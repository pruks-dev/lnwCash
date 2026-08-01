/**
 * Offline operations tests
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TokenProof } from '../../types';
import {
	getOfflineBalance,
	getOfflineHistory,
	sendEcashP2P,
	semiVerifyRedeem,
	isOnline
} from '../offline';
import { addProofs, deleteProofDB, resetProofDB, markSpent, getAllProofs, clearProofs, getUnspentProofsByMint } from '../proofsDb';
import { createWallet, unlockWallet, deleteWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { addTransaction, clearTransactions } from '../../storage/db';
import { encodeToken, decodeToken } from '../../cashu/token';

const TEST_PIN = '123456';
const TEST_NAME = 'Offline Test';
const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = 'keyset-abc123';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('Offline operations', () => {
	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	describe('getOfflineBalance', () => {
		it('should return balance without network', async () => {
			await addProofs(
				[makeProof('a', 10), makeProof('b', 20)],
				MINT_URL,
				KEYSET_ID
			);

			const balance = await getOfflineBalance();
			expect(balance.total).toBe(30);
			expect(balance.byMint[MINT_URL]).toBe(30);
		});

		it('should return per-mint breakdown', async () => {
			await addProofs([makeProof('a', 10)], MINT_URL, KEYSET_ID);
			await addProofs([makeProof('b', 5)], 'https://mint-b.example.com', KEYSET_ID);

			const balance = await getOfflineBalance();
			expect(balance.byMint[MINT_URL]).toBe(10);
			expect(balance.byMint['https://mint-b.example.com']).toBe(5);
		});

		it('should return zero when no proofs', async () => {
			const balance = await getOfflineBalance();
			expect(balance.total).toBe(0);
		});
	});

	describe('getOfflineHistory', () => {
		it('should return transactions from IndexedDB', async () => {
			const txId = await addTransaction({
				id: 'tx-001',
				type: 'mint',
				amount: 100,
				mint_url: MINT_URL,
				timestamp: Date.now(),
				token_hash: null,
				status: 'confirmed'
			});

			const history = await getOfflineHistory();
			expect(history.length).toBe(1);
			expect(history[0].id).toBe('tx-001');
		});

		it('should respect limit', async () => {
			for (let i = 0; i < 5; i++) {
				await addTransaction({
					id: `tx-${i}`,
					type: 'mint',
					amount: i * 10,
					mint_url: MINT_URL,
					timestamp: Date.now() - i * 1000,
					token_hash: null,
					status: 'confirmed'
				});
			}

			const history = await getOfflineHistory(3);
			expect(history.length).toBe(3);
		});

		it('should return empty when no transactions', async () => {
			await clearTransactions();
			const history = await getOfflineHistory();
			expect(history.length).toBe(0);
		});
	});

	describe('sendEcashP2P', () => {
		it('should create token locally without network', async () => {
			await addProofs([makeProof('a', 32)], MINT_URL, KEYSET_ID);

			const token = await sendEcashP2P(10, MINT_URL);
			expect(token).toMatch(/^cashuA/);

			const decoded = decodeToken(token);
			expect(decoded.mint).toBe(MINT_URL);
			expect(decoded.proofs.length).toBeGreaterThan(0);
		});

		it('should throw for insufficient funds', async () => {
			await addProofs([makeProof('a', 5)], MINT_URL, KEYSET_ID);
			await expect(sendEcashP2P(100, MINT_URL)).rejects.toThrow();
		});
	});

	describe('semiVerifyRedeem', () => {
		it('should verify a valid token as plausibly valid', () => {
			const token = encodeToken(
				[makeProof('p1', 10)],
				MINT_URL,
				'sat'
			);

			const result = semiVerifyRedeem(token);
			expect(result.plausiblyValid).toBe(true);
			expect(result.amount).toBe(10);
			expect(result.mint).toBe(MINT_URL);
			expect(result.unit).toBe('sat');
		});

		it('should detect missing cashuA prefix', () => {
			const result = semiVerifyRedeem('not-a-token');
			expect(result.plausiblyValid).toBe(false);
			expect(result.issues).toContain('Missing cashuA prefix');
		});

		it('should detect invalid base64', () => {
			const result = semiVerifyRedeem('cashuA!!!!not-base64!!!!');
			expect(result.plausiblyValid).toBe(false);
			expect(result.issues.length).toBeGreaterThan(0);
		});

		it('should detect missing proofs', () => {
			// Create token with empty proofs
			const badToken = encodeToken([], MINT_URL);
			const result = semiVerifyRedeem(badToken);
			expect(result.plausiblyValid).toBe(false);
			expect(result.issues).toContain('No proofs in token');
		});

		it('should detect invalid proof fields', () => {
			const badProof: TokenProof = {
				id: '',
				amount: -1,
				secret: '',
				C: ''
			};
			const badToken = encodeToken([badProof], MINT_URL);
			const result = semiVerifyRedeem(badToken);
			expect(result.plausiblyValid).toBe(false);
		});

		it('should validate multi-proof token', () => {
			const token = encodeToken(
				[makeProof('p1', 10), makeProof('p2', 20)],
				MINT_URL
			);
			const result = semiVerifyRedeem(token);
			expect(result.plausiblyValid).toBe(true);
			expect(result.amount).toBe(30);
			expect(result.proofCount).toBe(2);
		});
	});

	describe('isOnline', () => {
		it('should return boolean', () => {
			const online = isOnline();
			expect(typeof online).toBe('boolean');
		});
	});
});
