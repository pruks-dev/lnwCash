/**
 * TASK-4911 (INTENT-049, failed-policy ใหม่ตามกฎบอส): failed ได้ทางเดียว
 * คือพิสูจน์แล้วว่าไม่จ่าย — เลิกดู invoice expiry โดยสิ้นเชิง.
 *
 * TASK-4915 (INTENT-049, BLUEPRINT-049 v5 + Commander ORDER rev60
 * fix-forward test-only): เคส (3)(4) เดิม SUPERSEDED โดยนโยบายใหม่ 4913 —
 * retryable ⟹ failed (reconcile เจอ retryable = UNPAID/PENDING + inputs
 * UNSPENT ทั้งหมด ⇒ failed ทันที + clearReserved ไม่มี resend).
 * rewrite เคส (3)(4) ให้ตรงนโยบายใหม่ test-only — prod logic ห้ามแตะ.
 *
 * Scoped proof (4 cases, resolver-level with real proofsDb + real storage,
 * mocked mint network only):
 *   1. Unpaid-then-UNSPENT → failed + released NOW (history = truth).
 *   2. terminal-Paid → confirmed (inputs consumed, no stuck lock).
 *   3. stuck-Pending + all UNSPENT → failed NOW + released (4913: PENDING
 *      +UNSPENT ทั้งหมด = POST ไม่เคยมีผล = proven non-payment — ไม่มี
 *      resend, lock ว่าง, history = failed).
 *   4. expired-invoice + PENDING-quote + all UNSPENT → failed NOW +
 *      released (invoice หมดอายุไม่มีผลต่อ verdict ใด ๆ — quote PENDING +
 *      checkState พิสูจน์ไม่จ่าย = failed, ไม่มี resend).
 *
 * Case 4 uses the REAL BOLT-11 spec vector V1 decoded by the REAL
 * decodeBolt11 (timestamp 1496314658 + 3600s → long expired): under the old
 * expiry-driven policy this tx would fail on time; under the new policy the
 * invoice is never even read — the PENDING quote + all-UNSPENT checkState
 * proof fails it on mint truth, not on the clock.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, FRESH_SENTINEL } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	FRESH_SENTINEL: 'lnbc-4911-fresh-sentinel-never-decoded'
}));

// Real BOLT-11 spec vector (zero-amount, timestamp 1496314658, default
// expiry 3600 → long expired). Decoded by the REAL decoder in case 4 to
// prove the "expired invoice" premise with no mocks.
const V1_EXPIRED =
	'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w';

/** checkState verdict for the mocked mint (mutable per test). */
let mockProofStates: Array<'UNSPENT' | 'SPENT' | 'PENDING'> = [];
/** checkMeltQuote verdict for the mocked mint (mutable per test). */
let mockQuoteState = 'UNPAID';

vi.mock('../../cashu/client', () => ({
	checkMintQuote: vi.fn(),
	checkMeltQuote: vi.fn().mockImplementation((_mint: string, quoteId: string) =>
		Promise.resolve({
			quote: quoteId,
			amount: 5,
			fee_reserve: 0,
			paid: mockQuoteState === 'PAID',
			expiry: 9999999999,
			state: mockQuoteState
		})
	),
	checkState: vi.fn().mockImplementation((_mint: string, proofs: Array<{ secret: string }>) =>
		Promise.resolve({
			states: proofs.map((p, i) => ({
				secret: p.secret,
				state: mockProofStates[i] ?? 'UNSPENT',
				witness: null
			}))
		}
	))
}));

// ─── Imports (after mocks) ─────────────────────────────────────

import { clearAllWalletData } from '../storage';
import { addTransaction, getTransactions, clearTransactions } from '../../storage/db';
import {
	addProofs,
	getAllProofs,
	getUnspentProofs,
	markReserved,
	getReservedProofs,
	getTotalBalance,
	deleteProofDB,
	resetProofDB
} from '../proofsDb';
import { resolvePendingTransactions } from '../pending-tx-resolver';
import { decodeBolt11 } from '../bolt11';
import type { TokenProof } from '../../types';

function makeProof(tag: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-4911-${tag}`, C: `sig-4911-${tag}` };
}

async function localIdsOf(tags: string[]): Promise<string[]> {
	const all = await getAllProofs();
	return tags.map((t) => {
		const found = all.find((p) => p.secret === `secret-4911-${t}`);
		if (!found) throw new Error(`test setup: proof ${t} not stored`);
		return found.local_id;
	});
}

describe('TASK-4911 failed-policy: Unpaid-driven + checkState, no time-based fail', () => {
	beforeEach(async () => {
		await clearAllWalletData();
		await clearTransactions();
		await deleteProofDB();
		resetProofDB();
		try { localStorage.clear(); } catch { /* ignore */ }
		vi.clearAllMocks();
		mockProofStates = [];
		mockQuoteState = 'UNPAID';
	});

	afterEach(async () => {
		await clearAllWalletData();
		await clearTransactions();
		await deleteProofDB();
		resetProofDB();
	});

	it('(1) Unpaid-then-UNSPENT → failed + released NOW (history reflects truth)', async () => {
		await addProofs([makeProof('u1', 8)], MINT_URL, KEYSET_ID);
		const [idU] = await localIdsOf(['u1']);
		await markReserved([idU]);
		await addTransaction({
			id: 'melt-q4911-unpaid-01',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: null,
			invoice: FRESH_SENTINEL,
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idU]
		});
		mockQuoteState = 'UNPAID';
		mockProofStates = ['UNSPENT'];

		const n = await resolvePendingTransactions();

		expect(n).toBe(1);
		// History: failed ทันที (released+unspent = ไม่จ่าย = failed ไม่ใช่ confirmed).
		const failed = await getTransactions({ type: 'melt', status: 'failed' });
		expect(failed.some((t) => t.id === 'melt-q4911-unpaid-01')).toBe(true);
		// Mint ปล่อย proofs: lock ว่าง + เหรียญกลับ pool ครบ.
		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(1);
		expect(await getTotalBalance()).toBe(8);
	});

	it('(2) terminal-Paid → confirmed (inputs consumed, no stuck lock)', async () => {
		await addProofs([makeProof('p1', 8)], MINT_URL, KEYSET_ID);
		const [idP] = await localIdsOf(['p1']);
		await markReserved([idP]);
		await addTransaction({
			id: 'melt-q4911-paid-02',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: null,
			invoice: FRESH_SENTINEL,
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idP]
		});
		mockQuoteState = 'PAID';

		const n = await resolvePendingTransactions();

		expect(n).toBe(1);
		const confirmed = await getTransactions({ type: 'melt', status: 'confirmed' });
		expect(confirmed.some((t) => t.id === 'melt-q4911-paid-02')).toBe(true);
		expect(await getReservedProofs()).toEqual([]);
		expect((await getAllProofs()).find((p) => p.local_id === idP)?.spent).toBe(true);
	});

	it('(3) stuck-Pending + all UNSPENT → failed NOW + released, no resend (4913 retryable⟹failed)', async () => {
		await addProofs([makeProof('s1', 8)], MINT_URL, KEYSET_ID);
		const [idS] = await localIdsOf(['s1']);
		await markReserved([idS]);
		await addTransaction({
			id: 'melt-q4911-pending-03',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: null,
			invoice: FRESH_SENTINEL,
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idS]
		});
		// TASK-4913: PENDING + inputs UNSPENT ทั้งหมด = POST ไม่เคยมีผล =
		// proven non-payment → failed ทันที + clearReserved ไม่มี resend.
		mockQuoteState = 'PENDING';
		mockProofStates = ['UNSPENT'];
		const warns: string[] = [];
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
			warns.push(a.map(String).join(' '));
		});

		const n = await resolvePendingTransactions();

		warnSpy.mockRestore();

		// Failed ทันที — ไม่ค้าง pending อีก (SUPERSEDED เคสเดิมที่ assert pending).
		expect(n).toBe(1);
		const failed = await getTransactions({ type: 'melt', status: 'failed' });
		expect(failed.some((t) => t.id === 'melt-q4911-pending-03')).toBe(true);
		const still = await getTransactions({ type: 'melt', status: 'pending' });
		expect(still.some((t) => t.id === 'melt-q4911-pending-03')).toBe(false);
		// Proven non-payment ปล่อย lock: เหรียญกลับ pool ครบ + balance คืน.
		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(1);
		expect(await getTotalBalance()).toBe(8);
		// ไม่มี resend / retry อัตโนมัติใด ๆ.
		expect(warns.some((w) => /resend/i.test(w))).toBe(false);
		expect(warns.some((w) => /attempt\s+\d|2\/3|3\/3/i.test(w))).toBe(false);
	});

	it('(4) expired-invoice + PENDING-quote + all UNSPENT → failed NOW + released (no time-based verdict, no resend)', async () => {
		// Prove the premise with the REAL decoder: this invoice is expired.
		const decoded = decodeBolt11(V1_EXPIRED);
		expect('code' in decoded).toBe(false);
		if (!('code' in decoded)) {
			expect((decoded.timestamp + decoded.expiry) * 1000).toBeLessThan(Date.now());
		}

		await addProofs([makeProof('e1', 8)], MINT_URL, KEYSET_ID);
		const [idE] = await localIdsOf(['e1']);
		await markReserved([idE]);
		await addTransaction({
			id: 'melt-q4911-expired-04',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: null,
			invoice: V1_EXPIRED,
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idE]
		});
		// TASK-4913: quote PENDING + checkState ยืนยัน inputs ทั้งหมด UNSPENT
		// = proven non-payment → failed ทันที (invoice หมดอายุไม่มีผล —
		// verdict มาจาก mint truth ไม่ใช่นาฬิกา).
		mockQuoteState = 'PENDING';
		mockProofStates = ['UNSPENT'];
		const warns: string[] = [];
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
			warns.push(a.map(String).join(' '));
		});

		const n = await resolvePendingTransactions();

		warnSpy.mockRestore();

		// Expired invoice + PENDING quote + all UNSPENT = failed NOW
		// (SUPERSEDED เคสเดิมที่ assert pending — นโยบายใหม่ fail ทันที).
		expect(n).toBe(1);
		const failed = await getTransactions({ type: 'melt', status: 'failed' });
		expect(failed.some((t) => t.id === 'melt-q4911-expired-04')).toBe(true);
		const still = await getTransactions({ type: 'melt', status: 'pending' });
		expect(still.some((t) => t.id === 'melt-q4911-expired-04')).toBe(false);
		// Coins released: no lock + full balance back in the pool.
		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(1);
		expect(await getTotalBalance()).toBe(8);
		// ไม่มี resend / retry อัตโนมัติใด ๆ.
		expect(warns.some((w) => /resend/i.test(w))).toBe(false);
		expect(warns.some((w) => /attempt\s+\d|2\/3|3\/3/i.test(w))).toBe(false);
	});
});
