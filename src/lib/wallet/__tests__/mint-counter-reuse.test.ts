/**
 * TASK-240 (F-V27-001): NUT-13 counter-reuse regression tests.
 *
 * The mint 400 `{"detail":"outputs already signed","code":11003}` bug happened
 * because `incrementCounterK` ran AFTER `addProofs` (not in `finally`) — so an
 * IndexedDB write failure would leave the counter un-advanced and the next mint
 * would re-derive the same `B_`. A second path (localStorage loss) also reset
 * `counter_k` to 0 while old proofs remained in IndexedDB.
 *
 * Covers:
 *   1. counter advances even when addProofs throws (no 11003 reuse)
 *   2. counter_k == 0 + existing proofs → forced NUT-9 restore (no re-mint)
 *   3. normal mint → counter advances by amounts.length
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

// Wrap proofsDb.addProofs in a spy so a single test can make it throw, while
// every other function (getAllProofs, deleteProofDB, …) stays real.
vi.mock('../proofsDb', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../proofsDb')>();
	return {
		...actual,
		addProofs: vi.fn(actual.addProofs)
	};
});

import * as client from '../../cashu/client';
import * as proofsDb from '../proofsDb';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { completeMint, decomposeAmount } from '../mint';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('TASK-240 NUT-13 counter-reuse protection', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await proofsDb.deleteProofDB();
		proofsDb.resetProofDB();
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
		await proofsDb.deleteProofDB();
		proofsDb.resetProofDB();
	});

	it('F-V27-001: advances counter_k even when addProofs throws (no reuse)', async () => {
		const addProofsMock = proofsDb.addProofs as ReturnType<typeof vi.fn>;
		addProofsMock.mockRejectedValueOnce(new Error('IndexedDB write failed'));

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(false);
		expect(result.error).toBe('IndexedDB write failed');
		// The mint already signed → counter MUST advance regardless of the throw.
		expect(getCounterK(KEYSET_ID)).toBe(2);
	});

	it('F-V27-001: forces NUT-9 restore when counter_k=0 but proofs exist', async () => {
		// Simulate localStorage loss: counter_k is 0, but old proofs remain in IndexedDB.
		await proofsDb.addProofs(
			[{ id: KEYSET_ID, amount: 1, secret: '00'.repeat(32), C: '03' + 'c1'.repeat(32) }],
			MINT_URL,
			KEYSET_ID
		);
		// Sanity: the guard's trigger condition holds.
		expect(getCounterK(KEYSET_ID)).toBe(0);

		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/NUT-9|restore/i);
		// Must NOT submit outputs to the mint (no re-mint with counter 0).
		expect(client.mintTokens).not.toHaveBeenCalled();
		// Counter must remain 0 until a real restore is run.
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});

	it('F-V27-001: normal mint advances counter_k by amounts.length', async () => {
		const result = await completeMint(MINT_URL, 'q', 3, KEYSET_ID, false, seed);

		expect(result.success).toBe(true);
		// amount 3 decomposes to [1, 2] → 2 outputs → counter advanced by 2.
		expect(result.proofs.length).toBe(2);
		expect(getCounterK(KEYSET_ID)).toBe(2);
	});
});
