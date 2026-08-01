/**
 * Balance service tests
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBalance, getBalanceByMint, getMintBalances, hasSufficientFunds, mintHasFunds } from '../balance';
import { addProofs, deleteProofDB, resetProofDB, markSpent, getAllProofs, clearProofs } from '../proofsDb';
import type { TokenProof } from '../../types';

function makeProof(id: string, amount: number): TokenProof {
	return { id, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

const MINT_A = 'https://mint-a.example.com';
const MINT_B = 'https://mint-b.example.com';
const KEYSET = 'keyset-001';

describe('Balance service', () => {
	beforeEach(async () => {
		await deleteProofDB();
		resetProofDB();
	});

	afterEach(async () => {
		await deleteProofDB();
		resetProofDB();
	});

	describe('getBalance', () => {
		it('should return zero when no proofs', async () => {
			const balance = await getBalance();
			expect(balance.total).toBe(0);
			expect(balance.proofCount).toBe(0);
		});

		it('should aggregate across multiple proofs', async () => {
			await addProofs([makeProof('a', 10), makeProof('b', 20)], MINT_A, KEYSET);
			const balance = await getBalance();
			expect(balance.total).toBe(30);
			expect(balance.proofCount).toBe(2);
		});

		it('should aggregate across multiple mints', async () => {
			await addProofs([makeProof('a', 10)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 5)], MINT_B, KEYSET);

			const balance = await getBalance();
			expect(balance.total).toBe(15);
			expect(balance.byMint[MINT_A]).toBe(10);
			expect(balance.byMint[MINT_B]).toBe(5);
		});

		it('should exclude spent proofs', async () => {
			await addProofs([makeProof('a', 100)], MINT_A, KEYSET);
			const all = await getAllProofs();
			await markSpent([all[0].local_id]);

			const balance = await getBalance();
			expect(balance.total).toBe(0);
		});
	});

	describe('getBalanceByMint', () => {
		it('should return per-mint total', async () => {
			await addProofs([makeProof('a', 30)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 7)], MINT_B, KEYSET);

			const balanceA = await getBalanceByMint(MINT_A);
			expect(balanceA).toBe(30);

			const balanceB = await getBalanceByMint(MINT_B);
			expect(balanceB).toBe(7);
		});

		it('should return 0 for unknown mint', async () => {
			const balance = await getBalanceByMint('https://unknown.example.com');
			expect(balance).toBe(0);
		});
	});

	describe('getMintBalances', () => {
		it('should return sorted list by amount desc', async () => {
			await addProofs([makeProof('a', 10)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 50)], MINT_B, KEYSET);

			const balances = await getMintBalances();
			expect(balances.length).toBe(2);
			expect(balances[0].amount).toBe(50); // MINT_B first (higher)
			expect(balances[1].amount).toBe(10);
		});
	});

	describe('hasSufficientFunds', () => {
		it('should return true when enough funds', async () => {
			await addProofs([makeProof('a', 100)], MINT_A, KEYSET);
			expect(await hasSufficientFunds(50)).toBe(true);
			expect(await hasSufficientFunds(100)).toBe(true);
		});

		it('should return false when insufficient', async () => {
			await addProofs([makeProof('a', 10)], MINT_A, KEYSET);
			expect(await hasSufficientFunds(20)).toBe(false);
		});
	});

	describe('mintHasFunds', () => {
		it('should check per-mint balance', async () => {
			await addProofs([makeProof('a', 100)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 5)], MINT_B, KEYSET);

			expect(await mintHasFunds(MINT_A, 50)).toBe(true);
			expect(await mintHasFunds(MINT_B, 50)).toBe(false);
		});
	});
});
