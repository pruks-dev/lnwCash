/**
 * Proof selection and management utilities.
 * Operates on StoredProof objects (from IndexedDB proofsDb).
 */
import type { StoredProof } from './proofsDb';
import { ProofSelectionError } from './errors';

// ─── Selection Strategies ────────────────────────────────────

/**
 * Select proofs to cover `amount`.
 *
 * Strategy (prefer fewest proofs):
 * 1. Try exact single proof match
 * 2. Try greedy largest-first (fewest proofs heuristic)
 * 3. Fallback: any combination that covers amount
 *
 * @returns Array of selected proofs (unspent, marked for use)
 * @throws ProofSelectionError if insufficient funds
 */
export function selectProofs(proofs: StoredProof[], amount: number): StoredProof[] {
	if (amount <= 0) {
		throw new ProofSelectionError(amount);
	}

	const unspent = proofs.filter(p => !p.spent);

	// Check total balance
	const totalAvailable = unspent.reduce((sum, p) => sum + p.amount, 0);
	if (totalAvailable < amount) {
		throw new ProofSelectionError(amount);
	}

	// Try exact match: a single proof equal to amount
	const exactMatch = unspent.find(p => p.amount === amount);
	if (exactMatch) {
		return [exactMatch];
	}

	// Try greedy: sort descending, pick largest until amount covered
	const sorted = [...unspent].sort((a, b) => b.amount - a.amount);

	let selected: StoredProof[] = [];
	let accumulated = 0;

	for (const proof of sorted) {
		selected.push(proof);
		accumulated += proof.amount;
		if (accumulated >= amount) break;
	}

	if (accumulated >= amount) {
		// Try to reduce by removing largest last-proof if still sufficient
		if (selected.length > 1) {
			const last = selected[selected.length - 1];
			if (accumulated - last.amount >= amount) {
				selected.pop();
			}
		}
		return selected;
	}

	// Fallback: return everything (should not reach here given total check)
	return selected;
}

/**
 * Filter proofs by mint URL.
 */
export function getProofsByMint(proofs: StoredProof[], mintUrl: string): StoredProof[] {
	return proofs.filter(p => p.mint_url === mintUrl);
}

/**
 * Compute total amount of a list of proofs.
 */
export function sumProofs(proofs: StoredProof[]): number {
	return proofs.reduce((total, p) => total + p.amount, 0);
}

/**
 * Group proofs by keyset ID.
 */
export function groupByKeyset(proofs: StoredProof[]): Map<string, StoredProof[]> {
	const groups = new Map<string, StoredProof[]>();
	for (const p of proofs) {
		const list = groups.get(p.keyset_id) ?? [];
		list.push(p);
		groups.set(p.keyset_id, list);
	}
	return groups;
}

/**
 * Group proofs by mint URL.
 */
export function groupByMint(proofs: StoredProof[]): Map<string, StoredProof[]> {
	const groups = new Map<string, StoredProof[]>();
	for (const p of proofs) {
		const list = groups.get(p.mint_url) ?? [];
		list.push(p);
		groups.set(p.mint_url, list);
	}
	return groups;
}
