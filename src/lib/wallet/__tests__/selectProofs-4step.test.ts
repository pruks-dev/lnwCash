/**
 * TASK-1303 (INTENT-013): selectProofs 4-step ladder tests.
 *
 * ขั้น 1 exact-single (เดิม) → ขั้น 2 denomination-first (re-use TASK-1302)
 * → ขั้น 3 DP min-excess remainder (re-use TASK-1302) → ขั้น 4 greedy fallback
 * (โค้ดเดิม :41-61 คงเป็นชั้นท้าย).
 *
 * ชุดที่ envelope กำหนด:
 *  (1) exact subset → ไม่ swap ไม่มี change (sum เท่า amount เป๊ะ — excess = 0)
 *  (2) ไม่มี subset → greedy fallback ได้ผลเดิม (เทียบ reference greedy เดิม)
 *  (3) DP remainder เลือกตามเกณฑ์ 1-2-3
 *  (6) melt path ผ่าน call เดียวกัน (pattern melt.ts:285 / :351 — NUT-08 blank
 *      เทสเดิมคงเดิม — พิสูจน์ที่ suite ใหญ่)
 */
import { describe, it, expect } from 'vitest';
import { selectProofs, sumProofs } from '../proofs';
import type { StoredProof } from '../proofsDb';
import { ProofSelectionError } from '../errors';

let seq = 0;
function makeProof(amount: number, spent = false): StoredProof {
	seq += 1;
	return {
		local_id: `t1303-${seq}`,
		id: 'keyset-1',
		amount,
		secret: `secret-t1303-${seq}`,
		C: `sig-t1303-${seq}`,
		mint_url: 'https://mint.example.com',
		keyset_id: 'keyset-1',
		stored_at: Date.now(),
		spent
	};
}

/** Reference implementation of the OLD greedy (:41-61) — verbatim semantics,
 *  used to prove the fallback layer reproduces old results. */
function legacyGreedy(proofs: StoredProof[], amount: number): StoredProof[] {
	const unspent = proofs.filter(p => !p.spent);
	const sorted = [...unspent].sort((a, b) => b.amount - a.amount);
	let selected: StoredProof[] = [];
	let accumulated = 0;
	for (const proof of sorted) {
		selected.push(proof);
		accumulated += proof.amount;
		if (accumulated >= amount) break;
	}
	if (accumulated >= amount) {
		if (selected.length > 1) {
			const last = selected[selected.length - 1];
			if (accumulated - last.amount >= amount) selected.pop();
		}
		return selected;
	}
	return selected;
}

const sortedAmounts = (ps: StoredProof[]) => ps.map(p => p.amount).sort((a, b) => a - b);

// ─── ขั้น 1 — exact-single (คงเดิม) ──────────────────────────

describe('TASK-1303: selectProofs ขั้น 1 — exact-single คงเดิม', () => {
	it('ก้อนเดียวเท่า amount → หยิบก้อนนั้นทันที', () => {
		const proofs = [makeProof(8), makeProof(16), makeProof(32)];
		const result = selectProofs(proofs, 16);
		expect(result.length).toBe(1);
		expect(result[0].amount).toBe(16);
	});

	it('amount ≤ 0 / เงินไม่พอ → ProofSelectionError (contract เดิม)', () => {
		const proofs = [makeProof(8)];
		expect(() => selectProofs(proofs, 0)).toThrow(ProofSelectionError);
		expect(() => selectProofs(proofs, 9)).toThrow(ProofSelectionError);
	});
});

// ─── ชุด (1) exact subset → ไม่ swap ไม่มี change ────────────

describe('TASK-1303 ชุด (1): exact subset → sum == amount (excess = 0)', () => {
	it('6 = 4+2 — denomination-first จบในตัว', () => {
		const proofs = [makeProof(1), makeProof(2), makeProof(4), makeProof(8)];
		const result = selectProofs(proofs, 6);
		expect(sumProofs(result)).toBe(6); // excess = 0 → call site ไม่เข้า swap path
		expect(sortedAmounts(result)).toEqual([2, 4]);
	});

	it('3 = 2+1 จากกอง [8,2,2,1]', () => {
		const proofs = [makeProof(8), makeProof(2), makeProof(2), makeProof(1)];
		const result = selectProofs(proofs, 3);
		expect(sumProofs(result)).toBe(3);
		expect(sortedAmounts(result)).toEqual([1, 2]);
	});

	it('31 = 16+8+4+2+1 (all-ones → ขั้น 1 กินครบทุกบิต)', () => {
		const proofs = [makeProof(16), makeProof(8), makeProof(4), makeProof(2), makeProof(1)];
		const result = selectProofs(proofs, 31);
		expect(sumProofs(result)).toBe(31);
		expect(result.length).toBe(5);
	});

	it('5 = 1 + DP-exact {2,2} — remainder เกณฑ์ 1 ก็ได้ excess = 0', () => {
		const proofs = [makeProof(2), makeProof(2), makeProof(1)];
		const result = selectProofs(proofs, 5);
		expect(sumProofs(result)).toBe(5); // บิต 4 ไม่มีก้อน → DP จ่าย 4 ตรงจาก {2,2}
		expect(sortedAmounts(result)).toEqual([1, 2, 2]);
	});

	it('ก้อน spent ไม่ถูกหยิบ (exact subset ต้องมาจากก้อน unspent)', () => {
		// pool unspent = [4,8,2] → 6 = 110₂: hit 4 + hit 2 → exact [4,2]
		const proofs = [makeProof(2, true), makeProof(4), makeProof(8), makeProof(2)];
		const result = selectProofs(proofs, 6);
		expect(sumProofs(result)).toBe(6);
		expect(result.every(p => !p.spent)).toBe(true);
		expect(sortedAmounts(result)).toEqual([2, 4]);
	});
});

// ─── ชุด (2) ไม่มี subset → greedy fallback ได้ผลเดิม ────────

describe('TASK-1303 ชุด (2): ไม่มี subset → fallback ได้ผลเดิม', () => {
	it('กอง [8] จ่าย 5 (ไม่มี exact subset) → [8] เท่า greedy เดิม', () => {
		const proofs = [makeProof(8)];
		const result = selectProofs(proofs, 5);
		const old = legacyGreedy(proofs, 5);
		expect(sortedAmounts(result)).toEqual(sortedAmounts(old)); // [8]
		expect(sumProofs(result)).toBeGreaterThanOrEqual(5);
	});

	it('กอง [8,8] จ่าย 5 → [8] เท่า greedy เดิม (ก้อนเดียวพอ)', () => {
		const proofs = [makeProof(8), makeProof(8)];
		const result = selectProofs(proofs, 5);
		const old = legacyGreedy(proofs, 5);
		expect(sortedAmounts(result)).toEqual(sortedAmounts(old)); // [8]
		expect(result.length).toBe(1);
	});

	it('ขั้น 4 (greedy เดิม) ยังทำงานจริงเมื่อขั้น 2+3 หาทางไม่เจอ — defensive path', () => {
		// amount ไม่ใช่ safe integer → remainderSelect โยน RangeError → ตกชั้น greedy
		const proofs = [makeProof(8)];
		const result = selectProofs(proofs, 5.5);
		const old = legacyGreedy(proofs, 5.5);
		expect(sortedAmounts(result)).toEqual(sortedAmounts(old)); // [8]
		expect(sumProofs(result)).toBeGreaterThanOrEqual(5.5);
	});

	it('กองไม่มีทางพอ (Σ < amount) → ProofSelectionError เหมือนเดิม', () => {
		const proofs = [makeProof(2), makeProof(2)];
		expect(() => selectProofs(proofs, 5)).toThrow(ProofSelectionError);
	});
});

// ─── ชุด (3) DP remainder เกณฑ์ 1-2-3 ────────────────────────

describe('TASK-1303 ชุด (3): DP remainder เกณฑ์ 1-2-3', () => {
	it('เกณฑ์ 1: remainder exact — 5 จาก [2,2,1] → {2,2} จ่าย 4 ตรง', () => {
		const proofs = [makeProof(2), makeProof(2), makeProof(1)];
		const result = selectProofs(proofs, 5);
		expect(sumProofs(result)).toBe(5); // excess = 0
		expect(sortedAmounts(result)).toEqual([1, 2, 2]);
	});

	it('เกณฑ์ 2: ไม่ exact → excess น้อยสุด — 10 จาก [8,3] (golden TASK-1302)', () => {
		// บิต 8 hit, บิต 2 ไม่มี → R=2 → DP ยืม 3 (excess 1) — ทางเดียวที่ถึง
		const proofs = [makeProof(8), makeProof(3)];
		const result = selectProofs(proofs, 10);
		expect(sortedAmounts(result)).toEqual([3, 8]);
		expect(sumProofs(result)).toBe(11); // excess = 1 → caller เข้า swap path เดิม
	});

	it('เกณฑ์ 3: exact ซ้อน → จำนวนก้อนน้อยสุด — 4 จาก [3,2,1,1] → {3,1} ชนะ {2,1,1}', () => {
		const proofs = [makeProof(3), makeProof(2), makeProof(1), makeProof(1)];
		const result = selectProofs(proofs, 4);
		expect(sumProofs(result)).toBe(4); // exact
		expect(result.length).toBe(2); // {3,1} — ไม่เอา {2,1,1} (3 ก้อน)
		expect(sortedAmounts(result)).toEqual([1, 3]);
	});

	it('deterministic: pool เดิม amount เดิม → ผลเดิมทุกครั้ง', () => {
		const build = () => [makeProof(8), makeProof(3)];
		const a = selectProofs(build(), 10).map(p => p.amount);
		const b = selectProofs(build(), 10).map(p => p.amount);
		expect(a).toEqual(b);
	});
});

// ─── ชุด (6) melt path ผ่าน call เดียวกัน ────────────────────

describe('TASK-1303 ชุด (6): melt path ผ่าน selectProofs call เดียวกัน', () => {
	it('melt.ts:285 pattern — amount 30 จากกอง [32] → [32] (1 input)', () => {
		const proofs = [makeProof(32)];
		const result = selectProofs(proofs, 30);
		expect(sortedAmounts(result)).toEqual([32]);
		expect(sumProofs(result)).toBeGreaterThanOrEqual(30);
	});

	it('melt.ts:351 pattern — reselect ด้วย amount + fee_reserve: 55+1 จาก [32,16,8] → exact [32,16,8]', () => {
		const proofs = [makeProof(32), makeProof(16), makeProof(8)];
		const result = selectProofs(proofs, 56);
		// 56 = 111000₂ — ขั้น 1 (denomination-first) กินครบ → 3 inputs, excess = 0
		expect(sortedAmounts(result)).toEqual([8, 16, 32]);
		expect(sumProofs(result)).toBe(56);
	});

	it('melt C05-05 golden (amount 55 จาก [32,16,8]) → 3 inputs เท่า greedy เดิม', () => {
		// เคสนี้ล็อกพฤติกรรม melt.test.ts 'calculatedFee = 3 × ppk' ให้คงเดิม
		const proofs = [makeProof(32), makeProof(16), makeProof(8)];
		const result = selectProofs(proofs, 55);
		const old = legacyGreedy(proofs, 55);
		expect(sortedAmounts(result)).toEqual(sortedAmounts(old)); // [8,16,32]
		expect(result.length).toBe(3);
		expect(sumProofs(result)).toBe(56);
	});

	it('fee ทำให้เงินไม่พอ → ProofSelectionError (melt abort path คงเดิม)', () => {
		const proofs = [makeProof(32), makeProof(16)];
		expect(() => selectProofs(proofs, 56)).toThrow(ProofSelectionError);
	});
});
