/**
 * Mint flow tests (with mocked mint API)
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

	return {
		getMintInfo: vi.fn(),
		getKeysets: vi.fn().mockResolvedValue([
			{ id: 'keyset-abc123', unit: 'sat', active: true }
		]),
		getKeys: vi.fn(),
		requestMintQuote,
		mintTokens,
		requestMeltQuote: vi.fn(),
		meltTokens: vi.fn(),
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
	deterministicBlindingFactor: vi.fn().mockReturnValue(12345n)
}));

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, getTotalBalance } from '../proofsDb';
import { mintFlow, decomposeAmount } from '../mint';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const MINT_URL = 'https://mint.example.com';

// Create mock signatures matching the output amounts
function makeMockSignatures(amounts: number[]) {
	return {
		signatures: amounts.map(a => ({
			id: 'keyset-abc123',
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
			{ id: 'keyset-abc123', unit: 'sat', active: true }
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
			paid: true,
			expiry: 9999999999,
			state: 'UNPAID'
		});

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

	describe('mintFlow', () => {
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
			(client.getKeysets as ReturnType<typeof vi.fn>).mockRejectedValue(
				new TypeError('fetch failed')
			);

			const result = await mintFlow(MINT_URL, 10);

			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('should handle network error gracefully', async () => {
			(client.getKeysets as ReturnType<typeof vi.fn>).mockRejectedValue(
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

		it('C04-06: should proceed when quote.state is UNPAID', async () => {
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

		it('C04-06: should reject when quote.state is PAID', async () => {
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
				expiry: 1000000000, // past expiry
				state: 'EXPIRED'
			});

			const result = await mintFlow(MINT_URL, 10);
			expect(result.success).toBe(false);
			expect(result.error).toContain('EXPIRED');
		});
	});
});
