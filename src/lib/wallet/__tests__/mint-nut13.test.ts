/**
 * NUT-13 deterministic mint integration — completeMint with a seed derives
 * deterministic secrets and advances the per-keyset counter_k.
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
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	mintTokens: vi.fn().mockResolvedValue({ signatures: [] }),
	checkMintQuote: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	pollMintQuoteUntil: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	checkState: vi.fn(),
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
	deterministicBlindingFactor: vi.fn().mockReturnValue(12345n),
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
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(() => '02' + 'ff'.repeat(32)),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB } from '../proofsDb';
import { completeMint, decomposeAmount } from '../mint';
import { setActiveSeed, clearActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('NUT-13 deterministic mint', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();

		const mintTokensMock = client.mintTokens as ReturnType<typeof vi.fn>;
		mintTokensMock.mockResolvedValue({
			signatures: decomposeAmount(3).map((a) => ({
				id: KEYSET_ID,
				amount: a,
				C_: '02' + 'a1'.repeat(32)
			}))
		});

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

	it('should derive deterministic secrets from the seed and advance counter_k', async () => {
		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(true);
		const expectedSecrets = [
			deriveSecret(seed, KEYSET_ID, 0),
			deriveSecret(seed, KEYSET_ID, 1)
		];
		expect(result.proofs.map((p) => p.secret)).toEqual(expectedSecrets);
		// two outputs minted → counter_k advanced by 2
		expect(getCounterK(KEYSET_ID)).toBe(2);
	});

	it('should continue the counter across successive mints', async () => {
		await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		// Second mint starts at counter 2
		const second = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);
		const expectedSecrets = [
			deriveSecret(seed, KEYSET_ID, 2),
			deriveSecret(seed, KEYSET_ID, 3)
		];
		expect(second.proofs.map((p) => p.secret)).toEqual(expectedSecrets);
		expect(getCounterK(KEYSET_ID)).toBe(4);
	});

	it('should use the in-memory active seed when no seed argument is passed', async () => {
		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false);

		expect(result.success).toBe(true);
		expect(result.proofs.map((p) => p.secret)).toEqual([
			deriveSecret(seed, KEYSET_ID, 0),
			deriveSecret(seed, KEYSET_ID, 1)
		]);
		expect(getCounterK(KEYSET_ID)).toBe(2);
	});
});
