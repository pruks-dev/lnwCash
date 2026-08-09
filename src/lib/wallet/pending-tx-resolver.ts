/**
 * Pending Transaction Auto-Resolver
 *
 * Scans pending transactions on app startup and attempts to auto-resolve
 * by checking quote status with the mint.
 *
 * Call once on Home/History mount via `resolvePendingTransactions()`.
 */
import { getTransactions, updateTransaction } from '../storage/db';
import { checkMintQuote, checkMeltQuote } from '../cashu/client';
import type { Transaction } from '../types';

/** Transactions older than this (ms) are auto-failed without an API call */
const PENDING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Scan pending transactions and auto-resolve on app startup.
 *
 * Resolution logic:
 *  - >30 min old → auto-fail (no network call)
 *  - Mint type → checkMintQuote; if PAID → confirmed
 *  - Melt type → checkMeltQuote; if PAID → confirmed
 *  - EXPIRED / ISSUED states → skip (stay pending until timeout)
 *  - Network error / mint unreachable → leave as pending
 *
 * @returns Number of transactions resolved (confirmed or timed out)
 */
export async function resolvePendingTransactions(): Promise<number> {
	const txs = await getTransactions({ type: undefined, status: 'pending' });
	let resolved = 0;

	for (const tx of txs) {
		// Timeout: > 30 min → auto-fail (no API call)
		if (Date.now() - tx.timestamp > PENDING_TIMEOUT_MS) {
			await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
			resolved++;
			continue;
		}

		const quoteId = extractQuoteId(tx);
		if (!quoteId) continue;

		try {
			if (tx.type === 'mint') {
				const quote = await checkMintQuote(tx.mint_url, quoteId);
				if (quote.state === 'PAID') {
					await updateTransaction(tx.id, { status: 'confirmed' });
					resolved++;
				}
				// EXPIRED or ISSUED (not PAID) → skip, stays pending until timeout
			} else if (tx.type === 'melt') {
				const quote = await checkMeltQuote(tx.mint_url, quoteId);
				if (quote.state === 'PAID') {
					await updateTransaction(tx.id, { status: 'confirmed' });
					resolved++;
				}
				// PENDING or EXPIRED → skip, stays pending until timeout
			}
			// Other types (transfer, cashu_send, cashu_receive) → skip
		} catch {
			// Network/mint unreachable → leave as pending
		}
	}
	return resolved;
}

/**
 * Extract the quote ID from a transaction ID.
 *
 * Convention: tx.id format is "{type}-{quoteId}"
 * e.g. "mint-abc123xyz" → "abc123xyz"
 *      "melt-def456ghi" → "def456ghi"
 */
function extractQuoteId(tx: Transaction): string | null {
	const parts = tx.id.split('-');
	return parts.length >= 2 ? parts.slice(1).join('-') : null;
}
