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
import { decodeBolt11 } from './bolt11';
import type { Transaction } from '../types';

/**
 * Historic fixed 30-minute wall-clock timeout.
 *
 * TASK-4406 (INTENT-044): LEGACY FALLBACK ONLY — applied solely when a
 * pending tx carries no invoice or its invoice fails decodeBolt11
 * (legacy records). The primary fail criterion is the per-invoice LNBC
 * expiry (see getLnbcExpiryMs). Do NOT use this as the general rule.
 */
const PENDING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (legacy-fallback only)

/**
 * TASK-4406 (INTENT-044): resolve the per-transaction expiry (ms epoch)
 * from its LNBC invoice: expiryMs = (timestamp + expiry) * 1000.
 *
 * Pure offline decode via decodeBolt11 — no network call.
 *
 * @returns expiryMs, or null when the tx has no invoice or decode fails
 *          (caller must apply the legacy 30-minute fallback instead).
 */
function getLnbcExpiryMs(tx: Transaction): number | null {
	const invoice = tx.invoice;
	if (!invoice) return null;
	const decoded = decodeBolt11(invoice);
	if ('code' in decoded) return null;
	return (decoded.timestamp + decoded.expiry) * 1000;
}

/**
 * Scan pending transactions and auto-resolve on app startup.
 *
 * Resolution logic (TASK-4406 / INTENT-044, amended by TASK-4407 check-once):
 *  - Per-invoice LNBC expiry is the fail criterion: decodeBolt11(tx.invoice)
 *    → expiryMs = (timestamp + expiry) * 1000.
 *  - TASK-4407 (INTENT-044 rev8): now > expiryMs does NOT auto-fail
 *    immediately — one final mint check runs first (same checkMintQuote /
 *    checkMeltQuote path as fresh invoices). Only when that check proves
 *    unpaid (EXPIRED / ISSUED / still pending states) does the tx auto-fail.
 *    A PAID result on an expired invoice leaves mint pending for the central
 *    collector (edge: app closed + paid before expiry + reopened after
 *    expiry → PAID is found, never wrongly killed). Network error on the
 *    final check also leaves the tx pending (never kill on uncertainty).
 *  - No invoice / undecodable invoice (legacy) → historic 30-min wall-clock
 *    fallback + legacy-fallback log line (unchanged: legacy expiry still
 *    fails without a network call).
 *  - Mint type → checkMintQuote; if PAID → leave pending for the central
 *    mint collector (never confirm here).
 *  - Melt type → checkMeltQuote; if PAID → confirmed
 *  - Fresh invoice + EXPIRED / ISSUED states → skip (stay pending until
 *    invoice expiry, then the check-once above decides)
 *  - Network error / mint unreachable → leave as pending
 *
 * @returns Number of transactions resolved (confirmed or timed out)
 */
export async function resolvePendingTransactions(): Promise<number> {
	const txs = await getTransactions({ type: undefined, status: 'pending' });
	let resolved = 0;

	for (const tx of txs) {
		// TASK-4406: per-invoice LNBC expiry is the fail criterion (offline
		// decode, no API call). Fresh invoices must NOT fail here.
		const expiryMs = getLnbcExpiryMs(tx);
		let expired: boolean;
		if (expiryMs !== null) {
			expired = Date.now() > expiryMs;
		} else {
			// Legacy fallback: no invoice / decode failed → historic 30-min rule
			// (unchanged by TASK-4407: legacy expiry still fails with no check).
			console.warn(
				`[pending-tx-resolver] legacy-fallback: tx ${tx.id} has no decodable invoice — applying 30-min wall-clock timeout`
			);
			if (Date.now() - tx.timestamp > PENDING_TIMEOUT_MS) {
				await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
				resolved++;
				continue;
			}
			expired = false;
		}

		// TASK-4407 check-once: an expired invoice is NOT failed here.
		// Fall through to the shared mint check below (one final check);
		// only a proven-unpaid result fails (see expired branches).
		const quoteId = extractQuoteId(tx);
		if (!quoteId) {
			if (expired) {
				// Nothing to verify against — invoice dead, no quote to check.
				await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
				resolved++;
			}
			continue;
		}

		try {
			if (tx.type === 'mint') {
				const quote = await checkMintQuote(tx.mint_url, quoteId);
				if (quote.state === 'PAID') {
					// TASK-4301 (INTENT-043): do NOT confirm here — the central 5s
					// poll in App.svelte owns PAID mint quotes and mints them for
					// real via completeMint (proofs+balance, not a label).
					// Leave pending so the collector claims it (เก็บตกต้องได้เงินจริง).
					// TASK-4407: applies to EXPIRED invoices too — paid before
					// expiry + reopened after expiry must still be collected.
					continue;
				}
				// Fresh + EXPIRED/ISSUED (not PAID) → skip, stays pending until
				// invoice expiry. Expired + not PAID → proven unpaid → fail.
				if (expired) {
					await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
					resolved++;
				}
			} else if (tx.type === 'melt') {
				const quote = await checkMeltQuote(tx.mint_url, quoteId);
				if (quote.state === 'PAID') {
					await updateTransaction(tx.id, { status: 'confirmed' });
					resolved++;
				} else if (expired) {
					// Expired invoice + melt not PAID → proven unpaid → fail.
					await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
					resolved++;
				}
				// Fresh + PENDING/EXPIRED → skip, stays pending until invoice expiry
			} else if (expired) {
				// Other types (transfer, cashu_send, cashu_receive) have no mint
				// quote to verify — expired invoice → fail (TASK-4406 semantics).
				await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
				resolved++;
			}
			// Other types (transfer, cashu_send, cashu_receive) → skip
		} catch {
			// Network/mint unreachable → leave as pending (TASK-4407: also on
			// the final expired check — never kill on uncertainty)
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
