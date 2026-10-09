/**
 * TASK-084: Token Store — higher-level proof/token management layer.
 *
 * Wraps proofsDb.ts with additional operations:
 * - Mint-specific proof queries
 * - Balance aggregation by keyset
 * - Proof validation (checking if proofs are still valid with mint)
 * - Token import/export with V4 encoding
 *
 * This is the canonical token management API for the wallet.
 */
import {
	addProofs,
	getAllProofs,
	getUnspentProofs,
	getUnspentProofsIncludingPending,
	getProofsByMint,
	getUnspentProofsByMint,
	removeProofs,
	markSpent,
	getTotalBalance,
	getBalanceByMint,
	getProofCount,
	clearProofs,
	clearPendingNormalize,
	markPendingNormalizeByProof,
	makeLocalId,
	type StoredProof
} from './proofsDb';
import { addTransaction, getTransactionById, updateTransaction } from '../storage/db';
import { selectProofs, sumProofs } from './proofs';
import { encodeToken, decodeToken, getTokenAmount } from '../cashu/token';
import { decomposeAmount } from './mint';
import { completeSet } from './completeSet';
// TASK-1309: the transport error classes are part of the D3 boundary —
// client.ts classes ONLY (wallet/errors.ts MintUnreachableError is a
// DIFFERENT class in a different graph; the receive swap throws the ones
// mapped inside client.ts fetchFromMint). The RETHROW group (CashuError with
// HTTP code/status incl. BENIGN 11003/20002 + InvalidResponseError) needs no
// import here: anything that is NOT a transport error rethrows via the tail
// below.
import {
	checkState,
	swapProofs,
	CashuError,
	MintUnreachableError,
	NetworkError
} from '../cashu/client';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { fetchAndCacheKeysets, getMintPubkey, resolveKeysetId } from '../cashu/keyset';
import { verifyDleqCarol } from '../cashu/dleq';
import { getPrivateKey } from './state';
import { deriveSecretAndR, getActiveSeed } from './nut13';
import { getCounterK, incrementCounterK, withKeysetLock } from './counterK';
import { isWalletOnline, scheduleNormalizeAfterReceiveOnline } from './normalizeWiring';
import { notifySuspectOffline } from '../offline-indicator';
import type { TokenProof, DecodedToken } from '../types';
import { TokenValidationError } from './errors';

// ─── Types ───────────────────────────────────────────────────

export interface TokenStateCheck {
	proof: StoredProof;
	mintState: 'UNSPENT' | 'PENDING' | 'SPENT' | 'UNKNOWN';
	valid: boolean;
}

export interface ProofBalance {
	total: number;
	byMint: Record<string, number>;
	byKeyset: Record<string, number>;
	proofCount: number;
}

// ─── Token Store Operations ──────────────────────────────────

/**
 * TASK-1309 (D3, risk HIGH) — THE receive-fallback boundary predicate.
 *
 * Fallback group (pure TRANSPORT failures — nothing ever reached the mint's
 * rules engine): client.ts throws these BEFORE any HTTP-driven CashuError
 * exists:
 *   - MintUnreachableError — fetch threw TypeError (network/DNS), mapped at
 *     client.ts:360 (inside the catch of fetchFromMint:before-HTTP path);
 *   - NetworkError — AbortError timeout (client.ts:356), generic wrapping
 *     (client.ts:363), or the post-retries guarantee (client.ts:368).
 *   - TypeError — the raw WHATWG fetch network failure class (kept per the
 *     dispatch grouping; client.ts normally maps it, but a raw transport
 *     TypeError across the same wire carries the same semantics).
 *
 * RETHROW group (mint saw the request and answered — rethrow เสมอ, ห้าม
 * passthrough — storing them would bank mint-rejected proofs incl.
 * double-spent): ANY remaining CashuError bearing HTTP code/status (incl.
 * BENIGN 11003/20002) and InvalidResponseError — and, unchanged, everything
 * else (plain errors keep the pre-D3 catch shape).
 *
 * NOTE: MintUnreachableError/NetworkError/InvalidResponseError all extend
 * CashuError — the transport tests MUST come first; anything left CashuError
 * is a rules-reject (proving the transport group is NOT a catch-all).
 */
function isTransportNetworkError(err: unknown): boolean {
	return (
		err instanceof MintUnreachableError ||
		err instanceof NetworkError ||
		err instanceof TypeError
	);
}

/**
 * TASK-1314 (P1/S4 — NUT-12) — THE offline/fallback DLEQ receive gate.
 *
 * Carol's rule (NUT-12 §Carol): a received proof's DLEQ proof MUST be verified
 * with the mint's public key `A` for the amount. There is no mint state check
 * available while offline, so the DLEQ chain is the ONLY counterfeit defense
 * the passthrough has — hence fail-closed:
 *   - proof without a complete dleq {e, s, r}  → REJECT (S4: dleq-less = ปฏิเสธรับ)
 *   - no A accessible from the keyset cache    → REJECT (fallback — cannot verify offline)
 *   - verifyDleqCarol fails (tampered e/s/C)   → REJECT
 * The whole token is rejected (all-or-nothing): the caller stores NOTHING and
 * records NOTHING when any proof fails — reject BEFORE addProofs below.
 *
 * Covers BOTH 1309 wires on the single choke point: the offline gate branch
 * and the D3 network-error fallback both call receiveProofsPassthrough.
 * The ONLINE swap receive path is NOT here (P2 — untouched).
 */
function dleqReceiveGate(decoded: DecodedToken, mintUrl: string): void {
	for (let i = 0; i < decoded.proofs.length; i++) {
		const proof = decoded.proofs[i];
		const where = `proof #${i} (amount ${proof.amount}, keyset ${proof.id})`;
		if (
			!proof.dleq ||
			typeof proof.dleq.e !== 'string' || proof.dleq.e.length === 0 ||
			typeof proof.dleq.s !== 'string' || proof.dleq.s.length === 0 ||
			typeof proof.dleq.r !== 'string' || proof.dleq.r.length === 0
		) {
			throw new TokenValidationError(
				`TASK-1314 (S4): received proof ${where} carries no complete DLEQ proof {e, s, r} — ` +
				`refusing dleq-less coins on offline/fallback receive (NUT-12). No proof was stored.`
			);
		}
		// A from the keyset cache (offline-safe: getMintPubkey works purely from
		// localStorage cache; getMintPubkey resolves short/long IDs internally).
		const A = getMintPubkey(mintUrl, proof.id, proof.amount);
		if (!A) {
			throw new TokenValidationError(
				`TASK-1314: received proof ${where} — no denomination key in the keyset cache ` +
				`(cache empty or stale while offline) — cannot verify DLEQ, refusing receive. No proof was stored.`
			);
		}
		if (!verifyDleqCarol(proof.dleq, proof.secret, proof.C, A)) {
			throw new TokenValidationError(
				`TASK-1314: DLEQ Carol-verification FAILED for received proof ${where} — ` +
				`counterfeit or tampered token; rejecting the WHOLE token. No proof was stored.`
			);
		}
	}
}

/**
 * TASK-1309 — the offline PASSTHROUGH mechanism (1:1 addProofs, counter_k
 * untouched, pending_normalize flag, same-shape transaction + result) —
 * extracted from the old offline-gate branch and reused verbatim by BOTH
 * the offline gate and the D3 network-error fallback, so the two paths
 * CANNOT drift apart.
 *
 * TASK-1403 (F-049-002): the tx record is written with status 'pending'
 * (boss L-P008: 'transaction ที่รับมาแบบ offline ควรอยู่ใน history โดยขึ้น
 * สถานะว่า pending ไม่ใช่ confirm') + the proofIds mapping (tx_id ↔ proof
 * local_ids) so the T3 flush can settle it (flip confirmed / failed) via
 * `settleReceiveTxByProofs()`. Field is optional backward-compat — legacy
 * records without it are treated as absent (never force-flipped).
 */
async function receiveProofsPassthrough(
	decoded: DecodedToken,
	mintUrl: string,
	tokenString: string
): Promise<ReceiveResult> {
	// TASK-1314 (P1/S4): Carol-verify the DLEQ chain of every proof BEFORE
	// anything is stored — a tampered/dleq-less token throws here and the
	// passthrough below never runs (no addProofs, no record).
	dleqReceiveGate(decoded, mintUrl);

	const offlineProofs = decoded.proofs; // 1:1 — stored EXACTLY as decoded
	const totalAmount = offlineProofs.reduce((sum, p) => sum + p.amount, 0);
	await addProofs(offlineProofs, mintUrl, offlineProofs[0].id); // 1:1 — mark as-is
	await markPendingNormalizeByProof(offlineProofs);
	const dleqCount = offlineProofs.filter(p => p.dleq).length;
	// Local proof IDs for the tx ↔ proof mapping (deterministic local_id —
	// same function addProofs used to stamp the rows above).
	const proofIds = offlineProofs.map((p) => makeLocalId(p));

	// Record transaction (F-088) — best-effort — TASK-1403: status 'pending'
	// (NOT confirmed — the mint never saw these coins; the T3 flush flips
	// them to confirmed once every mapped proof leaves pending).
	const txId = `cashu-recv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	try {
		await addTransaction({
			id: txId,
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: totalAmount,
			mint_url: mintUrl,
			timestamp: Date.now(),
			token_hash: tokenString,
			status: 'pending',
			fee: 0,
			proofIds
		});
	} catch {
		// IndexedDB may be unavailable
	}

	return {
		amount: totalAmount,
		mint: mintUrl,
		unit: decoded.unit,
		proofCount: offlineProofs.length,
		dleqCount: dleqCount > 0 ? dleqCount : undefined
	};
}

// ─── TASK-1403 (F-049-002): tx ↔ proof settlement ─────────────

/**
 * TASK-1403 (F-049-002) — settle ONE offline-receive tx after a T3 flush
 * run, comparing the proofs named in its `proofIds` mapping:
 *
 *   - every mapped proof settled (pending_normalize cleared AND not
 *     quarantined — i.e. re-signed at the mint or zero-skipped per the
 *     OI-v5-2 mint-own pile)          → flip tx status 'confirmed'
 *   - every mapped proof dead (quarantined) → flip tx status 'failed'
 *     (OI-v5-3 ทาง (1) — record อย่างเดียว, ไม่แตะ .svelte)
 *   - mixed / some still pending        → keep 'pending' (คง pending จน
 *     สรุปหมด — ก้อนบางตายไม่ flip)
 *   - tx missing / no proofIds (legacy) → return 'unmapped' (never
 *     force-flipped — migration owns that case)
 *   - tx not pending                    → return 'skipped' (already settled)
 *
 * Record-level only: reads proofsDb rows, updates the tx status via
 * updateTransaction. Never derives, never touches the counter, never
 * renders.
 */
export type ReceiveTxSettleOutcome =
	| 'confirmed'
	| 'failed'
	| 'pending'
	| 'unmapped'
	| 'skipped';

/**
 * TASK-1501 (F-050-001 / INTENT-013 v5.2): the abort-path 3-way taxonomy.
 *
 * Boss ruling (L-P008): 'pending transaction ถ้า swap ไม่ผ่าน ทำไมไม่
 * failed' — 'คือ pending ถ้าถูก swap ตอนกลับมา ออนไลน์แล้วไม่ผ่านให้ถือว่า
 * failed' — i.e. a pending-swap-fail IS failed, UNLESS the failure is pure
 * transport (mint never evaluated our inputs → retry next round).
 *
 *   - TERMINAL-FAIL: the mint EVALUATED our inputs then rejected them
 *     (double-spent family 11002/11005, any other mint-rule CashuError
 *     reject, mint-anomaly / counter-guard after the mint answered), PLUS
 *     every unknown error (boss default: unknown = failed).
 *     → attempt-level force-fail of the mapped txs + clear their
 *     pending_normalize + record the diagnostic.
 *   - RETRYABLE: pure TRANSPORT only — MintUnreachableError / NetworkError /
 *     raw TypeError / timeout (AbortError), PLUS the benign idempotent
 *     family 11003 / 20002 (mint.ts benign-11003 retry owns that code path;
 *     here it only means "not evidence of dead inputs"). ONLY these two
 *     groups enumerate retryable — unknown is NEVER retryable.
 *     → keep pending (tx + proofs), no settle, no clear, retry next round.
 *
 * Classification is by FLOW (this flush path), not by code reuse — mint.ts's
 * benign-11003 retry loop is untouched and can never reach this predicate.
 */
export type FlushAbortVerdict = 'terminal' | 'retryable';

/** The RETRYABLE transport group — the ONLY "keep pending" envelope. */
function isFlushRetryableError(err: unknown): boolean {
	// Group 1 — transport: the mint never evaluated the inputs.
	if (
		err instanceof MintUnreachableError ||
		err instanceof NetworkError ||
		err instanceof TypeError
	) {
		return true;
	}
	if (
		err instanceof DOMException && (err as DOMException).name === 'AbortError'
	) {
		return true;
	}
	// Group 2 — benign idempotent family 11003/20002 (OUTPUT-side collision,
	// NOT evidence of dead inputs). input proofs may be perfectly healthy —
	// retry later under a fresh counter, never force-fail, never quarantine.
	if (err instanceof CashuError && (err as CashuError).isBenign) {
		return true;
	}
	return false;
}

/** TERMINAL-FAIL = everything the retryable predicate does NOT accept. */
export function classifyFlushAbortError(err: unknown): FlushAbortVerdict {
	return isFlushRetryableError(err) ? 'retryable' : 'terminal';
}

/** Extract the diagnostic (failCode/failName) from ANY abort error. */
export function describeFlushError(err: unknown): { failCode?: number | string; failName?: string } {
	const name = err instanceof Error ? err.name : typeof err;
	if (err instanceof CashuError) {
		const code = (err as CashuError).code;
		return { failCode: code, failName: name || 'CashuError' };
	}
	if (err instanceof DOMException) {
		return { failCode: (err as DOMException).name, failName: (err as DOMException).name };
	}
	if (err instanceof Error) {
		return { failName: name };
	}
	return { failName: String(name) };
}

export async function settleReceiveTxByProofs(
	txId: string,
	err?: unknown
): Promise<ReceiveTxSettleOutcome> {
	const tx = await getTransactionById(txId).catch(() => undefined);
	if (!tx) return 'unmapped';
	if (!tx.proofIds || tx.proofIds.length === 0) return 'unmapped';
	if (tx.status !== 'pending') return 'skipped';
	const ids = tx.proofIds;

	const all = await getAllProofs().catch(() => []);
	const byId = new Map(all.map((p) => [p.local_id, p]));
	let alive = 0;
	let dead = 0;
	let stillPending = 0;
	for (const id of ids) {
		const p = byId.get(id);
		if (!p) {
			// Proof row gone (wiped / removed) — we CANNOT prove settlement,
			// so stay conservative: keep pending (never force-flip on
			// missing evidence). The swap path keeps consumed rows
			// (markSpent) so a normal flush always finds them.
			stillPending++;
			continue;
		}
		if (p.quarantined) {
			dead++;
		} else if (p.pending_normalize) {
			stillPending++;
		} else {
			alive++;
		}
	}

	if (stillPending > 0 || (alive > 0 && dead > 0)) {
		return 'pending'; // ก้อนบางตายคง pending จนสรุปหมด
	}
	if (dead > 0 && alive === 0) {
		// TASK-1501 (F-050-001): backfill the diagnostic on the quarantine-
		// success leg (the mint's double-spent family reject code/name —
		// the `err` context). Quarantine stays the single owner of the dead
		// verdict; this only records WHY on the tx for the boss's trace.
		const diag = err !== undefined ? describeFlushError(err) : {};
		await updateTransaction(txId, {
			status: 'failed',
			...(diag.failCode !== undefined ? { failCode: diag.failCode } : {}),
			...(diag.failName !== undefined ? { failName: diag.failName } : {})
		}).catch(() => {});
		return 'failed';
	}
	if (alive > 0 && dead === 0) {
		await updateTransaction(txId, { status: 'confirmed' }).catch(() => {});
		return 'confirmed';
	}
	return 'pending';
}

/**
 * TASK-1403 (F-049-002) — settle EVERY pending cashu_receive tx that
 * carries a proofIds mapping (the T3 flush's post-run settle pass).
 * Returns the per-tx outcomes. Called by the flush binding (TASK-1402);
 * pure record sweep otherwise.
 */
export async function settlePendingReceiveTxs(
	err?: unknown
): Promise<
	Array<{ txId: string; outcome: ReceiveTxSettleOutcome }>
> {
	const { getTransactions } = await import('../storage/db');
	const txs = await getTransactions({ status: 'pending' }).catch(() => []);
	const out: Array<{ txId: string; outcome: ReceiveTxSettleOutcome }> = [];
	for (const tx of txs) {
		if (tx.type !== 'cashu_receive') continue;
		const outcome = await settleReceiveTxByProofs(tx.id, err);
		out.push({ txId: tx.id, outcome });
	}
	return out;
}

/**
 * TASK-1501 (F-050-001): attempt-level force-fail on the T3 flush ABORT
 * path — the TERMINAL-FAIL verdict hook (called by the flush binding with
 * the error context the engine swallowed).
 *
 * Boss ruling (L-P008): 'pending transaction ถ้า swap ไม่ผ่าน ทำไมไม่
 * failed' — a pending-swap-fail IS failed ( Ver a proposal adopted: unknown
 * defaults to failed). This runs on the ABORT path (no result), not just
 * the result path: every MAPPED pending cashu_receive whose proofIds
 * intersect THIS round's consumed pile (the pendingIds snapshot the flush
 * took before the run) flips 'failed' + records the diagnostic
 * (failCode/failName, latest verdict wins) + clears ITS proofs'
 * pending_normalize (the attempt is over — retrying spent coins is fraud).
 *
 * Boundary (must_do 7): legacy/unmapped txs (no proofIds) are NEVER
 * force-flipped — migration owns them — reported as `unmatched`.
 * RETRYABLE aborts never reach here (the flush binding checks the verdict
 * first and returns them to the next round untouched).
 */
export interface FlushAbortFailResult {
	/** mapped txs flipped 'failed' this attempt */
	failed: string[];
	/** legacy/unmapped pending txs seen but deliberately NOT flipped */
	unmatched: string[];
	/** mapped pending txs that do NOT intersect this round's pile */
	outOfScope: string[];
}

export async function forceFailMappedTxsOnFlushAbort(
	attemptProofLocalIds: string[],
	err: unknown
): Promise<FlushAbortFailResult> {
	const diag = describeFlushError(err);
	// Log BEFORE classification effects — the raw error is the evidence.
	console.warn(
		`[flush-abort] TASK-1501 TERMINAL-FAIL: ` +
		`${err instanceof Error ? err.message : String(err)} ` +
		`(failCode=${String(diag.failCode ?? '—')} failName=${diag.failName ?? '—'})`
	);
	const inAttempt = new Set(attemptProofLocalIds);
	const { getTransactions } = await import('../storage/db');
	const txs = await getTransactions({ status: 'pending' }).catch(() => []);
	const res: FlushAbortFailResult = { failed: [], unmatched: [], outOfScope: [] };
	for (const tx of txs) {
		if (tx.type !== 'cashu_receive') continue;
		if (tx.status !== 'pending') continue;
		const ids = tx.proofIds;
		if (!ids || ids.length === 0) {
			res.unmatched.push(tx.id); // legacy/unmapped — migration owns
			continue;
		}
		if (!ids.some((id) => inAttempt.has(id))) {
			res.outOfScope.push(tx.id); // not part of THIS flush round
			continue;
		}
		await updateTransaction(tx.id, {
			status: 'failed',
			failCode: diag.failCode,
			failName: diag.failName
		}).catch(() => {});
		// The attempt is over for these proofs: flip them out of the pending
		// pipeline (they are dead per the terminal verdict — retrying them
		// would re-submit spent coins). Rows stay for audit (no markSpent).
		await clearPendingNormalize(ids).catch(() => {});
		res.failed.push(tx.id);
	}
	return res;
}

/**
 * Store newly minted tokens.
 * Delegates to proofsDb.addProofs with validation.
 */
export async function storeTokens(
	proofs: TokenProof[],
	mintUrl: string,
	keysetId: string
): Promise<void> {
	if (!proofs || proofs.length === 0) {
		throw new Error('Cannot store empty proofs');
	}

	// Validate each proof has required fields
	for (const proof of proofs) {
		if (!proof.secret || !proof.C || !proof.id || proof.amount <= 0) {
			throw new Error(`Invalid proof: missing required fields`);
		}
	}

	await addProofs(proofs, mintUrl, keysetId);
}

/**
 * Get comprehensive balance including by-keyset breakdown.
 */
export async function getProofBalance(): Promise<ProofBalance> {
	// TASK-1315: include pending-normalize proofs — balance counts the user's
	// money; spending is gated by getUnspentProofs/selectProofs (P3).
	const proofs = await getUnspentProofsIncludingPending();

	const byMint: Record<string, number> = {};
	const byKeyset: Record<string, number> = {};

	for (const p of proofs) {
		byMint[p.mint_url] = (byMint[p.mint_url] ?? 0) + p.amount;
		byKeyset[p.keyset_id] = (byKeyset[p.keyset_id] ?? 0) + p.amount;
	}

	const total = Object.values(byMint).reduce((sum, amt) => sum + amt, 0);

	return {
		total,
		byMint,
		byKeyset,
		proofCount: proofs.length
	};
}

/**
 * Validate proofs against the mint to check their current state.
 * Used before melt/swap to prevent double-spend attempts.
 *
 * @param mintUrl - The mint URL to check against
 * @param proofs - The proofs to validate
 * @returns Array of TokenStateCheck with mint state
 */
export async function validateProofs(
	mintUrl: string,
	proofs: StoredProof[]
): Promise<TokenStateCheck[]> {
	try {
		const response = await checkState(
			mintUrl,
			proofs.map(p => ({ secret: p.secret, C: p.C }))
		);

		return proofs.map((proof, i) => {
			const state = response.states[i];
			return {
				proof,
				mintState: state?.state ?? 'UNKNOWN',
				valid: state?.state === 'UNSPENT' || state?.state === 'PENDING'
			};
		});
	} catch {
		// If mint is unreachable, mark all as UNKNOWN (not invalid)
		return proofs.map(proof => ({
			proof,
			mintState: 'UNKNOWN' as const,
			valid: true // optimistic — assume valid if mint unreachable
		}));
	}
}

/**
 * Check if any proof in a set is already spent (double-spend detection).
 *
 * @returns The spent proof if found, null if all proofs are unspent
 */
export async function findSpentProof(
	mintUrl: string,
	proofs: StoredProof[]
): Promise<StoredProof | null> {
	const checks = await validateProofs(mintUrl, proofs);
	const spent = checks.find(c => c.mintState === 'SPENT');
	return spent?.proof ?? null;
}

// ─── Re-exports from proofsDb for convenience ────────────────

export {
	getAllProofs,
	getUnspentProofs,
	getProofsByMint,
	getUnspentProofsByMint,
	removeProofs,
	markSpent,
	getTotalBalance,
	getBalanceByMint,
	getProofCount,
	clearProofs,
	type StoredProof
};

// ─── Send / Receive (P2P token transfer) ──────────────────────

export interface SendResult {
	token: string;
	amount: number;
	mint: string;
}

export interface ReceiveResult {
	amount: number;
	mint: string;
	unit: string;
	proofCount: number;
	dleqCount?: number;
}

/**
 * Send ecash tokens: select proofs, encode as V4 token, mark spent.
 *
 * F-070: When totalSelected > amount, excess proofs stay in wallet.
 * Uses decomposeAmount to identify exactly which amounts sum to the
 * requested send amount, keeping the rest as change in wallet.
 *
 * @param amount - Amount in sats to send
 * @param mintUrl - Mint URL for the proofs
 * @param memo - Optional memo note
 * @returns { token, amount, mint }
 */
export async function sendTokens(
	amount: number,
	mintUrl: string,
	memo?: string
): Promise<SendResult> {
	const allProofs = await getUnspentProofsByMint(mintUrl);
	const selected = selectProofs(allProofs, amount);
	const totalSelected = sumProofs(selected);

	// F-070: Decompose selected amounts into send portion and change
	const excess = totalSelected - amount;
	const sendAmounts = decomposeAmount(amount);
	const excessAmounts = excess > 0 ? decomposeAmount(excess) : [];
	const allOutputAmounts = [...sendAmounts, ...excessAmounts];

	// Match selected proofs to output amounts greedily
	// First N output amounts = send; rest = change
	let sendProofs: typeof selected = [];
	let changeProofs: typeof selected = [];
	let remainingSend = amount;
	const unusedRemaining: typeof selected = [];

	for (const p of selected) {
		if (remainingSend <= 0) {
			changeProofs.push(p);
		} else if (p.amount > remainingSend && sendProofs.length === 0) {
			sendProofs.push(p);
			remainingSend = 0;
		} else if (p.amount <= remainingSend) {
			sendProofs.push(p);
			remainingSend -= p.amount;
		} else {
			changeProofs.push(p);
		}
	}

	// Encode send proofs as V4 token
	const tokenProofs: TokenProof[] = sendProofs.map(p => {
		const tp: TokenProof = {
			id: p.id,
			amount: p.amount,
			secret: p.secret,
			C: p.C
		};
		if (p.dleq) {
			tp.dleq = p.dleq;
		}
		return tp;
	});

	const token = encodeToken(tokenProofs, mintUrl, 'sat', memo);

	// Mark only sent proofs as spent
	await markSpent(sendProofs.map(p => p.local_id));

	// Record transaction (F-088) — best-effort
	const sentAmount = sumProofs(sendProofs);
	try {
		await addTransaction({
			id: `cashu-send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			type: 'cashu_send',
			protocol: 'cashu',
			amount: sentAmount,
			mint_url: mintUrl,
			timestamp: Date.now(),
			token_hash: token,
			status: 'confirmed',
			fee: 0
		});
	} catch {
		// IndexedDB may be unavailable
	}

	return {
		token,
		amount: sentAmount,
		mint: mintUrl
	};
}

/**
 * Receive ecash tokens: decode V4 token, validate, store in IndexedDB.
 *
 * @param tokenString - Cashu V4 token string
 * @returns { amount, mint, unit, proofCount }
 * @throws TokenValidationError if token is invalid
 */
export async function receiveTokens(tokenString: string): Promise<ReceiveResult> {
	let decoded: DecodedToken;
	try {
		decoded = decodeToken(tokenString);
	} catch (err) {
		throw new TokenValidationError(
			err instanceof Error ? err.message : 'Failed to decode token'
		);
	}

	if (!decoded.proofs || decoded.proofs.length === 0) {
		throw new TokenValidationError('Token contains no proofs');
	}

	for (const proof of decoded.proofs) {
		if (!proof.secret || !proof.C || !proof.id || proof.amount <= 0) {
			throw new TokenValidationError('Invalid proof: missing required fields');
		}
	}

	const mintUrl = decoded.mint;
	const keysetId = decoded.proofs[0].id;
	let fullId = keysetId; // Will be resolved to full ID if short form

	// TASK-244 (F-V27-005): receiving requires an unlocked wallet, and the swap
	// receive outputs must be derived deterministically (NUT-13) from the active
	// seed so they are recoverable from the seed-phrase backup.
	getPrivateKey(); // throws WalletLockedError if wallet is locked
	const seed = getActiveSeed();

	// ─── TASK-1304 (5): OFFLINE receive — passthrough 1:1 เดิม 100% ───
	// Blueprint C: "ถ้า offline ให้เก็บแบบ passthrough ก่อน แล้ว consolidate ที
	// หลังเมื่อ online". ข้อห้าม: ห้ามเปลี่ยน passthrough เป็น swap — เก็บ 1:1
	// ตามเดิม, counter_k ไม่ถูกแตะ (flag "ไม่เข้าระบบ counter") — เก็บ
	// pending_normalize แทน แล้ว T3 (flushPendingNormalizeOnBackOnline) เคลียร์
	// เมื่อกลับ online. Derivation ไม่ถูกใช้ → legacy wallet (ไม่มี seed) ยัง
	// รับ offline ได้ปกติ.
	// TASK-1309: the mechanism itself lives in receiveProofsPassthrough() —
	// the D3 network-error fallback reuses THIS SAME mechanism (no drift).
	if (!isWalletOnline()) {
		return await receiveProofsPassthrough(decoded, mintUrl, tokenString);
	}

	// ONLINE swap receive — deterministic derivation REQUIRES a seed.
	if (!seed) {
		throw new Error(
			'NUT-13: no active wallet seed — deterministic swap receive requires a seed-phrase wallet. ' +
			'This legacy wallet has no mnemonic; re-key or recover to a seed-phrase wallet before receiving tokens, ' +
			'otherwise received proofs would be unrecoverable on restore.'
		);
	}

	// 1. Swap old proofs for new ones (NUT-03 double-spend protection)
	// Swap acts as the gatekeeper — mint rejects spent proofs
	try {
		// Fetch mint keys to get public key for this keyset
		await fetchAndCacheKeysets(mintUrl);
		fullId = resolveKeysetId(mintUrl, keysetId) || keysetId;

		// TASK-250 (RC-3): serialize counter read → derive → submit → advance per
		// keyset, and guard against counter-0 reuse (mirror of the mint guard).
		const newProofs = await withKeysetLock(fullId, async () => {
			// Counter-0 guard: if counter_k is 0 but proofs for this keyset already
			// exist in IndexedDB, the counter was lost (localStorage cleared). Deriving
			// swap outputs at counter 0 now would reuse a secret → force NUT-9 restore.
			if (getCounterK(fullId) === 0) {
				const existingProofs = await getAllProofs();
				if (existingProofs.some((p) => p.keyset_id === fullId)) {
					throw new Error(
						`NUT-13 counter_k is 0 for keyset ${fullId} but existing proofs are stored in IndexedDB — ` +
						`the counter was likely lost (localStorage cleared). Restore the wallet (NUT-9) before receiving ` +
						`to avoid reusing counter 0 ("outputs already signed" / 11003).`
					);
				}
			}

			// TASK-1304 (3): the swap receive consolidates straight into a
			// complete set of its own sum — S = sum(decoded.proofs) →
			// outputs = completeSet(S). The mint signs EXACTLY these outputs, so
			// the counter MUST advance by outputs.length (จุดเสี่ยง 2 HIGH —
			// ห้ามค้าง decoded.proofs.length; advance = จำนวนก้อนที่ mint sign
			// เสมอ เพื่อให้ NUT-9 restore ครอบทุกก้อน).
			const targetAmounts = completeSet(
				decoded.proofs.reduce((sum, p) => sum + p.amount, 0)
			);

			// Create blinded outputs (deterministic NUT-13 secrets + blinding)
			const blindPairs: Array<{ secret: string; B_: string; r: string }> = [];
			const outputs: Array<{ amount: number; id: string; B_: string }> = [];

			const startCounter = getCounterK(fullId);
			for (let i = 0; i < targetAmounts.length; i++) {
				const { secret, r } = deriveSecretAndR(seed, fullId, startCounter + i);
				const { B_, blindingFactor } = blindMessage(secret, r);
				blindPairs.push({ secret, B_, r: blindingFactor });
				outputs.push({ amount: targetAmounts[i], id: fullId, B_ });
			}

			// Swap: send old proofs as inputs, new blinded messages as outputs
			// Use full keyset IDs for both inputs and outputs
			const swapInputs = decoded.proofs.map(p => ({ ...p, id: fullId }));
			const swapResult = await swapProofs(mintUrl, swapInputs, outputs);

			// ── TASK-313 guard (melt.ts:624 pattern — TASK-1304) ────────
			// MORE than derived: the mint created outputs we never submitted —
			// advancing the counter would desync it (widening 11003 loops).
			// FEWER than derived: NUT-03 contract violation — index alignment
			// `outputs[i] ↔ signatures[i]` cannot be trusted. Both abort BEFORE
			// the counter advance below — counter_k survives intact.
			const signedCount = swapResult.signatures.length;
			if (signedCount > outputs.length) {
				throw new Error(
					`Mint anomaly: signed ${signedCount} swap outputs but we derived only ${outputs.length} — ` +
					`aborting to prevent counter_k desync. Mint URL: ${mintUrl}`
				);
			}
			if (signedCount < outputs.length) {
				throw new Error(
					`Mint anomaly: signed only ${signedCount} of ${outputs.length} swap outputs ` +
					`(the mint must sign every submitted output) — aborting to prevent misaligned secrets. ` +
					`Mint URL: ${mintUrl}`
				);
			}

			// TASK-244 (F-V27-005) + TASK-1304 (จุดเสี่ยง 2 HIGH): the mint has
			// now signed the swap receive outputs (swapProofs returned) — advance
			// counter_k by outputs.length (= จำนวนก้อนที่ mint sign เสมอ) even if
			// local persistence (addProofs below) later throws, otherwise the next
			// receive re-derives the same B_ and the mint rejects it as "outputs
			// already signed".
			incrementCounterK(fullId, outputs.length);

			// Unblind signatures to get new proofs
			const unblinded = swapResult.signatures.map((sig, i) => {
				const bp = blindPairs[i];
				const pubkey = getMintPubkey(mintUrl, fullId, sig.amount);
				const C = pubkey ? unblindSignature(sig.C_, bp.r, pubkey) : sig.C_;
				return {
					id: sig.id || keysetId,
					amount: sig.amount,
					secret: bp.secret,
					C,
					dleq: sig.dleq ? {
						e: sig.dleq.e,
						s: sig.dleq.s,
						r: blindingFactorToHex(bp.r)
					} : undefined
				};
			});

			await addProofs(unblinded, mintUrl, unblinded[0]?.id || fullId);
			return unblinded;
		});

		const totalAmount = newProofs.reduce((sum, p) => sum + p.amount, 0);
		const dleqCount = newProofs.filter(p => p.dleq).length;

		// Record transaction (F-088) — best-effort
		try {
			await addTransaction({
				id: `cashu-recv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				type: 'cashu_receive',
				protocol: 'cashu',
				amount: totalAmount,
				mint_url: mintUrl,
				timestamp: Date.now(),
				token_hash: tokenString,
				status: 'confirmed',
				fee: 0
			});
		} catch {
			// IndexedDB may be unavailable
		}

		// TASK-1304 (6): T1 — receive online finished → schedule the debounced
		// (~2s) auto-normalize toward a complete set (zero-swap short-circuit
		// inside normalizeToCompleteSet skips the swap when the pile already
		// IS the completeSet target).
		scheduleNormalizeAfterReceiveOnline();

		return {
			amount: totalAmount,
			mint: mintUrl,
			unit: decoded.unit,
			proofCount: newProofs.length,
			dleqCount: dleqCount > 0 ? dleqCount : undefined
		};
	} catch (err) {
		// ─── TASK-1309 (D3): FIRST — pure transport failure → fallback ────────
		// Nothing reached the mint's rules engine (wire-level error only) →
		// keep the proofs: same offline-passthrough mechanism (addProofs 1:1 +
		// pending_normalize + same-shape record, counter_k untouched) — plus
		// notifySuspectOffline() so the detector's badge is real state
		// immediately (D1 trigger (c) → probe follows → verdict is truth).
		// Mint-rejected-rules errors (CashuError code/status incl.
		// double-spent / BENIGN 11003,20002 + InvalidResponseError) NEVER hit
		// this branch — isTransportNetworkError does not accept them — they
		// fall to the rethrow tail below (token rejected เชิง rules ห้ามเก็บ).
		if (isTransportNetworkError(err)) {
			notifySuspectOffline();
			return await receiveProofsPassthrough(decoded, mintUrl, tokenString);
		}

		// ── OLD rethrow tail (คงเดิม 100%): mint-reject / validation → throw ──
		if (err instanceof TokenValidationError) throw err;
		throw new TokenValidationError(
			err instanceof Error ? err.message : 'Swap failed — token may be spent or invalid'
		);
	}

	// Not reached — swap, fallback or throw above
}
