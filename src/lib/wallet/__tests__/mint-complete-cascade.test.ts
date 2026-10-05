/**
 * TASK-1304 (INTENT-013) — integration: completeMint cascade
 *
 * 1. Mint amount N → the stored pile IS the complete-set of N (fold C).
 * 2. counter_k advance = completeSet(N).length — including the 11003
 *    idempotent-retry path (advance = amounts.length EVERY attempt).
 * 3. TASK-313-style guard (melt.ts:624 pattern): when the mint's signature
 *    count desyncs from the derived outputs (more, or fewer), completeMint
 *    aborts BEFORE the counter is touched and BEFORE any proof is stored.
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
	CashuError: class MockCashuError extends Error {
		status?: number;
		code?: number | string;
		constructor(message: string, status?: number, code?: number | string) {
			super(message);
			this.name = 'CashuError';
			this.status = status;
			this.code = code;
		}
	},
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
import { deleteProofDB, resetProofDB, getAllProofs, getTotalBalance } from '../proofsDb';
import { completeMint } from '../mint';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeSet } from '../completeSet';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

/** Faithful mock mint: signs EXACTLY the submitted blinded messages. */
function echoMint(): ReturnType<typeof vi.fn> {
	const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
	return mintTokens.mockImplementation(
		async (_url: string, _quote: string, postBody: Array<{ id: string; amount: number; B_: string }>) => ({
			signatures: postBody.map((o) => ({
				id: o.id,
				amount: o.amount,
				C_: '02' + 'a1'.repeat(32)
			}))
		})
	);
}

describe('TASK-1304: mint complete-set cascade', () => {
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

	it('mint 10 → the stored pile IS completeSet(10) and counter = completeSet(10).length', async () => {
		echoMint();

		const result = await completeMint(MINT_URL, 'q', 10, KEYSET_ID, false, seed);

		expect(result.success).toBe(true);
		const target = completeSet(10); // [1,1,2,4,1,1] — covers every amount 1..10
		expect(result.proofs.map((p) => p.amount).sort((a, b) => a - b))
			.toEqual([...target].sort((a, b) => a - b));
		expect(result.proofs.reduce((s, p) => s + p.amount, 0)).toBe(10);

		const stored = await getAllProofs();
		expect(stored.map((p) => p.amount).sort((a, b) => a - b))
			.toEqual([...target].sort((a, b) => a - b));
		expect(await getTotalBalance()).toBe(10);

		// The counter advanced by the count of outputs the mint signed:
		expect(getCounterK(KEYSET_ID)).toBe(target.length);
	});

	it('11003 idempotent retry — counter advance = completeSet(5).length EVERY attempt', async () => {
		const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
		// attempt 1: benign 11003 (outputs already signed) → attempt 2 succeeds.
		mintTokens
			.mockRejectedValueOnce(
				new client.CashuError('HTTP 400 (11003): outputs already signed', 400, 11003)
			)
			.mockImplementation(
				async (_url: string, _quote: string, postBody: Array<{ id: string; amount: number; B_: string }>) => ({
					signatures: postBody.map((o) => ({ id: o.id, amount: o.amount, C_: '02' + 'a1'.repeat(32) }))
				})
			);

		const target = completeSet(5); // [1,1,2,1] — 4 outputs
		const result = await completeMint(MINT_URL, 'q', 5, KEYSET_ID, false, seed);

		expect(result.success).toBe(true);
		expect(result.proofs).toHaveLength(target.length);
		// Two submitted attempts × outputs.length each (counter past collided then minted):
		expect(getCounterK(KEYSET_ID)).toBe(target.length * 2);
		// Stored proofs are the second attempt's derivation only (the collided first
		// attempt stayed unsigned locally — its secrets are not in the wallet):
		const stored = await getAllProofs();
		expect(stored).toHaveLength(target.length);
		expect(stored.map((p) => p.amount).sort((a, b) => a - b)).toEqual([...target].sort((a, b) => a - b));
	});

	it('guard (sign > derive) aborts BEFORE counter advance and storage', async () => {
		const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
		// The mint "creates" MORE outputs than the wallet derived — impossible
		// in reality, the exact TASK-313 anomaly (melt.ts:624 pattern).
		mintTokens.mockImplementation(
			async (_url: string, _quote: string, postBody: Array<{ amount: number }>) => ({
				signatures: [
					...postBody.map((o) => ({ id: KEYSET_ID, amount: o.amount, C_: '02' + 'a1'.repeat(32) })),
					{ id: KEYSET_ID, amount: 999, C_: '02' + 'bb'.repeat(32) } // extra, never derived
				]
			})
		);

		const result = await completeMint(MINT_URL, 'q', 5, KEYSET_ID, false, seed);

		expect(result.success).toBe(false);
		expect(result.error).toContain('Mint anomaly');
		expect(result.error).toContain('counter_k desync');
		// Counter NOT corrupted — the derived outputs' band stays usable:
		expect(getCounterK(KEYSET_ID)).toBe(0);
		// No proof stored:
		expect(await getTotalBalance()).toBe(0);
	});

	it('guard (sign < derive) refuses misaligned index mapping — counter intact', async () => {
		const mintTokens = client.mintTokens as ReturnType<typeof vi.fn>;
		const target = completeSet(5); // 4 outputs
		// Mint signs only the first 3 of 4 submitted outputs:
		mintTokens.mockImplementation(
			async (_url: string, _quote: string, postBody: Array<{ amount: number }>) => ({
				signatures: postBody.slice(0, target.length - 1).map((o) => ({
					id: KEYSET_ID,
					amount: o.amount,
					C_: '02' + 'a1'.repeat(32)
				}))
			})
		);

		const result = await completeMint(MINT_URL, 'q', 5, KEYSET_ID, false, seed);

		expect(result.success).toBe(false);
		expect(result.error).toContain('Mint anomaly');
		expect(result.error).toContain('misaligned');
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect(await getTotalBalance()).toBe(0);
	});
});
