/**
 * TASK-1403 (F-049-002 / OI-v5-2 ทาง (2)) — origin-split spec + 2 เส้น.
 *
 * THE RULE (P4 เคร่ง on the outside pile, zero-skip kept for mint-own):
 *   - pile from OUR OWN mint (counter เอง ตรวจแล้ว — T1/T2 mints,
 *     counter-derived) → zero-skip / confirm allowed when the pile is
 *     already a complete set (no forced swap).
 *   - pile received from OUTSIDE our mint (offline passthrough / P2P —
 *     the T3 back-online flush) → STRICT swap even when complete-set
 *     shaped (the mint must re-attest coins it never signed for us).
 *
 * Engine-level: normalizeToCompleteSet + resolveOriginForceSwap
 * (proofs.ts) + the T3 runner autoNormalizeOnBackOnlineWithOrigin.
 * No .svelte, no online receive (P2), no mint.ts, no client.ts.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import {
	normalizeToCompleteSet,
	resolveOriginForceSwap,
	autoNormalizeOnBackOnline,
	autoNormalizeOnBackOnlineWithOrigin,
	type NormalizeOptions
} from '../proofs';
import type { StoredProof } from '../proofsDb';

const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';
const MINT_URL = 'https://mint.origin1403.test';

function pile(amounts: number[]): StoredProof[] {
	return amounts.map((amount, i) => ({
		id: KEYSET_ID,
		amount,
		secret: `origin-${i}-${amount}`,
		C: `sig-origin-${i}-${amount}`,
		local_id: `lid-${i}-${amount}`,
		mint_url: MINT_URL,
		keyset_id: KEYSET_ID,
		stored_at: Date.now(),
		spent: false
	}));
}

// completeSet(4) = [1,1,2] — wait: golden table says 4 → [1,1,2]? No —
// 4 → [1,1,2] is listed for 5? Re-read: 4 → [1,1,2] (yes per docstring).
// A single [4] coin pile is NOT complete-set shaped, so for a TRUE
// zero-skip-shaped pile use completeSet(3) = [1,2] — pile [1,2] IS a
// complete set of Σ=3.
function zeroSkipShapedPile(): StoredProof[] {
	return pile([1, 2]); // Σ=3, completeSet(3)=[1,2] → zero-skip eligible
}

const mustNotSwap = async () => {
	throw new Error('must not swap — zero-skip expected');
};

const fakeSwap = async (proofs: StoredProof[], outputs: number[]): Promise<StoredProof[]> =>
	proofs.map((p, i) => ({ ...p, amount: outputs[i] ?? p.amount }));

function depsWith(swap: typeof fakeSwap) {
	return {
		getProofs: () => zeroSkipShapedPile(),
		swapFn: swap
	};
}

describe('TASK-1403 — resolveOriginForceSwap (the rule in one function)', () => {
	it("outside → ALWAYS true (P4 เคร่ง — even with forceSwap:false or no opts)", () => {
		expect(resolveOriginForceSwap({ origin: 'outside' })).toBe(true);
		expect(resolveOriginForceSwap({ origin: 'outside', forceSwap: false })).toBe(true);
		expect(resolveOriginForceSwap({ forceSwap: true })).toBe(true);
	});

	it('mint-own → defers to forceSwap (absent = false → zero-skip allowed)', () => {
		expect(resolveOriginForceSwap({ origin: 'mint-own' })).toBe(false);
		expect(resolveOriginForceSwap({ origin: 'mint-own', forceSwap: true })).toBe(true);
		expect(resolveOriginForceSwap(undefined)).toBe(false);
		expect(resolveOriginForceSwap({} as NormalizeOptions)).toBe(false);
	});
});

describe('TASK-1403 — OI-v5-2 เส้น 1: mint-own pile → zero-skip / confirm ได้', () => {
	it('complete-set-shaped mint-own pile zero-skips (swapFn never runs)', async () => {
		const res = await normalizeToCompleteSet(zeroSkipShapedPile(), mustNotSwap, {
			origin: 'mint-own'
		});
		expect(res.swapped).toBe(false);
		expect(res.zeroSwap).toBe(true);
		expect(res.sum).toBe(3);
	});

	it('legacy no-origin path keeps zero-skip (T1/T2 byte-behavior unchanged)', async () => {
		const res = await normalizeToCompleteSet(zeroSkipShapedPile(), mustNotSwap);
		expect(res.swapped).toBe(false);
		expect(res.zeroSwap).toBe(true);
	});
});

describe('TASK-1403 — OI-v5-2 เส้น 2: outside pile → บังคับ swap (P4 เคร่ง)', () => {
	it('SAME complete-set shape with origin outside SWAPS (no zero-skip)', async () => {
		let swapped = false;
		const res = await normalizeToCompleteSet(
			zeroSkipShapedPile(),
			async (proofs, outputs) => {
				swapped = true;
				return fakeSwap(proofs, outputs);
			},
			{ origin: 'outside' }
		);
		expect(swapped).toBe(true);
		expect(res.swapped).toBe(true);
		expect(res.zeroSwap).toBe(false);
	});

	it('T3 runner with origin (autoNormalizeOnBackOnlineWithOrigin) swaps the outside pile', async () => {
		const { cancelAutoNormalize } = await import('../proofs');
		cancelAutoNormalize();
		let swapped = false;
		const res = await autoNormalizeOnBackOnlineWithOrigin({
			getProofs: () => zeroSkipShapedPile(),
			swapFn: async (proofs, outputs) => {
				swapped = true;
				return fakeSwap(proofs, outputs);
			}
		});
		expect(res).not.toBeNull();
		expect(swapped).toBe(true);
		expect(res!.swapped).toBe(true);
		cancelAutoNormalize();
	});

	it('legacy T3 (forceSwap, no origin) ALSO swaps — origin is additive, never a bypass', async () => {
		const { cancelAutoNormalize } = await import('../proofs');
		cancelAutoNormalize();
		let swapped = false;
		const res = await autoNormalizeOnBackOnline(
			depsWith(async (proofs, outputs) => {
				swapped = true;
				return fakeSwap(proofs, outputs);
			})
		);
		expect(res).not.toBeNull();
		expect(swapped).toBe(true);
		cancelAutoNormalize();
		vi.clearAllMocks();
	});
});
