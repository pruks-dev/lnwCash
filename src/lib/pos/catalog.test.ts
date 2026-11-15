/**
 * TASK-5401 — scoped vitest for src/lib/pos/catalog.ts
 * Run scoped ONLY: npx vitest run src/lib/pos (L-P033 — never bare vitest)
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
	POS_CATALOG_SCHEMA_VERSION
} from './catalog';

const NOW = 1_790_000_000_000;

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
	it('empty catalog carries schema v1', () => {
		const doc = emptyCatalog(NOW);
		expect(doc.schema).toBe(POS_CATALOG_SCHEMA_VERSION);
		expect(doc.items).toEqual([]);
	});
});

describe('CRUD', () => {
	it('add + get roundtrip with defaults (kind/fiat/active)', () => {
		const doc = seeded();
		const p = getProduct(doc, 'p1');
		expect(p).not.toBeNull();
		expect(p!.name).toBe('Thai Tea');
		expect(p!.priceSat).toBe(500);
		expect(p!.fiatPriced).toBe(true);
		expect(p!.active).toBe(true);
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
	it('garbage / null → empty v1 catalog, never throws', () => {
		for (const bad of [null, undefined, 42, 'x', []]) {
			const doc = normalizeCatalogDoc(bad, NOW);
			expect(doc.schema).toBe(1);
			expect(doc.items).toEqual([]);
		}
	});

	it('pre-5401 doc without schema keeps valid rows, stamps v1', () => {
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
		expect(doc.schema).toBe(1);
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
