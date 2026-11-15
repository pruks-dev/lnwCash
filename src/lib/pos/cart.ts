/**
 * TASK-5401 — POS cart/bill domain (INTENT-054 BLUEPRINT v3)
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

function toLine(productId: string, name: string, unitPriceSat: number, qty: number): CartLine {
	return { productId, name, unitPriceSat, qty, lineTotalSat: unitPriceSat * qty };
}

/**
 * Add qty of a catalog product. Off-sale / unknown products are rejected
 * here so confirm-time never has to second-guess the catalog.
 */
export function addToCart(
	cart: Cart,
	product: { id: string; name: string; priceSat: number; active: boolean },
	qty: number = 1
): CartResult<Cart> {
	if (!product || typeof product.id !== 'string' || product.id.trim() === '') {
		return fail('BAD_PRODUCT', 'unknown product');
	}
	if (product.active !== true) return fail('BAD_PRODUCT', 'product is off-sale');
	if (!Number.isInteger(product.priceSat) || product.priceSat <= 0) {
		return fail('BAD_PRODUCT', 'product price must be a positive integer');
	}
	if (!Number.isInteger(qty) || qty <= 0) return fail('BAD_QTY', 'qty must be a positive integer');
	const idx = cart.lines.findIndex((l) => l.productId === product.id);
	const lines = cart.lines.slice();
	if (idx === -1) {
		lines.push(toLine(product.id, product.name, product.priceSat, qty));
	} else {
		const cur = lines[idx];
		lines[idx] = toLine(cur.productId, cur.name, cur.unitPriceSat, cur.qty + qty);
	}
	return { ok: true, value: { lines } };
}

/** Decrease qty (or drop the line when it reaches 0) — pre-confirm editing. */
export function decrementFromCart(cart: Cart, productId: string, qty: number = 1): CartResult<Cart> {
	if (!Number.isInteger(qty) || qty <= 0) return fail('BAD_QTY', 'qty must be a positive integer');
	const idx = cart.lines.findIndex((l) => l.productId === productId);
	if (idx === -1) return fail('NOT_FOUND', `line not found: ${productId}`);
	const lines = cart.lines.slice();
	const cur = lines[idx];
	const next = cur.qty - qty;
	if (next <= 0) lines.splice(idx, 1);
	else lines[idx] = toLine(cur.productId, cur.name, cur.unitPriceSat, next);
	return { ok: true, value: { lines } };
}

/** Remove a line entirely — pre-confirm editing. */
export function removeLine(cart: Cart, productId: string): CartResult<Cart> {
	if (!cart.lines.some((l) => l.productId === productId)) {
		return fail('NOT_FOUND', `line not found: ${productId}`);
	}
	return { ok: true, value: { lines: cart.lines.filter((l) => l.productId !== productId) } };
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
	const lines: BillLine[] = cart.lines.map((l) => ({
		productId: l.productId,
		name: l.name,
		unitPriceSat: l.unitPriceSat,
		qty: l.qty,
		lineTotalSat: l.lineTotalSat
	}));
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
