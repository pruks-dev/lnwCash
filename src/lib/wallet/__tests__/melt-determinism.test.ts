/**
 * TASK-244 (F-V27-005): NUT-13 determinism for melt change — same seed → same
 * change secret, counter_k advances, and legacy wallets fail clearly instead of
 * falling back to random secrets.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn(),
	getKeysets: vi.fn().mockResolvedValue([
		{ id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0 }
	]),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	requestMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 50,
		fee_reserve: 1,
		paid: false,
		expiry: 9999999999
	}),
	meltTokens: vi.fn().mockResolvedValue({
		paid: true,
		payment_preimage: 'preimage-abc',
		// TASK-MELT-DECOMPOSE: change 13 is now decomposed to [8, 4, 1] → the mint
		// returns one signature per denomination.
		change: [
			{ id: KEYSET_ID, amount: 8, C_: '02' + 'a1'.repeat(32) },
			{ id: KEYSET_ID, amount: 4, C_: '02' + 'a1'.repeat(32) },
			{ id: KEYSET_ID, amount: 1, C_: '02' + 'a1'.repeat(32) }
		]
	}),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockResolvedValue({ states: [] }),
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 50,
		fee_reserve: 1,
		paid: false,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockReturnValue({
		B_: '02' + 'b1'.repeat(32),
		blindingFactor: 'Zm9vYmFyYmF6'
	}),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'ff'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getKeysetById: vi.fn().mockReturnValue({ id: KEYSET_ID }),
	getAllKeysets: vi.fn().mockReturnValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'ff'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(() => '02' + 'ff'.repeat(32)),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs } from '../proofsDb';
import { meltFlow } from '../melt';
import { setActiveSeed, clearActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { getAllKeysets, fetchAndCacheKeysets } from '../../cashu/keyset';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('NUT-13 deterministic melt change (TASK-244)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed); // known seed for deterministic assertions

		// 64 sats → melt 50 + fee_reserve 1 → change 13 (> 0, exercises change path)
		await addProofs([makeProof('p1', 64)], MINT_URL, KEYSET_ID);

		// TASK-250 (RC-3): the 64-sat proof was "already minted" (1 output), so the
		// counter is 1 — the melt counter-0 guard must not fire, and change derives
		// from counter 1.
		setCounterK(KEYSET_ID, 1);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('derives the change secrets deterministically from the seed (NUT-13)', async () => {
		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(true);
		// change 13 → decompose [8, 4, 1] → 3 outputs
		expect(result.change.length).toBe(3);
		expect(result.change.map((p) => p.amount)).toEqual([8, 4, 1]);
		// each change secret must equal the NUT-13 derivation for its counter
		// (counter starts at 1), not random
		expect(result.change[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 1));
		expect(result.change[1].secret).toBe(deriveSecret(seed, KEYSET_ID, 2));
		expect(result.change[2].secret).toBe(deriveSecret(seed, KEYSET_ID, 3));
	});

	it('same seed → same change secrets across independent runs', async () => {
		const first = await meltFlow(MINT_URL, 'lnbc...', 50);

		// reset counter + proofs to simulate a fresh run with the same seed
		setCounterK(KEYSET_ID, 1);
		await deleteProofDB();
		resetProofDB();
		await addProofs([makeProof('p1', 64)], MINT_URL, KEYSET_ID);

		const second = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(second.change.length).toBe(3);
		expect(second.change[0].secret).toBe(first.change[0].secret);
		expect(second.change[1].secret).toBe(first.change[1].secret);
		expect(second.change[2].secret).toBe(first.change[2].secret);
		expect(second.change[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 1));
	});

	it('advances counter_k by the number of change outputs (3) after a successful melt', async () => {
		expect(getCounterK(KEYSET_ID)).toBe(1);

		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(true);
		// change 13 → decompose [8, 4, 1] → 3 outputs → counter 1 → 4
		expect(getCounterK(KEYSET_ID)).toBe(4);
	});

	it('legacy wallet (no active seed) → clear re-key/recover error, NOT random fallback', async () => {
		clearActiveSeed(); // simulate legacy wallet with no mnemonic

		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(false);
		expect(result.error).toBeTruthy();
		expect(result.error).toMatch(/seed|re-key|recover/i);
		// must NOT silently fall back to random — error must point at re-key/recover
		expect(result.error).not.toContain('preimage-abc');
	});
});

// ─── TASK-251 (RC-4 / F-V28-006): keyset version 00 (BIP32 legacy) ───────
//
// Live mint uses keyset `00c25786d85a1dcd` (version `00` → BIP32 legacy
// derivation, NOT HMAC-SHA256). The version-01 cases above never exercised
// `deriveSecretAndRBip32` through the melt path — this describe proves the
// change secret flows through the REAL BIP32 derivation (deriveSecretAndR is
// NOT mocked; only the cashu client / blind / keyset modules are).
const KEYSET_ID_V00 = '00c25786d85a1dcd';
// BIP32 path m/129372'/0'/1507773658'/1'/0 for the live mint keyset (counter 1),
// byte-for-byte from deriveSecretAndRBip32 — hardcoded so the test FAILS if the
// derivation accidentally routes through HMAC (which would produce a different value).
const CHANGE_SECRET_V00_COUNTER1 = '6f050b20feee6fbad8bea06d0ae16166187640ac6ae4818a0383dc5f09d688ba';

function makeProofV00(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID_V00, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('NUT-13 deterministic melt change — keyset version 00 (BIP32)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();

		// Point the keyset mocks at the version-00 keyset so F-072 ownership
		// verification accepts the proof and fee lookup succeeds.
		const v00Keyset = {
			id: KEYSET_ID_V00,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'ff'.repeat(32) },
			last_updated: Date.now()
		};
		vi.mocked(getAllKeysets).mockReturnValue([v00Keyset]);
		vi.mocked(fetchAndCacheKeysets).mockResolvedValue([v00Keyset]);

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);

		// 64 sats → melt 50 + fee_reserve 1 → change 13; counter starts at 1
		// (the 64-sat proof was "already minted" as output 0).
		await addProofs([makeProofV00('p1', 64)], MINT_URL, KEYSET_ID_V00);
		setCounterK(KEYSET_ID_V00, 1);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('derives the change secrets via the REAL BIP32 path (version 00)', async () => {
		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(true);
		// change 13 → decompose [8, 4, 1] → 3 outputs
		expect(result.change.length).toBe(3);
		// exact BIP32-derived value for counter 1 (NOT an HMAC value)
		expect(result.change[0].secret).toBe(CHANGE_SECRET_V00_COUNTER1);
		expect(result.change[0].secret).toBe(deriveSecret(seed, KEYSET_ID_V00, 1));
		expect(result.change[1].secret).toBe(deriveSecret(seed, KEYSET_ID_V00, 2));
		expect(result.change[2].secret).toBe(deriveSecret(seed, KEYSET_ID_V00, 3));
	});

	it('same seed → same change secret via BIP32 across independent runs', async () => {
		const first = await meltFlow(MINT_URL, 'lnbc...', 50);

		// reset counter + proofs to simulate a fresh run with the same seed
		setCounterK(KEYSET_ID_V00, 1);
		await deleteProofDB();
		resetProofDB();
		await addProofs([makeProofV00('p1', 64)], MINT_URL, KEYSET_ID_V00);

		const second = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(second.change[0].secret).toBe(first.change[0].secret);
		expect(second.change[0].secret).toBe(CHANGE_SECRET_V00_COUNTER1);
	});

	it('BIP32 secret differs from the HMAC secret for the same counter (real path, not HMAC)', async () => {
		// Sanity: version 00 must route through BIP32, not HMAC-SHA256.
		expect(deriveSecret(seed, KEYSET_ID_V00, 1)).not.toBe(deriveSecret(seed, KEYSET_ID, 1));
		expect(deriveSecret(seed, KEYSET_ID_V00, 1)).toBe(CHANGE_SECRET_V00_COUNTER1);
	});
});
