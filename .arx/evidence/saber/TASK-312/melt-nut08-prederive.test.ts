/**
 * TASK-312: MAX change pre-derive (NUT-08).
 *
 * When the mint advertises NUT-08, it returns all overpaid sats as change
 * (min_fee_estimate = 0). The wallet must therefore derive change =
 * MAX(0, spentTotal - amount - 0), decomposed via existing `decomposeAmount`
 * into standard Cashu denominations (binary: 1, 2, 4, 8, 16, ...).
 *
 * When the mint does NOT advertise NUT-08, the wallet must fall back to the
 * legacy fee model (feeReserve reserved upfront): change =
 * spentTotal - amount - feeReserve.
 *
 * 6 scenarios:
 *   (a) NUT-08 mint, 0 overpaid → changeAmount = 0 → no change output
 *   (b) NUT-08 mint, 100 overpaid → changeAmount = 100 → [64,32,4] = 3 outputs
 *   (c) NUT-08 mint, 1000 overpaid → [512,256,128,64,32,8] = 6 outputs
 *   (d) Non-NUT-08 mint, 100 overpaid → changeAmount = 100 - feeReserve (legacy)
 *   (e) spentTotal = amount → changeAmount = 0 regardless of NUT-08
 *   (f) hasNUT08 check throws → fallback to legacy feeReserve, melt succeeds
 *
 * Tests call `completeMelt` directly with explicit `inputs` so the spentTotal
 * is deterministic — `meltFlow`'s input-selection (`selectProofs`) could
 * otherwise pick a subset that changes the assertion numbers.
 *
 * `hasNUT08` is mocked directly (not the underlying `getMintCapability`) so
 * the 24h TTL cache does not leak between tests.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

// ─── Captured state (test → mint call) ─────────────────────────

/** outputBodies the wallet actually sends to the mint (postMelt argument #4) */
let capturedOutputBodies: Array<{ amount: number; id: string; B_: string }> = [];

/** Mutable hasNUT08 return — tests can override per scenario */
let mockSupportsNUT08: boolean = true;
/** If true, hasNUT08 rejects with `mockHasNUT08Error` (simulates network failure). */
let mockHasNUT08Throws: boolean = false;
const mockHasNUT08Error = new Error('network unreachable');

// ─── Module mocks (vitest hoisting moves these above imports) ────

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => {
		if (mockHasNUT08Throws) return Promise.reject(mockHasNUT08Error);
		return Promise.resolve(mockSupportsNUT08);
	}),
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
	// Capture the outputBodies the wallet sends, then return matching change sigs
	// so unblind + addProofs complete without further wiring.
	meltTokens: vi.fn((_mint: string, _quote: string, _inputs: any, outputs: any) => {
		capturedOutputBodies = outputs;
		return Promise.resolve({
			paid: true,
			payment_preimage: 'preimage-abc',
			change: (outputs as Array<{ amount: number }>).map((o) => ({
				id: KEYSET_ID,
				amount: o.amount,
				C_: '02' + 'a1'.repeat(32)
			}))
		});
	}),
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
import { completeMelt } from '../melt';
import type { TokenProof, SelectedProofInfo } from '../../../types';

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

describe('TASK-312: MAX change pre-derive (NUT-08)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		try { localStorage.clear(); } catch { /* ignore */ }
		vi.clearAllMocks();

		// Reset mock state to defaults (NUT-08 capable).
		mockSupportsNUT08 = true;
		mockHasNUT08Throws = false;
		capturedOutputBodies = [];

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

	it('a) NUT-08 mint, 0 overpaid → changeAmount = 0 → no change output', async () => {
		// 100 sats input, pay 100, feeReserve 0 → NUT-08: change = max(0, 100-100-0) = 0
		await addProofs([makeProof('a1', 100)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1); // 1 proof "already minted" → counter starts at 1

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('a1', 100))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);

		expect(result.success).toBe(true);
		// No change → meltTokens called with empty outputs array
		expect(capturedOutputBodies.length).toBe(0);
		expect(result.change.length).toBe(0);
	});

	it('b) NUT-08 mint, 100 overpaid → changeAmount = 100 → decompose [64,32,4] = 3 outputs', async () => {
		// 200 sats input, pay 100, feeReserve 0 → NUT-08: change = 200-100-0 = 100
		// decompose(100) → [64, 32, 4] (3 outputs, sum 100)
		await addProofs([makeProof('b1', 100), makeProof('b2', 100)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 2); // 2 proofs "already minted"

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('b1', 100)),
			makeInput(makeProof('b2', 100))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);

		expect(result.success).toBe(true);
		expect(capturedOutputBodies.length).toBe(3);
		expect(capturedOutputBodies.map((o) => o.amount)).toEqual([64, 32, 4]);
		expect(capturedOutputBodies.reduce((s, o) => s + o.amount, 0)).toBe(100);
		expect(result.change.length).toBe(3);
		expect(result.change.map((p) => p.amount)).toEqual([64, 32, 4]);
	});

	it('c) NUT-08 mint, 1000 overpaid → decompose [512,256,128,64,32,8] = 6 outputs', async () => {
		// 1100 sats input, pay 100, feeReserve 0 → NUT-08: change = 1100-100-0 = 1000
		// decompose(1000) → [512, 256, 128, 64, 32, 8] (6 outputs, sum 1000)
		await addProofs([makeProof('c1', 500), makeProof('c2', 600)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 2);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('c1', 500)),
			makeInput(makeProof('c2', 600))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);

		expect(result.success).toBe(true);
		expect(capturedOutputBodies.length).toBe(6);
		expect(capturedOutputBodies.map((o) => o.amount)).toEqual([512, 256, 128, 64, 32, 8]);
		expect(capturedOutputBodies.reduce((s, o) => s + o.amount, 0)).toBe(1000);
		expect(result.change.length).toBe(6);
		expect(result.change.map((p) => p.amount)).toEqual([512, 256, 128, 64, 32, 8]);
	});

	it('d) Non-NUT-08 mint, 100 overpaid → changeAmount = 100 - feeReserve (legacy)', async () => {
		// Legacy mint: hasNUT08 → false
		// 200 sats input, pay 100, feeReserve 2 → legacy: change = 200-100-2 = 98
		// decompose(98) → [64, 32, 2] (3 outputs, sum 98)
		mockSupportsNUT08 = false;

		await addProofs([makeProof('d1', 100), makeProof('d2', 100)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 2);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('d1', 100)),
			makeInput(makeProof('d2', 100))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 2);

		expect(result.success).toBe(true);
		expect(capturedOutputBodies.length).toBe(3);
		expect(capturedOutputBodies.map((o) => o.amount)).toEqual([64, 32, 2]);
		expect(capturedOutputBodies.reduce((s, o) => s + o.amount, 0)).toBe(98);
		expect(result.change.length).toBe(3);
		expect(result.change.map((p) => p.amount)).toEqual([64, 32, 2]);
	});

	it('e) spentTotal = amount → changeAmount = 0 regardless of NUT-08', async () => {
		// NUT-08 mint, exactly enough: 100 → 100, feeReserve 0
		// change = max(0, 100-100-0) = 0 → no change output
		await addProofs([makeProof('e1', 100)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 1);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('e1', 100))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 0);

		expect(result.success).toBe(true);
		expect(capturedOutputBodies.length).toBe(0);
		expect(result.change.length).toBe(0);
	});

	it('f) hasNUT08 check throws → fallback to legacy feeReserve, melt succeeds', async () => {
		// Simulate network error during capability check → hasNUT08 throws
		// → completeMelt catches → supportsNUT08 stays false → legacy path
		// (feeReserve reserved upfront, change = spentTotal - amount - feeReserve).
		// 200 sats, pay 100, feeReserve 2 → change = 98 → [64,32,2].
		mockHasNUT08Throws = true;

		await addProofs([makeProof('f1', 100), makeProof('f2', 100)], MINT_URL, KEYSET_ID);
		setCounterK(KEYSET_ID, 2);

		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('f1', 100)),
			makeInput(makeProof('f2', 100))
		];

		const result = await completeMelt(MINT_URL, 'melt-quote-xyz', inputs, 'lnbc...', 100, 2);

		// Melt must still succeed despite capability failure.
		expect(result.success).toBe(true);
		// Legacy path used: change = 200 - 100 - 2 = 98 → [64, 32, 2]
		expect(capturedOutputBodies.length).toBe(3);
		expect(capturedOutputBodies.map((o) => o.amount)).toEqual([64, 32, 2]);
		expect(capturedOutputBodies.reduce((s, o) => s + o.amount, 0)).toBe(98);
	});
});
