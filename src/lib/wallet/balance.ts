/**
 * Multi-mint balance service.
 * Aggregates proofs across mints and keysets, providing both total
 * and per-mint balance breakdowns.
 *
 * Reads from IndexedDB (proofsDb) — works offline too.
 */
import {
	getUnspentProofs,
	getUnspentProofsIncludingPending,
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
 * TASK-1315: includes pending-normalize proofs — pending is the user's money
 * (the badge must never quietly shrink while a pending pile waits for the T3
 * consolidate; selection/spending uses the separate getUnspentProofs pool).
 */
export async function getBalance(): Promise<Balance> {
	const proofs = await getUnspentProofsIncludingPending();

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
 *
 * @param mintUrl - The mint URL to query
 */
export async function getBalanceByMint(mintUrl: string): Promise<number> {
	const breakdown = await getBreakdownByMint();
	return breakdown[mintUrl] ?? 0;
}

/**
 * Get detailed breakdown per mint.
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
