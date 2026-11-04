/**
 * TASK-4902 (M4-ข) post-fix-replay: C4 duplicate-output scenario, 2 rounds from zero.
 *
 * Phase-A (TASK-4900) reproduced C4: postMelt throws → counter FROZEN → retry
 * re-derives the SAME B_ → mint answers 11003 "outputs already signed".
 *
 * Post-fix replay (mint-side mock enforces single-use B_: any repeated B_
 * throws 11003, exactly like a real mint):
 *   ROUND 1 from-zero: postMelt fails once (routing 20004) → counter 0→N,
 *     retry derives FRESH B_ → mint accepts (no 11003) → success, counter moves again.
 *   ROUND 2 from-zero: same with TIMEOUT failure mode.
 *
 * Each round starts from a full zero slate (counter 0 + empty proof DB +
 * fresh mock-mint seen-set + fresh quote id). PASS = 2/2 rounds with no 11003
 * and counter movement on BOTH the failing and the retry attempt.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC, seenB, postMeltCalls, failBox } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	seenB: new Set<string>(),
	postMeltCalls: [] as Array<{ quote: string; outputsB: string[] }>,
	failBox: { current: null as unknown | null }
}));

// changeAmount = 20 - 10 - 0 = 10 → NUT-08 blanks N = ceil(log2(10)) = 4
const DERIVED_N = 4;

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => Promise.resolve(true)),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn(() =>
		Promise.resolve({
			nuts: ['04', '05', '08'],
			version: 'Nutshell/0.20.1',
			cached_at: Date.now()
		})
	)
}));

// ─── Mint-side mock: B_ are single-use (11003 on ANY reuse) ─────
// (State lives in the vi.hoisted block above — the factory below closes over it.)

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
	requestMeltQuote: vi.fn(),
	meltTokens: vi.fn(
		(
			_mintUrl: string,
			quoteId: string,
			_inputs: unknown[],
			outputs?: Array<{ amount: number; id: string; B_: string }>
		) => {
			const outputsB = (outputs ?? []).map((o) => o.B_);
			postMeltCalls.push({ quote: quoteId, outputsB });
			// Real-mint rule: a B_ the mint already saw is 11003, ALWAYS
			// (same quote retry or cross-quote reuse — B_ are globally single-use).
			for (const b of outputsB) {
				if (seenB.has(b)) {
					const err = new (class extends Error {
						code = 11003;
						status = 400;
					})('outputs already signed (11003)');
					return Promise.reject(err);
				}
			}
			for (const b of outputsB) seenB.add(b);
			if (failBox.current !== null) {
				const err = failBox.current;
				failBox.current = null;
				return Promise.reject(err);
			}
			return Promise.resolve({
				paid: true,
				payment_preimage: `preimage-${quoteId}`,
				change: [{ id: KEYSET_ID, amount: 10, C_: '02' + 'c9'.repeat(32) }]
			});
		}
	),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockResolvedValue({ states: [] }),
	checkMintQuote: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'replay-q',
		amount: 10,
		fee_reserve: 0,
		paid: true,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	pollMeltQuoteUntilTerminal: vi.fn(),
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

// NOTE: mocked blind (deterministic B_ = f(secret); secret itself derives
// from the REAL seed+counter via nut13, so B_ still differs across counters
// — reuse would produce IDENTICAL B_, which the seen-set must catch).
// Real unblind math is out of scope here (covered by blind unit tests);
// mocking keeps this replay focused on counter/B_ behavior.
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
import { deleteProofDB, resetProofDB } from '../proofsDb';
import { setCounterK, getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { completeMelt } from '../melt';
import type { SelectedProofInfo } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeInput(tag: string, amount: number): SelectedProofInfo {
	const secret = `secret-${tag}`;
	return {
		local_id: `${KEYSET_ID}:${secret}:${tag}`,
		amount,
		id: KEYSET_ID,
		secret,
		C: `sig-${tag}`
	};
}

async function freshZeroSlate(): Promise<void> {
	await clearAllWalletData();
	await deleteProofDB();
	resetProofDB();
	localStorage.removeItem(STORAGE_KEY);
	try { localStorage.clear(); } catch { /* ignore */ }
	seenB.clear();
	postMeltCalls.length = 0;
	failBox.current = null;
	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	setActiveSeed(mnemonicToSeed(MNEMONIC));
	setCounterK(KEYSET_ID, 0); // from zero — no stored proofs, so the counter-0 guard passes
}

describe('TASK-4902 (M4-ข): post-fix C4 replay — 2 rounds from zero, no 11003', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('ROUND 1 from-zero: routing-20004 fail → counter moves → retry fresh B_ → success, no 11003', async () => {
		await freshZeroSlate();
		const inputs = [makeInput('r1', 20)];

		// Attempt 1: mint-side routing failure AFTER seeing our B_.
		failBox.current = new client.CashuError('HTTP 500 (20004): routing failed');
		const fail = await completeMelt(MINT_URL, 'replay-q1', inputs, 'lnbc...', 10, 0);
		expect(fail.success).toBe(false);
		expect(fail.unknownOutcome).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(DERIVED_N); // 0 + 4 — FROZEN no more
		expect(postMeltCalls).toHaveLength(1);

		// Attempt 2 (retry, same quote — violating nothing: fresh counters):
		// mint MUST accept — any B_ reuse would throw 11003 here.
		const retry = await completeMelt(MINT_URL, 'replay-q1', inputs, 'lnbc...', 10, 0);
		expect(retry.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(DERIVED_N + 1); // 4 + 1 signed
		expect(postMeltCalls).toHaveLength(2);

		// Behavioral proof: disjoint B_ sets across attempts (no reuse → no 11003 possible).
		const first = new Set(postMeltCalls[0].outputsB);
		const second = postMeltCalls[1].outputsB;
		expect(second.length).toBe(DERIVED_N);
		for (const b of second) expect(first.has(b)).toBe(false);
	});

	it('ROUND 2 from-zero: TIMEOUT fail → counter moves → retry fresh B_ → success, no 11003', async () => {
		await freshZeroSlate();
		const inputs = [makeInput('r2', 20)];

		// Attempt 1: client-side timeout — mint may STILL have signed (B_ recorded).
		failBox.current = new client.NetworkError(
			'Network error: Request timeout to https://mint.example.com/v1/melt/bolt11'
		);
		const fail = await completeMelt(MINT_URL, 'replay-q2', inputs, 'lnbc...', 10, 0);
		expect(fail.success).toBe(false);
		expect(fail.unknownOutcome).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(DERIVED_N); // 0 + 4
		expect(postMeltCalls).toHaveLength(1);

		// Attempt 2: fresh B_ at the advanced counter → accepted, no 11003.
		const retry = await completeMelt(MINT_URL, 'replay-q2', inputs, 'lnbc...', 10, 0);
		expect(retry.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(DERIVED_N + 1);
		expect(postMeltCalls).toHaveLength(2);

		const first = new Set(postMeltCalls[0].outputsB);
		const second = postMeltCalls[1].outputsB;
		expect(second.length).toBe(DERIVED_N);
		for (const b of second) expect(first.has(b)).toBe(false);
	});
});
