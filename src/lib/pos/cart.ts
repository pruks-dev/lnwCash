/**
 * TASK-5401 — POS cart/bill domain (INTENT-054 BLUEPRINT v3)
 * TASK-5603 — cart line identity product+modifier+note (INTENT-056 BLUEPRINT-056 v2)
 *
 * Identity rule (5603): a cart line is keyed by product + modifier + note.
 * Same product with a different modifier or note is a SEPARATE line
 * (latte less-sweet x1 + latte regular x2 = 2 rows). Old rows without
 * modifier/note normalize to empty (''), so persisted history reads in
 * both shapes — see normalizeIdentity + resolveLine + sales-log.
 *
 * Pure domain: NO svelte imports, NO localStorage, NO fetch.
 *
 * Fiat rule (hard): ALL fiat<->sats math goes through the existing
 * fiat stack — fiatToSats (convert.ts) + satsToFiat/formatFiat
 * (currency.ts) + RateEntry/FiatCurrency types (rates.ts).
 * This file contains ZERO rate arithmetic of its own.
 */

import { fiatToSats } from '../fiat/convert';
import { satsToFiat, formatFiat } from '../fiat/currency';
import type { FiatCurrency, RateEntry } from '../fiat/rates';

export interface CartLine {
	productId: string;
	name: string;
	unitPriceSat: number;
	qty: number;
	lineTotalSat: number;
	/**
	 * 5603 identity fields — OPTIONAL so pre-5603 shapes (cart fixtures,
	 * old persisted rows) still typecheck. Absent/null = '' (no modifier,
	 * no note) via resolveLine(). New lines written by addToCart always
	 * carry all four.
	 */
	/** Stable identity key — productId when modifier+note are empty. */
	lineId?: string;
	/** Machine modifier value ('' = none/regular). */
	modifier?: string;
	/** Display modifier label ('' = none). */
	modifierLabel?: string;
	/** Per-line note, trimmed ('' = none). */
	note?: string;
}

/** A CartLine with every 5603 identity field filled (no undefined). */
export interface ResolvedCartLine {
	productId: string;
	name: string;
	unitPriceSat: number;
	qty: number;
	lineTotalSat: number;
	lineId: string;
	modifier: string;
	modifierLabel: string;
	note: string;
}

export interface Cart {
	lines: CartLine[];
}

export interface BillLine {
	productId: string;
	name: string;
	unitPriceSat: number;
	qty: number;
	lineTotalSat: number;
	/** 5603 identity fields — optional for the same 2-shape reason. */
	lineId?: string;
	modifier?: string;
	modifierLabel?: string;
	note?: string;
}

export interface BillFiatSnapshot {
	currency: FiatCurrency;
	/** BTC price snapshot used — null when rate unavailable (fiat blocked). */
	pricePerBtc: number | null;
	/** Fiat value of totalSat via satsToFiat — null when rate unavailable. */
	amount: number | null;
	/** Display text via formatFiat ("– CUR" when unavailable — never fabricated). */
	text: string;
	stale: boolean;
	asOf: number | null;
}

export interface Bill {
	lines: BillLine[];
	totalSat: number;
	fiat: BillFiatSnapshot;
}

export type CartErrorCode = 'BAD_PRODUCT' | 'BAD_QTY' | 'NOT_FOUND' | 'EMPTY_CART';

export interface CartFailure {
	ok: false;
	code: CartErrorCode;
	message: string;
}

export interface CartOk<T> {
	ok: true;
	value: T;
}

export type CartResult<T> = CartOk<T> | CartFailure;

function fail(code: CartErrorCode, message: string): CartFailure {
	return { ok: false, code, message };
}

export function emptyCart(): Cart {
	return { lines: [] };
}

function cleanOpt(v: unknown): string {
	return typeof v === 'string' ? v.trim() : '';
}

export interface LineIdentityInput {
	modifier?: unknown;
	modifierLabel?: unknown;
	note?: unknown;
}

export interface LineIdentity {
	modifier: string;
	modifierLabel: string;
	note: string;
}

/**
 * 5603 — normalize any stored/legacy identity to the empty default.
 * Old rows (no modifier/note fields at all) land on { '','', '' } —
 * the history 2-shape reader (sales-log normalizeSales + resolveLine).
 */
export function normalizeIdentity(input?: LineIdentityInput | null): LineIdentity {
	if (typeof input !== 'object' || input === null) return { modifier: '', modifierLabel: '', note: '' };
	return {
		modifier: cleanOpt(input.modifier),
		modifierLabel: cleanOpt(input.modifierLabel),
		note: cleanOpt(input.note)
	};
}

/**
 * 5603 — stable line key. Default identity (no modifier, no note) keys
 * as the bare productId so pre-5603 callers/tests keep working byte-for-byte;
 * anything else keys as productId:modifier:note.
 */
export function lineIdFor(productId: string, ident?: LineIdentityInput | null): string {
	const { modifier, note } = normalizeIdentity(ident);
	if (!modifier && !note) return productId;
	return `${productId}:${modifier}:${note}`;
}

/** 5603 — resolve any (possibly legacy) line to the full identity shape. */
export function resolveLine(l: CartLine): ResolvedCartLine {
	const ident = normalizeIdentity(l);
	return {
		productId: l.productId,
		name: l.name,
		unitPriceSat: l.unitPriceSat,
		qty: l.qty,
		lineTotalSat: l.lineTotalSat,
		lineId:
			typeof l.lineId === 'string' && l.lineId.trim() !== ''
				? l.lineId
				: lineIdFor(l.productId, ident),
		modifier: ident.modifier,
		modifierLabel: ident.modifierLabel,
		note: ident.note
	};
}

function toLine(
	productId: string,
	name: string,
	unitPriceSat: number,
	qty: number,
	ident: LineIdentity
): CartLine {
	return {
		productId,
		name,
		unitPriceSat,
		qty,
		lineTotalSat: unitPriceSat * qty,
		lineId: lineIdFor(productId, ident),
		modifier: ident.modifier,
		modifierLabel: ident.modifierLabel,
		note: ident.note
	};
}

/**
 * Find a line by its 5603 lineId. Legacy fallback: when no lineId matches
 * but exactly ONE line carries the id as its productId (pre-5603 callers
 * pass productId), resolve to that line. Ambiguous (several lines share
 * the product) → -1 so the caller fails loudly instead of editing the
 * wrong row.
 */
function findLineIndex(lines: CartLine[], id: string): number {
	const exact = lines.findIndex((l) => resolveLine(l).lineId === id);
	if (exact !== -1) return exact;
	const byProduct: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].productId === id) byProduct.push(i);
	}
	return byProduct.length === 1 ? byProduct[0] : -1;
}

/**
 * Add qty of a catalog product. Off-sale / unknown products are rejected
 * here so confirm-time never has to second-guess the catalog.
 * 5603: `ident` (modifier/modifierLabel/note) selects the line — same
 * product with a different modifier or note APPENDS a new row instead of
 * merging (tap card adds a row; qty only changes on the bill stepper).
 * Omitted ident = default identity (merges with the bare-product line).
 */
export function addToCart(
	cart: Cart,
	product: { id: string; name: string; priceSat: number; active: boolean },
	qty: number = 1,
	ident?: LineIdentityInput | null
): CartResult<Cart> {
	if (!product || typeof product.id !== 'string' || product.id.trim() === '') {
		return fail('BAD_PRODUCT', 'unknown product');
	}
	if (product.active !== true) return fail('BAD_PRODUCT', 'product is off-sale');
	if (!Number.isInteger(product.priceSat) || product.priceSat <= 0) {
		return fail('BAD_PRODUCT', 'product price must be a positive integer');
	}
	if (!Number.isInteger(qty) || qty <= 0) return fail('BAD_QTY', 'qty must be a positive integer');
	const identity = normalizeIdentity(ident);
	const key = lineIdFor(product.id, identity);
	const idx = cart.lines.findIndex((l) => resolveLine(l).lineId === key);
	const lines = cart.lines.slice();
	if (idx === -1) {
		lines.push(toLine(product.id, product.name, product.priceSat, qty, identity));
	} else {
		const cur = resolveLine(lines[idx]);
		lines[idx] = toLine(cur.productId, cur.name, cur.unitPriceSat, cur.qty + qty, identity);
	}
	return { ok: true, value: { lines } };
}

/**
 * Decrease qty (or drop the line when it reaches 0) — pre-confirm editing.
 * 5603: `id` is the lineId (bill stepper passes it). Pre-5603 productId
 * callers still resolve via the single-line legacy fallback.
 */
export function decrementFromCart(cart: Cart, id: string, qty: number = 1): CartResult<Cart> {
	if (!Number.isInteger(qty) || qty <= 0) return fail('BAD_QTY', 'qty must be a positive integer');
	const idx = findLineIndex(cart.lines, id);
	if (idx === -1) return fail('NOT_FOUND', `line not found: ${id}`);
	const lines = cart.lines.slice();
	const cur = resolveLine(lines[idx]);
	const next = cur.qty - qty;
	if (next <= 0) lines.splice(idx, 1);
	else
		lines[idx] = toLine(cur.productId, cur.name, cur.unitPriceSat, next, {
			modifier: cur.modifier,
			modifierLabel: cur.modifierLabel,
			note: cur.note
		});
	return { ok: true, value: { lines } };
}

/**
 * Remove a line entirely — pre-confirm editing.
 * 5603: `id` is the lineId (same legacy productId fallback as decrement).
 */
export function removeLine(cart: Cart, id: string): CartResult<Cart> {
	const idx = findLineIndex(cart.lines, id);
	if (idx === -1) {
		return fail('NOT_FOUND', `line not found: ${id}`);
	}
	return { ok: true, value: { lines: cart.lines.filter((_, i) => i !== idx) } };
}

/** Integer sats total — plain qty math, no rates involved. */
export function cartTotalSats(cart: Cart): number {
	return cart.lines.reduce((sum, l) => sum + l.lineTotalSat, 0);
}

/**
 * Freeze a cart into a bill with a fiat snapshot.
 * Fiat leg delegates 100% to the fiat stack:
 * satsToFiat + formatFiat (currency.ts), entry comes from rates.ts.
 * Null/invalid price → amount null + "– CUR" text (fiat blocked, never faked).
 */
export function buildBill(
	cart: Cart,
	args: { currency: FiatCurrency; entry: RateEntry }
): CartResult<Bill> {
	if (cart.lines.length === 0) return fail('EMPTY_CART', 'cart is empty');
	const lines: BillLine[] = cart.lines.map((l) => {
		const r = resolveLine(l);
		return {
			productId: r.productId,
			name: r.name,
			unitPriceSat: r.unitPriceSat,
			qty: r.qty,
			lineTotalSat: r.lineTotalSat,
			lineId: r.lineId,
			modifier: r.modifier,
			modifierLabel: r.modifierLabel,
			note: r.note
		};
	});
	const totalSat = cartTotalSats(cart);
	const price = args.entry.price;
	const usable = typeof price === 'number' && Number.isFinite(price) && price > 0;
	const fiat: BillFiatSnapshot = {
		currency: args.currency,
		pricePerBtc: usable ? (price as number) : null,
		amount: usable ? satsToFiat(totalSat, price as number) : null,
		text: formatFiat(totalSat, usable ? (price as number) : null, args.currency),
		stale: args.entry.stale,
		asOf: args.entry.asOf
	};
	return { ok: true, value: { lines, totalSat, fiat } };
}

/**
 * Fiat-flag helper: convert a fiat-typed price into sats for a one-off
 * manual line — delegates to fiatToSats (convert.ts floor/dust policy).
 * Returns sats on success, failure code otherwise (never invents a rate).
 */
export function fiatPriceToSats(
	fiatStr: string,
	currency: FiatCurrency,
	entry: RateEntry
): { ok: true; sats: number } | { ok: false; code: string; message: string } {
	if (entry.price === null) {
		return { ok: false, code: 'UNAVAILABLE', message: 'rate unavailable — fiat mode blocked' };
	}
	const r = fiatToSats(fiatStr, currency, entry.price);
	if (!r.ok) return { ok: false, code: r.code, message: r.message };
	return { ok: true, sats: r.sats };
}
