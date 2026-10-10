/**
 * Multi-mint balance service.
 * Aggregates proofs across mints and keysets, providing both total
 * and per-mint balance breakdowns.
 *
 * Reads from IndexedDB (proofsDb) — works offline too.
 */
import {
	getUnspentProofs,
	getUnspentProofsByMint,
	getBalanceByMint as getBreakdownByMint
} from './proofsDb';

// ─── Types ───────────────────────────────────────────────────

export interface Balance {
	total: number;
	byMint: Record<string, number>;
	proofCount: number;
	lastUpdated: number;
}

export interface MintBalance {
	mintUrl: string;
	amount: number;
	proofCount: number;
}

// ─── Balance Queries ─────────────────────────────────────────

/**
 * Get total balance across ALL mints.
 * Reads from IndexedDB — no network needed.
 * INTENT-015 (TASK-1510): SPENDABLE ONLY — 'pending และ failed proof ไม่ควร
 * เอามานับเป็น balance ด้วย'. Sources getUnspentProofs (the gated spendable
 * pool); the badge shows only coins that can actually fund a spend.
 */
export async function getBalance(): Promise<Balance> {
	const proofs = await getUnspentProofs();

	const byMint: Record<string, number> = {};
	for (const p of proofs) {
		byMint[p.mint_url] = (byMint[p.mint_url] ?? 0) + p.amount;
	}

	const total = Object.values(byMint).reduce((sum, amt) => sum + amt, 0);

	return {
		total,
		byMint,
		proofCount: proofs.length,
		lastUpdated: Date.now()
	};
}

/**
 * Get balance for a specific mint only.
 * INTENT-015 (TASK-1510): SPENDABLE ONLY for this mint.
 *
 * @param mintUrl - The mint URL to query
 */
export async function getBalanceByMint(mintUrl: string): Promise<number> {
	const proofs = await getUnspentProofsByMint(mintUrl);
	return proofs.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Get detailed breakdown per mint.
 * INTENT-015 (TASK-1510): SPENDABLE ONLY — via proofsDb getBalanceByMint
 * (now sourced from getUnspentProofs).
 */
export async function getMintBalances(): Promise<MintBalance[]> {
	const breakdown = await getBreakdownByMint();

	return Object.entries(breakdown)
		.map(([mintUrl, amount]) => ({
			mintUrl,
			amount,
			proofCount: 0 // approximate — exact count requires separate query
		}))
		.sort((a, b) => b.amount - a.amount); // Sort by balance descending
}

/**
 * Check if the wallet has sufficient funds for a given amount.
 * TASK-1315: SPENDABLE check — pending-normalize proofs are the user's money
 * but cannot fund a spend yet (P3), so this uses the gated pool.
 */
export async function hasSufficientFunds(amount: number): Promise<boolean> {
	const proofs = await getUnspentProofs();
	const total = proofs.reduce((sum, p) => sum + p.amount, 0);
	return total >= amount;
}

/**
 * Check if a specific mint has sufficient funds.
 */
export async function mintHasFunds(mintUrl: string, amount: number): Promise<boolean> {
	const mintBalance = await getBalanceByMint(mintUrl);
	return mintBalance >= amount;
}
