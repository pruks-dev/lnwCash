/**
 * TASK-1303 (INTENT-013): normalizeToCompleteSet + AUTO MODE infra tests.
 *
 * ชุดที่ envelope กำหนด:
 *  (4) zero-swap short-circuit — กองอยู่ในสภาพ complete-set ของ sum ตัวเอง
 *      แล้ว → skip swap ทันที (เทียบ multiset กับ completeSet จาก TASK-1301)
 *  (5) debounce ทำงาน — T1/T2 ยิงถี่ภายใน ~2s → รันครั้งเดียว · T3 กลับ
 *      online เคลียร์ pending-normalize ทันที
 *
 * T4 force-normalize-after-send ยกเลิก (ruling_2) — ไม่มี hook ในโค้ด.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	normalizeToCompleteSet,
	AUTO_NORMALIZE_DEBOUNCE_MS,
	autoNormalizeAfterReceiveOnline,
	autoNormalizeAfterCompleteMint,
	autoNormalizeOnBackOnline,
	runAutoNormalizeNow,
	isAutoNormalizePending,
	isAutoNormalizeRunning,
	cancelAutoNormalize
} from '../proofs';
import type { SwapFn, AutoNormalizeDeps } from '../proofs';
import type { StoredProof } from '../proofsDb';

let seq = 0;
function makeProof(amount: number): StoredProof {
	seq += 1;
	return {
		local_id: `n1303-${seq}`,
		id: 'keyset-1',
		amount,
		secret: `secret-n1303-${seq}`,
		C: `sig-n1303-${seq}`,
		mint_url: 'https://mint.example.com',
		keyset_id: 'keyset-1',
		stored_at: Date.now(),
		spent: false
	};
}

/** swapFn จำลอง NUT-03: คืนก้อนใหม่ตาม outputs — บันทึก call ไว้ตรวจ */
function makeSwapFn() {
	const calls: { proofs: StoredProof[]; outputs: number[] }[] = [];
	const fn: SwapFn = async (proofs, outputs) => {
		calls.push({ proofs, outputs });
		return outputs.map(a => makeProof(a));
	};
	return { fn, calls };
}

function makeDeps(pile: StoredProof[], swap = makeSwapFn()) {
	const onSettle = vi.fn();
	const deps: AutoNormalizeDeps = {
		getProofs: () => pile,
		swapFn: swap.fn,
		onSettle
	};
	return { deps, onSettle, swap };
}

// ─── ชุด (4) zero-swap short-circuit ─────────────────────────

describe('TASK-1303 ชุด (4): zero-swap short-circuit', () => {
	it('กอง [1,2,4] (sum 7) ≡ completeSet(7) → skip swap ทันที', async () => {
		const { fn, calls } = makeSwapFn();
		const pile = [makeProof(1), makeProof(2), makeProof(4)];
		const result = await normalizeToCompleteSet(pile, fn);
		expect(calls.length).toBe(0); // swapFn ไม่โดนเรียกเลย
		expect(result.swapped).toBe(false);
		expect(result.zeroSwap).toBe(true);
		expect(result.sum).toBe(7);
		expect(result.target).toEqual([1, 2, 4]);
		expect(result.proofs).toBe(pile); // คืนกองเดิม ไม่แตะ
	});

	it('เทียบแบบ multiset (order-free): [4,1,2] ก็ zero-swap', async () => {
		const { fn, calls } = makeSwapFn();
		const result = await normalizeToCompleteSet(
			[makeProof(4), makeProof(1), makeProof(2)],
			fn
		);
		expect(calls.length).toBe(0);
		expect(result.zeroSwap).toBe(true);
	});

	it('completeSet แบบ burst: [1,1,2,4] (sum 8) → zero-swap', async () => {
		const { fn, calls } = makeSwapFn();
		const result = await normalizeToCompleteSet(
			[makeProof(1), makeProof(1), makeProof(2), makeProof(4)],
			fn
		);
		expect(calls.length).toBe(0);
		expect(result.zeroSwap).toBe(true);
		expect(result.target).toEqual([1, 1, 2, 4]);
	});

	it('ก้อนเดียว [1] ≡ completeSet(1) → zero-swap', async () => {
		const { fn, calls } = makeSwapFn();
		const result = await normalizeToCompleteSet([makeProof(1)], fn);
		expect(calls.length).toBe(0);
		expect(result.zeroSwap).toBe(true);
	});

	it('กอง [8] (sum 8) ไม่ใช่ completeSet → swap ถูกเรียก 1 ครั้ง ด้วย outputs [1,1,2,4]', async () => {
		const { fn, calls } = makeSwapFn();
		const pile = [makeProof(8)];
		const result = await normalizeToCompleteSet(pile, fn);
		expect(calls.length).toBe(1);
		expect(calls[0].proofs).toBe(pile);
		expect(calls[0].outputs).toEqual([1, 1, 2, 4]); // completeSet(8) จาก TASK-1301
		expect(result.swapped).toBe(true);
		expect(result.zeroSwap).toBe(false);
		expect(result.proofs.map(p => p.amount)).toEqual([1, 1, 2, 4]);
	});

	it('กองว่าง → ไม่ swap (sum 0, target [])', async () => {
		const { fn, calls } = makeSwapFn();
		const result = await normalizeToCompleteSet([], fn);
		expect(calls.length).toBe(0);
		expect(result.swapped).toBe(false);
		expect(result.zeroSwap).toBe(true);
		expect(result.sum).toBe(0);
		expect(result.target).toEqual([]);
	});

	it('pure-orchestrator: swapFn throw → error ไหลผ่านโดยตรง', async () => {
		const boom: SwapFn = async () => {
			throw new Error('mint down');
		};
		await expect(normalizeToCompleteSet([makeProof(8)], boom)).rejects.toThrow('mint down');
	});
});

// ─── ชุด (5) AUTO MODE debounce (T1/T2/T3) ───────────────────

describe('TASK-1303 ชุด (5): AUTO MODE debounce + hook points', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		cancelAutoNormalize();
		vi.useRealTimers();
	});

	it('AUTO_NORMALIZE_DEBOUNCE_MS = 2000 (ruling_2 ~2s)', () => {
		expect(AUTO_NORMALIZE_DEBOUNCE_MS).toBe(2000);
	});

	it('T1+T2 ยิงถี่ใน window เดียว → debounce รวมเป็นการรันครั้งเดียว', async () => {
		const { deps, swap, onSettle } = makeDeps([makeProof(8)]);
		autoNormalizeAfterReceiveOnline(deps); // T1
		expect(isAutoNormalizePending()).toBe(true);
		await vi.advanceTimersByTimeAsync(1200);
		autoNormalizeAfterCompleteMint(deps); // T2 ก่อนครบ window → reset timer
		await vi.advanceTimersByTimeAsync(1200);
		expect(swap.calls.length).toBe(0); // ยังไม่ครบ 2s นับจาก T2
		await vi.advanceTimersByTimeAsync(800); // ครบ 2s หลัง T2
		expect(swap.calls.length).toBe(1); // รันครั้งเดียว
		expect(isAutoNormalizePending()).toBe(false);
		expect(onSettle).toHaveBeenCalledTimes(1);
		expect(onSettle.mock.calls[0][0]?.swapped).toBe(true);
		expect(onSettle.mock.calls[0][2]).toBe('T2-complete-mint');
	});

	it('T1 ตั้งเวลาแล้ว T3 กลับ online → เคลียร์ pending-normalize ทันที (ไม่รอ 2s) และ timer เดิมถูกยกเลิก', async () => {
		const { deps, swap } = makeDeps([makeProof(8)]);
		autoNormalizeAfterReceiveOnline(deps); // T1 — pending
		expect(isAutoNormalizePending()).toBe(true);

		const flushed = autoNormalizeOnBackOnline(deps); // T3 — ทันที
		const result = await flushed;
		expect(swap.calls.length).toBe(1); // รันก่อนครบ debounce
		expect(result?.swapped).toBe(true);
		expect(isAutoNormalizePending()).toBe(false);

		await vi.advanceTimersByTimeAsync(AUTO_NORMALIZE_DEBOUNCE_MS + 1000);
		expect(swap.calls.length).toBe(1); // timer เดิมไม่ยิงซ้ำ
	});

	it('T3 บนกองที่ complete-set อยู่แล้ว → FORCE swap (P4 — zero-swap short-circuit ถูก bypass เฉพาะ T3)', async () => {
		const { deps, swap, onSettle } = makeDeps([
			makeProof(1),
			makeProof(2),
			makeProof(4)
		]);
		const result = await autoNormalizeOnBackOnline(deps);
		// TASK-1316 (P4): pending pile ต้องถูก swap จริง ณ mint — mint เป็นผู้ยืนยัน
		// ไม่เคยใช้ — แม้ pile เป็น complete-set shape แล้ว (zero-skip ถูก bypass):
		expect(swap.calls.length).toBe(1);
		expect(result?.swapped).toBe(true);
		expect(result?.zeroSwap).toBe(false);
		expect(onSettle).toHaveBeenCalledTimes(1);
	});

	it('T1/T2 hook บนกอง complete-set เดิม → zero-skip คงเดิม 100% (P4 เฉพาะ T3)', async () => {
		const { deps, swap, onSettle } = makeDeps([
			makeProof(1),
			makeProof(2),
			makeProof(4)
		]);
		// T1-receive-online hook — ไม่มี force — zero-swap short-circuit เดิม:
		const result = await runAutoNormalizeNow(deps, 'T1-receive-online');
		expect(swap.calls.length).toBe(0);
		expect(result?.zeroSwap).toBe(true);
		expect(onSettle).toHaveBeenCalledTimes(1);
		// T2-complete-mint hook — เช่นกัน:
		const result2 = await runAutoNormalizeNow(deps, 'T2-complete-mint');
		expect(swap.calls.length).toBe(0);
		expect(result2?.zeroSwap).toBe(true);
	});

	it('cancelAutoNormalize → ยกเลิกก่อนครบ window → ไม่รัน', async () => {
		const { deps, swap } = makeDeps([makeProof(8)]);
		autoNormalizeAfterReceiveOnline(deps);
		cancelAutoNormalize();
		expect(isAutoNormalizePending()).toBe(false);
		await vi.advanceTimersByTimeAsync(AUTO_NORMALIZE_DEBOUNCE_MS + 1000);
		expect(swap.calls.length).toBe(0);
	});

	it('running guard: รันค้าง → คำขอซ้อนคืน null ไม่รันซ้ำ', async () => {
		let release!: () => void;
		const gate = new Promise<void>(r => {
			release = r;
		});
		const { fn, calls } = makeSwapFn();
		const onSettle = vi.fn();
		const deps: AutoNormalizeDeps = {
			getProofs: () => gate.then(() => [makeProof(8)]),
			swapFn: fn,
			onSettle
		};
		const first = autoNormalizeOnBackOnline(deps);
		expect(isAutoNormalizeRunning()).toBe(true);
		const second = await autoNormalizeOnBackOnline(deps); // ซ้อน → null
		expect(second).toBeNull();
		release();
		const result = await first;
		expect(calls.length).toBe(1);
		expect(result?.swapped).toBe(true);
		expect(isAutoNormalizeRunning()).toBe(false);
	});

	it('swapFn พัง → onSettle(null, error, hook) — ไม่ throw หลุด background job', async () => {
		const boom: SwapFn = async () => {
			throw new Error('swap failed');
		};
		const onSettle = vi.fn();
		const deps: AutoNormalizeDeps = {
			getProofs: () => [makeProof(8)],
			swapFn: boom,
			onSettle
		};
		const result = await autoNormalizeOnBackOnline(deps);
		expect(result).toBeNull();
		expect(onSettle).toHaveBeenCalledTimes(1);
		expect(onSettle.mock.calls[0][0]).toBeNull();
		expect((onSettle.mock.calls[0][1] as Error).message).toBe('swap failed');
		expect(onSettle.mock.calls[0][2]).toBe('T3-back-online');
	});
});
