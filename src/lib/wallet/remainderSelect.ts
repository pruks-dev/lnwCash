/**
 * TASK-1302 (INTENT-013): remainder-first denomination selection —
 * pure, deterministic, no I/O.
 *
 * Two-step selection of pool coins to pay a total `S`:
 *
 *  ขั้น 1 — denomination-first: write `S` in binary; for every set bit take ONE
 *           matching-denomination coin (2^bit) straight from the pool
 *           (ก้อนเดียวต่อบิต — duplicate denominations stay untouched). A bit
 *           whose denomination is missing from the pool flows into the
 *           remainder `R`.
 *
 *  ขั้น 2 — remainder R → DP min-excess over the still-unused pool coins.
 *           Objective, lexicographic:
 *             เกณฑ์ 1: subset sum == R  → exact, done.
 *             เกณฑ์ 2: otherwise the subset with sum ≥ R minimizing (sum − R).
 *             เกณฑ์ 3: equal excess → fewest coins.
 *           Ties after เกณฑ์ 3 resolve deterministically to the
 *           lexicographically-first subset (ascending pool index).
 *           DP core is `dpMinExcess` — plain O(R×n) 0/1 subset-sum DP with an
 *           overshoot scan; NO timeout / NO cap / NO search-pruning layer.
 *
 *  ขั้น 3 — leftover excess (paid beyond `R`) is reported to the caller —
 *           recovering it is a swap-path concern, out of scope here
 *           (TASK-1303).
 */

// ─── Types ───────────────────────────────────────────────────

/** Result mode: dp subset covers `remainder` exactly, or overpays it. */
export type RemainderSelectMode = 'exact' | 'excess';

/** One DP min-excess pick over an amount pool (the DP core result). */
export interface MinExcessPick {
	/** Pool indices of the picked coins, ascending (into the pool passed in). */
	indices: number[];
	/** Amounts of the picked coins, same order as `indices`. */
	amounts: number[];
	/** Σ amounts — equals `R + excess`. */
	sum: number;
	/** True when the pick hits เกณฑ์ 1 (sum == R exactly). */
	exact: boolean;
	/** Overpay above R (0 when `exact`). */
	excess: number;
}

/** Full remainderSelect result (both steps combined). */
export interface RemainderSelectResult {
	/** ขั้น 1: pool indices taken denomination-first (ascending denomination). */
	denominationHits: number[];
	/** Amounts of the ขั้น 1 hits, same order. */
	denominationHitAmounts: number[];
	/** Σ denominationHitAmounts. */
	denominationHitSum: number;
	/** Remainder after ขั้น 1: S − denominationHitSum (0 = ขั้น 1 กินหมด). */
	remainder: number;
	/** ขั้น 2: DP picks as GLOBAL pool indices, ascending. */
	dpSubset: number[];
	/** Amounts of the ขั้น 2 picks, same order as `dpSubset`. */
	dpSubsetAmounts: number[];
	/** Σ dpSubsetAmounts. */
	dpSum: number;
	/** `exact` — dpSum == remainder · `excess` — dpSum = remainder + excess. */
	mode: RemainderSelectMode;
	/** 0 in exact mode · overpaid value (dpSum − remainder) in excess mode. */
	excess: number;
	/** denominationHitSum + dpSum — the coins the caller would hand over. */
	paidTotal: number;
}

// ─── DP core (ขั้น 2) ────────────────────────────────────────

/**
 * DP min-excess subset selection over `pool` (amounts) for target `R`.
 *
 * Finds the lexicographically-first (ascending index) subset minimizing
 * (excess, coin count) where excess = sum − R over subsets with sum ≥ R;
 * an exact (excess-0) subset wins outright (เกณฑ์ 1 → 3 order above).
 *
 * @param R target remainder (safe integer ≥ 0)
 * @param pool coin amounts, every entry a positive safe integer
 * @returns the pick, or `null` when no subset reaches sum ≥ R
 *          (i.e. Σ pool < R — the target simply cannot be paid)
 * @throws RangeError on invalid `R` / `pool` entries
 */
export function dpMinExcess(R: number, pool: readonly number[]): MinExcessPick | null {
	if (!Number.isSafeInteger(R) || R < 0) {
		throw new RangeError(`dpMinExcess: R must be a safe integer ≥ 0, got ${R}`);
	}
	for (let i = 0; i < pool.length; i++) {
		if (!Number.isSafeInteger(pool[i]) || pool[i] < 1) {
			throw new RangeError(`dpMinExcess: pool[${i}] must be a positive safe integer, got ${pool[i]}`);
		}
	}

	const n = pool.length;
	if (R === 0) {
		return { indices: [], amounts: [], sum: 0, exact: true, excess: 0 };
	}

	// dp[k][v] = fewest coins among the first k pool items summing EXACTLY to v
	// (0/1 per item), for v ∈ 0..R; UNREACH if impossible. Sums above R are
	// captured by the per-item overshoot scan below.
	const UNREACH = n + 1;
	const width = R + 1;
	const dp = new Int32Array((n + 1) * width);
	for (let v = 1; v < width; v++) dp[v] = UNREACH; // row 0: only v = 0 reachable

	// Best overshoot candidate: (excess, count) lexicographic — index ties
	// keep the FIRST scan hit (lowest item index, then lowest v), which
	// reconstructs to the lexicographically-first subset. bestItem === -1
	// marks "no candidate at all"; sentinels never collide with real values
	// (real excess ≥ 1 and real count ≤ n).
	let bestExcess = Number.MAX_SAFE_INTEGER;
	let bestCount = Number.MAX_SAFE_INTEGER;
	let bestItem = -1; // 0-based pool index of the crossing (last-added) coin
	let bestPreV = -1; // exact-sum state in row bestItem (before the crossing coin)

	for (let k = 1; k <= n; k++) {
		const c = pool[k - 1];
		const row = k * width;
		const prev = row - width;

		for (let v = 0; v < width; v++) {
			// skip (item k−1 not taken)
			let value = dp[prev + v];
			// take (item k−1) when it fits and strictly helps (0/1 item)
			if (v >= c && dp[prev + v - c] < UNREACH) {
				const taken = dp[prev + v - c] + 1;
				if (taken < value) value = taken;
			}
			dp[row + v] = value;

			// overshoot scan: this coin crosses from an exact-sum state v
			// (sum of earlier coins) past R. Candidates for sums ≥ R come only
			// from such crossings; every overpay subset truncates to one.
			if (v + c > R && dp[prev + v] < UNREACH) {
				const excess = v + c - R;
				const count = dp[prev + v] + 1;
				if (excess < bestExcess || (excess === bestExcess && count < bestCount)) {
					bestExcess = excess;
					bestCount = count;
					bestItem = k - 1;
					bestPreV = v;
				}
			}
		}
	}

	// เกณฑ์ 1: exact hit → subset = reconstruct(dp, n, R)
	if (dp[n * width + R] < UNREACH) {
		const picked = backtrack(dp, width, pool, n, R);
		return { indices: picked, amounts: picked.map((i) => pool[i]), sum: R, exact: true, excess: 0 };
	}

	// เกณฑ์ 2 + 3: no exact → minimal (excess, count) overpay, if one exists
	if (bestItem === -1) return null; // Σ pool < R — cannot pay at all

	const prePicked = backtrack(dp, width, pool, bestItem, bestPreV);
	const indices = [...prePicked, bestItem];
	return {
		indices,
		amounts: indices.map((i) => pool[i]),
		sum: R + bestExcess,
		exact: false,
		excess: bestExcess
	};
}

/** Backtrack a min-count exact-sum path in the dp table, ascending index. */
function backtrack(
	dp: Int32Array,
	width: number,
	pool: readonly number[],
	k: number,
	v: number
): number[] {
	const picked: number[] = [];
	while (k > 0) {
		const skip = dp[(k - 1) * width + v];
		if (skip === dp[k * width + v]) {
			// not taking this item still achieves the optimal count — prefer it
			k--;
			continue;
		}
		// strictly better only through this item → taken
		const c = pool[k - 1];
		picked.push(k - 1);
		k--;
		v -= c;
	}
	// walk collected items high→low index; return ascending
	return picked.reverse();
}

// ─── Public API (ขั้น 1 + ขั้น 2 + ขั้น 3) ───────────────────

/**
 * Select pool coins to pay total `S`:
 * ขั้น 1 denomination-first (one coin per set bit of S), then ขั้น 2 DP
 * min-excess for the remainder. Leftover excess is reported for the caller
 * to swap away (TASK-1303).
 *
 * @param S total to pay (positive safe integer, sats)
 * @param pool spendable coin amounts (positive safe integers)
 * @returns the structured selection result (see `RemainderSelectResult`)
 * @throws RangeError when `S` / `pool` entries are invalid, or when the pool
 *         cannot reach the remainder even by overpay (Σ remaining pool < R)
 */
export function remainderSelect(S: number, pool: readonly number[]): RemainderSelectResult {
	if (!Number.isSafeInteger(S) || S < 1) {
		throw new RangeError(`remainderSelect: S must be a positive safe integer, got ${S}`);
	}
	for (let i = 0; i < pool.length; i++) {
		if (!Number.isSafeInteger(pool[i]) || pool[i] < 1) {
			throw new RangeError(`remainderSelect: pool[${i}] must be a positive safe integer, got ${pool[i]}`);
		}
	}

	// ขั้น 1 — denomination-first: one exact-denomination coin per set bit.
	// Scanned LSB → MSB, so hits come out in ascending denomination order and
	// each bit consumes a single coin even when the pool holds duplicates.
	const used = new Array<boolean>(pool.length).fill(false);
	const denominationHits: number[] = [];
	const denominationHitAmounts: number[] = [];
	let denominationHitSum = 0;
	let remainder = 0;

	const binary = S.toString(2);
	for (let j = binary.length - 1; j >= 0; j--) {
		if (binary[j] !== '1') continue;
		const bit = binary.length - 1 - j;
		const denom = 2 ** bit;
		let hit = -1;
		for (let i = 0; i < pool.length; i++) {
			if (!used[i] && pool[i] === denom) {
				hit = i;
				break;
			}
		}
		if (hit === -1) {
			remainder += denom; // denomination ไม่พอ → บิตไหลลง remainder
		} else {
			used[hit] = true;
			denominationHits.push(hit);
			denominationHitAmounts.push(denom);
			denominationHitSum += denom;
		}
	}

	// ขั้น 2 — DP min-excess over the still-unused pool coins.
	const dpSubset: number[] = [];
	const dpSubsetAmounts: number[] = [];
	let dpSum = 0;
	let mode: RemainderSelectMode = 'exact';
	let excess = 0;

	if (remainder > 0) {
		const remainingIdx: number[] = [];
		for (let i = 0; i < pool.length; i++) if (!used[i]) remainingIdx.push(i);
		const remaining = remainingIdx.map((i) => pool[i]);

		const pick = dpMinExcess(remainder, remaining);
		if (pick === null) {
			throw new RangeError(
				`remainderSelect: pool cannot cover remainder ${remainder} (remaining pool total ${remaining.reduce((a, b) => a + b, 0)} < ${remainder})`
			);
		}
		for (let t = 0; t < pick.indices.length; t++) {
			const globalIdx = remainingIdx[pick.indices[t]];
			dpSubset.push(globalIdx);
			dpSubsetAmounts.push(pick.amounts[t]);
		}
		dpSum = pick.sum;
		mode = pick.exact ? 'exact' : 'excess';
		excess = pick.excess;
	}

	return {
		denominationHits,
		denominationHitAmounts,
		denominationHitSum,
		remainder,
		dpSubset,
		dpSubsetAmounts,
		dpSum,
		mode,
		excess,
		paidTotal: denominationHitSum + dpSum
	};
}
