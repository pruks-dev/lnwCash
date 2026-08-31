/**
 * TASK-313 (CRITICAL): counter_k advance must be driven by the ACTUAL signed
 * count from the mint response, NOT the derived count from the wallet's
 * output derivation.
 *
 * Money-loss bug scenario (regression):
 *   1. Wallet derives N change outputs (e.g. N=5).
 *   2. Mint signs FEWER outputs (M < N) — with the NUT-08 blank-output model
 *      (TASK-MELT-NUT08-BLANKS) this is the NORMAL case: the mint signs its
 *      own denomination split of the overpaid amount, which may need fewer
 *      outputs than the blanks sent, or none at all if it keeps the fee.
 *   3. OLD (buggy) code: incrementCounterK(changeKeysetId, N) — counter advances
 *      PAST what the mint actually consumed.
 *   4. Next melt: counter_k still points at the SAME B_ the mint already
 *      signed (because the mint never consumed that counter) → mint returns
 *      11003 "outputs already signed" → DOUBLE-SPEND / money loss.
 *
 * Fix: advance by meltResponse.change.length (the signed count).
 * Sanity guard: if signedCount > derived outputs.length, throw (mint anomaly —
 * mint cannot create outputs we did not ask for; abort to prevent counter_k
 * desync from widening the 11003 loop).
 *
 * 5 scenarios (scenarios updated for the blank-output model — the mint signs
 * its own split, so "mint signs X" amounts are the mint's own choice, not the
 * wallet's derivation; the counter assertion is unchanged):
 *   (a) 3 blanks sent, mint signs 2 → counter advances by 2
 *   (b) 7 blanks sent, mint signs 5 → counter advances by 5
 *   (c) 3 blanks sent, mint signs 0 → counter advances by 0
 *   (d) 3 blanks sent, mint signs 6 (anomaly) → throws, counter UNCHANGED
 *   (e) State machine: 3 sequential melts with varying signed counts — final
 *       counter = initial + sum(signed) (NOT sum(derived))
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

// ─── Mutable mock state ─────────────────────────────────────────

/** What the mint signs in response.change — tests override per scenario. */
let mockMintChange: Array<{ id: string; amount: number; C_: string }> = [];

/** Reset between tests via beforeEach. */
function setMockMintChange(sigs: Array<{ amount: number }>): void {
	mockMintChange = sigs.map((s) => ({
		id: KEYSET_ID,
		amount: s.amount,
		C_: '02' + 'a1'.repeat(32)
	}));
}

// ─── Module mocks (vitest hoisting moves these above imports) ────

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

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn().mockResolvedValue({
		nuts: { '08': { supported: true }, '04': true, '05': true },
		version: 'Nutshell/0.20.1',
		name: 'Test Mint',
		pubkey: '03' + 'b1'.repeat(32)
	}),
	getKeysets: vi.fn().mockResolvedValue([
		{ id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0 }
	]),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	requestMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 100,
		fee_reserve: 0,
		paid: true,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	// Returns whatever the test wired into mockMintChange.
	meltTokens: vi.fn(() =>
		Promise.resolve({
			paid: true,
			payment_preimage: 'preimage-abc',
			change: mockMintChange
		})
	),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockResolvedValue({ states: [] }),
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 100,
		fee_reserve: 0,
		paid: true,
		expiry: 9999999999,
		state: 'UNPAID'
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

import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs } from '../proofsDb';
import { setCounterK, getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { completeMelt } from '../melt';
import type { TokenProof, SelectedProofInfo } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

function makeInput(p: TokenProof): SelectedProofInfo {
	return {
		local_id: `${KEYSET_ID}:secret-${p.secret.slice(7, 15)}:${p.secret.slice(-8)}`,
		amount: p.amount,
		id: p.id,
		secret: p.secret,
		C: p.C
	};
}

// ─── Test suite ────────────────────────────────────────────────

describe('TASK-313: counter_k per-signed advance (CRITICAL — money-loss bug)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		try { localStorage.clear(); } catch { /* ignore */ }
		vi.clearAllMocks();

		// Reset mock change array
		setMockMintChange([]);

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	// ────────────────────────────────────────────────────────────
	// (a) 3 blanks sent... mint signs 2 → counter advances by 2
	//     Setup: spentTotal = 200, amount = 100, feeReserve = 0 (NUT-08)
	//     changeAmount = 100 → blanks = ceil(log2(100)) = 7 (amount=0 each)
	//     Mint signs its own 2-output split (keeps the rest as fee).
	// ────────────────────────────────────────────────────────────
	it('a) 7 blanks sent, mint signs 2 → counter advances by 2', async () => {
		await addProofs([makeProof('a1', 100), makeProof('a2', 100)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 100); // start counter at 100 for visibility (assertion later)

		setMockMintChange([{ amount: 64 }, { amount: 32 }]); // mint's own split: 2 sigs

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('a1', 100)),
			makeInput(makeProof('a2', 100))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);

		expect(result.success).toBe(true);
		// CRITICAL: counter advances by SIGNED count (2), NOT blank count (7)
		expect(getCounterK(KEYSET_ID)).toBe(102); // 100 + 2 signed
	});

	// ────────────────────────────────────────────────────────────
	// (b) 6 blanks sent, mint signs 5 → counter advances by 5
	//     Setup: spentTotal = 162, amount = 100, feeReserve = 0
	//     changeAmount = 62 → blanks = ceil(log2(62)) = 6 (amount=0 each)
	// ────────────────────────────────────────────────────────────
	it('b) 6 blanks sent, mint signs 5 → counter advances by 5', async () => {
		await addProofs([makeProof('b1', 162)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 100);

		setMockMintChange([
			{ amount: 32 }, { amount: 16 }, { amount: 8 }, { amount: 4 }, { amount: 2 }
		]); // mint's own split: 5 sigs

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('b1', 162))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);

		expect(result.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(105); // 100 + 5 signed
	});

	// ────────────────────────────────────────────────────────────
	// (c) 7 blanks sent, mint signs 0 → counter advances by 0
	//     Setup: spentTotal = 200, amount = 100, feeReserve = 0
	//     changeAmount = 100 → blanks = ceil(log2(100)) = 7 (amount=0 each)
	//     Mint signs nothing (e.g. consumed everything as fee).
	//     Counter must NOT advance — next melt re-derives the same B_'s
	//     (which the mint will treat as a fresh request since it never signed).
	// ────────────────────────────────────────────────────────────
	it('c) 7 blanks sent, mint signs 0 → counter advances by 0', async () => {
		await addProofs([makeProof('c1', 100), makeProof('c2', 100)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 100);

		setMockMintChange([]); // mint signs 0 of 7 blanks

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('c1', 100)),
			makeInput(makeProof('c2', 100))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);

		expect(result.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(100); // unchanged — 0 signed
	});

	// ────────────────────────────────────────────────────────────
	// (d) 6 blanks sent, mint signs 7 (anomaly) → throws, counter UNCHANGED
	//     Mint cannot legally sign MORE outputs than we asked for. If it does,
	//     abort BEFORE corrupting the counter (otherwise the next melt would
	//     skip even more counters and the 11003 loop would widen).
	//     Setup: spentTotal = 162, changeAmount = 62 → blanks = 6; mint signs 7.
	// ────────────────────────────────────────────────────────────
	it('d) 6 blanks sent, mint signs 7 (anomaly) → throws, counter UNCHANGED', async () => {
		await addProofs([makeProof('d1', 162)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 100);

		setMockMintChange([
			{ amount: 32 }, { amount: 16 }, { amount: 8 }, { amount: 4 },
			{ amount: 2 }, { amount: 1 }, { amount: 1 } // 7 sigs > 6 blanks = anomaly
		]);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('d1', 162))
		];

		// Sanity guard throws BEFORE incrementing counter.
		// completeMelt's outer try/catch converts the throw into a structured
		// failure result — the error message is preserved on result.error.
		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Mint anomaly/);

		expect(getCounterK(KEYSET_ID)).toBe(100); // UNCHANGED — counter not corrupted
	});

	// ────────────────────────────────────────────────────────────
	// (e) State machine — 3 sequential melts, varying signed counts
	// ────────────────────────────────────────────────────────────
	it('e) state machine — 3 sequential melts with varying signed counts', async () => {
		// Initial counter = 100
		await addProofs([
			makeProof('e1', 200),
			makeProof('e2', 200),
			makeProof('e3', 200),
			makeProof('e4', 150)
		], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 100);

		// ── Melt 1 ──
		// spentTotal = 200, changeAmount = 100 → blanks = ceil(log2(100)) = 7
		// Mint signs 2 (its own split, keeps the rest as fee). Counter → 102.
		setMockMintChange([{ amount: 64 }, { amount: 32 }]);
		const melt1Result = await completeMelt(
			MINT_URL, 'melt-quote-1',
			[makeInput(makeProof('e1', 200))],
			'lnbc1', 100, 0
		);
		expect(melt1Result.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(102); // 100 + 2 signed (NOT + 7 blanks)
		const counterAfterMelt1 = getCounterK(KEYSET_ID);

		// ── Melt 2 ──
		// spentTotal = 400, changeAmount = 300 → blanks = ceil(log2(300)) = 9
		// Mint signs 4 (its own split). Counter advances by 4 → 106.
		setMockMintChange([
			{ amount: 256 }, { amount: 32 }, { amount: 8 }, { amount: 4 }
		]);
		const melt2Result = await completeMelt(
			MINT_URL, 'melt-quote-2',
			[
				makeInput(makeProof('e2', 200)),
				makeInput(makeProof('e3', 200))
			],
			'lnbc2', 100, 0
		);
		expect(melt2Result.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(106); // 102 + 4 signed
		const counterAfterMelt2 = getCounterK(KEYSET_ID);

		// ── Melt 3 ──
		// spentTotal = 150, changeAmount = 50 → blanks = ceil(log2(50)) = 6
		// Mint signs 2 (its own split). Counter advances by 2 → 108.
		setMockMintChange([{ amount: 32 }, { amount: 16 }]);
		const melt3Result = await completeMelt(
			MINT_URL, 'melt-quote-3',
			[makeInput(makeProof('e4', 150))],
			'lnbc3', 100, 0
		);
		expect(melt3Result.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(108); // 106 + 2 signed

		// Final counter = 100 (initial) + 2 + 4 + 2 (signed) = 108
		// If buggy (advance by blank count): 100 + 7 + 9 + 6 = 122 — would desync.
		expect(counterAfterMelt1 + 0).toBe(102); // sanity
		expect(counterAfterMelt2 + 0).toBe(106); // sanity
		expect(getCounterK(KEYSET_ID)).toBe(108); // final

		// Critical invariant: signed sum (2+4+2=8) NOT blanks sum (7+9+6=22)
		const signedSum = 2 + 4 + 2;
		const blanksSum = 7 + 9 + 6;
		expect(signedSum).toBe(8);
		expect(blanksSum).toBe(22);
		expect(getCounterK(KEYSET_ID) - 100).toBe(signedSum);
	});
});
