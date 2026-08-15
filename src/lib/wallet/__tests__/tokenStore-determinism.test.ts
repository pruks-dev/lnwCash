/**
 * TASK-244 (F-V27-005): NUT-13 determinism for swap receive — same seed → same
 * swap secrets, counter_k advances by the number of received proofs, and legacy
 * wallets fail clearly instead of falling back to random secrets.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn().mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: [
			{ id: KEYSET_ID, amount: 2, secret: 'olds1', C: 'C-old1' },
			{ id: KEYSET_ID, amount: 1, secret: 'olds2', C: 'C-old2' }
		]
	})
}));

vi.mock('../../cashu/client', () => ({
	checkState: vi.fn(),
	swapProofs: vi.fn().mockResolvedValue({
		signatures: [
			{ id: KEYSET_ID, amount: 2, C_: '02' + 'a1'.repeat(32) },
			{ id: KEYSET_ID, amount: 1, C_: '02' + 'a2'.repeat(32) }
		]
	}),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([]),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	// getMintPubkey returns null so unblind falls back to C = sig.C_ (no curve parsing)
	getMintPubkey: vi.fn(() => null),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, getAllProofs } from '../proofsDb';
import { receiveTokens } from '../tokenStore';
import { setActiveSeed, clearActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('NUT-13 deterministic swap receive (TASK-244)', () => {
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
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('derives deterministic swap secrets + advances counter_k by proof count', async () => {
		const result = await receiveTokens('cashuAdummy');

		expect(result.proofCount).toBe(2);
		// counter advanced by the number of received (swapped) proofs
		expect(getCounterK(KEYSET_ID)).toBe(2);

		const stored = await getAllProofs();
		const secrets = stored.map((p) => p.secret).sort();
		const expected = [
			deriveSecret(seed, KEYSET_ID, 0),
			deriveSecret(seed, KEYSET_ID, 1)
		].sort();
		expect(secrets).toEqual(expected);
	});

	it('same seed → same swap secrets across independent runs', async () => {
		await receiveTokens('cashuAdummy');
		const firstSecrets = (await getAllProofs()).map((p) => p.secret).sort();

		// reset state and receive again with the same seed
		localStorage.removeItem(STORAGE_KEY);
		await deleteProofDB();
		resetProofDB();

		await receiveTokens('cashuAdummy');
		const secondSecrets = (await getAllProofs()).map((p) => p.secret).sort();

		expect(firstSecrets).toEqual(secondSecrets);
		expect(firstSecrets).toEqual([
			deriveSecret(seed, KEYSET_ID, 0),
			deriveSecret(seed, KEYSET_ID, 1)
		].sort());
	});

	it('legacy wallet (no active seed) → clear migration error, NOT random fallback', async () => {
		clearActiveSeed(); // simulate legacy wallet with no mnemonic

		await expect(receiveTokens('cashuAdummy')).rejects.toThrow(/seed|migrat/i);
	});
});
