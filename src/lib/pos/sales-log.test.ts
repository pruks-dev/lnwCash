/**
 * TASK-5710 — scoped vitest for src/lib/pos/sales-log.ts (v3 snapshot freeze)
 * Run scoped ONLY: npx vitest run src/lib/pos/sales-log.test.ts (L-P033 — never bare vitest)
 */
import { describe, it, expect } from 'vitest';
import {
	toDeviceIso,
	deviceDayKey,
	normalizeSales,
	normalizeSaleLine,
	createSaleRecord,
	summarizeDay,
	summarizeShift,
	listSaleDays,
	type SaleRecord,
	type SaleInput
} from './sales-log';

function line(over: Record<string, unknown> = {}) {
	return {
		productId: 'p1',
		name: 'Thai Tea',
		currency: 'SAT',
		amount: 500,
		unitSats: 500,
		qty: 2,
		lineTotalSat: 1000,
		rate: null,
		...over
	};
}

function input(over: Partial<SaleInput> = {}): SaleInput {
	return {
		totalSat: 2200,
		fiat: { currency: 'THB', pricePerBtc: 1_700_000, amount: 0.0374, text: '0.04 THB' },
		method: 'cashu',
		refId: 'token_abc123',
		lines: [line(), { ...line(), productId: 'p2', name: 'Cake', amount: 1200, unitSats: 1200, qty: 1, lineTotalSat: 1200 }],
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
		const ms = Date.UTC(2026, 4, 17, 12, 0, 0);
		const d = new Date(ms);
		const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
		const expected = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		expect(deviceDayKey(ms)).toBe(expected);
		const midnightLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
		const prev = new Date(midnightLocal - 1);
		const expectedPrev = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
		expect(deviceDayKey(midnightLocal - 1)).toBe(expectedPrev);
	});
});

describe('v3 snapshot freeze', () => {
	it('fiat rows freeze truth + unitSats + rate; SAT rows carry null rate', () => {
		const fiatLine = {
			productId: 'latte',
			name: 'Latte',
			currency: 'THB',
			amount: 100,
			unitSats: 5882,
			qty: 1,
			lineTotalSat: 5882,
			rate: 1_700_000
		};
		const l = normalizeSaleLine(fiatLine);
		expect(l).toMatchObject(fiatLine);
		const s = normalizeSaleLine(line());
		expect(s).toMatchObject({ currency: 'SAT', amount: 500, unitSats: 500, rate: null });
	});

	it('SAT row with a rate is rejected (SAT path never touches rate)', () => {
		expect(normalizeSaleLine({ ...line(), rate: 123 })).toBeNull();
	});

	it('missing lineTotalSat recomputes from frozen unitSats × qty', () => {
		const { lineTotalSat: _drop, ...rest } = line();
		void _drop;
		expect(normalizeSaleLine(rest)?.lineTotalSat).toBe(1000);
	});

	it('drops lines missing sell-critical fields', () => {
		expect(normalizeSaleLine(null)).toBeNull();
		expect(normalizeSaleLine({ ...line(), productId: '' })).toBeNull();
		expect(normalizeSaleLine({ ...line(), qty: 0 })).toBeNull();
		expect(normalizeSaleLine({ ...line(), unitSats: 0 })).toBeNull();
	});
});

describe('MIGRATE pre-v3 rows still read (totals byte-identical)', () => {
	it('stored-sats rows map to a SAT freeze', () => {
		const l = normalizeSaleLine({
			productId: 'latte',
			name: 'Latte',
			unitPriceSat: 200,
			qty: 2,
			lineTotalSat: 400
		});
		expect(l).toMatchObject({
			currency: 'SAT',
			amount: 200,
			unitSats: 200,
			qty: 2,
			lineTotalSat: 400,
			rate: null
		});
	});

	it('v2-style rows (stored sats + fiat pair) keep the pair with frozen sats', () => {
		const l = normalizeSaleLine({
			productId: 'latte',
			name: 'Latte',
			unitPriceSat: 5882,
			currency: 'THB',
			amount: 100,
			qty: 1,
			lineTotalSat: 5882,
			rate: 1_700_000
		});
		expect(l).toMatchObject({
			currency: 'THB',
			amount: 100,
			unitSats: 5882,
			rate: 1_700_000
		});
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
	});

	it('summarizeShift windows + listSaleDays ascending', () => {
		const sales = twoSales();
		const day = deviceDayKey(1_790_000_000_000);
		const shift = summarizeShift(sales, 1_790_000_000_000 - 1, 1_790_000_000_000 + 1);
		expect(shift.count).toBe(2);
		expect(listSaleDays(sales)).toEqual([day]);
	});
});
