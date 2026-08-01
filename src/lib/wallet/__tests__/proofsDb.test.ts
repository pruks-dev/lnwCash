/**
 * Proofs IndexedDB storage tests
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	addProofs,
	getAllProofs,
	getUnspentProofs,
	getProofsByMint,
	getUnspentProofsByMint,
	removeProofs,
	markSpent,
	deleteProofDB,
	resetProofDB,
	getTotalBalance,
	getBalanceByMint,
	getProofCount,
	clearProofs
} from '../proofsDb';
import type { TokenProof } from '../../types';

function makeProof(id: string, amount: number, secret?: string): TokenProof {
	return {
		id,
		amount,
		secret: secret ?? `secret-${id}`,
		C: `sig-${id}`
	};
}

const MINT_A = 'https://mint-a.example.com';
const MINT_B = 'https://mint-b.example.com';
const KEYSET = 'keyset-001';

describe('Proofs DB', () => {
	beforeEach(async () => {
		await deleteProofDB();
		resetProofDB();
	});

	afterEach(async () => {
		await deleteProofDB();
		resetProofDB();
	});

	describe('addProofs', () => {
		it('should add proofs to IndexedDB', async () => {
			const proofs = [makeProof('id-1', 10), makeProof('id-2', 20)];
			await addProofs(proofs, MINT_A, KEYSET);

			const all = await getAllProofs();
			expect(all.length).toBe(2);
		});

		it('should store mint_url and keyset_id', async () => {
			const proofs = [makeProof('id-3', 50)];
			await addProofs(proofs, MINT_A, KEYSET);

			const all = await getAllProofs();
			expect(all[0].mint_url).toBe(MINT_A);
			expect(all[0].keyset_id).toBe(KEYSET);
		});

		it('should store proofs as unspent by default', async () => {
			const proofs = [makeProof('id-4', 5)];
			await addProofs(proofs, MINT_A, KEYSET);

			const all = await getAllProofs();
			expect(all[0].spent).toBe(false);
		});
	});

	describe('getAllProofs', () => {
		it('should return empty array when no proofs', async () => {
			const all = await getAllProofs();
			expect(all).toEqual([]);
		});

		it('should return all proofs including spent', async () => {
			await addProofs([makeProof('a', 1)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 2)], MINT_B, KEYSET);

			const all = await getAllProofs();
			expect(all.length).toBe(2);
		});
	});

	describe('getUnspentProofs', () => {
		it('should only return unspent proofs', async () => {
			await addProofs([makeProof('a', 1)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 2)], MINT_A, KEYSET);

			// Mark first as spent
			const all = await getAllProofs();
			await markSpent([all[0].local_id]);

			const unspent = await getUnspentProofs();
			expect(unspent.length).toBe(1);
			expect(unspent[0].amount).toBe(2);
		});
	});

	describe('getProofsByMint', () => {
		it('should filter proofs by mint url', async () => {
			await addProofs([makeProof('a', 1)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 2)], MINT_B, KEYSET);

			const result = await getProofsByMint(MINT_A);
			expect(result.length).toBe(1);
			expect(result[0].mint_url).toBe(MINT_A);
		});
	});

	describe('removeProofs', () => {
		it('should delete proofs by local_id', async () => {
			await addProofs([makeProof('a', 1)], MINT_A, KEYSET);
			const all = await getAllProofs();
			await removeProofs([all[0].local_id]);

			const after = await getAllProofs();
			expect(after.length).toBe(0);
		});
	});

	describe('markSpent', () => {
		it('should mark proofs as spent', async () => {
			await addProofs([makeProof('a', 1)], MINT_A, KEYSET);
			const all = await getAllProofs();
			await markSpent([all[0].local_id]);

			const after = await getAllProofs();
			expect(after[0].spent).toBe(true);
		});
	});

	describe('getTotalBalance', () => {
		it('should sum unspent proof amounts', async () => {
			await addProofs([makeProof('a', 10)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 20)], MINT_A, KEYSET);
			await addProofs([makeProof('c', 5)], MINT_B, KEYSET);

			const total = await getTotalBalance();
			expect(total).toBe(35);
		});

		it('should exclude spent proofs from balance', async () => {
			await addProofs([makeProof('a', 100)], MINT_A, KEYSET);
			const all = await getAllProofs();
			await markSpent([all[0].local_id]);

			const total = await getTotalBalance();
			expect(total).toBe(0);
		});

		it('should return 0 when no proofs', async () => {
			const total = await getTotalBalance();
			expect(total).toBe(0);
		});
	});

	describe('getBalanceByMint', () => {
		it('should return per-mint breakdown', async () => {
			await addProofs([makeProof('a', 10)], MINT_A, KEYSET);
			await addProofs([makeProof('b', 20)], MINT_A, KEYSET);
			await addProofs([makeProof('c', 5)], MINT_B, KEYSET);

			const breakdown = await getBalanceByMint();
			expect(breakdown[MINT_A]).toBe(30);
			expect(breakdown[MINT_B]).toBe(5);
		});
	});

	describe('clearProofs', () => {
		it('should delete all proofs', async () => {
			await addProofs([makeProof('a', 1)], MINT_A, KEYSET);
			await clearProofs();
			const count = await getProofCount();
			expect(count).toBe(0);
		});
	});

	describe('getProofCount', () => {
		it('should return correct count', async () => {
			expect(await getProofCount()).toBe(0);
			await addProofs([makeProof('a', 1), makeProof('b', 2)], MINT_A, KEYSET);
			expect(await getProofCount()).toBe(2);
		});
	});
});
