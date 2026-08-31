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
 * NUT-08 blank-output model (TASK-MELT-NUT08-BLANKS): the wallet now sends
 * n = max(ceil(log2(spentTotal - amount)), 1) BLANK outputs (amount = 0 each)
 * and the mint imprints the amounts per its own denomination split. The mint
 * may legitimately sign FEWER outputs than blanks sent (keeping the fee) —
 * counter_k still advances by the SIGNED count (TASK-313 contract, untouched).
 *
 * IMPORTANT — TASK-313 anomaly guard: the mint cannot sign MORE outputs than
 * we derived (no B_'s for them). So tests must have
 * `mockMintChange.length <= derived outputs.length` or TASK-313 throws.
 *
 * 7 scenarios:
 *   (a) Legacy mode, no change derived, mint signs nothing
 *       → actual_fee = feeReserve
 *   (b) NUT-08 full refund (mint signs more outputs than legacy expectation,
 *       sum = MAX = spentTotal - amount)
 *       → actual_fee = 0
 *   (c) NUT-08 partial refund (mint signs some, sum > legacy but < MAX)
 *       → actual_fee > 0
 *   (d) Mint truncation (blanks fewer than mint's split needed): mint
 *       truncates its split to the blanks available → sum < legacy
 *       → NO throw (warn only), actualFee clamped truthfully, tx recorded
 *   (e) NUT-08 end-to-end happy path → actual_fee truthful + DB invariants
 *   (f) Blanks-count assertion: overpaid 8 → ceil(log2(8)) = 3 blanks sent
 *   (g) Commander repro: spentTotal=208, amount=200, feeReserve=2, blanks=3,
 *       mint returns [4,2] (sum=6=legacy) → no throw, actualFee=2, tx recorded
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
import { meltTokens } from '../../cashu/client';
import type { TokenProof, SelectedProofInfo } from '../../types';

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
	// (b) NUT-08 full refund — mint returns the full overpaid sum
	//     spentTotal = 115, amount = 100, feeReserve = 10
	//     legacy changeAmount = 115 - 100 - 10 = 5
	//     blanks sent = ceil(log2(15)) = 4
	//     Mint imprints its own split [8, 4, 2, 1] (sum = 15 = MAX changeAmount)
	//     → sumChange - legacyChangeAmount = 15 - 5 = 10 (full overpaid refund)
	//     → actual_fee = 10 - 10 = 0 (full refund)
	// ────────────────────────────────────────────────────────────
	it('b) NUT-08 full refund → actual_fee = 0', async () => {
		// legacy changeAmount = max(0, 115 - 100 - 10) = 5
		// Mint signs [8, 4, 2, 1] (sum=15) → actual_fee = 10 - (15 - 5) = 0
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
	// (c) NUT-08 partial refund — mint returns a partial overpaid sum
	//     spentTotal = 115, amount = 100, feeReserve = 10
	//     legacy changeAmount = 5
	//     blanks sent = ceil(log2(15)) = 4
	//     Mint imprints [8, 4, 2] (sum = 14) — keeps 1 sat as fee
	//     → sumChange - legacyChangeAmount = 14 - 5 = 9 (overpaid refund of 9)
	//     → actual_fee = 10 - 9 = 1
	// ────────────────────────────────────────────────────────────
	it('c) NUT-08 partial refund → actual_fee = feeReserve - (sum - legacy)', async () => {
		// legacy changeAmount = 5
		// Mint signs [8, 4, 2] (sum=14) → actual_fee = 10 - (14 - 5) = 1
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
	// (d) Mint truncation: blanks < mint's split → sum(change) < legacy
	//     → NO throw (warn only) — payment already succeeded, tx recorded
	//
	//     NEW behavior (TASK-MELT-NUT08-BLANKS): with the blank-output model,
	//     the mint signs its OWN denomination split and may need MORE outputs
	//     than the blanks we sent; it then TRUNCATES the split to the blanks
	//     available and silently keeps the rest as fee. This is an anomaly
	//     worth warning about — but the Lightning payment has ALREADY
	//     succeeded, so throwing here would misreport the payment and lose
	//     the tx record. Behavior: console.warn + truthful (clamped) fee +
	//     tx recorded.
	//
	//     Setup: spentTotal = 115, amount = 100, feeReserve = 10
	//     legacy changeAmount = 5, blanks sent = ceil(log2(15)) = 4
	//     Mint signs [1] only (sum=1 < legacy=5) → anomaly → warn
	//     actualFee formula (unclamped): 10 - (1 - 5) = 14 → truthful fee the
	//     mint actually kept (charged more than the reserve).
	// ────────────────────────────────────────────────────────────
	it('d) truncation: sum(change) < legacyChangeAmount → warn (no throw), actualFee truthful, tx recorded', async () => {
		// legacy changeAmount = 5; mint signs [1] only (sum=1 < 5) → warn
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mockSupportsNUT08 = true;
		setMockMintChange([{ amount: 1 }]); // sum=1 < legacy=5

		await addProofs([makeProof('d1', 115)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('d1', 115))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-d', inputs, 'lnbc-d', 100, FEE_RESERVE);

		// NO throw — payment already succeeded, melt completes successfully
		expect(result.success).toBe(true);

		// Anomaly was logged as a warning (not thrown)
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringMatching(/Mint anomaly: signed change sum \(1\) < expected changeAmount \(5\)/)
		);
		warnSpy.mockRestore();

		// Transaction IS recorded — a successful LN payment must never be lost
		const txs = await getTransactions({ type: 'melt' });
		const tx = txs.find((t) => t.id === 'melt-melt-quote-d');
		expect(tx).toBeDefined();
		expect(tx?.status).toBe('confirmed');
		// Truthful fee: mint actually kept 10 - (1 - 5) = 14 sats (over reserve)
		expect(tx?.actual_fee).toBe(14);
		// legacy `fee` field keeps the TASK-084 contract (the reserve)
		expect(tx?.fee).toBe(FEE_RESERVE);
	});

	// ────────────────────────────────────────────────────────────
	// (e) NUT-08 mode + full refund → actual_fee = 0 (end-to-end)
	//     Verify the whole TASK-314 pipeline: NUT-08 detection → blank outputs
	//     → mint imprints its split → actual_fee = 0 in DB.
	//     Also verifies UI-display invariants (actual_fee !== fee → show reserve).
	// ────────────────────────────────────────────────────────────
	it('e) NUT-08 full refund → actual_fee = 0 (end-to-end)', async () => {
		// legacy changeAmount = 5; blanks = ceil(log2(15)) = 4
		// Mint imprints [8, 4, 2, 1] (sum=15) → actual_fee = 10 - (15 - 5) = 0
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

	// ────────────────────────────────────────────────────────────
	// (f) Blank-output count: overpaid 8 → ceil(log2(8)) = 3 blanks sent
	//     The NUT-08 change branch must send max(ceil(log2(changeAmount)), 1)
	//     outputs, each with amount = 0 (mint imprints the amounts).
	// ────────────────────────────────────────────────────────────
	it('f) NUT-08 blank outputs: overpaid 8 → 3 blanks (amount=0 each)', async () => {
		mockSupportsNUT08 = true;
		setMockMintChange([{ amount: 4 }, { amount: 2 }, { amount: 2 }]); // mint's own split of 8

		await addProofs([makeProof('f1', 108)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('f1', 108))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-f', inputs, 'lnbc-f', 100, FEE_RESERVE);

		expect(result.success).toBe(true);

		// Inspect the outputs the wallet sent to the mint
		const meltCall = (meltTokens as ReturnType<typeof vi.fn>).mock.calls[0];
		const sentOutputs = meltCall[3] as Array<{ amount: number; id: string }>;
		// ceil(log2(8)) = 3 blanks — exactly what the mint's 3-way split needs
		expect(sentOutputs.length).toBe(3);
		// ALL blanks: amount = 0 — the mint imprints amounts when signing
		expect(sentOutputs.every((o) => o.amount === 0)).toBe(true);
		// Change unblinded with sig.amount (mint-imprinted): [4, 2, 2]
		expect(result.change.map((p) => p.amount)).toEqual([4, 2, 2]);
	});

	// ────────────────────────────────────────────────────────────
	// (g) COMMANDER REPRO (TASK-MELT-NUT08-BLANKS acceptance #3):
	//     spentTotal=208, amount=200, feeReserve=2, mint fee_paid=2
	//     OLD bug: decompose(8) = [8] → 1 output sent; mint split 6 → [4, 2]
	//     needed 2 outputs → mint truncated to the 1 available ([4]) →
	//     "signed change sum (4) < expected changeAmount (6)" thrown AFTER
	//     payment succeeded + 2 sats lost.
	//     NEW: blanks = ceil(log2(8)) = 3 (amount=0 each) → mint returns
	//     [4, 2] (sum=6=legacyChangeAmount) → no throw, actualFee =
	//     2 - (6 - 6) = 2 (truthful — the real fee the mint charged),
	//     tx recorded confirmed.
	// ────────────────────────────────────────────────────────────
	it('g) Commander repro: spentTotal=208, amount=200 → blanks=3, mint returns [4,2], no throw, actualFee=2', async () => {
		mockSupportsNUT08 = true;
		// Mint's split of the 6-sat overpay → [4, 2] (sum=6)
		setMockMintChange([{ amount: 4 }, { amount: 2 }]);

		await addProofs([makeProof('g1', 200), makeProof('g2', 8)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 2);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('g1', 200)),
			makeInput(makeProof('g2', 8))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-g', inputs, 'lnbc-g', 200, 2);

		// No throw — melt completes successfully
		expect(result.success).toBe(true);
		// Change = the mint-imprinted [4, 2] (sum 6, nothing truncated away)
		expect(result.change.map((p) => p.amount)).toEqual([4, 2]);
		expect(result.change.reduce((s, p) => s + p.amount, 0)).toBe(6);

		// Tx recorded with the TRUTHFUL fee: feeReserve - (6 - 6) = 2
		// (= the fee the mint actually charged, per the TASK-314 formula)
		const txs = await getTransactions({ type: 'melt' });
		const tx = txs.find((t) => t.id === 'melt-melt-quote-g');
		expect(tx).toBeDefined();
		expect(tx?.status).toBe('confirmed');
		expect(tx?.actual_fee).toBe(2);
		expect(tx?.fee).toBe(2); // legacy fallback = feeReserve
	});
});
