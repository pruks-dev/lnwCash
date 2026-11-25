/**
 * TASK-5710 — scoped vitest for cart line identity product+modifier+note (v3 truth)
 * Run scoped ONLY: npx vitest run src/lib/pos/cart-identity.test.ts (L-P033 — never bare vitest)
 *
 * Identity rule: same product + different modifier/note = SEPARATE lines.
 * Tapping a card appends a row; qty only changes on the bill stepper.
 * Legacy rows (no identity fields) normalize to the empty identity.
 * v3: lines carry { currency, amount } truth — sats resolve live in buildBill.
 */
import { describe, it, expect } from 'vitest';
import {
	emptyCart,
	addToCart,
	decrementFromCart,
	removeLine,
	buildBill,
	lineIdFor,
	normalizeIdentity,
	resolveLine,
	type Cart
} from './cart';
import { fiatToSats } from '../fiat/convert';
import type { RateEntry } from '../fiat/rates';

const RATE = 3_000_000; // TEST INPUT, not a real rate
function liveEntry(): RateEntry {
	return { price: RATE, asOf: 1_790_000_000_000, where: 'cache', stale: false, expired: false };
}

const LATTE = { id: 'latte', name: 'Latte', currency: 'SAT' as const, amount: 200, active: true };
const LESS = { modifier: 'less', modifierLabel: 'หวานน้อย', note: 'หวานน้อย' };
const REGULAR = { modifier: 'regular', modifierLabel: 'หวานปกติ', note: '' };

function add(cart: Cart, ident?: { modifier: string; modifierLabel: string; note: string }) {
	const r = addToCart(cart, LATTE, 1, ident);
	expect(r.ok).toBe(true);
	if (!r.ok) throw new Error('add failed');
	return r.value;
}

describe('lineIdFor / normalizeIdentity', () => {
	it('default identity keys as the bare productId', () => {
		expect(lineIdFor('latte')).toBe('latte');
		expect(lineIdFor('latte', null)).toBe('latte');
		expect(lineIdFor('latte', { modifier: '', modifierLabel: '', note: '' })).toBe('latte');
	});

	it('modifier or note extends the key', () => {
		expect(lineIdFor('latte', REGULAR)).toBe('latte:regular:');
		expect(lineIdFor('latte', LESS)).toBe('latte:less:หวานน้อย');
	});

	it('legacy rows normalize to the empty identity', () => {
		expect(normalizeIdentity(undefined)).toEqual({ modifier: '', modifierLabel: '', note: '' });
		expect(normalizeIdentity({ note: '  spaced  ' })).toEqual({
			modifier: '',
			modifierLabel: '',
			note: 'spaced'
		});
	});

	it('resolveLine fills a legacy truth line', () => {
		const r = resolveLine({ productId: 'p1', name: 'Old', currency: 'SAT', amount: 100, qty: 2 });
		expect(r.lineId).toBe('p1');
		expect(r.modifier).toBe('');
		expect(r.modifierLabel).toBe('');
		expect(r.note).toBe('');
		expect(r.currency).toBe('SAT');
		expect(r.amount).toBe(100);
	});
});

describe('add splits rows by identity, merges within identity', () => {
	it('same product + different modifier/note = 2 rows (mockup STATE B)', () => {
		let cart = emptyCart();
		cart = add(cart, LESS); // หวานน้อย ×1
		cart = add(cart, REGULAR); // หวานปกติ ×1 (tap again, same card)
		cart = add(cart, REGULAR); // หวานปกติ ×2 — merges within identity
		expect(cart.lines).toHaveLength(2);
		const less = cart.lines.find((l) => resolveLine(l).modifier === 'less');
		const reg = cart.lines.find((l) => resolveLine(l).modifier === 'regular');
		expect(less?.qty).toBe(1);
		expect(reg?.qty).toBe(2);
		expect(resolveLine(less!).lineId).toBe('latte:less:หวานน้อย');
		// v3: no stored sats — truth carried, freeze happens in buildBill
		expect(less).toMatchObject({ currency: 'SAT', amount: 200 });
		expect(reg).toMatchObject({ currency: 'SAT', amount: 200 });
		const bill = buildBill(cart, { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		expect(bill.value.totalSat).toBe(600);
	});

	it('same product + same note typed twice merges (one row, qty 2)', () => {
		let cart = emptyCart();
		cart = add(cart, LESS);
		cart = add(cart, LESS);
		expect(cart.lines).toHaveLength(1);
		expect(cart.lines[0].qty).toBe(2);
		const bill = buildBill(cart, { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		expect(bill.value.totalSat).toBe(400);
	});

	it('default-identity add merges with the bare-product line (legacy path)', () => {
		let cart = emptyCart();
		cart = add(cart);
		cart = add(cart);
		expect(cart.lines).toHaveLength(1);
		expect(cart.lines[0].qty).toBe(2);
	});

	it('decrement / remove resolve by lineId', () => {
		let cart = emptyCart();
		cart = add(cart, LESS);
		cart = add(cart, REGULAR);
		const d = decrementFromCart(cart, 'latte:regular:', 1);
		expect(d.ok).toBe(true);
		if (!d.ok) return;
		expect(d.value.lines).toHaveLength(1);
		expect(resolveLine(d.value.lines[0]).modifier).toBe('less');
		const out = removeLine(d.value, 'latte:less:หวานน้อย');
		expect(out.ok).toBe(true);
		if (!out.ok) return;
		expect(out.value.lines).toEqual([]);
	});
});

describe('fiat truth resolves live per identity row', () => {
	it('fiat product rows resolve via the fiat stack (floor intact)', () => {
		const FIAT_LATTE = { id: 'flat', name: 'Flat', currency: 'THB' as const, amount: 45, active: true };
		let cart = emptyCart();
		const r = addToCart(cart, FIAT_LATTE, 2, LESS);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		cart = r.value;
		const bill = buildBill(cart, { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		const want = fiatToSats('45', 'THB', RATE);
		expect(want.ok).toBe(true);
		if (!want.ok) return;
		expect(bill.value.lines[0].unitSats).toBe(want.sats);
		expect(bill.value.totalSat).toBe(want.sats * 2);
		expect(bill.value.lines[0].rate).toBe(RATE);
	});
});
