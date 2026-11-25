/**
 * TASK-5710 — scoped vitest for src/lib/pos/catalog.ts (schema v3 pricing rupture)
 * Run scoped ONLY: npx vitest run src/lib/pos/catalog.test.ts (L-P033 — never bare vitest)
 *
 * v3: PosProduct stores ONLY { currency, amount } truth — no stored-sats
 * field. SAT truth resolves with no rate; fiat truth resolves live at
 * bill time. normalize() migrates v1 (stored-sats-only → SAT) and v2
 * (fiat pair kept, stored sats dropped; broken pair + stored sats → SAT
 * fallback so the row stays sellable).
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
	resolveTruthPair,
	hasNativePrice,
	POS_CATALOG_SCHEMA_VERSION
} from './catalog';
import { parseFiatAmount } from '../fiat/convert';

const NOW = 1_790_000_000_000;

function seeded() {
	const r1 = addProduct(emptyCatalog(NOW), {
		id: 'p1',
		name: 'Thai Tea',
		currency: 'SAT',
		amount: 500,
		kind: 'drink',
		fiatPriced: true
	});
	expect(r1.ok).toBe(true);
	if (!r1.ok) throw new Error('seed failed');
	const r2 = addProduct(r1.value, {
		id: 'p2',
		name: 'Cake',
		currency: 'SAT',
		amount: 1200,
		kind: 'snack'
	});
	expect(r2.ok).toBe(true);
	if (!r2.ok) throw new Error('seed failed');
	return r2.value;
}

describe('catalog schema', () => {
	it('empty catalog carries schema v3', () => {
		const doc = emptyCatalog(NOW);
		expect(doc.schema).toBe(POS_CATALOG_SCHEMA_VERSION);
		expect(doc.schema).toBe(3);
		expect(doc.items).toEqual([]);
	});
});

describe('CRUD', () => {
	it('add + get roundtrip with truth pair (SAT)', () => {
		const doc = seeded();
		const p = getProduct(doc, 'p1');
		expect(p).not.toBeNull();
		expect(p!.name).toBe('Thai Tea');
		expect(p!.currency).toBe('SAT');
		expect(p!.amount).toBe(500);
		expect(p!.fiatPriced).toBe(true);
		expect(p!.active).toBe(true);
		expect(hasNativePrice(p!)).toBe(false);
	});

	it('add accepts a fiat truth pair', () => {
		const r = addProduct(emptyCatalog(NOW), {
			id: 'latte',
			name: 'Latte',
			currency: 'THB',
			amount: 100
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(getProduct(r.value, 'latte')).toMatchObject({ currency: 'THB', amount: 100 });
		expect(hasNativePrice(getProduct(r.value, 'latte')!)).toBe(true);
	});

	it('rejects empty id / empty name / bad truth', () => {
		const doc = emptyCatalog(NOW);
		expect(addProduct(doc, { id: '', name: 'x', currency: 'SAT', amount: 1 }).ok).toBe(false);
		expect(addProduct(doc, { id: 'a', name: '  ', currency: 'SAT', amount: 1 }).ok).toBe(false);
		for (const bad of [0, -5, 1.5, NaN]) {
			const r = addProduct(doc, { id: 'a', name: 'x', currency: 'SAT', amount: bad });
			expect(r.ok).toBe(false);
		}
		// unknown currency / bad-decimal fiat amount
		expect(
			addProduct(doc, { id: 'b', name: 'B', currency: 'XXX' as never, amount: 5 }).ok
		).toBe(false);
		expect(addProduct(doc, { id: 'c', name: 'C', currency: 'JPY', amount: 1.5 }).ok).toBe(
			false
		);
	});

	it('rejects duplicate id', () => {
		const doc = seeded();
		const r = addProduct(doc, { id: 'p1', name: 'Other', currency: 'SAT', amount: 9 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.code).toBe('DUPLICATE_ID');
	});

	it('update mutates allowed fields, id immutable, validates truth', () => {
		let doc = seeded();
		const r = updateProduct(doc, 'p1', { name: 'Thai Tea XL', currency: 'THB', amount: 100 });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		doc = r.value;
		expect(getProduct(doc, 'p1')).toMatchObject({ currency: 'THB', amount: 100 });
		expect(updateProduct(doc, 'nope', { name: 'z' }).ok).toBe(false);
		const bad = updateProduct(doc, 'p1', { amount: 0 });
		expect(bad.ok).toBe(false);
		// SAT fraction rejected (must stay integer sats)
		expect(updateProduct(doc, 'p1', { currency: 'SAT', amount: 1.5 }).ok).toBe(false);
	});

	it('update merges one side of the pair', () => {
		let doc = seeded();
		const set = updateProduct(doc, 'p1', { currency: 'THB', amount: 100 });
		expect(set.ok).toBe(true);
		if (!set.ok) return;
		doc = set.value;
		// one-sided amount patch merges with the stored currency
		const merge = updateProduct(doc, 'p1', { amount: 200 });
		expect(merge.ok).toBe(true);
		if (!merge.ok) return;
		expect(getProduct(merge.value, 'p1')).toMatchObject({ currency: 'THB', amount: 200 });
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
	it('garbage / null → empty v3 catalog, never throws', () => {
		for (const bad of [null, undefined, 42, 'x', []]) {
			const doc = normalizeCatalogDoc(bad, NOW);
			expect(doc.schema).toBe(3);
			expect(doc.items).toEqual([]);
		}
	});

	it('v3 rows survive untouched', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 3,
				updatedAt: NOW,
				items: [
					{ id: 'latte', name: 'Latte', currency: 'THB', amount: 100, kind: 'drink', active: true, updatedAt: NOW },
					{ id: 'coin', name: 'Coin', currency: 'SAT', amount: 900, active: true, updatedAt: NOW }
				]
			},
			NOW
		);
		expect(doc.schema).toBe(3);
		expect(doc.items).toHaveLength(2);
		expect(doc.items[0]).toMatchObject({ currency: 'THB', amount: 100 });
		expect(doc.items[1]).toMatchObject({ currency: 'SAT', amount: 900 });
	});

	it('drops duplicate ids, keeps first', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 3,
				items: [
					{ id: 'd', name: 'A', currency: 'SAT', amount: 10 },
					{ id: 'd', name: 'B', currency: 'SAT', amount: 20 }
				]
			},
			NOW
		);
		expect(doc.items).toHaveLength(1);
		expect(doc.items[0].name).toBe('A');
	});

	it('drops rows with no truth and no sellable legacy price', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 3,
				items: [
					{ id: 'bad', name: 'Bad', currency: 'XXX', amount: 5 },
					{ id: 'zero', name: 'Zero', currency: 'SAT', amount: 0 }
				]
			},
			NOW
		);
		expect(doc.items).toEqual([]);
	});
});

describe('MIGRATE v1/v2 → v3 (stored sats become truth, then dropped)', () => {
	it('v1 stored-sats-only rows → SAT truth with identical amounts', () => {
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
		expect(doc.schema).toBe(3);
		expect(doc.items).toHaveLength(3);
		expect(doc.items.map((p) => [p.currency, p.amount])).toEqual([
			['SAT', 500],
			['SAT', 1200],
			['SAT', 1]
		]);
		// the retired field is GONE from the live shape
		for (const p of doc.items) {
			expect(p).not.toHaveProperty('priceSat');
		}
		console.log(
			`[migrate-proof] v1→v3 before=3 after=${doc.items.length} truth=[${doc.items.map((p) => `${p.currency}:${p.amount}`).join(',')}] intact`
		);
	});

	it('v2 rows with a valid fiat pair keep the pair, stored sats dropped', () => {
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
		expect(doc.items[0]).toMatchObject({ currency: 'THB', amount: 100 });
		expect(doc.items[1]).toMatchObject({ currency: 'JPY', amount: 150 });
		for (const p of doc.items) {
			expect(p).not.toHaveProperty('priceSat');
		}
	});

	it('v2 broken pair + stored sats → SAT fallback (row stays sellable)', () => {
		const doc = normalizeCatalogDoc(
			{
				schema: 2,
				items: [
					{ id: 'half', name: 'Half', priceSat: 42, currency: 'THB', updatedAt: NOW },
					{ id: 'weird', name: 'Weird', priceSat: 43, currency: 'XXX', amount: 5, updatedAt: NOW },
					{ id: 'fraq', name: 'Fraq', priceSat: 44, currency: 'JPY', amount: 1.5, updatedAt: NOW }
				]
			},
			NOW
		);
		expect(doc.items).toHaveLength(3);
		expect(doc.items.map((p) => [p.currency, p.amount])).toEqual([
			['SAT', 42],
			['SAT', 43],
			['SAT', 44]
		]);
	});
});

describe('resolveTruthPair (rate-free entry validation)', () => {
	it('SAT integer ok, fiat decimals follow the fiat stack', () => {
		expect(resolveTruthPair('SAT', 200)).toMatchObject({ ok: true, currency: 'SAT', amount: 200 });
		expect(resolveTruthPair('THB', 100)).toMatchObject({ ok: true, currency: 'THB', amount: 100 });
		expect(resolveTruthPair('JPY', 1.5).ok).toBe(false);
		expect(resolveTruthPair('XXX', 5).ok).toBe(false);
		// agrees with convert.ts decimals policy exactly
		expect(resolveTruthPair('THB', 100.005).ok).toBe(parseFiatAmount('100.005', 'THB').ok);
	});
});
