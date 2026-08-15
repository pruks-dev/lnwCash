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
		change: [{ id: KEYSET_ID, amount: 13, C_: '02' + 'a1'.repeat(32) }]
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
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('derives the change secret deterministically from the seed (NUT-13)', async () => {
		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(true);
		expect(result.change.length).toBe(1);
		// change secret must equal the NUT-13 derivation for counter 0 (not random)
		expect(result.change[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 0));
	});

	it('same seed → same change secret across independent runs', async () => {
		const first = await meltFlow(MINT_URL, 'lnbc...', 50);

		// reset counter + proofs to simulate a fresh run with the same seed
		setCounterK(KEYSET_ID, 0);
		await deleteProofDB();
		resetProofDB();
		await addProofs([makeProof('p1', 64)], MINT_URL, KEYSET_ID);

		const second = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(first.success).toBe(true);
		expect(second.success).toBe(true);
		expect(second.change[0].secret).toBe(first.change[0].secret);
		expect(second.change[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 0));
	});

	it('advances counter_k by 1 after a successful melt change', async () => {
		expect(getCounterK(KEYSET_ID)).toBe(0);

		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(1);
	});

	it('legacy wallet (no active seed) → clear migration error, NOT random fallback', async () => {
		clearActiveSeed(); // simulate legacy wallet with no mnemonic

		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(false);
		expect(result.error).toBeTruthy();
		expect(result.error).toMatch(/seed|migrat/i);
		// must NOT silently fall back to random — error must point at migration
		expect(result.error).not.toContain('preimage-abc');
	});
});
