/**
 * TASK-5401 — scoped vitest for POS persistence (storage/local.ts pos:* keys)
 * Run scoped ONLY: npx vitest run src/lib/pos (L-P033 — never bare vitest)
 *
 * Covers the get/set/clear pairs for pos:catalog + pos:sales and proves
 * old installs (keys absent / pre-5401 shapes) still load.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
	getPosCatalog,
	setPosCatalog,
	clearPosCatalog,
	getPosSales,
	setPosSales,
	clearPosSales,
	clearAll
} from '../storage/local';
import { emptyCatalog, addProduct } from './catalog';
import { createSaleRecord, type SaleInput } from './sales-log';

const NOW = 1_790_000_000_000;

function saleInput(): SaleInput {
	return {
		totalSat: 1500,
		fiat: { currency: 'THB', pricePerBtc: 1_700_000, amount: 0.0255, text: '0.03 THB' },
		method: 'lightning',
		refId: 'lnbc_test1',
		lines: [{ productId: 'p1', name: 'Thai Tea', currency: 'SAT', amount: 500, unitSats: 500, qty: 3, lineTotalSat: 1500, rate: null }]
	};
}

beforeEach(() => {
	clearAll();
});

describe('pos:catalog persistence pair', () => {
	it('absent key (old install) → empty v3 catalog', () => {
		const doc = getPosCatalog();
		expect(doc.schema).toBe(3);
		expect(doc.items).toEqual([]);
	});

	it('set/get roundtrip', () => {
		let doc = emptyCatalog(NOW);
		const r = addProduct(doc, { id: 'p1', name: 'Thai Tea', currency: 'SAT', amount: 500, kind: 'drink' });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		doc = r.value;
		expect(setPosCatalog(doc)).toBe(true);
		const back = getPosCatalog();
		expect(back.items).toHaveLength(1);
		expect(back.items[0].name).toBe('Thai Tea');
	});

	it('clear drops the key, next read is empty', () => {
		const r = addProduct(emptyCatalog(NOW), { id: 'p1', name: 'x', currency: 'SAT', amount: 5 });
		if (!r.ok) return;
		setPosCatalog(r.value);
		expect(clearPosCatalog()).toBe(true);
		expect(getPosCatalog().items).toEqual([]);
	});

	it('pre-5401 raw shape (no schema) loads via normalize', () => {
		localStorage.setItem(
			'lnwcash_pos_catalog',
			JSON.stringify({ items: [{ id: 'old', name: 'Old', priceSat: 100 }] })
		);
		const doc = getPosCatalog();
		expect(doc.schema).toBe(3);
		expect(doc.items).toHaveLength(1);
		expect(doc.items[0].active).toBe(true);
	});
});

describe('pos:sales persistence pair', () => {
	it('absent key (old install) → empty log', () => {
		expect(getPosSales()).toEqual([]);
	});

	it('set/get roundtrip', () => {
		const r = createSaleRecord(saleInput(), NOW, 'persist1');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(setPosSales([r.value])).toBe(true);
		const back = getPosSales();
		expect(back).toHaveLength(1);
		expect(back[0].id).toBe('sale_1790000000000_persist1');
		expect(back[0].refId).toBe('lnbc_test1');
	});

	it('clear drops the key, next read is empty', () => {
		const r = createSaleRecord(saleInput(), NOW, 'c1');
		if (!r.ok) return;
		setPosSales([r.value]);
		expect(clearPosSales()).toBe(true);
		expect(getPosSales()).toEqual([]);
	});

	it('mixed corrupt persisted array → only valid rows survive', () => {
		const r = createSaleRecord(saleInput(), NOW, 'mix1');
		if (!r.ok) return;
		localStorage.setItem('lnwcash_pos_sales', JSON.stringify([r.value, { nope: 1 }, null]));
		const back = getPosSales();
		expect(back).toHaveLength(1);
		expect(back[0].refId).toBe('lnbc_test1');
	});
});

describe('clearAll covers POS keys (single-device scope)', () => {
	it('wipes catalog + sales together with wallet keys', () => {
		const rc = addProduct(emptyCatalog(NOW), { id: 'p1', name: 'x', currency: 'SAT', amount: 5 });
		if (!rc.ok) return;
		setPosCatalog(rc.value);
		const rs = createSaleRecord(saleInput(), NOW, 'all1');
		if (!rs.ok) return;
		setPosSales([rs.value]);
		clearAll();
		expect(getPosCatalog().items).toEqual([]);
		expect(getPosSales()).toEqual([]);
	});
});
