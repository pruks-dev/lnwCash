/**
 * TASK-4913 (INTENT-049, BLUEPRINT-049 v4 + Commander ORDER rev58):
 * retryable ⟹ failed — ตัด auto-resend ออกทั้งหมด.
 *
 * Scoped proof (5 cases, real proofsDb + real storage, mocked mint only):
 *   1. reconcile: quote UNPAID + all inputs UNSPENT → 'failed' (no retryable).
 *   2. reconcile: quote PENDING + all inputs UNSPENT → 'failed' (no retryable).
 *   3. meltFlow: POST throws (unknown) + UNPAID + all UNSPENT → failed NOW +
 *      clearReserved + balance กลับ + tx failed in History + meltTokens
 *      ถูกเรียกครั้งเดียว (no second POST) + poll ไม่ถูกเรียก.
 *   4. resolver: PENDING + proofIds + all UNSPENT → failed + released NOW +
 *      balance กลับ (path retryable ตรงกับ meltFlow).
 *   5. resolver: PENDING + proofIds + input SPENT → stays pending (ไม่ฆ่า
 *      เมื่อพิสูจน์ไม่ได้ — guard ฝั่ง uncertainty ยังอยู่).
 *
 * รอบใหม่ขอ quote ใหม่ ไม่ reuse quote เดิม: meltFlow fail แล้วไม่ POST ซ้ำ
 * ด้วย quote id เดิม (case 3 asserts single POST), resolver fail แล้วจบ
 * (ไม่เปิด intent ใหม่ — ไม่มี auto retry ใด ๆ).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC, postMeltCalls, failBox } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	postMeltCalls: [] as Array<{ quote: string; outputsB: string[] }>,
	failBox: { current: null as unknown | null }
}));

/** Mutable mint verdicts (per-test). */
let mockQuoteState: string = 'UNPAID';
let mockProofStates: Array<'UNSPENT' | 'SPENT' | 'PENDING'> = [];
let mockPollCalls = 0;

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => Promise.resolve(true)),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn(() =>
		Promise.resolve({ nuts: ['04', '05', '08'], version: 'Nutshell/0.20.1', cached_at: Date.now() })
	)
}));

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn().mockResolvedValue({
		nuts: { '08': { supported: true }, '04': true, '05': true },
		version: 'Nutshell/0.20.1',
		name: 'Test Mint',
		pubkey: '03' + 'b1'.repeat(32)
	}),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	requestMeltQuote: vi.fn().mockImplementation((_mint: string, _inv: string, amount: number) =>
		Promise.resolve({
			quote: 'q4913-retry-01',
			amount,
			fee_reserve: 0,
			expiry: 9999999999,
			state: 'UNPAID'
		})
	),
	meltTokens: vi.fn(
		(
			_mintUrl: string,
			quoteId: string,
			_inputs: unknown[],
			outputs?: Array<{ amount: number; id: string; B_: string }>
		) => {
			const outputsB = (outputs ?? []).map((o) => o.B_);
			postMeltCalls.push({ quote: quoteId, outputsB });
			if (failBox.current !== null) {
				const err = failBox.current;
				failBox.current = null;
				return Promise.reject(err);
			}
			return Promise.resolve({
				paid: true,
				payment_preimage: `preimage-${quoteId}`,
				change: []
			});
		}
	),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockImplementation((_mint: string, proofs: Array<{ secret: string }>) =>
		Promise.resolve({
			states: proofs.map((p, i) => ({
				secret: p.secret,
				state: mockProofStates[i] ?? 'UNSPENT',
				witness: null
			}))
		}
	)),
	checkMintQuote: vi.fn(),
	checkMeltQuote: vi.fn().mockImplementation((_mint: string, quoteId: string) =>
		Promise.resolve({
			quote: quoteId,
			amount: 10,
			fee_reserve: 0,
			paid: mockQuoteState === 'PAID',
			expiry: 9999999999,
			state: mockQuoteState
		})
	),
	pollMeltQuoteUntilTerminal: vi.fn().mockImplementation(() => {
		mockPollCalls++;
		return Promise.resolve({ quote: { state: mockQuoteState }, terminal: false, timedOut: true });
	}),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'a1'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getAllKeysets: vi.fn().mockReturnValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'a1'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getMintPubkey: vi.fn().mockReturnValue('03' + 'b1'.repeat(32)),
	getKeysetById: vi.fn().mockReturnValue({
		id: KEYSET_ID,
		unit: 'sat',
		active: true,
		input_fee_ppk: 0,
		keys: { '1': '02' + 'a1'.repeat(32) },
		last_updated: Date.now()
	}),
	resolveKeysetId: vi.fn().mockImplementation((_url: string, id: string) => id),
	isCacheStale: vi.fn().mockReturnValue(false),
	clearCache: vi.fn(),
	rotateKeysets: vi.fn()
}));

vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockImplementation((secret: string) => ({
		B_: 'B_' + secret,
		blindingFactor: 'r_' + secret
	})),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

// ─── Imports (after mocks) ─────────────────────────────────────

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
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
import { setCounterK, getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { meltFlow, reconcileMeltAttempt } from '../melt';
import { resolvePendingTransactions } from '../pending-tx-resolver';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(tag: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-4913-${tag}`, C: `sig-4913-${tag}` };
}

async function localIdsOf(tags: string[]): Promise<string[]> {
	const all = await getAllProofs();
	return tags.map((t) => {
		const found = all.find((p) => p.secret === `secret-4913-${t}`);
		if (!found) throw new Error(`test setup: proof ${t} not stored`);
		return found.local_id;
	});
}

async function freshWalletWithFunds(tags: Array<{ tag: string; amount: number }>): Promise<void> {
	await clearAllWalletData();
	await clearTransactions();
	await deleteProofDB();
	resetProofDB();
	localStorage.removeItem(STORAGE_KEY);
	try { localStorage.clear(); } catch { /* ignore */ }
	postMeltCalls.length = 0;
	failBox.current = null;
	mockPollCalls = 0;
	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	setActiveSeed(mnemonicToSeed(MNEMONIC));
	// Non-zero counter: the NUT-13 counter-0 guard must see no lost-counter
	// risk (stored proofs exist → counter 0 would throw). Any non-zero base
	// works with the mocked blind math.
	setCounterK(KEYSET_ID, 7);
	for (const { tag, amount } of tags) {
		await addProofs([makeProof(tag, amount)], MINT_URL, KEYSET_ID);
	}
}

describe('TASK-4913 retryable⟹failed: no auto re-send', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mockQuoteState = 'UNPAID';
		mockProofStates = [];
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await clearTransactions();
		await deleteProofDB();
		resetProofDB();
	});

	it('(1) reconcile UNPAID + all UNSPENT → failed (retryable ไม่มีอีก)', async () => {
		const r = await reconcileMeltAttempt(
			MINT_URL,
			'q4913-u1',
			[{ local_id: 'x', amount: 20, id: KEYSET_ID, secret: 's', C: 'c' }],
			'lnbc-fresh-never-decoded'
		);
		expect(r.outcome).toBe('failed');
		expect((r as { outcome: string }).outcome).not.toBe('retryable');
	});

	it('(2) reconcile PENDING + all UNSPENT → failed (retryable ไม่มีอีก)', async () => {
		mockQuoteState = 'PENDING';
		const r = await reconcileMeltAttempt(
			MINT_URL,
			'q4913-p1',
			[{ local_id: 'x', amount: 20, id: KEYSET_ID, secret: 's', C: 'c' }],
			'lnbc-fresh-never-decoded'
		);
		expect(r.quoteState).toBe('PENDING');
		expect(r.outcome).toBe('failed');
	});

	it('(3) meltFlow POST พัง + UNPAID + all UNSPENT → failed + ปล่อยเหรียญ + POST ครั้งเดียว', async () => {
		await freshWalletWithFunds([{ tag: 'm1', amount: 20 }]);
		const [idM] = await localIdsOf(['m1']);
		expect(await getTotalBalance()).toBe(20);

		// POST leaves the wallet but the answer is lost (routing/timeout).
		failBox.current = new client.CashuError('HTTP 500 (20004): routing failed');
		mockQuoteState = 'UNPAID';
		mockProofStates = ['UNSPENT'];
		const warns: string[] = [];
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
			warns.push(a.map(String).join(' '));
		});

		const res = await meltFlow(MINT_URL, 'lnbc-fresh-never-decoded', 10);

		warnSpy.mockRestore();

		// Failed — NOT pending, NOT success.
		expect(res.success).toBe(false);
		expect(res.pending).not.toBe(true);
		// Exactly ONE POST — no second send with the same quote id.
		expect(postMeltCalls).toHaveLength(1);
		expect(postMeltCalls[0].quote).toBe('q4913-retry-01');
		// Failed before any poll handoff (reconcile decided at once).
		expect(mockPollCalls).toBe(0);
		// No second-send log line of any shape.
		expect(warns.some((w) => /resend/i.test(w))).toBe(false);
		expect(warns.some((w) => /attempt\s+\d|2\/3|3\/3/i.test(w))).toBe(false);
		// History shows failed under the quote-bound tx id.
		const failed = await getTransactions({ type: 'melt', status: 'failed' });
		expect(failed.some((t) => t.id === 'melt-q4913-retry-01')).toBe(true);
		// Coins released: no lock + full balance back in the pool.
		expect(await getReservedProofs()).toEqual([]);
		expect(await getUnspentProofs()).toHaveLength(1);
		expect((await getAllProofs()).find((p) => p.local_id === idM)?.spent).not.toBe(true);
		expect(await getTotalBalance()).toBe(20);
	});

	it('(4) resolver PENDING + proofIds + all UNSPENT → failed + released (ตรงกับ meltFlow)', async () => {
		await freshWalletWithFunds([{ tag: 'r1', amount: 8 }]);
		const [idR] = await localIdsOf(['r1']);
		await markReserved([idR]);
		await addTransaction({
			id: 'melt-q4913-pending-04',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: null,
			invoice: 'lnbc-4913-fresh-sentinel-never-decoded',
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idR]
		});
		mockQuoteState = 'PENDING';
		mockProofStates = ['UNSPENT'];

		const n = await resolvePendingTransactions();

		expect(n).toBe(1);
		const failed = await getTransactions({ type: 'melt', status: 'failed' });
		expect(failed.some((t) => t.id === 'melt-q4913-pending-04')).toBe(true);
		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(1);
		expect(await getTotalBalance()).toBe(8);
	});

	it('(5) resolver PENDING + input SPENT → stays pending (uncertainty ไม่ฆ่า)', async () => {
		await freshWalletWithFunds([{ tag: 's1', amount: 8 }]);
		const [idS] = await localIdsOf(['s1']);
		await markReserved([idS]);
		await addTransaction({
			id: 'melt-q4913-pending-05',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: null,
			invoice: 'lnbc-4913-fresh-sentinel-never-decoded',
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idS]
		});
		mockQuoteState = 'PENDING';
		mockProofStates = ['SPENT'];

		// Second call covers the failed-scan leg (must not throw / must not claim).
		const n = await resolvePendingTransactions();

		expect(n).toBe(0);
		const still = await getTransactions({ type: 'melt', status: 'pending' });
		expect(still.some((t) => t.id === 'melt-q4913-pending-05')).toBe(true);
		expect((await getReservedProofs()).map((p) => p.local_id)).toEqual([idS]);
		expect(getCounterK(KEYSET_ID)).toBe(7);
	});
});
