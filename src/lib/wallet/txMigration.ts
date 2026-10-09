/**
 * TASK-1403 (F-049-002 / OI-v5-4 ทาง (1)) — one-time boot migration sweep.
 *
 * Problem: legacy tx records (v4.4/v4.5 — written by the OLD passthrough with
 * status 'confirmed' and NO proofIds mapping) may sit 'confirmed' in history
 * while their proofs are STILL pending_normalize (never consolidated at the
 * mint). Those records lie about settlement.
 *
 * Fixup (STRICT — record status only, never proof rows, never .svelte):
 *   - scan 'confirmed' cashu_receive txs WITHOUT a proofIds mapping;
 *   - match candidate proofs heuristically: same mint_url + stored_at within
 *     the tx timestamp window (proofs stamped at receive time) + currently
 *     pending_normalize;
 *   - ONLY when the match proves stale-confirmed (≥1 mapped-by-heuristic
 *     proof still pending) → flip tx status back to 'pending' + ATTACH the
 *     proofIds mapping so the normal flush settle path owns it from here;
 *   - tx already truly settled (no pending proof matches) → UNTOUCHED
 *     (ห้ามแตะ record confirmed จริง);
 *   - tx WITH a mapping → UNTOUCHED (owned by the flush settle path, not
 *     the migration).
 *
 * One-time: guarded by localStorage flag
 * `lnwcash_tx_pending_migration_v1` — runs once per device, then never again.
 * Rollback: `rollbackTxPendingMigration()` clears the flag + flips back ONLY
 * txs this sweep touched (tracked in the flag payload) from 'pending' to
 * 'confirmed' — test + operator escape hatch.
 *
 * Caller-proof: the non-test production caller is `runTxPendingMigrationOnce`
 * invoked from `unlockWallet` (state.ts) — boot mount จริง (non-test caller
 * ≥1 per dispatch must_do 6).
 */

import { getTransactions, updateTransaction } from '../storage/db';
import { getAllProofs } from './proofsDb';
import { makeLocalId } from './proofsDb';

export const TX_PENDING_MIGRATION_FLAG = 'lnwcash_tx_pending_migration_v1';

/** Window (ms) around the tx timestamp inside which a pending proof counts as "this tx's". */
export const MIGRATION_MATCH_WINDOW_MS = 10 * 60 * 1000; // 10 min

export interface TxMigrationSweepResult {
	/** txs flipped confirmed → pending (+ mapping attached) */
	fixed: string[];
	/** confirmed txs examined but left untouched (truly settled or mapped) */
	untouched: string[];
	/** whether the sweep actually ran (false = flag already set, skipped) */
	ran: boolean;
}

function readFlag(): { done: boolean; fixed: string[] } {
	try {
		const raw = localStorage.getItem(TX_PENDING_MIGRATION_FLAG);
		if (!raw) return { done: false, fixed: [] };
		const parsed = JSON.parse(raw) as { done?: boolean; fixed?: string[] };
		return { done: parsed.done === true, fixed: parsed.fixed ?? [] };
	} catch {
		return { done: false, fixed: [] };
	}
}

function writeFlag(fixed: string[]): void {
	try {
		localStorage.setItem(TX_PENDING_MIGRATION_FLAG, JSON.stringify({ done: true, fixed }));
	} catch {
		/* best-effort */
	}
}

/**
 * One-time boot sweep. Idempotent: second call is a no-op (returns ran:false).
 */
export async function runTxPendingMigrationOnce(): Promise<TxMigrationSweepResult> {
	const flag = readFlag();
	if (flag.done) {
		return { fixed: [], untouched: [], ran: false };
	}

	const fixed: string[] = [];
	const untouched: string[] = [];

	let txs: Awaited<ReturnType<typeof getTransactions>>;
	try {
		txs = await getTransactions({ status: 'confirmed' });
	} catch {
		writeFlag([]);
		return { fixed, untouched, ran: true };
	}
	let proofs: Awaited<ReturnType<typeof getAllProofs>>;
	try {
		proofs = await getAllProofs();
	} catch {
		writeFlag([]);
		return { fixed, untouched, ran: true };
	}

	const pendingByMint = proofs.filter((p) => p.pending_normalize === true && !p.spent && !p.quarantined);

	for (const tx of txs) {
		if (tx.type !== 'cashu_receive') continue;
		// Mapped txs are owned by the flush settle path — migration never touches.
		if (tx.proofIds && tx.proofIds.length > 0) {
			untouched.push(tx.id);
			continue;
		}
		// Heuristic match: same mint + stored near tx time + still pending.
		const matched = pendingByMint.filter(
			(p) =>
				p.mint_url === tx.mint_url &&
				Math.abs(p.stored_at - tx.timestamp) <= MIGRATION_MATCH_WINDOW_MS
		);
		if (matched.length === 0) {
			// No pending proof matches — genuinely confirmed (online receive
			// เดิม) → ห้ามแตะ.
			untouched.push(tx.id);
			continue;
		}
		// Stale-confirmed: proofs still pending → fixup to pending + attach mapping.
		const proofIds = matched.map((p) => p.local_id ?? makeLocalId(p));
		try {
			await updateTransaction(tx.id, { status: 'pending', proofIds });
			fixed.push(tx.id);
		} catch {
			// DB write failed — leave untouched, still record as examined.
			untouched.push(tx.id);
		}
	}

	writeFlag(fixed);
	return { fixed, untouched, ran: true };
}

/**
 * Rollback: clears the one-time flag and flips back ONLY the txs this sweep
 * touched (flag payload) from 'pending' → 'confirmed' (mapping kept — the
 * flush settle path can still use it). Txs the sweep never fixed are never
 * touched. Returns the rolled-back tx ids.
 */
export async function rollbackTxPendingMigration(): Promise<string[]> {
	const flag = readFlag();
	const rolled: string[] = [];
	for (const txId of flag.fixed) {
		try {
			const txs = await getTransactions();
			const tx = txs.find((t) => t.id === txId);
			if (tx && tx.status === 'pending') {
				await updateTransaction(txId, { status: 'confirmed' });
				rolled.push(txId);
			}
		} catch {
			/* best-effort per tx */
		}
	}
	try {
		localStorage.removeItem(TX_PENDING_MIGRATION_FLAG);
	} catch {
		/* best-effort */
	}
	return rolled;
}
