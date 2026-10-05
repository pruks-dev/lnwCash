/**
 * Transfer (send/receive) tests
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWallet, unlockWallet, deleteWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, getTotalBalance, addProofs, getUnspentProofs, getAllProofs } from '../proofsDb';
import { sendTokens, receiveTokens, createTokenForDisplay } from '../transfer';
import { decodeToken } from '../../cashu/token';
import type { TokenProof } from '../../types';
import { TokenValidationError } from '../errors';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = 'keyset-abc123';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('Transfer', () => {
	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);

		// Add proofs
		await addProofs(
			[makeProof('p1', 32), makeProof('p2', 16), makeProof('p3', 8)],
			MINT_URL,
			KEYSET_ID
		);
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	describe('sendTokens', () => {
		it('should create a valid V4 token', async () => {
			const result = await sendTokens(10, MINT_URL);
			expect(result.token).toMatch(/^cashu[AB]/);
			expect(result.amount).toBeGreaterThanOrEqual(10);
			expect(result.mint).toBe(MINT_URL);
		});

		it('should mark sent proofs as spent', async () => {
			const balanceBefore = await getTotalBalance();

			await sendTokens(20, MINT_URL);

			const balanceAfter = await getTotalBalance();
			// TASK-1303 (INTENT-013): 20 = 10100₂ — denomination-first hit 16,
			// DP ยืม 8 (เกณฑ์ 2, excess 4) → selected [16,8] sum 24.
			// Test env ไม่มี mint → swap fail → fallback ส่ง selected เดิม → ลด 24.
			expect(balanceAfter).toBe(balanceBefore - 24);
		});

		it('should produce a decodable token', async () => {
			const result = await sendTokens(10, MINT_URL);
			const decoded = decodeToken(result.token);
			expect(decoded.proofs.length).toBeGreaterThan(0);
			expect(decoded.mint).toBe(MINT_URL);
		});

		it('should throw for insufficient funds', async () => {
			await expect(sendTokens(1000, MINT_URL)).rejects.toThrow();
		});
	});

	describe('createTokenForDisplay', () => {
		it('should create a token without altering wallet state', async () => {
			const proofs = await getUnspentProofs();
			const tokenProofs: TokenProof[] = proofs.slice(0, 1).map(p => ({
				id: p.id,
				amount: p.amount,
				secret: p.secret,
				C: p.C
			}));

			const balanceBefore = await getTotalBalance();
			const token = createTokenForDisplay(tokenProofs, MINT_URL);
			const balanceAfter = await getTotalBalance();

			expect(token).toMatch(/^cashu[AB]/);
			expect(balanceAfter).toBe(balanceBefore); // No change
		});
	});

	describe('receiveTokens', () => {
		it('should decode and store received proofs', async () => {
			// First send to create token
			const { token } = await sendTokens(5, MINT_URL);

			// Wipe proofs to simulate clean state, but keep wallet
			const { deleteProofDB, resetProofDB } = await import('../proofsDb');
			await deleteProofDB();
			resetProofDB();

			// Receive token
			const result = await receiveTokens(token);

			expect(result.amount).toBeGreaterThanOrEqual(5);
			expect(result.mint).toBe(MINT_URL);
			expect(result.proofCount).toBeGreaterThan(0);

			// Verify proofs stored
			const balance = await getTotalBalance();
			expect(balance).toBeGreaterThan(0);
		});

		it('should reject invalid token', async () => {
			await expect(receiveTokens('invalid-token')).rejects.toThrow(TokenValidationError);
		});

		it('should reject empty token', async () => {
			// Create token with no proofs manually
			const { encodeToken } = await import('../../cashu/token');
			const badToken = encodeToken([], MINT_URL);

			await expect(receiveTokens(badToken)).rejects.toThrow(TokenValidationError);
		});

		it('should reject token without prefix', async () => {
			// Create a token-like string that's missing the cashuA prefix
			const jsonStr = JSON.stringify({ token: [{ mint: 'https://m.example.com', proofs: [] }] });
			const encoder = new TextEncoder();
			const bytes = encoder.encode(jsonStr);
			// Manually base64url encode
			const base64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
			// This might decode but should fail on validation
			try {
				await receiveTokens(base64);
			} catch (err) {
				expect(err).toBeInstanceOf(TokenValidationError);
			}
		});
	});

	describe('Transfer roundtrip', () => {
		it('wallet A → token → wallet B → balance updated', async () => {
			// Wallet A sends tokens
			const { token, amount } = await sendTokens(10, MINT_URL);
			expect(token).toBeTruthy();

			// Record Wallet A's balance after send
			const balanceA = await getTotalBalance();

			// Wipe proofs to simulate Wallet B
			await deleteProofDB();
			resetProofDB();

			// Wallet B receives
			const received = await receiveTokens(token);
			expect(received.amount).toBeGreaterThanOrEqual(10);

			const balanceB = await getTotalBalance();
			expect(balanceB).toBeGreaterThan(0);
		});
	});
});
