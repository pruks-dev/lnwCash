/**
 * TASK-1305 (INTENT-013) — melt integration: melt flows through the NEW
 * 4-step selectProofs while the change pipeline stays UNTOUCHED.
 *
 * What is proven (forbidden list — zero product-code edits to melt.ts):
 *   1. melt.ts:285 — requestMelt selects via the TASK-1303 ladder: a
 *      completeSet(47) pile melting 30 → ขั้น 1 exact [16,8,4,2] (4 inputs).
 *   2. melt.ts:351 — the fee_reserve reselect also runs the ladder: fee pushes
 *      the need past the first selection → reselect finds [8,2] exactly.
 *   3. NUT-08 blank output model (:557) UNCHANGED — change →
 *      ceil(log2(changeAmount)) amount-0 blanks, mint imprints its own split.
 *   4. TASK-313 signedCount advance (:617/:635) UNCHANGED — advance by the
 *      ACTUAL signed count, never the derived count (DEV-1304-2 two-directions
 *      guard applies to mint/receive/swap ONLY — melt keeps signedCount).
 *   5. Anomaly guard (:624 pattern) UNCHANGED — mint signing MORE outputs than
 *      derived still aborts BEFORE the counter is touched.
 *   6. Legacy pow2 decomposition (:580) UNCHANGED — no-NUT-08 mint still gets
 *      decomposeAmount (NOT completeSet) for melt change.
 *   7. DEV-1303-1 golden (ruling_1 — acknowledgment ONLY, pending Commander):
 *      melt 30 from [32,16,8] = 3 inputs ([16,8,32] — DP เกณฑ์ 2 ยืม 32).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

// ─── Captured state (test → mint call) ─────────────────────────

let capturedInputBodies: Array<{ amount: number; id: string; secret: string; C: string }> = [];
let capturedOutputBodies: Array<{ amount: number; id: string; B_: string }> = [];

/** Mutable hasNUT08 return (melt change-pipeline branch switch). */
let mockSupportsNUT08: boolean = true;
/** When set, the mock mint imprints EXACTLY these amounts as change sigs
 *  (simulating the mint's own denomination split — length may differ from
 *  the derived blanks, which exercises the signedCount/anomaly logic). */
let mintImprint: number[] | null = null;

// ─── Module mocks ──────────────────────────────────────────────

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => Promise.resolve(mockSupportsNUT08)),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn(() =>
		Promise.resolve({
			nuts: mockSupportsNUT08 ? ['04', '05', '08'] : ['04', '05'],
			version: 'Nutshell/0.20.1',
			cached_at: Date.now()
		})
	)
}));

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn(),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	mintTokens: vi.fn(),
	swapProofs: vi.fn(),
	requestMeltQuote: vi.fn().mockResolvedValue({
		quote: 'mq',
		amount: 30,
		fee_reserve: 0,
		paid: false,
		expiry: 9999999999
	}),
	checkState: vi.fn().mockImplementation(
		(_mint: string, proofs: Array<{ secret: string }>) =>
			Promise.resolve({
				states: proofs.map((p) => ({ secret: p.secret, state: 'UNSPENT' as const, witness: null }))
			})
	),
	// Capture bodies, then return change sigs per the mint-imprint list.
	meltTokens: vi.fn((_mint: string, _quote: string, inputs: Array<{ amount: number; id: string; secret: string; C: string }>, outputs: Array<{ amount: number; id: string; B_: string }>) => {
		capturedInputBodies = inputs;
		capturedOutputBodies = outputs;
		const amounts = mintImprint ?? outputs.map((o) => o.amount);
		return Promise.resolve({
			paid: true,
			payment_preimage: 'preimage-abc',
			change: amounts.map((a) => ({ id: KEYSET_ID, amount: a, C_: '02' + 'a1'.repeat(32) }))
		});
	}),
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'mq',
		amount: 30,
		fee_reserve: 0,
		paid: false,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 5,
			keys: { '1': '02' + 'a1'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getAllKeysets: vi.fn(() => [
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 5,
			keys: { '1': '02' + 'a1'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getKeysetById: vi.fn().mockReturnValue({
		id: KEYSET_ID,
		unit: 'sat',
		active: true,
		input_fee_ppk: 5,
		keys: { '1': '02' + 'a1'.repeat(32) },
		last_updated: Date.now()
	}),
	getMintPubkey: vi.fn().mockReturnValue('03' + 'b1'.repeat(32)),
	resolveKeysetId: vi.fn().mockImplementation((_url: string, id: string) => id),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	rotateKeysets: vi.fn()
}));

vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockImplementation((secret: string) => ({
		B_: 'B_' + secret,
		blindingFactor: 'r_' + secret
	})),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

// ─── Imports (after mocks) ─────────────────────────────────────

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs, getAllProofs } from '../proofsDb';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { setCounterK, getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { requestMelt, completeMelt, meltFlow } from '../melt';
import { completeSet } from '../completeSet';
import type { TokenProof, SelectedProofInfo } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

function makeInput(p: TokenProof): SelectedProofInfo {
	return {
		local_id: `${KEYSET_ID}:secret-${p.secret.slice(7, 15)}:${p.secret.slice(-8)}`,
		amount: p.amount,
		id: p.id,
		secret: p.secret,
		C: p.C
	};
}

const addPile = (amounts: number[]) =>
	addProofs(
		amounts.map((a, i) => makeProof(`t1305m${i}_${a}`, a)),
		MINT_URL,
		KEYSET_ID
	);

describe('TASK-1305: melt integration — 4-step selectProofs + change pipeline untouched', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		try { localStorage.clear(); } catch { /* ignore */ }
		vi.clearAllMocks();

		// Reset mock state to defaults (NUT-08 capable, echo outputs).
		mockSupportsNUT08 = true;
		mintImprint = null;
		capturedInputBodies = [];
		capturedOutputBodies = [];
		(client.requestMeltQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
			quote: 'mq',
			amount: 30,
			fee_reserve: 0,
			paid: false,
			expiry: 9999999999
		});

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
		// counter band starts behind the stub proofs (TASK-250 guard).
		setCounterK(KEYSET_ID, 3);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it(':285 — 30 จากกอง completeSet(47) → ขั้น 1 exact [16,8,4,2] (4 inputs) · fee = 4×ppk', async () => {
		await addPile(completeSet(47).map((a) => a)); // [1,1,2,4,8,16,1,2,4,8]

		const req = await requestMelt(MINT_URL, 'lnbc...', 30);
		expect(req.success).toBe(true);
		expect(req.selectedProofs.map((p) => p.amount).sort((a, b) => b - a))
			.toEqual([16, 8, 4, 2]); // exact — sum 30, excess 0, 4 inputs
		expect(req.inputFeePpk).toBe(5);
		expect(req.calculatedFee).toBe(20); // 4 × 5

		// two-phase completion — production order
		const res = await completeMelt(MINT_URL, req.quote, req.selectedProofs, 'lnbc...', 30, req.feeReserve);
		expect(res.success).toBe(true);
		expect(res.change).toHaveLength(0); // NUT-08, nothing overpaid
		// no change derived → counter untouched
		expect(getCounterK(KEYSET_ID)).toBe(3);
	});

	it(':351 — fee บังคับ reselect: จ่าย 8 + fee 2 → reselect 10 → exact [8,2] · NUT-08 blank + signedCount advance', async () => {
		await addPile([16, 8, 2, 1]);
		(client.requestMeltQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
			quote: 'mq',
			amount: 8,
			fee_reserve: 2,
			paid: false,
			expiry: 9999999999
		});

		const req = await requestMelt(MINT_URL, 'lnbc...', 8);
		expect(req.success).toBe(true);
		// first selection [8] (exact) covers only 8 < 8+fee → :351 reselect →
		// 10 = 1010₂ → denomination hits 8+2 — EXACT (4-step ladder live at :351)
		expect(req.selectedProofs.map((p) => p.amount).sort((a, b) => b - a)).toEqual([8, 2]);

		// NUT-08 mint: spentTotal 10, paid 8 → change 2 → ceil(log2(2)) = 1 blank;
		// mint imprints [2] → signedCount 1 → advance by 1 (not blanks length)
		mintImprint = [2];
		const res = await completeMelt(MINT_URL, req.quote, req.selectedProofs, 'lnbc...', 8, 2);
		expect(res.success).toBe(true);
		expect(capturedInputBodies.map((p) => p.amount).sort((a, b) => b - a)).toEqual([8, 2]);
		expect(capturedOutputBodies).toHaveLength(1);
		expect(capturedOutputBodies[0].amount).toBe(0); // blank — mint imprints
		expect(res.change.map((p) => p.amount)).toEqual([2]);
		expect(getCounterK(KEYSET_ID)).toBe(4); // 3 + signedCount(1)
	});

	it('NUT-08 blank model คงเดิม (:557) — change 16 → 4 blanks (amount 0) · mint แบ่งเอง [8,4,4] → advance = signedCount 3', async () => {
		await addPile([20, 6]);
		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('nut08a', 20)),
			makeInput(makeProof('nut08b', 6))
		];

		mintImprint = [8, 4, 4]; // the mint's own split of 16 — 3 sigs
		const res = await completeMelt(MINT_URL, 'mq', inputs, 'lnbc...', 10, 0);

		expect(res.success).toBe(true);
		expect(capturedOutputBodies).toHaveLength(4); // ceil(log2(16)) = 4 blanks
		expect(capturedOutputBodies.every((o) => o.amount === 0)).toBe(true);
		expect(res.change.map((p) => p.amount).sort((a, b) => b - a)).toEqual([8, 4, 4]);
		// TASK-313 advance: ACTUAL signed count (3), NOT derived count (4)
		expect(getCounterK(KEYSET_ID)).toBe(6); // 3 + 3
	});

	it('legacy pow2 คงเดิม (:580) — change 12 → decomposeAmount [8,4] (2 outputs · ไม่ใช่ completeSet(12) = 7 ก้อน)', async () => {
		mockSupportsNUT08 = false;
		await addPile([20, 6]);
		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('leg1', 20)),
			makeInput(makeProof('leg2', 6))
		];

		const res = await completeMelt(MINT_URL, 'mq', inputs, 'lnbc...', 10, 4);

		// spentTotal 26 − 10 − feeReserve 4 = 12 → pow2 decomposition, 2 outputs
		expect(res.success).toBe(true);
		expect(capturedOutputBodies.map((o) => o.amount)).toEqual([8, 4]);
		expect(capturedOutputBodies).toHaveLength(2); // NOT completeSet(12) = 7 ก้อน
		expect(res.change.map((p) => p.amount)).toEqual([8, 4]);
		expect(getCounterK(KEYSET_ID)).toBe(5); // 3 + signedCount(2)
	});

	it('anomaly guard คงเดิม (:624) — mint เซ็นมากกว่าที่ derive (6 > 4) → abort ก่อนแตะ counter', async () => {
		await addPile([20, 6]);
		const inputs: SelectedProofInfo[] = [
			makeInput(makeProof('ano1', 20)),
			makeInput(makeProof('ano2', 6))
		];

		mintImprint = [4, 4, 4, 4, 4, 4]; // 6 sigs > 4 derived blanks — anomaly
		const res = await completeMelt(MINT_URL, 'mq', inputs, 'lnbc...', 10, 0);

		expect(res.success).toBe(false);
		expect(res.error).toContain('Mint anomaly: signed 6 change outputs but we derived only 4');
		// counter survives intact (guard aborted BEFORE any advance):
		expect(getCounterK(KEYSET_ID)).toBe(3);
		// no change got stored (abort before unblind/store):
		const unspent = (await getAllProofs()).filter((p) => !p.spent);
		expect(unspent).toHaveLength(2); // the two stub inputs only
	});

	it('DEV-1303-1 golden (ruling_1 — รับรู้เท่านั้น ห้ามแก้): melt 30 จาก [32,16,8] = 3 inputs', async () => {
		mockSupportsNUT08 = false;
		await addPile([32, 16, 8]);

		const req = await requestMelt(MINT_URL, 'lnbc...', 30);
		expect(req.success).toBe(true);
		// 30 = 11110₂: ขั้น 1 hits 16, 8 · R = 6 → DP เกณฑ์ 2 ยืม 32 (excess 26)
		// → 3 inputs จ่ายรวม 56 — พฤติกรรมนี้คงตาม ruling_1 จนกว่า Commander ตัดสิน
		expect(req.selectedProofs).toHaveLength(3);
		expect(req.selectedProofs.map((p) => p.amount).sort((a, b) => b - a)).toEqual([32, 16, 8]);

		// legacy change = 56 − 30 − 0 = 26 → pow2 [16,8,2] (change pipeline เดิม)
		const res = await completeMelt(MINT_URL, req.quote, req.selectedProofs, 'lnbc...', 30, 0);
		expect(res.success).toBe(true);
		expect(capturedInputBodies).toHaveLength(3);
		expect(capturedOutputBodies.map((o) => o.amount)).toEqual([16, 8, 2]);
		expect(res.change.map((p) => p.amount).sort((a, b) => b - a)).toEqual([16, 8, 2]);
		expect(getCounterK(KEYSET_ID)).toBe(6); // 3 + signedCount(3)
	});

	it('meltFlow รวมทั้งเส้น — 4-step selection + legacy change — สถานะกระเป๋าจบถูก', async () => {
		mockSupportsNUT08 = false;
		await addPile([32, 16, 8]);
		(client.requestMeltQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
			quote: 'mq',
			amount: 10,
			fee_reserve: 0,
			paid: false,
			expiry: 9999999999
		});

		const result = await meltFlow(MINT_URL, 'lnbc...', 10);
		expect(result.success).toBe(true);

		// 10 = 1010₂: hit 8 · R = 2 → DP over [32,16] เกณฑ์ 2 ยืม 16 (excess 14)
		// → selected [8,16] paid 24 → legacy change 14 → pow2 [8,4,2] เดิม
		expect(capturedInputBodies.map((p) => p.amount).sort((a, b) => b - a)).toEqual([16, 8]);
		expect(capturedOutputBodies.map((o) => o.amount)).toEqual([8, 4, 2]); // pow2 — NOT completeSet(14)
		expect(result.change.map((p) => p.amount).sort((a, b) => b - a)).toEqual([8, 4, 2]);
		// counter advanced by the ACTUAL signed count (3 pow2 outputs):
		expect(getCounterK(KEYSET_ID)).toBe(3 + 3);
	});
});
