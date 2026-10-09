/**
 * Proof selection and management utilities.
 * Operates on StoredProof objects (from IndexedDB proofsDb).
 */
import type { StoredProof } from './proofsDb';
import { ProofSelectionError } from './errors';
import { remainderSelect } from './remainderSelect';
import { completeSet } from './completeSet';

// ─── Selection Strategies ────────────────────────────────────

/**
 * Select proofs to cover `amount` — TASK-1303 (INTENT-013) 4-step ladder:
 *
 * 1. Exact single proof match (เดิม) — a proof whose amount === `amount`.
 * 2. Denomination-first (re-use TASK-1302 `remainderSelect` ขั้น 1): write
 *    `amount` in binary, take ONE matching-denomination proof per set bit.
 * 3. DP min-excess remainder (re-use TASK-1302 `remainderSelect` ขั้น 2-3):
 *    cover the leftover remainder exactly (เกณฑ์ 1) or with minimal
 *    (excess, coin-count) overpay (เกณฑ์ 2-3). Any excess is reported to the
 *    caller by the sum alone — call sites keep their existing swap path.
 * 4. Greedy largest-first fallback (เดิม :41-61 คงเป็นชั้นท้าย) — only when
 *    steps 1-3 find no way (defensive; e.g. malformed amounts).
 *
 * Contract/signature unchanged: same `(proofs, amount) → StoredProof[]`,
 * same `ProofSelectionError` on insufficient funds — every call site
 * (transfer.ts, melt.ts, offline.ts, tokenStore.ts) accepts it as-is.
 *
 * @returns Array of selected proofs (unspent, marked for use), sum ≥ amount
 * @throws ProofSelectionError if insufficient funds
 */
export function selectProofs(proofs: StoredProof[], amount: number): StoredProof[] {
	if (amount <= 0) {
		throw new ProofSelectionError(amount);
	}

	// TASK-1315 (P3/L-P005 layer 2 — defensive guard): callers may hand this
	// pool directly (e.g. a stale snapshot) — pending-normalize proofs are
	// NEVER spendable regardless of what the caller supplied. Layer 1 (DB:
	// getUnspentProofs) already excludes them; this second line makes the
	// guarantee hold even for raw pools.
	const unspent = proofs.filter(p => !p.spent && !p.pending_normalize);

	// Check total balance
	const totalAvailable = unspent.reduce((sum, p) => sum + p.amount, 0);
	if (totalAvailable < amount) {
		throw new ProofSelectionError(amount);
	}

	// ขั้น 1 — exact single proof equal to amount
	const exactMatch = unspent.find(p => p.amount === amount);
	if (exactMatch) {
		return [exactMatch];
	}

	// ขั้น 2+3 — denomination-first + DP min-excess remainder
	// (re-use remainderSelect from TASK-1302 — one call runs ขั้น 1 then ขั้น 2-3;
	//  no duplicated implementation, semantics locked by remainderSelect tests)
	try {
		const pool = unspent.map(p => p.amount);
		const pick = remainderSelect(amount, pool);
		// ขั้น 3 (remainderSelect): excess > 0 → คืน caller — swap path เดิมของ call site
		return [...pick.denominationHits, ...pick.dpSubset].map(i => unspent[i]);
	} catch {
		// ขั้น 2+3 หาทางไม่เจอ (input ผิดปกติ เช่น non-safe-integer) → ตกไปชั้นท้าย
	}

	// ขั้น 4 — greedy fallback: sort descending, pick largest until amount covered
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

// ─── Consolidation — normalize to complete-set (TASK-1303 B) ─

/**
 * Host-performed NUT-03 swap, injected into `normalizeToCompleteSet`.
 * Hands over `proofs` and must return the proofs received back with exactly
 * `outputs` denominations (sum(outputs) === sum(proofs)).
 * All I/O lives here — the orchestrator itself stays pure.
 */
export type SwapFn = (proofs: StoredProof[], outputs: number[]) => Promise<StoredProof[]>;

/** Result of one `normalizeToCompleteSet` attempt. */
export interface NormalizeResult {
	/** true — swapFn ran · false — zero-swap short-circuit (or empty pile). */
	swapped: boolean;
	/** true — pile already complete-set of its own sum → swap skipped. */
	zeroSwap: boolean;
	/** Σ amount of the pile before normalize. */
	sum: number;
	/** completeSet(sum) target denominations (empty when sum = 0). */
	target: number[];
	/** Proofs after the attempt (swapFn result when swapped; input otherwise). */
	proofs: StoredProof[];
}

/** Multiset equality (order-free) between the pile amounts and the target. */
function isCompleteSetMultiset(amounts: number[], target: number[]): boolean {
	if (amounts.length !== target.length) return false;
	const a = [...amounts].sort((x, y) => x - y);
	const t = [...target].sort((x, y) => x - y);
	return a.every((v, i) => v === t[i]);
}

/** TASK-1316 (P4): normalize options — forceSwap bypasses the zero-swap
 *  short-circuit. ONLY the T3 flush path (normalizeWiring) passes it: the
 *  pending pile MUST be re-signed at the mint (the mint itself re-verifies the
 *  coins were never spent — the one authority that can). T1/T2 keep the
 *  zero-skip semantics exactly as TASK-1303 ruled (self-minted coins). */
export interface NormalizeOptions {
	forceSwap?: boolean;
	/**
	 * TASK-1403 (F-049-002 / OI-v5-2 ทาง (2)): origin of the pile being
	 * normalized — lets the flush split the rule per pile source:
	 *   - 'mint-own': proofs WE minted ourselves (counter-derived, NUT-13 —
	 *     counter เอง ตรวจแล้ว) → zero-skip / confirm allowed (T1/T2
	 *     semantics; the coins were born inside our counter band).
	 *   - 'outside': proofs received from OUTSIDE our mint (offline
	 *     passthrough / P2P receives) → strict swap (P4 เคร่ง) — the mint
	 *     itself must re-attest coins it never signed for us.
	 * Absent = legacy behavior (forceSwap decides; T1/T2 zero-skip as before).
	 */
	origin?: 'mint-own' | 'outside';
}

/** Resolve the effective force-swap for a run: 'outside' piles ALWAYS swap. */
export function resolveOriginForceSwap(opts?: NormalizeOptions): boolean {
	if (opts?.origin === 'outside') return true; // P4 เคร่ง — outside บังคับ swap
	return opts?.forceSwap ?? false;
}

/**
 * Consolidate a proof pile into a complete-set of its own sum — TASK-1303
 * (INTENT-013, ruling_2). Pure orchestrator: the swap is function injection
 * (`swapFn`), no I/O here.
 *
 * zero-swap short-circuit: when the pile's amount multiset already equals
 * `completeSet(sum)` (TASK-1301), skip the swap entirely (risk R-8/R-9
 * mitigation — assumption verified:false, covered by unit tests here).
 * TASK-1316 (P4): opts.forceSwap=true (T3 flush ONLY) bypasses this
 * short-circuit — the pending pile is swapped at the mint even when it is
 * already complete-set shaped, so the mint gets to attest every coin.
 * TASK-1403 (OI-v5-2 ทาง (2)): opts.origin='outside' ALSO forces the swap
 * (outside pile บังคับ swap เคร่ง) while opts.origin='mint-own' keeps the
 * zero-skip for self-minted coins (counter เอง ตรวจแล้ว — confirm ได้).
 *
 * @param proofs the pile to consolidate
 * @param swapFn injected NUT-03 swap (see `SwapFn`)
 * @param opts optional forceSwap bypass (T3 flush only — see NormalizeOptions)
 * @throws whatever `swapFn` throws — propagated to the caller untouched
 */
export async function normalizeToCompleteSet(
	proofs: StoredProof[],
	swapFn: SwapFn,
	opts?: NormalizeOptions
): Promise<NormalizeResult> {
	const sum = proofs.reduce((s, p) => s + p.amount, 0);

	// Empty pile — nothing to consolidate
	if (sum <= 0) {
		return { swapped: false, zeroSwap: true, sum: 0, target: [], proofs };
	}

	const target = completeSet(sum);

	// zero-swap short-circuit (ruling_2): pile already in complete-set shape —
	// BYPASSED when forceSwap (P4: T3 flush must swap at the mint) or when the
	// pile came from OUTSIDE our mint (TASK-1403 OI-v5-2 ทาง (2): outside
	// บังคับ swap เคร่ง). mint-own piles (counter-derived, NUT-13) keep zero-skip.
	const force = resolveOriginForceSwap(opts);
	if (!force && isCompleteSetMultiset(proofs.map(p => p.amount), target)) {
		return { swapped: false, zeroSwap: true, sum, target, proofs };
	}

	const newProofs = await swapFn(proofs, target);
	return { swapped: true, zeroSwap: false, sum, target, proofs: newProofs };
}

// ─── AUTO MODE normalize infra (TASK-1303 C — ruling_2) ──────
// Infra + export เท่านั้น — wire จริง (mint.ts / tokenStore.ts) เป็นของ
// TASK-1304. Hook points: T1 (หลัง receive online) · T2 (หลัง completeMint) ·
// T3 (กลับ online เคลียร์ pending-normalize). T4 force-normalize-after-send
// ยกเลิก (ruling_2) — ไม่มีในโค้ด.

/** Debounce window for T1/T2 auto-normalize (ruling_2: ~2s). */
export const AUTO_NORMALIZE_DEBOUNCE_MS = 2000;

/** Which hook point scheduled the auto-normalize (observability only). */
export type AutoNormalizeHook = 'T1-receive-online' | 'T2-complete-mint' | 'T3-back-online';

/** Dependencies injected by the wiring layer (TASK-1304). */
export interface AutoNormalizeDeps {
	/** Gather the current spendable pile (unspent proofs) to normalize. */
	getProofs: () => Promise<StoredProof[]> | StoredProof[];
	/** NUT-03 swap — injected I/O (see `SwapFn`). */
	swapFn: SwapFn;
	/** Optional settle callback: `(result, undefined, hook)` on success,
	 *  `(null, error, hook)` on failure. Never throws. */
	onSettle?: (result: NormalizeResult | null, error: unknown | undefined, hook: AutoNormalizeHook) => void;
}

let autoNormalizeTimer: ReturnType<typeof setTimeout> | null = null;
let autoNormalizePending = false;
let autoNormalizeRunning = false;

/** true when an auto-normalize is scheduled but has not run yet. */
export function isAutoNormalizePending(): boolean {
	return autoNormalizePending;
}

/** true while a normalize attempt is in flight (guards double-runs). */
export function isAutoNormalizeRunning(): boolean {
	return autoNormalizeRunning;
}

/** Cancel a scheduled (not yet run) auto-normalize and clear pending state. */
export function cancelAutoNormalize(): void {
	if (autoNormalizeTimer !== null) {
		clearTimeout(autoNormalizeTimer);
		autoNormalizeTimer = null;
	}
	autoNormalizePending = false;
}

/** Shared debounced scheduler — re-scheduling inside the window collapses
 *  into a single run (`debounce` semantics of ruling_2). */
function scheduleAutoNormalize(deps: AutoNormalizeDeps, hook: AutoNormalizeHook): void {
	autoNormalizePending = true;
	if (autoNormalizeTimer !== null) clearTimeout(autoNormalizeTimer);
	autoNormalizeTimer = setTimeout(() => {
		autoNormalizeTimer = null;
		void runAutoNormalizeNow(deps, hook);
	}, AUTO_NORMALIZE_DEBOUNCE_MS);
}

/** Run one normalize attempt now (guarded — never double-runs, never throws). */
export async function runAutoNormalizeNow(
	deps: AutoNormalizeDeps,
	hook: AutoNormalizeHook,
	opts?: NormalizeOptions
): Promise<NormalizeResult | null> {
	if (autoNormalizeRunning) return null;
	autoNormalizeRunning = true;
	autoNormalizePending = false;
	try {
		const pile = await deps.getProofs();
		const result = await normalizeToCompleteSet(pile, deps.swapFn, opts);
		deps.onSettle?.(result, undefined, hook);
		return result;
	} catch (err) {
		deps.onSettle?.(null, err, hook);
		return null;
	} finally {
		autoNormalizeRunning = false;
	}
}

/** T1 — หลัง receive online จบ (wire = TASK-1304) — debounced ~2s. */
export function autoNormalizeAfterReceiveOnline(deps: AutoNormalizeDeps): void {
	scheduleAutoNormalize(deps, 'T1-receive-online');
}

/** T2 — หลัง completeMint จบ (wire = TASK-1304) — debounced ~2s. */
export function autoNormalizeAfterCompleteMint(deps: AutoNormalizeDeps): void {
	scheduleAutoNormalize(deps, 'T2-complete-mint');
}

/** T3 — กลับ online: เคลียร์ pending-normalize ทันที (bypass debounce wait).
 *  TASK-1316 (P4): T3 ส่ง forceSwap — pending pile ถูก swap จริง ณ mint
 *  เสมอ (mint เป็นผู้ยืนยันไม่เคยใช้) — zero-swap short-circuit ถูก bypass
 *  เฉพาะเส้นนี้ (T1/T2 คง zero-skip เดิม 100%). */
export function autoNormalizeOnBackOnline(deps: AutoNormalizeDeps): Promise<NormalizeResult | null> {
	if (autoNormalizeTimer !== null) {
		clearTimeout(autoNormalizeTimer);
		autoNormalizeTimer = null;
	}
	return runAutoNormalizeNow(deps, 'T3-back-online', { forceSwap: true });
}

/**
 * TASK-1403 (F-049-002 / OI-v5-2 ทาง (2)): T3 with the origin-split rule —
 * identical immediate path to autoNormalizeOnBackOnline, but the pending
 * pile rides as origin:'outside' (outside บังคับ swap เคร่ง) alongside
 * forceSwap:true. Mint-own piles keep zero-skip on T1/T2 (no origin passed
 * there). Pure engine — no I/O beyond deps.
 */
export function autoNormalizeOnBackOnlineWithOrigin(deps: AutoNormalizeDeps): Promise<NormalizeResult | null> {
	if (autoNormalizeTimer !== null) {
		clearTimeout(autoNormalizeTimer);
		autoNormalizeTimer = null;
	}
	return runAutoNormalizeNow(deps, 'T3-back-online', { forceSwap: true, origin: 'outside' });
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
