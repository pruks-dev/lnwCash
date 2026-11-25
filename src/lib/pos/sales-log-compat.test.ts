/**
 * TASK-5710 — scoped vitest for sales-log history compat (v3 freeze + legacy rows)
 * Run scoped ONLY: npx vitest run src/lib/pos/sales-log-compat.test.ts (L-P033 — never bare vitest)
 *
 * Shape 1 (pre-v3): lines carry stored sats (unitPriceSat) + optional fiat
 * pair → read as frozen rows (SAT freeze or pair-kept freeze).
 * Shape 2 (5603 identity): lineId + modifier/modifierLabel/note preserved.
 * Shape 3 (v3 freeze): { currency, amount, unitSats, rate } kept verbatim.
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
	it('legacy stored-sats line → SAT freeze, empty identity, bare lineId', () => {
		const l = normalizeSaleLine({
			productId: 'latte',
			name: 'Latte',
			unitPriceSat: 200,
			qty: 2,
			lineTotalSat: 400
		});
		expect(l).toMatchObject({
			productId: 'latte',
			currency: 'SAT',
			amount: 200,
			unitSats: 200,
			lineTotalSat: 400,
			rate: null,
			lineId: 'latte',
			modifier: '',
			modifierLabel: '',
			note: ''
		});
	});

	it('5603 identity + stored sats keeps identity byte-for-byte', () => {
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
			note: 'หวานน้อย',
			unitSats: 200,
			lineTotalSat: 200
		});
	});

	it('v3 freeze row passes through verbatim', () => {
		const l = normalizeSaleLine({
			productId: 'latte',
			name: 'Latte',
			currency: 'THB',
			amount: 100,
			unitSats: 5882,
			qty: 1,
			lineTotalSat: 5882,
			rate: 1_700_000
		});
		expect(l).toMatchObject({
			currency: 'THB',
			amount: 100,
			unitSats: 5882,
			lineTotalSat: 5882,
			rate: 1_700_000
		});
	});

	it('recomputes a missing lineTotalSat from frozen unitSats × qty', () => {
		const l = normalizeSaleLine({
			productId: 'p',
			name: 'N',
			currency: 'SAT',
			amount: 200,
			unitSats: 200,
			qty: 3
		});
		expect(l?.lineTotalSat).toBe(600);
	});

	it('drops lines missing sell-critical fields', () => {
		expect(normalizeSaleLine(null)).toBeNull();
		expect(normalizeSaleLine({ productId: '', name: 'N', unitPriceSat: 1, qty: 1 })).toBeNull();
		expect(normalizeSaleLine({ productId: 'p', name: 'N', unitPriceSat: 0, qty: 1 })).toBeNull();
		expect(normalizeSaleLine({ productId: 'p', name: 'N', unitPriceSat: 1, qty: 0 })).toBeNull();
		expect(
			normalizeSaleLine({ productId: 'p', name: 'N', currency: 'SAT', amount: 0, unitSats: 5, qty: 1 })
		).toBeNull();
	});
});

describe('normalizeSales 2-shape', () => {
	it('old persisted sales read with frozen SAT lines', () => {
		const out = normalizeSales([legacySale()]);
		expect(out).toHaveLength(1);
		const s: SaleRecord = out[0];
		expect(s.totalSat).toBe(400);
		expect(s.lines).toHaveLength(1);
		expect(s.lines[0]).toMatchObject({ currency: 'SAT', unitSats: 200, lineTotalSat: 400, rate: null });
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
				currency: 'THB',
				amount: 100,
				unitSats: 5882,
				qty: 1,
				lineTotalSat: 5882,
				rate: 1_700_000,
				lineId: 'latte:less:หวานน้อย',
				modifier: 'less',
				modifierLabel: 'หวานน้อย',
				note: 'หวานน้อย'
			}
		];
		const out = normalizeSales([legacySale(), fresh]);
		expect(out).toHaveLength(2);
		expect(out[1].lines[0]).toMatchObject({ currency: 'THB', amount: 100, rate: 1_700_000 });
	});
});
