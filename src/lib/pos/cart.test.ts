/**
 * TASK-5401 — scoped vitest for src/lib/pos/cart.ts
 * Run scoped ONLY: npx vitest run src/lib/pos (L-P033 — never bare vitest)
 *
 * Fiat cross-check: expected values are computed with the EXISTING
 * fiat stack (satsToFiat/fiatToSats) — cart.ts must agree exactly,
 * proving it reuses rates/convert and invents no rate of its own.
 */
import { describe, it, expect } from 'vitest';
import {
	emptyCart,
	addToCart,
	decrementFromCart,
	removeLine,
	cartTotalSats,
	buildBill,
	fiatPriceToSats
} from './cart';
import { satsToFiat, formatFiat } from '../fiat/currency';
import { fiatToSats } from '../fiat/convert';
import type { RateEntry } from '../fiat/rates';

const PRICE_THB = 1_700_000; // TEST INPUT, not a real rate
const NOW = 1_790_000_000_000;

function liveEntry(): RateEntry {
	return { price: PRICE_THB, asOf: NOW, where: 'cache', stale: false, expired: false };
}

function deadEntry(): RateEntry {
	return { price: null, asOf: null, where: 'cache', stale: true, expired: true };
}

const TEA = { id: 'p1', name: 'Thai Tea', priceSat: 500, active: true };
const CAKE = { id: 'p2', name: 'Cake', priceSat: 1200, active: true };
const OFF = { id: 'p3', name: 'Old', priceSat: 100, active: false };

describe('add / edit before confirm', () => {
	it('add accumulates qty + line totals', () => {
		let cart = emptyCart();
		let r = addToCart(cart, TEA, 2);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		cart = r.value;
		r = addToCart(cart, TEA, 1);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		cart = r.value;
		expect(cart.lines).toHaveLength(1);
		expect(cart.lines[0].qty).toBe(3);
		expect(cart.lines[0].lineTotalSat).toBe(1500);
	});

	it('rejects off-sale / bad product / bad qty', () => {
		expect(addToCart(emptyCart(), OFF, 1).ok).toBe(false);
		expect(addToCart(emptyCart(), { ...TEA, priceSat: 0 }, 1).ok).toBe(false);
		expect(addToCart(emptyCart(), TEA, 0).ok).toBe(false);
		expect(addToCart(emptyCart(), TEA, 1.5).ok).toBe(false);
	});

	it('decrement lowers qty, drops line at zero', () => {
		let r = addToCart(emptyCart(), TEA, 2);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		let cart = r.value;
		const d1 = decrementFromCart(cart, 'p1', 1);
		expect(d1.ok).toBe(true);
		if (!d1.ok) return;
		expect(d1.value.lines[0].qty).toBe(1);
		const d2 = decrementFromCart(d1.value, 'p1', 1);
		expect(d2.ok).toBe(true);
		if (!d2.ok) return;
		expect(d2.value.lines).toEqual([]);
		expect(decrementFromCart(d2.value, 'p1', 1).ok).toBe(false);
	});

	it('removeLine drops the whole line', () => {
		let r = addToCart(emptyCart(), TEA, 1);
		if (!r.ok) return;
		const r2 = addToCart(r.value, CAKE, 1);
		if (!r2.ok) return;
		const out = removeLine(r2.value, 'p1');
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(out.value.lines.map((l) => l.productId)).toEqual(['p2']);
		expect(removeLine(out.value, 'ghost').ok).toBe(false);
	});

	it('cartTotalSats sums integer sats (no rates)', () => {
		let r = addToCart(emptyCart(), TEA, 2);
		if (!r.ok) return;
		const r2 = addToCart(r.value, CAKE, 1);
		if (!r2.ok) return;
		expect(cartTotalSats(r2.value)).toBe(2200);
	});
});

describe('buildBill fiat snapshot (reuses fiat stack)', () => {
	it('live rate: total + fiat amount/text match satsToFiat/formatFiat exactly', () => {
		let r = addToCart(emptyCart(), TEA, 2);
		if (!r.ok) return;
		const r2 = addToCart(r.value, CAKE, 1);
		if (!r2.ok) return;
		const bill = buildBill(r2.value, { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		expect(bill.value.totalSat).toBe(2200);
		// cross-check against the existing fiat lib — must be identical
		expect(bill.value.fiat.amount).toBe(satsToFiat(2200, PRICE_THB));
		expect(bill.value.fiat.text).toBe(formatFiat(2200, PRICE_THB, 'THB'));
		expect(bill.value.fiat.pricePerBtc).toBe(PRICE_THB);
	});

	it('dead rate: fiat blocked, amount null, "– CUR" text, sats total kept', () => {
		let r = addToCart(emptyCart(), TEA, 1);
		if (!r.ok) return;
		const bill = buildBill(r.value, { currency: 'THB', entry: deadEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		expect(bill.value.totalSat).toBe(500);
		expect(bill.value.fiat.amount).toBeNull();
		expect(bill.value.fiat.pricePerBtc).toBeNull();
		expect(bill.value.fiat.text).toBe('– THB');
	});

	it('empty cart cannot bill', () => {
		const bill = buildBill(emptyCart(), { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(false);
	});
});

describe('fiatPriceToSats delegates to fiatToSats', () => {
	it('agrees with convert.ts floor math', () => {
		const got = fiatPriceToSats('100', 'THB', liveEntry());
		const want = fiatToSats('100', 'THB', PRICE_THB);
		expect(got.ok).toBe(true);
		expect(want.ok).toBe(true);
		if (got.ok && want.ok) expect(got.sats).toBe(want.sats); // 5882
	});

	it('dead rate → UNAVAILABLE (never invents)', () => {
		const got = fiatPriceToSats('100', 'THB', deadEntry());
		expect(got.ok).toBe(false);
	});
});
