/**
 * TASK-5401 — scoped vitest for src/lib/pos/sales-log.ts
 * Run scoped ONLY: npx vitest run src/lib/pos (L-P033 — never bare vitest)
 */
import { describe, it, expect } from 'vitest';
import {
	toDeviceIso,
	deviceDayKey,
	normalizeSales,
	createSaleRecord,
	summarizeDay,
	summarizeShift,
	listSaleDays,
	type SaleRecord,
	type SaleInput
} from './sales-log';

function input(over: Partial<SaleInput> = {}): SaleInput {
	return {
		totalSat: 2200,
		fiat: { currency: 'THB', pricePerBtc: 1_700_000, amount: 0.0374, text: '0.04 THB' },
		method: 'cashu',
		refId: 'token_abc123',
		lines: [{ productId: 'p1', name: 'Thai Tea', unitPriceSat: 500, qty: 2, lineTotalSat: 1000 }],
		...over
	};
}

describe('device-local time', () => {
	it('toDeviceIso carries numeric offset, never UTC Z', () => {
		const iso = toDeviceIso(1_790_000_000_000);
		expect(iso).not.toMatch(/Z$/);
		expect(iso).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+[+-][0-9]{2}:[0-9]{2}$/);
	});

	it('deviceDayKey equals local calendar day (not UTC slice)', () => {
		// TZ-independent: derive expected from local getters, not a hard date.
		const ms = Date.UTC(2026, 4, 17, 12, 0, 0);
		const d = new Date(ms);
		const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
		const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		expect(deviceDayKey(ms)).toBe(expected);
		// local-midnight boundary: 1ms before local midnight is the previous day
		const midnightLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		const prev = new Date(midnightLocal - 1);
		const expectedPrev = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
		expect(deviceDayKey(midnightLocal - 1)).toBe(expectedPrev);
	});
});

describe('createSaleRecord', () => {
	it('stamps id + device time, links payment by refId only', () => {
		const r = createSaleRecord(input(), 1_790_000_000_000, 'xyz123');
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.value.id).toBe('sale_1790000000000_xyz123');
		expect(r.value.createdAtMs).toBe(1_790_000_000_000);
		expect(r.value.createdAtIso).toBe(toDeviceIso(1_790_000_000_000));
		expect(r.value.method).toBe('cashu');
		expect(r.value.refId).toBe('token_abc123');
		// link-only: no embedded token object
		expect((r.value as unknown as Record<string, unknown>).token).toBeUndefined();
		expect((r.value as unknown as Record<string, unknown>).proofs).toBeUndefined();
	});

	it('rejects bad total / empty lines / bad method / empty ref', () => {
		expect(createSaleRecord(input({ totalSat: 0 })).ok).toBe(false);
		expect(createSaleRecord(input({ lines: [] })).ok).toBe(false);
		expect(createSaleRecord(input({ refId: '  ' })).ok).toBe(false);
		const badMethod = createSaleRecord({
			...input(),
			method: 'credit-card' as unknown as 'cashu'
		});
		expect(badMethod.ok).toBe(false);
	});
});

describe('normalizeSales (old-install migrate)', () => {
	it('non-array → []', () => {
		expect(normalizeSales(null)).toEqual([]);
		expect(normalizeSales({})).toEqual([]);
	});

	it('drops corrupt rows, keeps valid ones', () => {
		const good = createSaleRecord(input(), 1_790_000_000_000, 'ok1');
		expect(good.ok).toBe(true);
		if (!good.ok) return;
		const rows = normalizeSales([
			good.value,
			{ id: '', method: 'cashu', totalSat: 5, lines: [{ x: 1 }], refId: 't' },
			{ id: 'bad2', method: 'visa', totalSat: 5, lines: [{ x: 1 }], refId: 't' },
			'garbage',
			null
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(good.value.id);
	});
});

describe('summaries (device-local buckets)', () => {
	function twoSales(): SaleRecord[] {
		const a = createSaleRecord(input({ method: 'cashu', totalSat: 1000 }), 1_790_000_000_000, 'a');
		const b = createSaleRecord(
			input({ method: 'lightning', totalSat: 2000, refId: 'lnbc_1' }),
			1_790_000_000_000,
			'b'
		);
		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return [];
		return [a.value, b.value];
	}

	it('summarizeDay splits by method', () => {
		const sales = twoSales();
		const day = deviceDayKey(1_790_000_000_000);
		const s = summarizeDay(sales, day);
		expect(s.count).toBe(2);
		expect(s.totalSat).toBe(3000);
		expect(s.byMethod.cashu).toEqual({ count: 1, totalSat: 1000 });
		expect(s.byMethod.lightning).toEqual({ count: 1, totalSat: 2000 });
		expect(summarizeDay(sales, '2000-01-01').count).toBe(0);
	});

	it('summarizeShift respects [start, end) window', () => {
		const sales = twoSales();
		const t = 1_790_000_000_000;
		const inside = summarizeShift(sales, t - 1000, t + 1000);
		expect(inside.count).toBe(2);
		const outside = summarizeShift(sales, t + 1000, t + 2000);
		expect(outside.count).toBe(0);
	});

	it('listSaleDays ascending unique', () => {
		const sales = twoSales();
		expect(listSaleDays(sales)).toEqual([deviceDayKey(1_790_000_000_000)]);
	});
});
