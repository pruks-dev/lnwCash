/**
 * TASK-314: actual_fee — true fee paid after mint overpaid return (NUT-08).
 *
 * The wallet pre-reserves `feeReserve` to cover the LN routing fee. When the
 * mint signs change outputs, it may sign MORE than `spentTotal - amount -
 * feeReserve` (the legacy changeAmount). The overpaid portion is the fee the
 * mint is refunding — the true fee is reduced accordingly:
 *
 *   actual_fee = feeReserve - (change.length > 0 ? sum(change.amounts) - legacyChangeAmount : 0)
 *
 * where legacyChangeAmount = max(0, spentTotal - amount - feeReserve).
 *
 * Why LEGACY changeAmount (not the NUT-08 MAX derived for output decomposition
 * in TASK-312): the NUT-08 MAX equals `spentTotal - amount` (the maximum
 * possible refund). Plugging that into the formula gives feeReserve for a
 * full refund, which lies to the user. Using legacy changeAmount makes the
 * formula give 0 for full refund and feeReserve for no refund.
 *
 * IMPORTANT — interacts with TASK-313 anomaly guard: the mint cannot sign
 * MORE outputs than we derived (no B_'s for them). So tests must have
 * `mockMintChange.length <= derived outputs.length` or TASK-313 throws.
 *
 * 5 scenarios:
 *   (a) Legacy mode, no change derived, mint signs nothing
 *       → actual_fee = feeReserve
 *   (b) NUT-08 full refund (mint signs all derived, sum = MAX = spentTotal - amount)
 *       → actual_fee = 0
 *   (c) NUT-08 partial refund (mint signs some, sum > legacy but < MAX)
 *       → actual_fee > 0
 *   (d) Mint anomaly: sum(change) < legacyChangeAmount → throw
 *   (e) NUT-08 end-to-end → actual_fee = 0 + DB invariants verified
 *
 * Test pattern mirrors melt-counter-per-signed.test.ts and
 * melt-nut08-prederive.test.ts.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

// ─── Captured / mutable mock state ─────────────────────────────

/** What the mint signs in response.change — tests override per scenario. */
let mockMintChange: Array<{ id: string; amount: number; C_: string }> = [];

/** Mutable hasNUT08 return — tests can override per scenario. */
let mockSupportsNUT08: boolean = true;

function setMockMintChange(sigs: Array<{ amount: number }>): void {
	mockMintChange = sigs.map((s) => ({
		id: KEYSET_ID,
		amount: s.amount,
		C_: '02' + 'a1'.repeat(32)
	}));
}

// ─── Module mocks (vitest hoisting moves these above imports) ────

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => Promise.resolve(mockSupportsNUT08)),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn(() =>
		Promise.resolve({
			nuts: mockSupportsNUT08 ? ['04', '05', '08'] : ['04', '05'],
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
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { deleteDatabase, resetDB, getTransactions } from '../../storage/db';
import { completeMelt } from '../melt';
import type { TokenProof, SelectedProofInfo } from '../../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const FEE_RESERVE = 10;

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

describe('TASK-314: actual_fee — true fee paid after mint overpaid return (NUT-08)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		await deleteDatabase();
		resetDB();
		localStorage.removeItem(STORAGE_KEY);
		try { localStorage.clear(); } catch { /* ignore */ }
		vi.clearAllMocks();

		// Reset mock state to defaults (NUT-08 capable).
		mockSupportsNUT08 = true;
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
		await deleteDatabase();
		resetDB();
	});

	// ────────────────────────────────────────────────────────────
	// (a) Legacy mode (no NUT-08), no change derived, mint signs nothing
	//     spentTotal = 110, amount = 100, feeReserve = 10
	//     NUT-08 MAX changeAmount = 110 - 100 - 0 = 10 (but legacy used)
	//     legacy changeAmount = 110 - 100 - 10 = 0 → no change derived
	//     Mint signs [] → sum = 0, legacyChangeAmount = 0, no anomaly
	//     actual_fee = 10 - (0 - 0) = 10 (== feeReserve)
	// ────────────────────────────────────────────────────────────
	it('a) legacy, no change → actual_fee = feeReserve', async () => {
		// Legacy mint: changeAmount = max(0, 110 - 100 - 10) = 0 → no change derived
		// Mint signs nothing → actual_fee = feeReserve
		mockSupportsNUT08 = false;
		setMockMintChange([]);

		await addProofs([makeProof('a1', 110)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('a1', 110))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-a', inputs, 'lnbc-a', 100, FEE_RESERVE);

		expect(result.success).toBe(true);
		const txs = await getTransactions({ type: 'melt' });
		const tx = txs.find((t) => t.id === 'melt-melt-quote-a');
		expect(tx).toBeDefined();
		expect(tx?.actual_fee).toBe(FEE_RESERVE); // 10 — full reserve
		expect(tx?.fee).toBe(FEE_RESERVE);        // legacy fallback still 10
	});

	// ────────────────────────────────────────────────────────────
	// (b) NUT-08 full refund — mint signs all derived outputs
	//     spentTotal = 115, amount = 100, feeReserve = 10
	//     NUT-08 MAX changeAmount = 115 - 100 - 0 = 15
	//     legacy changeAmount = 115 - 100 - 10 = 5
	//     decompose(15) = [8, 4, 2, 1] (4 outputs, sum 15)
	//     Mint signs [8, 4, 2, 1] (sum = 15, equals MAX changeAmount)
	//     → sumChange - legacyChangeAmount = 15 - 5 = 10 (full overpaid refund)
	//     → actual_fee = 10 - 10 = 0 (full refund)
	// ────────────────────────────────────────────────────────────
	it('b) NUT-08 full refund → actual_fee = 0', async () => {
		// NUT-08: MAX changeAmount = max(0, 115 - 100 - 0) = 15
		//   decompose(15) → [8, 4, 2, 1] (4 outputs, sum 15)
		// legacy changeAmount = max(0, 115 - 100 - 10) = 5
		// Mint signs [8, 4, 2, 1] (all derived) → sum=15
		// → actual_fee = feeReserve - (sum - legacy) = 10 - (15 - 5) = 0
		mockSupportsNUT08 = true;
		setMockMintChange([
			{ amount: 8 }, { amount: 4 }, { amount: 2 }, { amount: 1 }
		]);

		await addProofs([makeProof('b1', 115)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('b1', 115))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-b', inputs, 'lnbc-b', 100, FEE_RESERVE);

		expect(result.success).toBe(true);
		const txs = await getTransactions({ type: 'melt' });
		const tx = txs.find((t) => t.id === 'melt-melt-quote-b');
		expect(tx).toBeDefined();
		expect(tx?.actual_fee).toBe(0);          // true cost = 0 (full fee refunded)
		expect(tx?.fee).toBe(FEE_RESERVE);       // legacy reserve = 10 (for display fallback)
	});

	// ────────────────────────────────────────────────────────────
	// (c) NUT-08 partial refund — mint signs SOME derived outputs
	//     spentTotal = 115, amount = 100, feeReserve = 10
	//     NUT-08 MAX changeAmount = 15, decompose [8, 4, 2, 1] (4 outputs)
	//     legacy changeAmount = 5
	//     Mint signs [8, 4, 2] (sum = 14) — signs 3 of 4 derived
	//     → sumChange - legacyChangeAmount = 14 - 5 = 9 (overpaid refund of 9)
	//     → actual_fee = 10 - 9 = 1
	// ────────────────────────────────────────────────────────────
	it('c) NUT-08 partial refund → actual_fee = feeReserve - (sum - legacy)', async () => {
		// NUT-08: MAX changeAmount = 15, decompose [8, 4, 2, 1] (4 outputs)
		// legacy changeAmount = 5
		// Mint signs [8, 4, 2] (sum=14) — signs 3 of 4
		// → actual_fee = 10 - (14 - 5) = 10 - 9 = 1
		mockSupportsNUT08 = true;
		setMockMintChange([{ amount: 8 }, { amount: 4 }, { amount: 2 }]);

		await addProofs([makeProof('c1', 115)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('c1', 115))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-c', inputs, 'lnbc-c', 100, FEE_RESERVE);

		expect(result.success).toBe(true);
		const txs = await getTransactions({ type: 'melt' });
		const tx = txs.find((t) => t.id === 'melt-melt-quote-c');
		expect(tx).toBeDefined();
		expect(tx?.actual_fee).toBe(1);          // 10 - (14 - 5) = 1
		expect(tx?.fee).toBe(FEE_RESERVE);       // legacy reserve = 10
		// Sanity: actual_fee < fee when partial refund occurred
		expect(tx!.actual_fee!).toBeLessThan(tx!.fee!);
		// Sanity: actual_fee > 0 (partial refund, not full)
		expect(tx!.actual_fee!).toBeGreaterThan(0);
	});

	// ────────────────────────────────────────────────────────────
	// (d) Mint anomaly: sum(change) < legacyChangeAmount → throw
	//     This is the TASK-314 anomaly guard: mint returned less change than
	//     the legacy changeAmount → actual_fee would exceed feeReserve
	//     (impossible). Must abort BEFORE recording incorrect fee.
	//     Mirrors TASK-313 signedCount > outputs.length guard.
	//
	//     Setup: spentTotal = 115, amount = 100, feeReserve = 10
	//     NUT-08 MAX changeAmount = 15, decompose [8, 4, 2, 1] (4 outputs)
	//     legacy changeAmount = 5
	//     Mint signs [1] only (sum=1 < 5) → anomaly (actual fee would be 9,
	//     but 9 < feeReserve=10, still detectable as under-refund).
	//     Wait — sum=1 < legacy=5 means actual_fee = feeReserve - (1 - 5)
	//     = 10 + 4 = 14, exceeds feeReserve → impossible → throw.
	//     NOTE: cannot test with mint signs [] because the formula's else
	//     branch (change.length === 0) returns actualFee = feeReserve
	//     without checking the anomaly condition.
	// ────────────────────────────────────────────────────────────
	it('d) anomaly: sum(change) < legacyChangeAmount → throw', async () => {
		// NUT-08 mode: MAX changeAmount = 15, decompose [8, 4, 2, 1] (4 outputs)
		// legacy changeAmount = 5
		// Mint signs [1] only (sum=1 < 5) → anomaly
		mockSupportsNUT08 = true;
		setMockMintChange([{ amount: 1 }]); // signs 1 of 4, sum < legacyChangeAmount

		await addProofs([makeProof('d1', 115)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('d1', 115))
		];

		// completeMelt's outer try/catch converts the throw into a structured
		// failure result — the error message is preserved on result.error.
		const result = await completeMelt(MINT_URL, 'melt-quote-d', inputs, 'lnbc-d', 100, FEE_RESERVE);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Mint anomaly/);
		expect(result.error).toMatch(/signed change sum/);

		// Critical: no transaction recorded for the failed melt.
		const txs = await getTransactions({ type: 'melt' });
		const tx = txs.find((t) => t.id === 'melt-melt-quote-d');
		expect(tx).toBeUndefined();
	});

	// ────────────────────────────────────────────────────────────
	// (e) NUT-08 mode + full refund → actual_fee = 0 (end-to-end)
	//     Verify the whole TASK-314 pipeline: NUT-08 detection → change
	//     decomposition → mint signs all → actual_fee = 0 in DB.
	//     Also verifies UI-display invariants (actual_fee !== fee → show reserve).
	// ────────────────────────────────────────────────────────────
	it('e) NUT-08 full refund → actual_fee = 0 (end-to-end)', async () => {
		// NUT-08: MAX changeAmount = 15, decompose [8, 4, 2, 1] (4 outputs)
		// legacy changeAmount = 5
		// Mint signs all 4 → sum=15 → actual_fee = 10 - (15 - 5) = 0
		mockSupportsNUT08 = true;
		setMockMintChange([
			{ amount: 8 }, { amount: 4 }, { amount: 2 }, { amount: 1 }
		]);

		await addProofs([makeProof('e1', 115)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('e1', 115))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-e', inputs, 'lnbc-e', 100, FEE_RESERVE);

		// End-to-end success
		expect(result.success).toBe(true);
		expect(result.feeReserve).toBe(FEE_RESERVE);
		expect(result.change.length).toBe(4);

		// DB persisted with actual_fee = 0 (true cost) and fee = 10 (reserve, legacy)
		const txs = await getTransactions({ type: 'melt' });
		const tx = txs.find((t) => t.id === 'melt-melt-quote-e');
		expect(tx).toBeDefined();
		expect(tx?.actual_fee).toBe(0);          // NUT-08 mint: full fee refunded
		expect(tx?.fee).toBe(FEE_RESERVE);       // legacy reserve still 10
		expect(tx?.status).toBe('confirmed');
		expect(tx?.type).toBe('melt');
		expect(tx?.protocol).toBe('lightning');
		expect(tx?.preimage).toBe('preimage-abc');

		// UI display invariant: actual_fee !== fee → reserve shown in parens
		expect(tx?.actual_fee !== tx?.fee).toBe(true);
		// Invariant: actual_fee <= fee (true cost never exceeds reserve in NUT-08 mode)
		expect(tx!.actual_fee!).toBeLessThanOrEqual(tx!.fee!);
	});
});
