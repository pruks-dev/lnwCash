/**
 * TASK-260: benign "outputs already signed" (11003) retry.
 *
 * When a mint POST is rejected with code 11003 the mint has ALREADY signed the
 * exact outputs we submitted (a lost cross-tab race, or a response that was
 * signed but never received). The wallet must treat this as benign: advance the
 * counter past the collided outputs and re-derive fresh secrets — NOT surface
 * an error loop to the user.
 *
 * A real error (any other code, or a non-Cashu error) must still fail the mint
 * exactly as before — this is NOT a blanket catch.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', () => {
	// A faithful CashuError shape (stores .code) so `instanceof CashuError &&
	// err.code === 11003` works in the code under test.
	class CashuError extends Error {
		status?: number;
		code?: number | string;
		constructor(message: string, status?: number, code?: number | string) {
			super(message);
			this.name = 'CashuError';
			this.status = status;
			this.code = code;
		}
	}
	return {
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
		CashuError,
		MintUnreachableError: class extends Error {},
		NetworkError: class extends Error {},
		InvalidResponseError: class extends Error {}
	};
});

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

function signaturesFor(): Array<{ id: string; amount: number; C_: string }> {
	return decomposeAmount(3).map((a) => ({
		id: KEYSET_ID,
		amount: a,
		C_: '02' + 'a1'.repeat(32)
	}));
}

describe('TASK-260: benign 11003 "outputs already signed" retry', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();

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

	it('retries with a fresh counter and succeeds on benign 11003', async () => {
		const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
		mintTokens
			.mockRejectedValueOnce(
				new client.CashuError('HTTP 400 (11003): outputs already signed', 400, 11003)
			)
			.mockResolvedValueOnce({ signatures: signaturesFor() });

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(true);
		expect(result.proofs.length).toBe(2);
		// First attempt (counter 0,1) collided → retried with counter 2,3.
		expect(mintTokens).toHaveBeenCalledTimes(2);
		// 2 skipped + 2 minted = counter 4.
		expect(getCounterK(KEYSET_ID)).toBe(4);
	});

	it('does NOT retry on a real (non-11003) error', async () => {
		const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
		mintTokens.mockRejectedValueOnce(
			new client.CashuError('HTTP 400 (10000): custom error', 400, 10000)
		);

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(false);
		expect(result.error).toContain('10000');
		expect(mintTokens).toHaveBeenCalledTimes(1);
		// No counter advance on a real error.
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});

	it('does NOT retry on a non-Cashu error (blanket-catch guard)', async () => {
		const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
		mintTokens.mockRejectedValueOnce(new Error('network blew up'));

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(false);
		expect(result.error).toContain('network blew up');
		expect(mintTokens).toHaveBeenCalledTimes(1);
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});

	it('bounds the retry — persistent 11003 does not loop forever', async () => {
		const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
		mintTokens.mockRejectedValue(
			new client.CashuError('HTTP 400 (11003): outputs already signed', 400, 11003)
		);

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(false);
		// 1 initial + 3 retries = 4 attempts, then it surfaces the error.
		expect(mintTokens).toHaveBeenCalledTimes(4);
		// Counter advanced once per retry (3 × 2 outputs).
		expect(getCounterK(KEYSET_ID)).toBe(6);
	});
});
