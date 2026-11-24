/**
 * TASK-5603 — scoped vitest for cart line identity product+modifier+note
 * (INTENT-056 BLUEPRINT-056 v2, approved mockup 2/3).
 * Run scoped ONLY: npx vitest run --project=product src/lib/pos/cart-identity.test.ts
 * (L-P033 — never bare vitest).
 *
 * Identity rule: same product + different modifier/note = SEPARATE lines.
 * Tapping a card appends a row; qty only changes on the bill stepper.
 * Legacy rows (no identity fields) normalize to the empty identity.
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
import type { RateEntry } from '../fiat/rates';

const RATE = 3_000_000; // TEST INPUT, not a real rate
function liveEntry(): RateEntry {
	return { price: RATE, asOf: 1_790_000_000_000, where: 'cache', stale: false, expired: false };
}

const LATTE = { id: 'latte', name: 'Latte', priceSat: 200, active: true };
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

	it('resolveLine fills a legacy productId-only line', () => {
		const r = resolveLine({ productId: 'p1', name: 'Old', unitPriceSat: 100, qty: 2, lineTotalSat: 200 });
		expect(r.lineId).toBe('p1');
		expect(r.modifier).toBe('');
		expect(r.modifierLabel).toBe('');
		expect(r.note).toBe('');
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
		expect(less?.lineTotalSat).toBe(200);
		expect(reg?.lineTotalSat).toBe(400);
	});

	it('same product + same note typed twice merges (one row, qty 2)', () => {
		let cart = emptyCart();
		cart = add(cart, LESS);
		cart = add(cart, LESS);
		expect(cart.lines).toHaveLength(1);
		expect(cart.lines[0].qty).toBe(2);
		expect(cart.lines[0].lineTotalSat).toBe(400);
	});

	it('default-identity add merges with the bare-product line (legacy path)', () => {
		let cart = emptyCart();
		cart = add(cart);
		cart = add(cart);
		expect(cart.lines).toHaveLength(1);
		expect(resolveLine(cart.lines[0]).lineId).toBe('latte');
	});
});

describe('bill stepper edits exactly one row by lineId', () => {
	it('inc/dec/remove target the lineId, never the sibling row', () => {
		let cart = emptyCart();
		cart = add(cart, LESS);
		cart = add(cart, REGULAR);
		cart = add(cart, REGULAR);
		// + on the regular row → 3, less untouched
		const inc = addToCart(cart, LATTE, 1, REGULAR);
		expect(inc.ok).toBe(true);
		if (!inc.ok) return;
		cart = inc.value;
		expect(cart.lines.find((l) => resolveLine(l).modifier === 'regular')?.qty).toBe(3);
		expect(cart.lines.find((l) => resolveLine(l).modifier === 'less')?.qty).toBe(1);
		// - on the less lineId → row drops at 0, regular keeps 3
		const dec = decrementFromCart(cart, 'latte:less:หวานน้อย', 1);
		expect(dec.ok).toBe(true);
		if (!dec.ok) return;
		cart = dec.value;
		expect(cart.lines).toHaveLength(1);
		expect(resolveLine(cart.lines[0]).modifier).toBe('regular');
		// remove the last row by lineId
		const rm = removeLine(cart, 'latte:regular:');
		expect(rm.ok).toBe(true);
		if (!rm.ok) return;
		expect(rm.value.lines).toEqual([]);
	});

	it('legacy productId callers resolve when exactly one line carries it', () => {
		let cart = emptyCart();
		cart = add(cart);
		const dec = decrementFromCart(cart, 'latte', 1);
		expect(dec.ok).toBe(true);
		if (!dec.ok) return;
		expect(dec.value.lines).toEqual([]);
	});

	it('ambiguous productId (two lines, one product) fails loudly — no wrong-row edit', () => {
		let cart = emptyCart();
		cart = add(cart, LESS);
		cart = add(cart, REGULAR);
		expect(decrementFromCart(cart, 'latte', 1).ok).toBe(false);
		expect(removeLine(cart, 'latte').ok).toBe(false);
	});
});

describe('buildBill carries identity to the bill', () => {
	it('bill lines keep lineId + modifier + note for the sales log', () => {
		let cart = emptyCart();
		cart = add(cart, LESS);
		cart = add(cart, REGULAR);
		const bill = buildBill(cart, { currency: 'THB', entry: liveEntry() });
		expect(bill.ok).toBe(true);
		if (!bill.ok) return;
		expect(bill.value.lines).toHaveLength(2);
		expect(bill.value.totalSat).toBe(400);
		const less = bill.value.lines.find((l) => l.modifier === 'less');
		expect(less?.lineId).toBe('latte:less:หวานน้อย');
		expect(less?.modifierLabel).toBe('หวานน้อย');
		expect(less?.note).toBe('หวานน้อย');
	});
});
