/**
 * TASK-5601 — scoped vitest for src/lib/pos/catalog.ts (schema v2 HEAVY)
 * Run scoped ONLY: npx vitest run src/lib/pos/catalog.test.ts (L-P033 — never bare vitest)
 */
import { describe, it, expect } from 'vitest';
import {
	emptyCatalog,
	addProduct,
	updateProduct,
	setProductActive,
	removeProduct,
	getProduct,
	listActive,
	normalizeCatalogDoc,
	resolveNativeSats,
	hasNativePrice,
	POS_CATALOG_SCHEMA_VERSION
} from './catalog';
import { fiatToSats } from '../fiat/convert';
import type { RateEntry } from '../fiat/rates';

const NOW = 1_790_000_000_000;
const PRICE_THB = 1_700_000; // TEST INPUT, not a real rate

function liveEntry(): RateEntry {
	return { price: PRICE_THB, asOf: NOW, where: 'cache', stale: false, expired: false };
}

function seeded() {
	const r1 = addProduct(emptyCatalog(NOW), {
		id: 'p1',
		name: 'Thai Tea',
		priceSat: 500,
		kind: 'drink',
		fiatPriced: true
	});
	expect(r1.ok).toBe(true);
	if (!r1.ok) throw new Error('seed failed');
	const r2 = addProduct(r1.value, { id: 'p2', name: 'Cake', priceSat: 1200, kind: 'snack' });
	expect(r2.ok).toBe(true);
	if (!r2.ok) throw new Error('seed failed');
	return r2.value;
}

describe('catalog schema', () => {
	it('empty catalog carries schema v2', () => {
		const doc = emptyCatalog(NOW);
		expect(doc.schema).toBe(POS_CATALOG_SCHEMA_VERSION);
		expect(doc.schema).toBe(2);
		expect(doc.items).toEqual([]);
	});
});

describe('CRUD', () => {
	it('add + get roundtrip with defaults (kind/fiat/active + null native pair)', () => {
		const doc = seeded();
		const p = getProduct(doc, 'p1');
		expect(p).not.toBeNull();
		expect(p!.name).toBe('Thai Tea');
		expect(p!.priceSat).toBe(500);
		expect(p!.fiatPriced).toBe(true);
		expect(p!.active).toBe(true);
		// v2: SAT-only rows default to a null native pair
		expect(p!.currency).toBeNull();
		expect(p!.amount).toBeNull();
		expect(hasNativePrice(p!)).toBe(false);
	});

	it('rejects empty id / empty name / bad price', () => {
		const doc = emptyCatalog(NOW);
		expect(addProduct(doc, { id: '', name: 'x', priceSat: 1 }).ok).toBe(false);
		expect(addProduct(doc, { id: 'a', name: '  ', priceSat: 1 }).ok).toBe(false);
		for (const bad of [0, -5, 1.5, NaN]) {
			const r = addProduct(doc, { id: 'a', name: 'x', priceSat: bad });
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.code).toBe('BAD_PRICE');
		}
	});

	it('rejects duplicate id', () => {
		const doc = seeded();
		const r = addProduct(doc, { id: 'p1', name: 'Other', priceSat: 9 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('DUPLICATE_ID');
	});

	it('update mutates allowed fields, id immutable, validates', () => {
		let doc = seeded();
		const r = updateProduct(doc, 'p1', { name: 'Thai Tea XL', priceSat: 700 });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		doc = r.value;
		expect(getProduct(doc, 'p1')!.priceSat).toBe(700);
		expect(updateProduct(doc, 'nope', { name: 'z' }).ok).toBe(false);
		const bad = updateProduct(doc, 'p1', { priceSat: 0 });
		expect(bad.ok).toBe(false);
	});

	it('remove drops the row, unknown id fails', () => {
		const doc = seeded();
		const r = removeProduct(doc, 'p2');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(getProduct(r.value, 'p2')).toBeNull();
		expect(removeProduct(r.value, 'p2').ok).toBe(false);
	});
});

describe('on/off sale', () => {
	it('setProductActive toggles, listActive filters', () => {
		let doc = seeded();
		const r = setProductActive(doc, 'p2', false);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		doc = r.value;
		expect(getProduct(doc, 'p2')!.active).toBe(false);
		expect(listActive(doc).map((p) => p.id)).toEqual(['p1']);
		expect(setProductActive(doc, 'ghost', true).ok).toBe(false);
	});
});

describe('normalize (old-install migrate)', () => {
	it('garbage / null → empty v2 catalog, never throws', () => {
		for (const bad of [null, undefined, 42, 'x', []]) {
			const doc = normalizeCatalogDoc(bad, NOW);
			expect(doc.schema).toBe(2);
			expect(doc.items).toEqual([]);
		}
	});

	it('pre-5401 doc without schema keeps valid rows, stamps v2', () => {
		const doc = normalizeCatalogDoc(
			{
				items: [
					{ id: 'old1', name: 'Old', priceSat: 100, kind: 'misc' },
					{ id: 'bad', name: '', priceSat: 100 },
					{ id: 'bad2', name: 'x', priceSat: 0 }
				]
			},
			NOW
		);
		expect(doc.schema).toBe(2);
		expect(doc.items).toHaveLength(1);
		expect(doc.items[0].id).toBe('old1');
		// missing flags default: on-sale, not fiat-priced
		expect(doc.items[0].active).toBe(true);
		expect(doc.items[0].fiatPriced).toBe(false);
	});

	it('drops duplicate ids, keeps first', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 1,
				items: [
					{ id: 'd', name: 'A', priceSat: 10 },
					{ id: 'd', name: 'B', priceSat: 20 }
				]
			},
			NOW
		);
		expect(doc.items).toHaveLength(1);
		expect(doc.items[0].name).toBe('A');
	});
});

describe('v1 → v2 migrate (HEAVY — priceSat intact)', () => {
	it('v1 rows migrate with count parity + priceSat byte-identical + null pair', () => {
		const v1 = {
			schema: 1,
			updatedAt: NOW,
			items: [
				{ id: 'tea', name: 'Thai Tea', priceSat: 500, kind: 'drink', fiatPriced: true, active: true, updatedAt: NOW },
				{ id: 'cake', name: 'Cake', priceSat: 1200, kind: 'snack', fiatPriced: false, active: false, updatedAt: NOW },
				{ id: 'coin', name: 'Coin', priceSat: 1, kind: '', active: true, updatedAt: NOW }
			]
		};
		const doc = normalizeCatalogDoc(v1, NOW);
		expect(doc.schema).toBe(2);
		expect(doc.items).toHaveLength(3);
		expect(doc.items.map((p) => p.priceSat)).toEqual([500, 1200, 1]);
		for (const p of doc.items) {
			expect(p.currency).toBeNull();
			expect(p.amount).toBeNull();
		}
		console.log(
			`[migrate-proof] v1→v2 before=3 after=${doc.items.length} priceSat=[${doc.items.map((p) => p.priceSat).join(',')}] intact`
		);
	});

	it('v2 rows with a valid native pair survive normalize untouched', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 2,
				updatedAt: NOW,
				items: [
					{ id: 'latte', name: 'Latte', priceSat: 5882, currency: 'THB', amount: 100, kind: 'drink', active: true, updatedAt: NOW },
					{ id: 'maki', name: 'Maki', priceSat: 900, currency: 'JPY', amount: 150, active: true, updatedAt: NOW }
				]
			},
			NOW
		);
		expect(doc.items).toHaveLength(2);
		expect(doc.items[0]).toMatchObject({ currency: 'THB', amount: 100, priceSat: 5882 });
		expect(doc.items[1]).toMatchObject({ currency: 'JPY', amount: 150, priceSat: 900 });
	});

	it('broken pair never loses the product — pair nulled, priceSat kept', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 2,
				updatedAt: NOW,
				items: [
					{ id: 'half', name: 'Half', priceSat: 42, currency: 'THB', updatedAt: NOW },
					{ id: 'weird', name: 'Weird', priceSat: 43, currency: 'XXX', amount: 5, updatedAt: NOW },
					{ id: 'fraq', name: 'Fraq', priceSat: 44, currency: 'JPY', amount: 1.5, updatedAt: NOW }
				]
			},
			NOW
		);
		expect(doc.items).toHaveLength(3);
		expect(doc.items.map((p) => p.priceSat)).toEqual([42, 43, 44]);
		for (const p of doc.items) {
			expect(p.currency).toBeNull();
			expect(p.amount).toBeNull();
		}
	});
});

describe('HEAVY native pair CRUD', () => {
	it('add accepts a paired currency+amount', () => {
		const r = addProduct(emptyCatalog(NOW), {
			id: 'latte',
			name: 'Latte',
			priceSat: 5882,
			currency: 'THB',
			amount: 100
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(getProduct(r.value, 'latte')).toMatchObject({ currency: 'THB', amount: 100, priceSat: 5882 });
	});

	it('add rejects unpaired / unknown currency / bad-decimal amounts', () => {
		const doc = emptyCatalog(NOW);
		const half = addProduct(doc, { id: 'a', name: 'A', priceSat: 10, currency: 'THB' });
		expect(half.ok).toBe(false);
		if (!half.ok) expect(half.code).toBe('BAD_CURRENCY');
		const weird = addProduct(doc, { id: 'b', name: 'B', priceSat: 10, currency: 'XXX' as never, amount: 5 });
		expect(weird.ok).toBe(false);
		if (!weird.ok) expect(weird.code).toBe('BAD_CURRENCY');
		const fraq = addProduct(doc, { id: 'c', name: 'C', priceSat: 10, currency: 'JPY', amount: 1.5 });
		expect(fraq.ok).toBe(false);
		if (!fraq.ok) expect(fraq.code).toBe('BAD_CURRENCY');
	});

	it('update merges one side, rejects half-clear, clears with null/null', () => {
		let doc = seeded();
		const set = updateProduct(doc, 'p1', { currency: 'THB', amount: 100 });
		expect(set.ok).toBe(true);
		if (!set.ok) return;
		doc = set.value;
		expect(getProduct(doc, 'p1')).toMatchObject({ currency: 'THB', amount: 100, priceSat: 500 });
		// one-sided amount patch merges with the stored currency
		const merge = updateProduct(doc, 'p1', { amount: 200 });
		expect(merge.ok).toBe(true);
		if (!merge.ok) return;
		expect(getProduct(merge.value, 'p1')).toMatchObject({ currency: 'THB', amount: 200 });
		// half-clear (currency null, amount left set) is rejected — never half a price
		const halfClear = updateProduct(merge.value, 'p1', { currency: null });
		expect(halfClear.ok).toBe(false);
		const clear = updateProduct(merge.value, 'p1', { currency: null, amount: null });
		expect(clear.ok).toBe(true);
		if (!clear.ok) return;
		expect(getProduct(clear.value, 'p1')).toMatchObject({ currency: null, amount: null });
	});
});

describe('convert-at-entry (rev48 intact — delegates to fiatToSats)', () => {
	it('resolveNativeSats agrees with convert.ts floor math', () => {
		const got = resolveNativeSats('100', 'THB', liveEntry());
		const want = fiatToSats('100', 'THB', PRICE_THB);
		expect(got.ok).toBe(true);
		expect(want.ok).toBe(true);
		if (got.ok && want.ok) expect(got.sats).toBe(want.sats); // 5882
	});

	it('dead rate → UNAVAILABLE (never invents)', () => {
		const dead: RateEntry = { price: null, asOf: null, where: 'cache', stale: true, expired: true };
		const got = resolveNativeSats('100', 'THB', dead);
		expect(got.ok).toBe(false);
	});
});
