/**
 * TASK-1304 (INTENT-013): auto-normalize WIRING layer.
 *
 * TASK-1303 exported the pure infra (normalizeToCompleteSet + T1/T2/T3 hooks
 * + debounce 2s + zero-swap short-circuit) from `proofs.ts`. This module is
 * the only place that binds the REAL I/O side of the SwapFn contract:
 *   `(proofs, outputs=completeSet(sum)) → Promise<StoredProof[]>`
 * — keyset/mint grouping is THIS module's job (blueprint INTENT-013 fold C).
 *
 * Wire points (blueprint ruling_2):
 *   T1 — after an ONLINE receive finished           → debounced ~2s
 *   T2 — after completeMint finished                → debounced ~2s
 *   T3 — back online: flush pending-normalize pile  → immediately (no debounce)
 *
 * TWO CRITICAL INVARIANTS (จุดเสี่ยง 2 HIGH / NUT-13 Option A semantics —
 * counter advance = number of outputs the mint ACTUALLY signed, always):
 *   - the bound swap advances counter_k per group by `outputs.length`
 *     (a successful NUT-03 swap signs EXACTLY the outputs we submitted);
 *   - a TASK-313-style guard (pattern melt.ts:624) aborts BEFORE the counter
 *     is touched when the mint's signature count desyncs from the derivation
 *     (sign > derive = impossible-mint anomaly; sign < derive = protocol
 *     violation, index alignment could not be trusted either way).
 *
 * NOTE: client/keyset/blind are imported DYNAMICALLY inside `swapGroup`
 * (call time). Static imports would break the vi.mock surface of existing
 * unit-test files that mock `cashu/client` without a `swapProofs` export
 * (mint suites) — dynamic import resolves through the same mock registry
 * but delays the module binding to call time.
 */
import {
	autoNormalizeAfterReceiveOnline,
	autoNormalizeAfterCompleteMint,
	autoNormalizeOnBackOnline,
	runAutoNormalizeNow,
	cancelAutoNormalize,
	type AutoNormalizeDeps,
	type NormalizeResult
} from './proofs';
import type { SwapFn } from './proofs';
import { completeSet } from './completeSet';
import {
	addProofs,
	getAllProofs,
	getUnspentProofs,
	getUnspentProofsIncludingPending,
	getPendingNormalizeProofs,
	clearPendingNormalize,
	markSpent,
	markQuarantined,
	makeLocalId,
	type StoredProof
} from './proofsDb';
import { isDoubleSpentFamilyError, QuarantineAppliedError } from './errors';
import type { TokenProof } from '../types';
import { getCounterK, incrementCounterK, withKeysetLock } from './counterK';
import { deriveSecretAndR, getActiveSeed } from './nut13';
import { getDetectorStatus, onConnectivityChange } from '../offline-indicator';

// ─── Online detection ───────────────────────────────────────

/**
 * TASK-1308 (F-048-001, layer 3): truth = the probe-based detector service
 * (`$lib/offline-indicator`) — the ONE connectivity state for the app.
 * `navigator.onLine` is NOT truth anymore (FR-2): it only seeds the detector
 * and demotes window events to probe TRIGGERS.
 *
 * Reads the detector state directly (NOT isOnline()): while 'probing' there
 * is no completed verdict yet → false → the wallet takes the offline
 * passthrough path (risk-6 safe); 'online' only after a probe run succeeded
 * (probe-success). This module's import graph stays free of transfer.ts /
 * cashu/token — offline-indicator imports nothing, so the mock surfaces of
 * existing test suites are unchanged.
 */
export function isWalletOnline(): boolean {
	return getDetectorStatus().state === 'online';
}

// ─── SwapFn binding (TASK-1304 must_do 7) ─────────────────────

/** One (mint_url, keyset_id) slice of the pile — the NUT-03 swap granularity. */
interface PileGroup {
	mintUrl: string;
	keysetId: string;
	proofs: StoredProof[];
	sum: number;
}

/** Group the pile by (mint_url, keyset_id) — larger slice first, key tie-break. */
function groupPile(proofs: StoredProof[]): PileGroup[] {
	const map = new Map<string, PileGroup>();
	for (const p of proofs) {
		const k = `${p.mint_url}||${p.keyset_id}`;
		const g = map.get(k) ?? { mintUrl: p.mint_url, keysetId: p.keyset_id, proofs: [], sum: 0 };
		g.proofs.push(p);
		g.sum += p.amount;
		map.set(k, g);
	}
	return [...map.values()].sort((a, b) => (b.sum - a.sum) || a.keysetId.localeCompare(b.keysetId));
}

/**
 * Extract an exact subset of `coins` (multiset of pow2 denominations) whose
 * sum equals `sum`. Greedy largest-first, DFS+memo fallback, honest throw
 * when no subset exists. Always possible for completeSet targets because the
 * group sums re-assemble to Σ(outputs).
 */
function extractShare(coins: number[], sum: number): { share: number[]; rest: number[] } {
	if (!Number.isSafeInteger(sum) || sum < 0) {
		throw new Error(`extractShare: invalid group sum ${sum}`);
	}
	if (sum === 0) return { share: [], rest: [...coins] };
	const total = coins.reduce((s, c) => s + c, 0);
	if (total < sum) {
		throw new Error(
			`extractShare: cannot allocate group sum ${sum} from outputs summing ${total}`
		);
	}

	// Fast path: greedy largest-first subset-sum.
	const desc = [...coins].sort((a, b) => b - a);
	const used = new Array<boolean>(desc.length).fill(false);
	const share: number[] = [];
	let remaining = sum;
	for (let i = 0; i < desc.length && remaining > 0; i++) {
		if (!used[i] && desc[i] <= remaining) {
			used[i] = true;
			share.push(desc[i]);
			remaining -= desc[i];
		}
	}
	if (remaining === 0) {
		return { share, rest: desc.filter((_, i) => !used[i]) };
	}

	// DFS fallback: exact subset-sum with pruning + memo over (index, need).
	const suffixSum = new Array<number>(desc.length + 1).fill(0);
	for (let i = desc.length - 1; i >= 0; i--) suffixSum[i] = suffixSum[i + 1] + desc[i];
	const deadMemo = new Set<string>();
	const go = (i: number, need: number, picked: number[]): number[] | null => {
		if (need === 0) return picked;
		if (i >= desc.length || need > suffixSum[i]) return null;
		if (deadMemo.has(`${i}:${need}`)) return null;
		for (let j = i; j < desc.length && desc[j] === desc[i]; j++) {
			if (desc[j] <= need) {
				const take = go(j + 1, need - desc[j], [...picked, desc[j]]);
				if (take) return take;
			}
		}
		const skip = go(i + 1, need, picked);
		if (skip) return skip;
		deadMemo.add(`${i}:${need}`);
		return null;
	};
	const found = go(0, sum, []);
	if (!found) {
		throw new Error(
			`extractShare: no subset of outputs sums to group sum ${sum} — allocation impossible`
		);
	}
	const rest = [...desc];
	for (const c of found) {
		const at = rest.indexOf(c);
		rest.splice(at, 1);
	}
	return { share: found, rest };
}

/**
 * Swap ONE (mint, keyset) group for exactly `amounts` denominations.
 *
 * Counter invariants (NUT-13 Option A — กฎเดิม):
 *   - deterministic derivation from the active seed + per-keyset counter
 *   - counter-0 reuse guard (mirror of mint.ts / tokenStore.ts)
 *   - TASK-313-style alignment guard BEFORE the counter is touched
 *   - advance counter_k by outputs.length (mint signs exactly these)
 */
async function swapGroup(
	mintUrl: string,
	keysetId: string,
	inputs: StoredProof[],
	amounts: number[]
): Promise<StoredProof[]> {
	const seed = getActiveSeed();
	if (!seed) {
		throw new Error(
			'NUT-13: no active wallet seed — deterministic swap requires a seed-phrase wallet. ' +
			'Re-key or recover to a seed-phrase wallet before this swap can run.'
		);
	}

	const [clientMod, blindMod, keysetMod] = await Promise.all([
		import('../cashu/client'),
		import('../cashu/blind'),
		import('../cashu/keyset')
	]);
	if (typeof clientMod.swapProofs !== 'function') {
		throw new Error('swap unavailable: cashu client has no swapProofs');
	}

	// Cached keysets provide the pubkeys for unblinding; a failed fetch is
	// non-fatal — unblinding falls back to the raw C_ (mirror of tokenStore.ts).
	await keysetMod.fetchAndCacheKeysets(mintUrl).catch(() => { /* unblind falls back */ });

	return withKeysetLock(keysetId, async () => {
		// Counter-0 guard (mirror of mint.ts / tokenStore.ts): counter lost while
		// proofs persisted → deriving at 0 would reuse a signed secret → NUT-9 first.
		if (getCounterK(keysetId) === 0) {
			const existing = await getAllProofs();
			if (existing.some((p) => p.keyset_id === keysetId)) {
				throw new Error(
					`NUT-13 counter_k is 0 for keyset ${keysetId} but existing proofs are stored in IndexedDB — ` +
					`the counter was likely lost (localStorage cleared). Restore the wallet (NUT-9) before swapping ` +
					`to avoid reusing counter 0 ("outputs already signed" / 11003).`
				);
			}
		}

		const startCounter = getCounterK(keysetId);
		const blindPairs: Array<{ secret: string; r: string }> = [];
		const outputs: Array<{ amount: number; id: string; B_: string }> = [];

		for (let i = 0; i < amounts.length; i++) {
			const derived = deriveSecretAndR(seed, keysetId, startCounter + i);
			const { B_, blindingFactor } = blindMod.blindMessage(derived.secret, derived.r);
			blindPairs.push({ secret: derived.secret, r: blindingFactor });
			outputs.push({ amount: amounts[i], id: keysetId, B_ });
		}

		const swapInputs = inputs.map((p) => ({
			id: keysetId,
			amount: p.amount,
			secret: p.secret,
			C: p.C
		}));

		// TASK-1316 (P5): the DOUBLE-SPENT family reject (11002/11005 — hard
		// evidence the coins are dead) quarantines the group and lets the flush
		// continue with the remaining groups. Network errors / the benign
		// idempotent family (11003/20002) / unknown errors are NOT evidence of
		// dead coins — they propagate untouched (boundary tests both ways).
		let swapResult: Awaited<ReturnType<typeof clientMod.swapProofs>>;
		try {
			swapResult = await clientMod.swapProofs(mintUrl, swapInputs, outputs);
		} catch (err) {
			if (isDoubleSpentFamilyError(err)) {
				const deadIds = inputs.map((p) => p.local_id);
				await markQuarantined(deadIds);
				throw new QuarantineAppliedError(
					`TASK-1316: quarantined ${deadIds.length} proofs of keyset ${keysetId} — ` +
					`mint double-spent family reject: ${err instanceof Error ? err.message : String(err)}`,
					deadIds,
					err
				);
			}
			throw err;
		}

		// ── TASK-313 guard (melt.ts:624 pattern — TASK-1304) ────────────────
		// The mint may not sign MORE outputs than we derived (counter cannot
		// create outputs we did not submit). Aborting BEFORE the counter is
		// touched keeps counter_k intact — the 11003 loop cannot widen.
		const signedCount = swapResult.signatures.length;
		if (signedCount > outputs.length) {
			throw new Error(
				`Mint anomaly: signed ${signedCount} swap outputs but we derived only ${outputs.length} — ` +
				`aborting to prevent counter_k desync. Mint URL: ${mintUrl}`
			);
		}
		// A successful NUT-03 swap must sign ALL submitted outputs; a short
		// return would break index alignment (wrong secret ↔ wrong signature) —
		// refuse to persist rather than store unusable proofs.
		if (signedCount < outputs.length) {
			throw new Error(
				`Mint anomaly: signed only ${signedCount} of ${outputs.length} swap outputs ` +
				`(NUT-03 requires signing every submitted output) — aborting to prevent ` +
				`misaligned secrets. Mint URL: ${mintUrl}`
			);
		}

		// ── NUT-13 Option A: advance = outputs.length (จุดเสี่ยง 2 HIGH) ──
		// The mint signed EXACTLY the submitted outputs, so the counter must
		// advance by outputs.length — never inputs.length.
		incrementCounterK(keysetId, outputs.length);

		const unblinded: TokenProof[] = swapResult.signatures.map((sig, i) => {
			const bp = blindPairs[i];
			const pubkey = keysetMod.getMintPubkey(mintUrl, keysetId, sig.amount);
			const C = pubkey
				? blindMod.unblindSignature(sig.C_, bp.r, pubkey)
				: sig.C_;
			const proof: TokenProof = {
				id: sig.id || keysetId,
				amount: sig.amount,
				secret: bp.secret,
				C
			};
			if (sig.dleq) {
				proof.dleq = {
					e: sig.dleq.e,
					s: sig.dleq.s,
					r: blindMod.blindingFactorToHex(bp.r)
				};
			}
			return proof;
		});

		const addKeysetId = unblinded[0]?.id || keysetId;
		await addProofs(unblinded, mintUrl, addKeysetId);
		await markSpent(inputs.map((p) => p.local_id));

		// Return the same stored shape that addProofs persisted.
		return unblinded.map((p) => ({
			...p,
			local_id: makeLocalId(p),
			mint_url: mintUrl,
			keyset_id: addKeysetId,
			stored_at: Date.now(),
			spent: false
		}));
	});
}

/** The real SwapFn bound for TASK-1303's normalizeToCompleteSet. */
export const boundSwapFn: SwapFn = async (proofs, outputs) => {
	const groups = groupPile(proofs);
	const pileSum = proofs.reduce((s, p) => s + p.amount, 0);
	const outputsSum = outputs.reduce((s, a) => s + a, 0);
	if (outputsSum !== pileSum) {
		throw new Error(
			`boundSwapFn: outputs sum ${outputsSum} must equal pile sum ${pileSum}`
		);
	}

	const newProofs: StoredProof[] = [];
	let remaining = [...outputs];

	for (const g of groups) {
		const { share, rest } = extractShare(remaining, g.sum);
		remaining = rest;
		try {
			newProofs.push(...await swapGroup(g.mintUrl, g.keysetId, g.proofs, share));
		} catch (err) {
			// TASK-1316 (P5): a quarantined group is already handled (marked in
			// proofsDb) — the flush CONTINUES with the remaining groups. Anything
			// else (network, benign, unknown) aborts the run untouched.
			if (err instanceof QuarantineAppliedError) {
				continue;
			}
			throw err;
		}
	}

	if (remaining.length > 0) {
		// Every group got its exact share — nothing can remain.
		throw new Error(
			'boundSwapFn: internal allocation error — outputs left over after group swaps'
		);
	}
	return newProofs;
};

// ─── Deps assembly + T1/T2/T3 wire functions ──────────────────

/** Shared AutoNormalizeDeps over the whole spendable pile. */
export function createAutoNormalizeDeps(): AutoNormalizeDeps {
	return {
		// TASK-1315 (P3/balance): the normalize engine works on ALL unspent
		// money INCLUDING the pending pile — the T3 flush exists precisely to
		// consolidate it; T1/T2 treat pending as money too (if a pending pile
		// lingers, an auto run consolidates it). Spending itself remains gated
		// by selectProofs/getUnspentProofs (P3 layer 1+2).
		getProofs: () => getUnspentProofsIncludingPending(),
		swapFn: boundSwapFn
	};
}

/** T1 — call right after an ONLINE receive finished (debounced ~2s). */
export function scheduleNormalizeAfterReceiveOnline(): void {
	autoNormalizeAfterReceiveOnline(createAutoNormalizeDeps());
}

/** T2 — call right after completeMint finished (debounced ~2s). */
export function scheduleNormalizeAfterMint(): void {
	autoNormalizeAfterCompleteMint(createAutoNormalizeDeps());
}

/**
 * T3 — back online: consolidate immediately (no debounce) and clear the
 * pending-normalize flags on success (swapped or zero-swap short-circuit).
 * On failure the flags stay — the next back-online flush retries.
 */
export async function flushPendingNormalizeOnBackOnline(): Promise<NormalizeResult | null> {
	const pendingIds = (await getPendingNormalizeProofs()).map((p) => p.local_id);
	const result = await autoNormalizeOnBackOnline(createAutoNormalizeDeps());
	if (result) {
		// Consumed: pile was swapped (inputs marked spent inside swapGroup) or
		// the pile was already a complete set (zero-swap short-circuit).
		await clearPendingNormalize(pendingIds);
	}
	return result;
}

/** Manual trigger (tests / advanced callers) — one normalize run now. */
export function normalizePileNow(): Promise<NormalizeResult | null> {
	return runAutoNormalizeNow(createAutoNormalizeDeps(), 'T3-back-online');
}

/** Cancel a scheduled (not yet run) auto-normalize timer. */
export function cancelScheduledNormalize(): void {
	cancelAutoNormalize();
}

// ─── completeSet passthrough — single import surface for callers ──
export { completeSet };

// ─── T3 flush trigger source (TASK-1308 — F-048-001 closure, single binding) ─
// The production flush trigger binds to the DETECTOR state change
// (probe-success → definite 'online' verdict), NOT to the window 'online'
// event: the event window never fires when the device never leaves online
// state (e.g. VPN tunneled machines — F-048-001 dead window). The detector
// fires listeners only when a COMPLETED probe run flips the verdict to
// 'online' — the one true "back online" moment. Engine semantics unchanged
// (zero-swap short-circuit + running lock remain in proofs.ts); the binding
// stays in this single wiring point (v4.1 heart).
if (typeof window !== 'undefined') {
	onConnectivityChange((online) => {
		if (online) void flushPendingNormalizeOnBackOnline();
	});
}
