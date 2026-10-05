/**
 * TASK-1301 (INTENT-013): complete-set decomposition — pure, deterministic, no I/O.
 *
 * `completeSet(S)` splits a target amount `S` into power-of-2 denominations so
 * that the result can pay every amount `1..S` exactly with a subset of the
 * returned coins (each coin used at most once).
 *
 * Algorithm (Commander pseudo rev2):
 *   1. Write `S` in binary.
 *   2. MSB = 2^n → the largest denomination present.
 *   3. If any bit below the MSB is `0`, break the MSB down:
 *      2^n = 1 + decompose(2^n − 1)
 *      (2^n − 1 is all-ones `111…1₂` → plain pow2 chain [1, 2, …, 2^(n−1)]).
 *   4. The remaining part (S − 2^n) is decomposed recursively.
 *   5. Base cases:
 *      - S = 1                    → [1]
 *      - S = 2^n − 1 (all ones)   → plain pow2 chain [1, 2, …, 2^(n−1)]
 *
 * Note (ruling_4): S = 2^n exactly (only zeros below the MSB) bursts through
 * rule 3 — no separate force-burst code path and no DFS/BnB search:
 *   completeSet(2^n) = [1] + [1, 2, …, 2^(n−1)].
 *
 * Examples (golden 15, locked):
 *   1 → [1]                    3 → [1,2]
 *   2 → [1,1]                  4 → [1,1,2]
 *   5 → [1,1,2,1]              6 → [1,1,2,1,1]
 *   7 → [1,2,4]                31 → [1,2,4,8,16]
 *   32 → [1,1,2,4,8,16]        33 → [1,1,2,4,8,16,1]
 *   47 → [1,1,2,4,8,16,1,2,4,8]                  63 → [1,2,4,8,16,32]
 *   64 → [1,1,2,4,8,16,32]                       96 → 13 coins, 100 → 16 coins
 */

// ─── Public API ──────────────────────────────────────────────

/**
 * Decompose `S` into power-of-2 denominations that together pay every
 * amount `1..S` exactly (full subset-sum coverage).
 *
 * Deterministic: the same `S` always yields the same, exact-ordered array
 * (MSB burst part first, then the recursive remainder, chains ascending).
 *
 * @param S target amount (positive safe integer ≥ 1, in sats)
 * @returns ordered array of power-of-2 amounts whose sum equals `S`
 * @throws RangeError when `S` is not a positive safe integer
 */
export function completeSet(S: number): number[] {
	if (!Number.isSafeInteger(S) || S < 1) {
		throw new RangeError(`completeSet: S must be a positive safe integer, got ${S}`);
	}
	return decompose(S);
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Recursive core. Shared by `completeSet` and itself; accepts `0` for the
 * "MSB consumed all of S" case.
 */
function decompose(S: number): number[] {
	if (S === 0) return [];

	const binary = S.toString(2);
	const len = binary.length; // MSB exponent + 1

	// เคสพื้น 2: S = 2^n − 1 (บิตใต้ MSB ไม่มี 0 เลย → all-ones)
	// → pow2 ธรรมดา [1, 2, 4, …, 2^(len−1)] (len ก้อน)
	if (!binary.slice(1).includes('0')) {
		return pow2Chain(len);
	}

	// มีบิต 0 ต่ำกว่า MSB → แตก MSB (rule 3):
	//   2^(len−1) = 1 + pow2Chain(len − 1)   (decompose(2^(len−1) − 1))
	const msb = 2 ** (len - 1);
	const burst = [1, ...pow2Chain(len - 1)];

	// ส่วนที่เหลือ (S − MSB) → recursive decompose ต่อ (rule 4)
	return [...burst, ...decompose(S - msb)];
}

/** Strictly ascending power-of-2 chain `[1, 2, 4, …, 2^(count−1)]`. */
function pow2Chain(count: number): number[] {
	const out = new Array<number>(count);
	for (let e = 0; e < count; e++) out[e] = 2 ** e;
	return out;
}
