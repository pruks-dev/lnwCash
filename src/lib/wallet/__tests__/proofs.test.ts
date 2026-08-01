/**
 * Proof selection tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { selectProofs, sumProofs, groupByKeyset, groupByMint } from '../proofs';
import type { StoredProof } from '../proofsDb';
import { ProofSelectionError } from '../errors';

function makeProof(
	localId: string,
	amount: number,
	mint: string = 'https://mint.example.com',
	keysetId: string = 'keyset-1',
	spent: boolean = false
): StoredProof {
	return {
		local_id: localId,
		id: keysetId,
		amount,
		secret: `secret-${localId}`,
		C: `sig-${localId}`,
		mint_url: mint,
		keyset_id: keysetId,
		stored_at: Date.now(),
		spent
	};
}

describe('Proof selection', () => {
	let proofs: StoredProof[];

	beforeEach(() => {
		proofs = [
			makeProof('p1', 1),
			makeProof('p2', 2),
			makeProof('p3', 4),
			makeProof('p4', 8),
			makeProof('p5', 16),
			makeProof('p6', 32),
			makeProof('p7', 64),
		];
	});

	describe('selectProofs', () => {
		it('should select exact match when available', () => {
			const result = selectProofs(proofs, 16);
			expect(result.length).toBe(1);
			expect(result[0].amount).toBe(16);
		});

		it('should select fewest proofs using greedy approach', () => {
			const result = selectProofs(proofs, 70);
			// Greedy picks 64 + 8 = 72 (2 proofs) — that's fewer than 64 + 4 + 2
			expect(result.length).toBe(2);
			expect(sumProofs(result)).toBeGreaterThanOrEqual(70);
		});

		it('should select all if necessary', () => {
			const result = selectProofs(proofs, 127);
			expect(sumProofs(result)).toBeGreaterThanOrEqual(127);
		});

		it('should throw for zero amount', () => {
			expect(() => selectProofs(proofs, 0)).toThrow(ProofSelectionError);
		});

		it('should throw for insufficient funds', () => {
			expect(() => selectProofs(proofs, 200)).toThrow(ProofSelectionError);
		});

		it('should skip spent proofs', () => {
			const allSpent = proofs.map(p => ({ ...p, spent: true }));
			expect(() => selectProofs(allSpent, 10)).toThrow(ProofSelectionError);
		});

		it('should select only from unspent proofs', () => {
			// Mark 64-sat proof as spent
			proofs[6].spent = true;
			const result = selectProofs(proofs, 60);
			const total = sumProofs(result);
			expect(total).toBeGreaterThanOrEqual(60);
			// 64 was spent, should use 32 + 16 + 8 + 4 = 60
		});
	});

	describe('sumProofs', () => {
		it('should sum proof amounts', () => {
			expect(sumProofs(proofs)).toBe(127);
		});

		it('should return 0 for empty array', () => {
			expect(sumProofs([])).toBe(0);
		});
	});

	describe('groupByKeyset', () => {
		it('should group proofs by keyset', () => {
			const p1 = makeProof('a1', 1, 'https://mint.example.com', 'ks-a');
			const p2 = makeProof('a2', 2, 'https://mint.example.com', 'ks-a');
			const p3 = makeProof('b1', 4, 'https://mint.example.com', 'ks-b');

			const groups = groupByKeyset([p1, p2, p3]);
			expect(groups.get('ks-a')?.length).toBe(2);
			expect(groups.get('ks-b')?.length).toBe(1);
		});
	});

	describe('groupByMint', () => {
		it('should group proofs by mint', () => {
			const p1 = makeProof('a1', 1, 'https://mint-a.example.com', 'ks-1');
			const p2 = makeProof('a2', 2, 'https://mint-a.example.com', 'ks-1');
			const p3 = makeProof('b1', 4, 'https://mint-b.example.com', 'ks-2');

			const groups = groupByMint([p1, p2, p3]);
			expect(groups.get('https://mint-a.example.com')?.length).toBe(2);
			expect(groups.get('https://mint-b.example.com')?.length).toBe(1);
		});
	});
});
