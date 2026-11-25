/**
 * TASK-5401 — POS cart/bill domain (INTENT-054 BLUEPRINT v3)
 * TASK-5603 — cart line identity product+modifier+note (INTENT-056 BLUEPRINT-056 v2)
 * TASK-5710 — v3 pricing rupture (INTENT-057 BLUEPRINT v3 rev5):
 *   the cart stores NO sats. Each line carries the seller truth
 *   { currency, amount }; sats resolve LIVE in buildBill(rateEntry).
 *   - SAT lines resolve with NO rate touch (amount IS sats).
 *   - fiat lines resolve via fiatToSats (convert.ts floor + dust-block).
 *   Dead rate + fiat lines → buildBill FAILS loud (fail, never invent);
 *   SAT-only carts still bill when the rate is gone.
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
import type { PosCurrency } from './catalog';

export interface CartLine {
	productId: string;
	name: string;
	/** v3 truth — the seller's set price. Sats resolve live (never stored). */
	currency: PosCurrency;
	/** Truth amount: integer sats for SAT, major units for fiat. */
	amount: number;
	qty: number;
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
	currency: PosCurrency;
	amount: number;
	qty: number;
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
	/** v3 per-row FREEZE — truth + resolved sats + rate used, immutable after bill. */
	currency: PosCurrency;
	amount: number;
	/** Resolved unit sats (SAT: amount verbatim, no rate; fiat: fiatToSats live). */
	unitSats: number;
	qty: number;
	lineTotalSat: number;
	/** BTC price used for this row (fiat rows only; SAT rows carry null — never touch rate). */
	rate: number | null;
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

export type CartErrorCode =
	| 'BAD_PRODUCT'
	| 'BAD_QTY'
	| 'NOT_FOUND'
	| 'EMPTY_CART'
	| 'RATE_UNAVAILABLE'
	| 'DUST_ZERO_SAT'
	| 'BAD_PRICE';

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
		currency: l.currency,
		amount: l.amount,
		qty: l.qty,
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
	currency: PosCurrency,
	amount: number,
	qty: number,
	ident: LineIdentity
): CartLine {
	return {
		productId,
		name,
		currency,
		amount,
		qty,
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

function isFiatCur(v: unknown): v is FiatCurrency {
	return (
		typeof v === 'string' &&
		['THB', 'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'KRW', 'SGD', 'AUD', 'MYR'].includes(v)
	);
}

function validTruth(currency: unknown, amount: unknown): currency is PosCurrency {
	if (currency === 'SAT') return typeof amount === 'number' && Number.isInteger(amount) && amount > 0;
	if (!isFiatCur(currency)) return false;
	return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

/**
 * v3 LIVE resolve — one line's truth → sats against a rate entry.
 * SAT: amount IS sats (rate untouched — works with a dead rate).
 * Fiat: fiatToSats (convert.ts floor + dust-block); dead rate →
 * RATE_UNAVAILABLE (fail loud, never invent).
 */
export function resolveLineSats(
	line: Pick<CartLine, 'currency' | 'amount'>,
	entry: RateEntry
): { ok: true; unitSats: number; rate: number | null } | { ok: false; code: CartErrorCode; message: string } {
	if (line.currency === 'SAT') {
		if (typeof line.amount !== 'number' || !Number.isInteger(line.amount) || line.amount <= 0) {
			return { ok: false, code: 'BAD_PRICE', message: 'SAT amount must be a positive integer' };
		}
		return { ok: true, unitSats: line.amount, rate: null };
	}
	if (!isFiatCur(line.currency)) {
		return { ok: false, code: 'BAD_PRICE', message: 'unknown currency' };
	}
	if (entry.price === null) {
		return { ok: false, code: 'RATE_UNAVAILABLE', message: 'rate unavailable — fiat mode blocked' };
	}
	const r = fiatToSats(String(line.amount), line.currency, entry.price);
	if (!r.ok) {
		if (r.code === 'RATE_UNAVAILABLE')
			return { ok: false, code: 'RATE_UNAVAILABLE', message: r.message };
		if (r.code === 'DUST_ZERO_SAT')
			return { ok: false, code: 'DUST_ZERO_SAT', message: r.message };
		return { ok: false, code: 'BAD_PRICE', message: r.message };
	}
	return { ok: true, unitSats: r.sats, rate: entry.price };
}

/**
 * Add qty of a catalog product. Off-sale / unknown products are rejected
 * here so confirm-time never has to second-guess the catalog.
 * v3: the product's TRUTH { currency, amount } is carried (no sats
 * stored — resolution happens in buildBill).
 * 5603: `ident` (modifier/modifierLabel/note) selects the line — same
 * product with a different modifier or note APPENDS a new row instead of
 * merging (tap card adds a row; qty only changes on the bill stepper).
 * Omitted ident = default identity (merges with the bare-product line).
 */
export function addToCart(
	cart: Cart,
	product: { id: string; name: string; currency: PosCurrency; amount: number; active: boolean },
	qty: number = 1,
	ident?: LineIdentityInput | null
): CartResult<Cart> {
	if (!product || typeof product.id !== 'string' || product.id.trim() === '') {
		return fail('BAD_PRODUCT', 'unknown product');
	}
	if (product.active !== true) return fail('BAD_PRODUCT', 'product is off-sale');
	if (!validTruth(product.currency, product.amount)) {
		return fail('BAD_PRODUCT', 'product truth price must be SAT integer or positive fiat amount');
	}
	if (!Number.isInteger(qty) || qty <= 0) return fail('BAD_QTY', 'qty must be a positive integer');
	const identity = normalizeIdentity(ident);
	const key = lineIdFor(product.id, identity);
	const idx = cart.lines.findIndex((l) => resolveLine(l).lineId === key);
	const lines = cart.lines.slice();
	if (idx === -1) {
		lines.push(toLine(product.id, product.name, product.currency, product.amount, qty, identity));
	} else {
		const cur = resolveLine(lines[idx]);
		lines[idx] = toLine(cur.productId, cur.name, cur.currency, cur.amount, cur.qty + qty, identity);
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
		lines[idx] = toLine(cur.productId, cur.name, cur.currency, cur.amount, next, {
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

/**
 * v3 LIVE cart total — resolves every line against the entry (SAT lines
 * need no rate; fiat lines go through fiatToSats). Dead rate + any fiat
 * line → RATE_UNAVAILABLE (fail loud). Use for live Order totals; the
 * frozen bill total comes from buildBill.
 */
export function cartTotalLive(
	cart: Cart,
	entry: RateEntry
): { ok: true; totalSat: number } | { ok: false; code: CartErrorCode; message: string } {
	let total = 0;
	for (const l of cart.lines) {
		const rl = resolveLine(l);
		const s = resolveLineSats({ currency: rl.currency, amount: rl.amount }, entry);
		if (!s.ok) return s;
		total += s.unitSats * rl.qty;
	}
	return { ok: true, totalSat: total };
}

/**
 * Freeze a cart into a bill with a fiat snapshot.
 * v3: EVERY line resolves live here (single entry for the whole bill —
 * one rate per bill, snapshot at pay time). SAT lines never touch the
 * rate; fiat lines fail the whole bill loud when the rate is dead
 * (SAT-only carts still bill — mixed carts block until the rate returns).
 * Each BillLine freezes { currency, amount, unitSats, rate } so old bills
 * never recompute.
 * Bill-level fiat leg delegates 100% to the fiat stack:
 * satsToFiat + formatFiat (currency.ts), entry comes from rates.ts.
 * Null/invalid price → amount null + "– CUR" text (fiat blocked, never faked).
 */
export function buildBill(
	cart: Cart,
	args: { currency: FiatCurrency; entry: RateEntry }
): CartResult<Bill> {
	if (cart.lines.length === 0) return fail('EMPTY_CART', 'cart is empty');
	const lines: BillLine[] = [];
	for (const raw of cart.lines) {
		const r = resolveLine(raw);
		const s = resolveLineSats({ currency: r.currency, amount: r.amount }, args.entry);
		if (!s.ok) return s;
		lines.push({
			productId: r.productId,
			name: r.name,
			currency: r.currency,
			amount: r.amount,
			unitSats: s.unitSats,
			qty: r.qty,
			lineTotalSat: s.unitSats * r.qty,
			rate: s.rate,
			lineId: r.lineId,
			modifier: r.modifier,
			modifierLabel: r.modifierLabel,
			note: r.note
		});
	}
	const totalSat = lines.reduce((sum, l) => sum + l.lineTotalSat, 0);
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
