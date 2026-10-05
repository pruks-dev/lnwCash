/**
 * TASK-1301 tests: completeSet composition.
 *
 * Locks:
 *  - Golden 15 (per-coin, exact-ordered) — Commander locked table, ห้ามเดา.
 *  - Coin counts 63→6 / 96→13 / 100→16.
 *  - DP coverage property: subset-sum of the output pays every amount 1..S
 *    using each coin at most once.
 *  - Every coin is a power of 2, and the coins sum back to S.
 *  - Deterministic sweep S = 1..256 (pow2-only + sum + coverage).
 */
import { describe, it, expect } from 'vitest';
import { completeSet } from '../completeSet';

// ─── Test helpers ────────────────────────────────────────────

/** True when `v` is a positive power of 2 (v = 2^k, k ≥ 0). */
function isPow2(v: number): boolean {
	return Number.isSafeInteger(v) && v >= 1 && (v & (v - 1)) === 0;
}

/**
 * Subset-sum reachability DP over a coin multiset (each coin usable at most
 * once) — returns which values in 0..S are exactly payable.
 */
function subsetPayable(coins: readonly number[], S: number): boolean[] {
	const reach = new Array<boolean>(S + 1).fill(false);
	reach[0] = true;
	for (const coin of coins) {
		for (let v = S; v >= coin; v--) {
			if (reach[v - coin]) reach[v] = true;
		}
	}
	return reach;
}

/** Full coverage + pow2 + sum-check shared by golden 15 and the sweep. */
function assertCompleteSet(S: number): number[] {
	const out = completeSet(S);
	expect(out.every(isPow2)).toBe(true);
	expect(out.reduce((a, b) => a + b, 0)).toBe(S);
	const reach = subsetPayable(out, S);
	for (let v = 1; v <= S; v++) {
		expect(reach[v], `coverage failed for S=${S}: value ${v} not payable`).toBe(true);
	}
	return out;
}

// ─── Golden 15 ───────────────────────────────────────────────

const GOLDEN_15: ReadonlyArray<readonly [number, readonly number[]]> = [
	[1, [1]],
	[2, [1, 1]],
	[3, [1, 2]],
	[4, [1, 1, 2]],
	[5, [1, 1, 2, 1]],
	[6, [1, 1, 2, 1, 1]],
	[7, [1, 2, 4]],
	[31, [1, 2, 4, 8, 16]],
	[32, [1, 1, 2, 4, 8, 16]],
	[33, [1, 1, 2, 4, 8, 16, 1]],
	[47, [1, 1, 2, 4, 8, 16, 1, 2, 4, 8]],
	[63, [1, 2, 4, 8, 16, 32]],
	[64, [1, 1, 2, 4, 8, 16, 32]],
	[
		96,
		[1, 1, 2, 4, 8, 16, 32, 1, 1, 2, 4, 8, 16]
	],
	[
		100,
		[1, 1, 2, 4, 8, 16, 32, 1, 1, 2, 4, 8, 16, 1, 1, 2]
	]
];

describe('TASK-1301: completeSet golden 15 (ตรงเป๊ะรายก้อน)', () => {
	it('matches every golden entry, per coin, in exact order', () => {
		for (const [S, expected] of GOLDEN_15) {
			expect(completeSet(S), `completeSet(${S})`).toEqual([...expected]);
		}
	});
});

describe('TASK-1301: completeSet locked coin counts', () => {
	it('63 → 6 ก้อน', () => {
		expect(completeSet(63)).toHaveLength(6);
	});
	it('96 → 13 ก้อน', () => {
		expect(completeSet(96)).toHaveLength(13);
	});
	it('100 → 16 ก้อน', () => {
		expect(completeSet(100)).toHaveLength(16);
	});
});

describe('TASK-1301: completeSet golden coverage + invariants', () => {
	it('golden 15 bodies also satisfy pow2 + sum == S + full 1..S coverage', () => {
		for (const [S] of GOLDEN_15) {
			assertCompleteSet(S);
		}
	});
});

describe('TASK-1301: completeSet property sweep S = 1..256', () => {
	it('pow2-only + sum == S + subset-sum coverage 1..S for every S', () => {
		for (let S = 1; S <= 256; S++) {
			assertCompleteSet(S);
		}
	});

	it('is deterministic: same S → identical output on repeated calls', () => {
		for (let S = 1; S <= 64; S++) {
			expect(completeSet(S)).toEqual(completeSet(S));
		}
	});
});

describe('TASK-1301: completeSet input validation', () => {
	it('rejects non-positive / non-integer / unsafe inputs', () => {
		for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => completeSet(bad)).toThrow(RangeError);
		}
	});
});
