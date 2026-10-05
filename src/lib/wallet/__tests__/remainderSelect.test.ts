/**
 * TASK-1302 tests: remainderSelect (denomination-first + DP min-excess).
 *
 * Locks:
 *  - Golden 4 on the DP min-excess core (per-coin, exact-ordered):
 *      R=3 [8,2,2,1] → [2,1] (เกณฑ์ 1)
 *      R=6 [8,4,2]   → [4,2] (เกณฑ์ 1 — exact ชนะ [8] excess 2)
 *      R=9 [8,4,2,2,1] → [8,1] (เกณฑ์ 3 — exact 2 ทาง ก้อนน้อยชนะ)
 *      R=7 [8,4]     → [8]   (เกณฑ์ 2 — excess 1)
 *  - เคสขั้น 1: กินหมด (R=0) / กินบางส่วน + DP เก็บตก /
 *    denomination ไม่พอบิตไหลลง remainder / denomination ซ้ำ (ก้อนเดียวต่อบิต) /
 *    DP รองรับก้อนค่าซ้ำใน pool.
 */
import { describe, it, expect } from 'vitest';
import { remainderSelect, dpMinExcess } from '../remainderSelect';
import type { RemainderSelectResult } from '../remainderSelect';

// ─── Test helpers ────────────────────────────────────────────

/** Structural invariants every remainderSelect result must hold. */
function invariants(S: number, pool: readonly number[], r: RemainderSelectResult): void {
	const used = new Set([...r.denominationHits, ...r.dpSubset]);
	expect(used.size).toBe(r.denominationHits.length + r.dpSubset.length); // disjoint
	expect(Math.max(-1, ...used)).toBeLessThan(pool.length);
	expect(r.denominationHitAmounts).toEqual(r.denominationHits.map((i) => pool[i]));
	expect(r.dpSubsetAmounts).toEqual(r.dpSubset.map((i) => pool[i]));
	expect(r.denominationHitSum).toBe(r.denominationHitAmounts.reduce((a, b) => a + b, 0));
	expect(r.dpSum).toBe(r.dpSubsetAmounts.reduce((a, b) => a + b, 0));
	expect(r.remainder).toBe(S - r.denominationHitSum);
	expect(r.paidTotal).toBe(r.denominationHitSum + r.dpSum);
	if (r.mode === 'exact') {
		expect(r.excess).toBe(0);
		expect(r.dpSum).toBe(r.remainder);
	} else {
		expect(r.excess).toBeGreaterThan(0);
		expect(r.dpSum).toBe(r.remainder + r.excess);
	}
}

// ─── Golden 4 (DP min-excess core) ───────────────────────────

describe('TASK-1302: dpMinExcess golden 4 (ตรงเป๊ะ)', () => {
	it('เกณฑ์ 1: R=3 pool [8,2,2,1] → [2,1] exact', () => {
		const pick = dpMinExcess(3, [8, 2, 2, 1]);
		expect(pick).not.toBeNull();
		expect(pick!.amounts).toEqual([2, 1]);
		expect(pick!.indices).toEqual([1, 3]);
		expect(pick!.exact).toBe(true);
		expect(pick!.excess).toBe(0);
		expect(pick!.sum).toBe(3);
	});

	it('เกณฑ์ 1: R=6 pool [8,4,2] → [4,2] (exact ชนะ [8] excess 2)', () => {
		const pick = dpMinExcess(6, [8, 4, 2]);
		expect(pick).not.toBeNull();
		expect(pick!.amounts).toEqual([4, 2]);
		expect(pick!.exact).toBe(true);
		expect(pick!.excess).toBe(0);
	});

	it('เกณฑ์ 3: R=9 pool [8,4,2,2,1] → [8,1] (exact 2 ทาง ก้อนน้อยชนะ)', () => {
		const pick = dpMinExcess(9, [8, 4, 2, 2, 1]);
		expect(pick).not.toBeNull();
		expect(pick!.amounts).toEqual([8, 1]);
		expect(pick!.indices).toEqual([0, 4]);
		expect(pick!.exact).toBe(true);
		expect(pick!.excess).toBe(0);
	});

	it('เกณฑ์ 2: R=7 pool [8,4] → [8] (excess 1)', () => {
		const pick = dpMinExcess(7, [8, 4]);
		expect(pick).not.toBeNull();
		expect(pick!.amounts).toEqual([8]);
		expect(pick!.exact).toBe(false);
		expect(pick!.excess).toBe(1);
		expect(pick!.sum).toBe(8);
	});

	it('DP core รองรับก้อนค่าซ้ำใน pool (แต่ละก้อน 0/1)', () => {
		const pick = dpMinExcess(4, [2, 2]);
		expect(pick).not.toBeNull();
		expect(pick!.amounts).toEqual([2, 2]);
		expect(pick!.exact).toBe(true);
	});

	it('R=0 → exact pick ว่าง', () => {
		const pick = dpMinExcess(0, [8, 4, 2]);
		expect(pick).not.toBeNull();
		expect(pick!.exact).toBe(true);
		expect(pick!.amounts).toEqual([]);
		expect(pick!.excess).toBe(0);
	});

	it('Σ pool < R (overpay ก็ไม่ถึง) → null', () => {
		expect(dpMinExcess(5, [2, 2])).toBeNull();
		expect(dpMinExcess(4, [])).toBeNull();
	});

	it('dpMinExcess ตรวจ input: R ติดลบ / pool มีก้อน ≤ 0 / ไม่ใช่ int', () => {
		expect(() => dpMinExcess(-1, [2])).toThrow(RangeError);
		expect(() => dpMinExcess(1, [0])).toThrow(RangeError);
		expect(() => dpMinExcess(1, [-2])).toThrow(RangeError);
		expect(() => dpMinExcess(1, [1.5])).toThrow(RangeError);
	});
});

// ─── เคสขั้น 1 (remainderSelect full flow) ───────────────────

describe('TASK-1302: remainderSelect ขั้น 1 — denomination-first', () => {
	it('ขั้น 1 กินหมด (R=0) → exact, DP ไม่ต้องทำงาน', () => {
		const r = remainderSelect(5, [4, 1]);
		invariants(5, [4, 1], r);
		expect(r.mode).toBe('exact');
		expect(r.excess).toBe(0);
		expect(r.remainder).toBe(0);
		expect(r.denominationHits).toEqual([1, 0]); // LSB→MSB: 1 ก่อน 4
		expect(r.denominationHitAmounts).toEqual([1, 4]);
		expect(r.dpSubset).toEqual([]);
		expect(r.paidTotal).toBe(5);
	});

	it('กินบางส่วน + DP เก็บตก → mode excess', () => {
		// S=10 = 1010₂: บิต 8 → hit, บิต 2 → ไม่มีก้อน 2 ไหลลง R=2 → DP ยืมก้อน 3 (excess 1)
		const r = remainderSelect(10, [8, 3]);
		invariants(10, [8, 3], r);
		expect(r.mode).toBe('excess');
		expect(r.excess).toBe(1);
		expect(r.denominationHits).toEqual([0]);
		expect(r.remainder).toBe(2);
		expect(r.dpSubset).toEqual([1]);
		expect(r.dpSubsetAmounts).toEqual([3]);
		expect(r.dpSum).toBe(3);
		expect(r.paidTotal).toBe(11);
	});

	it('denomination ไม่พอบางบิตไหลลง remainder แล้ว pool ที่เหลือยังไปไม่ถึง → RangeError', () => {
		// S=10 = 1010₂: บิต 8 hit, บิต 2 ไหลลง R=2 → pool เหลือว่าง จ่ายไม่ถึงแม้ overpay
		expect(() => remainderSelect(10, [8])).toThrow(RangeError);
	});

	it('pool มี denomination ซ้ำ → หยิบก้อนเดียวต่อบิต', () => {
		// S=5 = 101₂: บิต denom 1,4; pool [4,4,1] → หยิบ 4 ก้อนเดียว อีกก้อนตกค้าง
		const r = remainderSelect(5, [4, 4, 1]);
		invariants(5, [4, 4, 1], r);
		expect(r.mode).toBe('exact');
		expect(r.excess).toBe(0);
		expect(r.remainder).toBe(0);
		expect(r.denominationHits).toEqual([2, 0]); // บิต denom 1 → idx2, บิต denom 4 → idx0
		expect(r.dpSubset).toEqual([]);
		expect(r.paidTotal).toBe(5);
	});

	it('DP รองรับก้อนค่าซ้ำใน pool หลังขั้น 1 (exact {2,6})', () => {
		// S=10 = 1010₂: บิต denom 2 → hit idx0, บิต denom 8 → ไม่มีก้อน 8 → R=8;
		// pool เหลือ [2(idx1), 6(idx2)] → DP exact 2+6=8 (ก้อนค่าซ้ำ 2 ยังใช้ได้ใน DP)
		const r = remainderSelect(10, [2, 2, 6]);
		invariants(10, [2, 2, 6], r);
		expect(r.mode).toBe('exact');
		expect(r.excess).toBe(0);
		expect(r.denominationHits).toEqual([0]);
		expect(r.remainder).toBe(8);
		expect(r.dpSubset).toEqual([1, 2]);
		expect(r.dpSubsetAmounts).toEqual([2, 6]);
		expect(r.paidTotal).toBe(10);
	});

	it('ขั้น 1 กินก้อนแล้ว DP ใช้เฉพาะก้อนที่เหลือ (S=7 pool [8,4])', () => {
		// บิต 4 → hit, R=3 จาก [8] เดี่ยว → เกณฑ์ 2: [8] excess 5 (golden DP-core R=7 e=1
		// ใช้ pool เต็ม — ที่นี่ 4 ถูกขั้น 1 กินไปก่อน จึงยืม 8 แทน)
		const r = remainderSelect(7, [8, 4]);
		invariants(7, [8, 4], r);
		expect(r.mode).toBe('excess');
		expect(r.excess).toBe(5);
		expect(r.denominationHits).toEqual([1]);
		expect(r.dpSubset).toEqual([0]);
		expect(r.paidTotal).toBe(12);
	});
});

// ─── Hybrid + hygiene ────────────────────────────────────────

describe('TASK-1302: remainderSelect เคสผสม + hygiene', () => {
	it('S ผสม → ขั้น 1 กินครบทุกบิต exact (hits เรียง denominator ขึ้น)', () => {
		// S=44 = 101100₂: บิต denom 4, 8, 32; pool [32, 8, 4] → hit ครบ ครบบิต R=0
		const r = remainderSelect(44, [32, 8, 4]);
		invariants(44, [32, 8, 4], r);
		expect(r.mode).toBe('exact');
		expect(r.remainder).toBe(0);
		expect(r.denominationHits).toEqual([2, 1, 0]); // LSB→MSB: 4, 8, 32
		expect(r.denominationHitAmounts).toEqual([4, 8, 32]);
		expect(r.dpSubset).toEqual([]);
	});

	it('remainderSelect deterministic: ซ้ำเท่าเดิมทุกครั้ง', () => {
		const r1 = remainderSelect(10, [8, 3]);
		const r2 = remainderSelect(10, [8, 3]);
		expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
	});

	it('remainderSelect ตรวจ input: S ≤ 0 / ไม่ใช่ int / pool ก้อนกาก', () => {
		expect(() => remainderSelect(0, [1])).toThrow(RangeError);
		expect(() => remainderSelect(-5, [1])).toThrow(RangeError);
		expect(() => remainderSelect(2.5, [1])).toThrow(RangeError);
		expect(() => remainderSelect(5, [0])).toThrow(RangeError);
		expect(() => remainderSelect(5, [1, -2])).toThrow(RangeError);
		expect(() => remainderSelect(5, [1, 2.5])).toThrow(RangeError);
	});
});
