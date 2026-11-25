/**
 * TASK-5710 — scoped vitest for src/lib/pos/cart.ts (v3 live-resolve)
 * Run scoped ONLY: npx vitest run src/lib/pos/cart.test.ts (L-P033 — never bare vitest)
 *
 * v3: the cart stores NO sats — lines carry { currency, amount } truth.
 * buildBill resolves live against ONE entry for the whole bill:
 * SAT lines need no rate; fiat lines go through fiatToSats (floor +
 * dust intact). Cross-checks compute expectations with the EXISTING
 * fiat stack — cart.ts must agree exactly, inventing no rate of its own.
 */
import { describe, it, expect } from 'vitest';
import {
	emptyCart,
	addToCart,
	decrementFromCart,
	removeLine,
	cartTotalLive,
	buildBill,
	resolveLineSats,
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

const TEA = { id: 'p1', name: 'Thai Tea', currency: 'SAT' as const, amount: 500, active: true };
const CAKE = { id: 'p2', name: 'Cake', currency: 'SAT' as const, amount: 1200, active: true };
const LATTE = { id: 'latte', name: 'Latte', currency: 'THB' as const, amount: 100, active: true };
const OFF = { id: 'p3', name: 'Old', currency: 'SAT' as const, amount: 100, active: false };

describe('add / edit before confirm (truth carried, no sats stored)', () => {
	it('add accumulates qty, lines carry truth (no stored sats)', () => {
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
		expect(cart.lines[0]).toMatchObject({ currency: 'SAT', amount: 500 });
		expect(cart.lines[0]).not.toHaveProperty('unitPriceSat');
		expect(cart.lines[0]).not.toHaveProperty('lineTotalSat');
	});

	it('rejects off-sale / bad truth / bad qty', () => {
		expect(addToCart(emptyCart(), OFF, 1).ok).toBe(false);
		expect(addToCart(emptyCart(), { ...TEA, amount: 0 }, 1).ok).toBe(false);
		expect(addToCart(emptyCart(), { ...TEA, amount: 1.5 }, 1).ok).toBe(false);
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
});

describe('resolveLineSats (live truth → sats)', () => {
	it('SAT resolves with no rate (dead entry still works)', () => {
		const r = resolveLineSats({ currency: 'SAT', amount: 500 }, deadEntry());
		expect(r).toEqual({ ok: true, unitSats: 500, rate: null });
	});

	it('fiat agrees with convert.ts floor math exactly', () => {
		const got = resolveLineSats({ currency: 'THB', amount: 100 }, liveEntry());
		const want = fiatToSats('100', 'THB', PRICE_THB);
		expect(got.ok).toBe(true);
		expect(want.ok).toBe(true);
		if (got.ok && want.ok) {
			expect(got.unitSats).toBe(want.sats); // 5882
			expect(got.rate).toBe(PRICE_THB);
		}
	});

	it('fiat + dead rate → RATE_UNAVAILABLE (never invents)', () => {
		const got = resolveLineSats({ currency: 'THB', amount: 100 }, deadEntry());
		expect(got.ok).toBe(false);
		if (!got.ok) expect(got.code).toBe('RATE_UNAVAILABLE');
	});
});

describe('cartTotalLive (live Order total)', () => {
	it('SAT-only cart totals with a dead rate', () => {
		let r = addToCart(emptyCart(), TEA, 2);
		if (!r.ok) return;
		const r2 = addToCart(r.value, CAKE, 1);
		if (!r2.ok) return;
		const t = cartTotalLive(r2.value, deadEntry());
		expect(t).toEqual({ ok: true, totalSat: 2200 });
	});

	it('fiat lines need the rate — dead entry blocks', () => {
		let r = addToCart(emptyCart(), LATTE, 1);
		if (!r.ok) return;
		expect(cartTotalLive(r.value, deadEntry()).ok).toBe(false);
		const live = cartTotalLive(r.value, liveEntry());
		expect(live.ok).toBe(true);
		if (!live.ok) return;
		const want = fiatToSats('100', 'THB', PRICE_THB);
		expect(want.ok).toBe(true);
		if (want.ok) expect(live.totalSat).toBe(want.sats);
	});
});

describe('buildBill v3 (one entry, per-row freeze)', () => {
	it('SAT-only bill: totals + fiat snapshot match the fiat stack exactly', () => {
		let r = addToCart(emptyCart(), TEA, 2);
		if (!r.ok) return;
		const r2 = addToCart(r.value, CAKE, 1);
		if (!r2.ok) return;
		const bill = buildBill(r2.value, { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		expect(bill.value.totalSat).toBe(2200);
		expect(bill.value.fiat.amount).toBe(satsToFiat(2200, PRICE_THB));
		expect(bill.value.fiat.text).toBe(formatFiat(2200, PRICE_THB, 'THB'));
		expect(bill.value.fiat.pricePerBtc).toBe(PRICE_THB);
		// per-row freeze: SAT rows carry null rate (never touch rate)
		for (const l of bill.value.lines) {
			expect(l.rate).toBeNull();
			expect(l.unitSats).toBe(l.currency === 'SAT' ? l.amount : l.unitSats);
		}
		expect(bill.value.lines.map((l) => l.lineTotalSat)).toEqual([1000, 1200]);
	});

	it('fiat line resolves live (floor intact) and freezes truth + rate', () => {
		let r = addToCart(emptyCart(), LATTE, 2);
		if (!r.ok) return;
		const bill = buildBill(r.value, { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		const want = fiatToSats('100', 'THB', PRICE_THB);
		expect(want.ok).toBe(true);
		if (!want.ok) return;
		expect(bill.value.lines[0]).toMatchObject({
			currency: 'THB',
			amount: 100,
			unitSats: want.sats,
			qty: 2,
			lineTotalSat: want.sats * 2,
			rate: PRICE_THB
		});
		expect(bill.value.totalSat).toBe(want.sats * 2);
	});

	it('SAT-only bill works with a dead rate (fiat snapshot blocked, sats kept)', () => {
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

	it('fiat line + dead rate → whole bill fails loud (SAT-only can still sell)', () => {
		let r = addToCart(emptyCart(), LATTE, 1);
		if (!r.ok) return;
		const blocked = buildBill(r.value, { currency: 'THB', entry: deadEntry() });
		expect(blocked.ok).toBe(false);
		if (blocked.ok) return;
		expect(blocked.code).toBe('RATE_UNAVAILABLE');
		// same dead entry, SAT-only cart still bills
		const sat = addToCart(emptyCart(), TEA, 1);
		if (!sat.ok) return;
		expect(buildBill(sat.value, { currency: 'THB', entry: deadEntry() }).ok).toBe(true);
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
