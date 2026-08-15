/**
 * TASK-250 (RC-2): mint must REQUIRE a seed — no random-secret fallback.
 *
 * A legacy (24-word) wallet has no mnemonic, so `getActiveSeed()` returns null.
 * The old `createOutputs()` silently fell back to `generateRandomSecret()`,
 * producing proofs that can never be recovered from the seed. Minting now throws
 * a clear migration error instead of falling back.
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
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('TASK-250 RC-2: mint requires seed (no random fallback)', () => {
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

	it('no active seed → clear migration error, mintTokens NOT called (no random fallback)', async () => {
		clearActiveSeed(); // simulate a legacy wallet with no mnemonic

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/seed|migrat/i);
		// Must NOT derive random secrets and submit — no mintTokens call.
		expect(client.mintTokens).not.toHaveBeenCalled();
		// Counter must remain untouched.
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});

	it('explicit seed argument still works even when the active seed is unset', async () => {
		clearActiveSeed();

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(true);
		expect(result.proofs.length).toBe(2); // 3 → [1, 2]
		expect(client.mintTokens).toHaveBeenCalledTimes(1);
		expect(getCounterK(KEYSET_ID)).toBe(2);
	});
});
