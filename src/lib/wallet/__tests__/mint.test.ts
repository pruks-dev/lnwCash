/**
 * Mint flow tests (with mocked mint API)
 *
 * TASK-084 UPDATE: Tests now cover both legacy mintFlow and new two-phase
 * requestMint + completeMint API.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the client module (HTTP layer)
vi.mock('../../cashu/client', () => {
	const requestMintQuote = vi.fn().mockResolvedValue({
		quote: 'quote-xyz',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'UNPAID'
	});

	const mintTokens = vi.fn().mockResolvedValue({
		signatures: [] // Will be set in test
	});

	// TASK-084: Add checkMintQuote and pollMintQuoteUntil mocks
	const checkMintQuote = vi.fn().mockResolvedValue({
		quote: 'quote-xyz',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	});

	const pollMintQuoteUntil = vi.fn().mockResolvedValue({
		quote: 'quote-xyz',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	});

	return {
		getMintInfo: vi.fn(),
		getKeysets: vi.fn().mockResolvedValue([
			{ id: 'keyset-abc123', unit: 'sat', active: true }
		]),
		getKeys: vi.fn(),
		requestMintQuote,
		mintTokens,
		checkMintQuote,
		pollMintQuoteUntil,
		requestMeltQuote: vi.fn(),
		meltTokens: vi.fn(),
		checkMeltQuote: vi.fn(),
		checkState: vi.fn(),
		CashuError: class extends Error {},
		MintUnreachableError: class extends Error {},
		NetworkError: class extends Error {},
		InvalidResponseError: class extends Error {}
	};
});

// Mock blind signatures to always succeed
vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockReturnValue({
		B_: '02' + 'b1'.repeat(32),
		blindingFactor: 'Zm9vYmFyYmF6' // valid base64url
	}),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	deterministicBlindingFactor: vi.fn().mockReturnValue(12345n),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

// Mock keyset module — fetchAndCacheKeysets is called directly by requestMint
vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{ id: 'keyset-abc123', unit: 'sat', active: true, input_fee_ppk: 0, keys: { '1': '02' + 'ff'.repeat(32) }, last_updated: Date.now() }
	]),
	getKeysetById: vi.fn().mockReturnValue({
		id: 'keyset-abc123', unit: 'sat', active: true, input_fee_ppk: 0, keys: { '1': '02' + 'ff'.repeat(32) }, last_updated: Date.now()
	}),
	getAllKeysets: vi.fn().mockReturnValue([]),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn().mockReturnValue(false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn().mockReturnValue('02' + 'ff'.repeat(32)),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, getTotalBalance } from '../proofsDb';
import { mintFlow, requestMint, completeMint, decomposeAmount } from '../mint';
import { getTransactions, clearTransactions } from '../../storage/db';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = 'keyset-abc123';

// Create mock signatures matching the output amounts
function makeMockSignatures(amounts: number[]) {
	return {
		signatures: amounts.map(a => ({
			id: KEYSET_ID,
			amount: a,
			C_: '02' + 'a1'.repeat(32)
		}))
	};
}

describe('Mint flow', () => {
	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		vi.clearAllMocks();

		// Reset all client mocks to their default implementations
		const mintTokensMock = client.mintTokens as ReturnType<typeof vi.fn>;
		mintTokensMock.mockResolvedValue(makeMockSignatures(decomposeAmount(10)));

		const getKeysetsMock = client.getKeysets as ReturnType<typeof vi.fn>;
		getKeysetsMock.mockResolvedValue([
			{ id: KEYSET_ID, unit: 'sat', active: true }
		]);

		const getMintInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
		getMintInfoMock.mockResolvedValue({
			name: 'Test Mint',
			pubkey: '02' + 'ff'.repeat(32),
			version: '1.0'
		});

		const reqMock = client.requestMintQuote as ReturnType<typeof vi.fn>;
		reqMock.mockResolvedValue({
			quote: 'quote-xyz',
			request: 'lnbc...',
			paid: false,
			expiry: 9999999999,
			state: 'UNPAID'
		});

		// TASK-084: pollMintQuoteUntil returns PAID
		const pollMock = client.pollMintQuoteUntil as ReturnType<typeof vi.fn>;
		pollMock.mockResolvedValue({
			quote: 'quote-xyz',
			request: 'lnbc...',
			paid: true,
			expiry: 9999999999,
			state: 'PAID'
		});

		const checkMock = client.checkMintQuote as ReturnType<typeof vi.fn>;
		checkMock.mockResolvedValue({
			quote: 'quote-xyz',
			request: 'lnbc...',
			paid: true,
			expiry: 9999999999,
			state: 'PAID'
		});

		// Reset keyset mock to default (success)
		const keysetModule = await import('../../cashu/keyset');
		const mockFetchKeysets = keysetModule.fetchAndCacheKeysets as ReturnType<typeof vi.fn>;
		mockFetchKeysets.mockResolvedValue([
			{ id: 'keyset-abc123', unit: 'sat', active: true, input_fee_ppk: 0, keys: { '1': '02' + 'ff'.repeat(32) }, last_updated: Date.now() }
		]);

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	describe('decomposeAmount', () => {
		it('should decompose into powers of 2', () => {
			const result = decomposeAmount(10);
			expect(result.reduce((a, b) => a + b, 0)).toBe(10);
		});

		it('should decompose 1 to [1]', () => {
			expect(decomposeAmount(1)).toEqual([1]);
		});

		it('should decompose 0 to []', () => {
			expect(decomposeAmount(0)).toEqual([]);
		});

		it('should decompose large amounts', () => {
			const result = decomposeAmount(1000);
			const sum = result.reduce((a, b) => a + b, 0);
			expect(sum).toBe(1000);
		});
	});

	// TASK-084: New two-phase mint tests
	describe('requestMint (phase 1)', () => {
		it('T084: should return bolt11 invoice for user payment', async () => {
			const result = await requestMint(MINT_URL, 10);

			expect(result.success).toBe(true);
			expect(result.quote).toBe('quote-xyz');
			expect(result.request).toBe('lnbc...');
			expect(result.amount).toBe(10);
			expect(result.keysetId).toBe(KEYSET_ID);
		});

		it('T084: should return error when mint unreachable', async () => {
			// fetchAndCacheKeysets is called directly by requestMint
			const { fetchAndCacheKeysets: mockFetchKeysets } = await import('../../cashu/keyset');
			(mockFetchKeysets as ReturnType<typeof vi.fn>).mockRejectedValue(
				new TypeError('fetch failed')
			);

			const result = await requestMint(MINT_URL, 10);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('T084: should fail when wallet is locked', async () => {
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);

			const result = await requestMint(MINT_URL, 10);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});
	});

	describe('completeMint (phase 2)', () => {
		it('T084: should complete mint and store proofs', async () => {
			const result = await completeMint(MINT_URL, 'quote-xyz', 10, KEYSET_ID, false);

			expect(result.success).toBe(true);
			expect(result.amount).toBe(10);
			expect(result.proofs.length).toBeGreaterThan(0);

			const balance = await getTotalBalance();
			expect(balance).toBe(10);
		});

		it('T084: should fail if quote is not PAID', async () => {
			const checkMock = client.checkMintQuote as ReturnType<typeof vi.fn>;
			checkMock.mockResolvedValue({
				quote: 'quote-unpaid',
				request: 'lnbc...',
				paid: false,
				expiry: 9999999999,
				state: 'UNPAID'
			});

			const result = await completeMint(MINT_URL, 'quote-unpaid', 10, KEYSET_ID, false);
			expect(result.success).toBe(false);
			expect(result.error).toContain('not PAID');
		});

		it('should record transaction with protocol=lightning and bolt11 invoice', async () => {
			await clearTransactions();

			const result = await completeMint(MINT_URL, 'quote-xyz', 10, KEYSET_ID, false);

			expect(result.success).toBe(true);

			const txs = await getTransactions({ type: 'mint' });
			expect(txs.length).toBe(1);
			const tx = txs[0];
			expect(tx.protocol).toBe('lightning');
			expect(tx.invoice).toBe('lnbc...');
			expect(tx.token_hash).toBeNull();
			expect(tx.status).toBe('confirmed');
		});
	});

	describe('mintFlow (combined, backward-compat)', () => {
		it('should successfully mint ecash with mocked API', async () => {
			const result = await mintFlow(MINT_URL, 10);

			expect(result.success).toBe(true);
			expect(result.amount).toBe(10);
			expect(result.proofs.length).toBeGreaterThan(0);
		});

		it('should store proofs in IndexedDB after successful mint', async () => {
			await mintFlow(MINT_URL, 10);

			const balance = await getTotalBalance();
			expect(balance).toBe(10);
		});

		it('should return error when mint is unreachable', async () => {
			const { fetchAndCacheKeysets: mockFetchKeysets } = await import('../../cashu/keyset');
			(mockFetchKeysets as ReturnType<typeof vi.fn>).mockRejectedValue(
				new TypeError('fetch failed')
			);

			const result = await mintFlow(MINT_URL, 10);

			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('should handle network error gracefully', async () => {
			const { fetchAndCacheKeysets: mockFetchKeysets } = await import('../../cashu/keyset');
			(mockFetchKeysets as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Network error')
			);

			const result = await mintFlow(MINT_URL, 5);

			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('should return error when wallet is locked', async () => {
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);

			const result = await mintFlow(MINT_URL, 10);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		// ─── C04-06: quote.state verification ────────────────────

		it('C04-06: should proceed when quote.state is UNPAID (then polled to PAID)', async () => {
			const reqMock = client.requestMintQuote as ReturnType<typeof vi.fn>;
			reqMock.mockResolvedValue({
				quote: 'quote-unpaid',
				request: 'lnbc...',
				paid: false,
				expiry: 9999999999,
				state: 'UNPAID'
			});

			const result = await mintFlow(MINT_URL, 10);
			expect(result.success).toBe(true);
			expect(result.amount).toBe(10);
		});

		it('C04-06: should reject when quote.state is PAID at request time (double-mint)', async () => {
			const reqMock = client.requestMintQuote as ReturnType<typeof vi.fn>;
			reqMock.mockResolvedValue({
				quote: 'quote-already-paid',
				request: 'lnbc...',
				paid: true,
				expiry: 9999999999,
				state: 'PAID'
			});

			const result = await mintFlow(MINT_URL, 10);
			expect(result.success).toBe(false);
			expect(result.error).toContain('PAID');
		});

		it('C04-06: should reject when quote.state is EXPIRED', async () => {
			const reqMock = client.requestMintQuote as ReturnType<typeof vi.fn>;
			reqMock.mockResolvedValue({
				quote: 'quote-expired',
				request: 'lnbc...',
				paid: false,
				expiry: 1000000000,
				state: 'EXPIRED'
			});

			const result = await mintFlow(MINT_URL, 10);
			expect(result.success).toBe(false);
			expect(result.error).toContain('EXPIRED');
		});
	});
});
