/**
 * TASK-5603 — scoped vitest for sales-log 2-shape history compat
 * (INTENT-056 BLUEPRINT-056 v2).
 * Run scoped ONLY: npx vitest run --project=product src/lib/pos/sales-log-compat.test.ts
 * (L-P033 — never bare vitest).
 *
 * Shape 1 (pre-5603): lines carry productId/name/unitPriceSat/qty/
 * lineTotalSat only — no modifier/note fields at all. Must read as
 * empty-note lines (history keeps rendering, totals intact).
 * Shape 2 (5603): lines carry lineId + modifier/modifierLabel/note.
 */
import { describe, it, expect } from 'vitest';
import { normalizeSales, normalizeSaleLine } from './sales-log';
import type { SaleRecord } from './sales-log';

function legacySale(): Record<string, unknown> {
	return {
		id: 'sale_old',
		createdAtIso: '2026-11-20T10:00:00.000+07:00',
		createdAtMs: 1_794_000_000_000,
		totalSat: 400,
		fiat: { currency: 'THB', pricePerBtc: 3_000_000, amount: 0.012, text: '36.00 THB' },
		method: 'cashu',
		refId: 'cashu:1:400',
		lines: [{ productId: 'latte', name: 'Latte', unitPriceSat: 200, qty: 2, lineTotalSat: 400 }]
	};
}

describe('normalizeSaleLine', () => {
	it('legacy line (no identity fields) → empty note, bare lineId', () => {
		const l = normalizeSaleLine({
			productId: 'latte',
			name: 'Latte',
			unitPriceSat: 200,
			qty: 2,
			lineTotalSat: 400
		});
		expect(l).toMatchObject({
			productId: 'latte',
			lineId: 'latte',
			modifier: '',
			modifierLabel: '',
			note: ''
		});
	});

	it('5603 line keeps identity byte-for-byte', () => {
		const l = normalizeSaleLine({
			productId: 'latte',
			name: 'Latte',
			unitPriceSat: 200,
			qty: 1,
			lineTotalSat: 200,
			lineId: 'latte:less:หวานน้อย',
			modifier: 'less',
			modifierLabel: 'หวานน้อย',
			note: 'หวานน้อย'
		});
		expect(l).toMatchObject({
			lineId: 'latte:less:หวานน้อย',
			modifier: 'less',
			modifierLabel: 'หวานน้อย',
			note: 'หวานน้อย'
		});
	});

	it('recomputes a missing lineTotalSat from unit × qty', () => {
		const l = normalizeSaleLine({ productId: 'p', name: 'N', unitPriceSat: 200, qty: 3 });
		expect(l?.lineTotalSat).toBe(600);
	});

	it('drops lines missing sell-critical fields', () => {
		expect(normalizeSaleLine(null)).toBeNull();
		expect(normalizeSaleLine({ productId: '', name: 'N', unitPriceSat: 1, qty: 1 })).toBeNull();
		expect(normalizeSaleLine({ productId: 'p', name: 'N', unitPriceSat: 0, qty: 1 })).toBeNull();
		expect(normalizeSaleLine({ productId: 'p', name: 'N', unitPriceSat: 1, qty: 0 })).toBeNull();
	});
});

describe('normalizeSales 2-shape', () => {
	it('old persisted sales read with empty-note lines', () => {
		const out = normalizeSales([legacySale()]);
		expect(out).toHaveLength(1);
		const s: SaleRecord = out[0];
		expect(s.totalSat).toBe(400);
		expect(s.lines).toHaveLength(1);
		expect(s.lines[0].note ?? '').toBe('');
		expect(s.lines[0].modifier ?? '').toBe('');
	});

	it('mixed old + new sales both survive in one log', () => {
		const fresh = legacySale();
		fresh.id = 'sale_new';
		fresh.lines = [
			{
				productId: 'latte',
				name: 'Latte',
				unitPriceSat: 200,
				qty: 1,
				lineTotalSat: 200,
				lineId: 'latte:less:หวานน้อย',
				modifier: 'less',
				modifierLabel: 'หวานน้อย',
				note: 'หวานน้อย'
			},
			{ productId: 'tea', name: 'Tea', unitPriceSat: 2100, qty: 1, lineTotalSat: 2100 }
		];
		fresh.totalSat = 2300;
		const out = normalizeSales([legacySale(), fresh]);
		expect(out).toHaveLength(2);
		expect(out[1].lines).toHaveLength(2);
		expect(out[1].lines[0].note).toBe('หวานน้อย');
		expect(out[1].lines[1].note ?? '').toBe('');
	});

	it('sale whose every line is corrupt still drops (existing rule kept)', () => {
		const bad = legacySale();
		bad.lines = [{ productId: '', name: '', unitPriceSat: -1, qty: 0 }];
		expect(normalizeSales([bad])).toEqual([]);
	});
});
