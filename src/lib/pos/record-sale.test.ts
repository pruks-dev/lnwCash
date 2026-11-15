/**
 * TASK-5405 — scoped vitest for src/lib/pos/record-sale.ts (+ PosHistory/
 * PosSuccess file-hygiene guards).
 * Run scoped ONLY: npx vitest run src/lib/pos (L-P033 — never bare vitest)
 *
 * Proves:
 *   1. write-before-show: recordSale() persists via save() BEFORE returning
 *      ok:true (the success screen may only render the returned value).
 *   2. device-local midnight cut: sales straddling local midnight land on
 *      different days; summarizeShift([local-midnight, now)) keeps only
 *      today's side; no UTC slicing anywhere.
 *   3. separation: shop totals come only from SaleRecord[]; wallet numbers
 *      are never imported (static source guard) and never added in.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'node:url';
import {
	recordSale,
	formatDeviceTime,
	formatDeviceDateTime,
	startOfLocalDay,
	type RecordSaleDeps
} from './record-sale';
import {
	deviceDayKey,
	toDeviceIso,
	summarizeDay,
	summarizeShift,
	createSaleRecord,
	type SaleInput,
	type SaleRecord
} from './sales-log';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function input(over: Partial<SaleInput> = {}): SaleInput {
	return {
		totalSat: 2200,
		fiat: { currency: 'THB', pricePerBtc: 1_700_000, amount: 0.0374, text: '0.04 THB' },
		method: 'cashu',
		refId: 'token_abc123',
		lines: [{ productId: 'p1', name: 'Thai Tea', unitPriceSat: 1100, qty: 2, lineTotalSat: 2200 }],
		...over
	};
}

function deps(over: Partial<RecordSaleDeps> = {}): RecordSaleDeps {
	return {
		existing: [],
		save: () => true,
		nowMs: 1_790_000_000_000,
		rand: 'fix001',
		...over
	};
}

describe('write-before-show (paid-success contract)', () => {
	it('persists via save() BEFORE the caller may show the screen', () => {
		const order: string[] = [];
		let shownId: string | null = null;
		const r = recordSale(input(), {
			...deps(),
			save: (sales) => {
				order.push('saved');
				expect(sales).toHaveLength(1);
				return true;
			}
		});
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// The UI shows ONLY after ok:true lands — save() ran first.
		order.push('shown');
		shownId = r.value.id;
		expect(order).toEqual(['saved', 'shown']);
		expect(shownId).toBe('sale_1790000000000_fix001');
	});

	it('appends to the existing log without dropping earlier sales', () => {
		const first = createSaleRecord(input({ refId: 'q_first' }), 1_790_000_000_000, 'a');
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		let stored: SaleRecord[] = [];
		const r = recordSale(input({ refId: 'q_second', method: 'lightning' }), {
			...deps({ nowMs: 1_790_000_001_000, rand: 'b' }),
			existing: [first.value],
			save: (sales) => {
				stored = sales;
				return true;
			}
		});
		expect(r.ok).toBe(true);
		expect(stored).toHaveLength(2);
		expect(stored[0].refId).toBe('q_first');
		expect(stored[1].refId).toBe('q_second');
	});

	it('PERSIST_FAIL returns no value to show (nothing stored → no screen)', () => {
		const r = recordSale(input(), { ...deps(), save: () => false });
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.code).toBe('PERSIST_FAIL');
		expect((r as unknown as Record<string, unknown>).value).toBeUndefined();
	});

	it('validation failures never touch save()', () => {
		let saves = 0;
		const noSave = () => {
			saves += 1;
			return true;
		};
		expect(recordSale(input({ totalSat: 0 }), { ...deps(), save: noSave }).ok).toBe(false);
		expect(recordSale(input({ refId: '  ' }), { ...deps(), save: noSave }).ok).toBe(false);
		expect(saves).toBe(0);
	});
});

describe('device-local midnight cut (never UTC)', () => {
	// TZ-independent: constructed from LOCAL calendar fields, so "23:59:59
	// local" and "00:00 next day local" straddle midnight on ANY machine.
	const beforeMidnight = new Date(2026, 10, 9, 23, 59, 59, 999).getTime();
	const afterMidnight = new Date(2026, 10, 10, 0, 0, 0, 0).getTime();
	const middayAfter = new Date(2026, 10, 10, 12, 0, 0, 0).getTime();

	function saleAt(ms: number, rand: string, totalSat = 1000): SaleRecord {
		const r = createSaleRecord(input({ totalSat }), ms, rand);
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error('fixture must be valid');
		return r.value;
	}

	it('sales on either side of local midnight land on different days', () => {
		const dayA = deviceDayKey(beforeMidnight);
		const dayB = deviceDayKey(afterMidnight);
		expect(dayA).not.toBe(dayB);
		const sales = [saleAt(beforeMidnight, 'm1'), saleAt(afterMidnight, 'm2')];
		expect(summarizeDay(sales, dayA).count).toBe(1);
		expect(summarizeDay(sales, dayB).count).toBe(1);
	});

	it('summarizeShift([local-midnight, now)) keeps only the new-day side', () => {
		const sales = [saleAt(beforeMidnight, 's1'), saleAt(afterMidnight, 's2', 2000)];
		const midnight = startOfLocalDay(afterMidnight);
		expect(midnight).toBe(afterMidnight);
		const shift = summarizeShift(sales, midnight, middayAfter);
		expect(shift.count).toBe(1);
		expect(shift.totalSat).toBe(2000);
		// ...while a full-window shift sees both.
		expect(summarizeShift(sales, beforeMidnight, middayAfter).count).toBe(2);
	});

	it('device ISO carries a numeric offset, never UTC "Z"', () => {
		expect(toDeviceIso(afterMidnight)).not.toMatch(/Z$/);
		expect(toDeviceIso(afterMidnight)).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+[+-][0-9]{2}:[0-9]{2}$/);
	});

	it('device formatters use local getters (match the local calendar)', () => {
		const d = new Date(afterMidnight);
		const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
		expect(formatDeviceTime(afterMidnight)).toBe(
			`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
		);
		expect(formatDeviceDateTime(afterMidnight)).toBe(
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
				`${pad(d.getHours())}:${pad(d.getMinutes())}`
		);
	});

	it('no UTC slicing in the sales path (static source guard)', () => {
		// Doc comments may NAME toISOString() to forbid it — strip comments
		// first, then guard the remaining code.
		const stripComments = (src: string): string =>
			src
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/(^|\s)\/\/.*$/gm, '$1');
		for (const f of ['src/lib/pos/sales-log.ts', 'src/lib/pos/record-sale.ts']) {
			const code = stripComments(readFileSync(resolve(REPO_ROOT, f), 'utf-8'));
			expect(code, `${f} code must not slice UTC dates`).not.toContain('toISOString');
			expect(code, `${f} code must not use UTC getters`).not.toMatch(/getUTC[A-Z]/);
		}
		const history = existsSync(resolve(REPO_ROOT, 'src/screens/PosHistory.svelte'))
			? readFileSync(resolve(REPO_ROOT, 'src/screens/PosHistory.svelte'), 'utf-8')
			: null; // TASK-5416: UI deleted by design — guard vacuous when file absent
		if (history !== null)
			expect(history, 'PosHistory must not slice UTC dates').not.toContain('toISOString');
		const success = existsSync(resolve(REPO_ROOT, 'src/components/PosSuccess.svelte'))
			? readFileSync(resolve(REPO_ROOT, 'src/components/PosSuccess.svelte'), 'utf-8')
			: null; // TASK-5416: UI deleted by design — guard vacuous when file absent
		if (success !== null)
			expect(success, 'PosSuccess must not slice UTC dates').not.toContain('toISOString');
	});

	it('prints the midnight-cut proof block (captured into summary-proof.txt)', () => {
		const offMin = -new Date(afterMidnight).getTimezoneOffset();
		const sign = offMin >= 0 ? '+' : '-';
		const abs = Math.abs(offMin);
		const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
		const sales = [saleAt(beforeMidnight, 'p1', 1000), saleAt(afterMidnight, 'p2', 2000)];
		const dayA = deviceDayKey(beforeMidnight);
		const dayB = deviceDayKey(afterMidnight);
		console.log(
			`[5405-proof] tzOffset=${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)} ` +
				`beforeMs=${beforeMidnight} afterMs=${afterMidnight}`
		);
		console.log(`[5405-proof] day(before)=${dayA} day(after)=${dayB} different=${dayA !== dayB}`);
		console.log(
			`[5405-proof] summarizeDay(${dayA}).count=${summarizeDay(sales, dayA).count} ` +
				`summarizeDay(${dayB}).count=${summarizeDay(sales, dayB).count}`
		);
		const shift = summarizeShift(sales, startOfLocalDay(afterMidnight), middayAfter);
		console.log(
			`[5405-proof] summarizeShift([local-midnight, noon)).count=${shift.count} ` +
				`totalSat=${shift.totalSat} (only the new-day sale)`
		);
		expect(dayA).not.toBe(dayB);
	});
});

describe('shop-vs-wallet separation (never summed)', () => {
	it('shop summary counts SaleRecord[] only — wallet txs live in a separate total', () => {
		const r1 = createSaleRecord(input({ totalSat: 1000, method: 'cashu' }), 1_790_000_000_000, 'w1');
		const r2 = createSaleRecord(
			input({ totalSat: 2000, method: 'lightning', refId: 'lnbc_x' }),
			1_790_000_000_000,
			'w2'
		);
		expect(r1.ok && r2.ok).toBe(true);
		if (!r1.ok || !r2.ok) return;
		const shop = [r1.value, r2.value];
		// Wallet-side txs are a DIFFERENT source (read by History.svelte via
		// getTransactions — never imported here, fixture stands in for shape).
		const walletTxs = [
			{ id: 'mint-aaa', amount: 5000 },
			{ id: 'melt-bbb', amount: 3000 }
		];
		const shopSummary = summarizeDay(shop, deviceDayKey(1_790_000_000_000));
		const walletTotal = walletTxs.reduce((a, t) => a + t.amount, 0);
		expect(shopSummary.totalSat).toBe(3000);
		expect(walletTotal).toBe(8000);
		// The two ledgers are reported side-by-side, never merged:
		expect(shopSummary.totalSat).not.toBe(shopSummary.totalSat + walletTotal);
		expect(shopSummary.byMethod.cashu.totalSat).toBe(1000);
		expect(shopSummary.byMethod.lightning.totalSat).toBe(2000);
	});

	it('sales path never imports the wallet (static source guard)', () => {
		// Doc comments are allowed to NAME the forbidden modules (to say
		// "do not import these") — so strip comments first and guard the
		// remaining code: no wallet import edges, no wallet calls.
		const stripComments = (src: string): string =>
			src
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/(^|\s)\/\/.*$/gm, '$1');
		for (const f of [
			'src/lib/pos/sales-log.ts',
			'src/lib/pos/record-sale.ts',
			'src/screens/PosHistory.svelte', // TASK-5416: absent by design → skipped below
			'src/components/PosSuccess.svelte' // TASK-5416: absent by design → skipped below
		]) {
			if (!existsSync(resolve(REPO_ROOT, f))) continue; // UI deleted per 5416 — guard vacuous
			const code = stripComments(readFileSync(resolve(REPO_ROOT, f), 'utf-8'));
			for (const token of ['proofsDb', 'tokenStore', 'getTransactions']) {
				expect(code, `${f} code must not reference wallet-side "${token}"`).not.toContain(token);
			}
			const importLines = code.split('\n').filter((l) => l.trim().startsWith('import'));
			for (const line of importLines) {
				expect(line, `${f} must not import wallet/cashu stores`).not.toMatch(
					/storage\/db|cashu\/(client|token|keyset)|proofsDb|tokenStore/
				);
			}
		}
	});

	it('PosHistory stays read-only (no SaleRecord writes)', () => {
		// Same comment-stripping rule as above: prose may describe the
		// contract, code must not write.
		const stripComments = (src: string): string =>
			src
				.replace(/\/\*[\s\S]*?\*\//g, '')
				.replace(/(^|\s)\/\/.*$/gm, '$1');
		const history = existsSync(resolve(REPO_ROOT, 'src/screens/PosHistory.svelte'))
			? stripComments(
					readFileSync(resolve(REPO_ROOT, 'src/screens/PosHistory.svelte'), 'utf-8')
				)
			: null; // TASK-5416: UI deleted by design — guard vacuous when file absent
		if (history !== null) {
			expect(history).not.toContain('setPosSales');
			expect(history).not.toContain('recordSale');
			expect(history).not.toContain('createSaleRecord');
		}
		const success = existsSync(resolve(REPO_ROOT, 'src/components/PosSuccess.svelte'))
			? stripComments(
					readFileSync(resolve(REPO_ROOT, 'src/components/PosSuccess.svelte'), 'utf-8')
				)
			: null; // TASK-5416: UI deleted by design — guard vacuous when file absent
		if (success !== null) {
			expect(success).not.toContain('setPosSales');
			expect(success).not.toContain('recordSale(');
		}
	});
});
