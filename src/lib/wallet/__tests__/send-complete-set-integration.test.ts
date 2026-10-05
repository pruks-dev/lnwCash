/**
 * TASK-1305 (INTENT-013) — send integration: exact-subset send + greedy-swap
 * fallback + change = completeSet + NO-T4.
 *
 * FOLD A end-to-end wiring (transfer.ts sendTokens):
 *   1. selectProofs 4-step (TASK-1303) finds an EXACT subset (sum == amount)
 *      → sendTokens sends it IN PLACE — NO swap, NO change, counter untouched.
 *   2. No exact subset (e.g. pool [32] paying 10) → swap path เดิม: send
 *      portion (decomposeAmount, random secrets) + change portion now = 
 *      completeSet(excess) (TASK-1301) whose secrets are the NUT-13
 *      derivation band [start, start + completeSet(excess).length) — so the
 *      :134 incrementCounterK(keysetId, excessAmounts.length) is auto-exact.
 *   3. NO T4 (ruling_2): send NEVER schedules auto-normalize on any path.
 *
 * REAL crypto round-trip: blind/unblind NOT mocked — the mock mint signs each
 * blinded message with a real secp256k1 key (pattern of TASK-1304 wiring
 * tests), so change proofs verify against the same mint key and their
 * secrets provably equal the NUT-13 derivation band.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { verifySignature } from '../../cashu/blind';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', () => ({
	swapProofs: vi.fn(),
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
			input_fee_ppk: 0,
			keys: { '1': '02' + 'ff'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import * as client from '../../cashu/client';
import { getMintPubkey } from '../../cashu/keyset';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import {
	deleteProofDB,
	resetProofDB,
	addProofs,
	getAllProofs,
	getUnspentProofs
} from '../proofsDb';
import { sendTokens } from '../transfer';
import { decodeToken } from '../../cashu/token';
import { setActiveSeed, clearActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeSet } from '../completeSet';
import {
	isAutoNormalizePending,
	isAutoNormalizeRunning,
	AUTO_NORMALIZE_DEBOUNCE_MS
} from '../proofs';
import { cancelScheduledNormalize } from '../normalizeWiring';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function swapCalls(): ReturnType<typeof vi.fn> {
	return client.swapProofs as ReturnType<typeof vi.fn>;
}

function p(amount: number, tag: string): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${tag}`, C: `sig-${tag}` };
}

/** addProofs a stub pile from amounts (Pro x must NOT collide). */
function addPile(amounts: number[]): Promise<void> {
	return addProofs(
		amounts.map((a, i) => p(a, `t1305-${i}-${a}`)),
		MINT_URL,
		KEYSET_ID
	);
}

describe('TASK-1305: send — exact subset / greedy swap / change = completeSet / NO T4', () => {
	const seed = mnemonicToSeed(MNEMONIC);
	// Real mock-mint keypair — signatures follow the real blind/unblind algebra.
	const mintSecret = secp256k1.utils.randomSecretKey();
	const mintK = bytesToBigInt(mintSecret);
	const mintPubkeyHex = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();
		cancelScheduledNormalize();

		vi.mocked(getMintPubkey).mockReturnValue(mintPubkeyHex);
		const signB = (B_: string) => secp256k1.Point.fromHex(B_).multiply(mintK).toHex(true);
		swapCalls().mockImplementation(
			async (_url: string, _inputs: unknown, outputs: Array<{ id: string; amount: number; B_: string }>) => ({
				signatures: outputs.map((o) => ({ id: o.id, amount: o.amount, C_: signB(o.B_) }))
			})
		);

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
	});

	afterEach(async () => {
		cancelScheduledNormalize();
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	// ─── เส้นที่ 1: exact subset → ไม่ swap ไม่มี change ─────────

	it('ขั้น 1 — exact single (8 จาก [8,4,2,1]) → ก้อนเดิมส่งออก in-place · ไม่ swap · ไม่มี change', async () => {
		await addPile([8, 4, 2, 1]); // completeSet(15) shape

		const result = await sendTokens(8, MINT_URL);

		expect(result.amount).toBe(8);
		// NO mint round-trip at all — no swap, no keyset call:
		expect(swapCalls()).not.toHaveBeenCalled();
		// token carries the ORIGINAL 8-sat proof (identity preserved, not re-issued):
		const decoded = decodeToken(result.token);
		expect(decoded.proofs.map((pr) => pr.amount)).toEqual([8]);
		expect(decoded.proofs[0].secret).toBe('secret-t1305-0-8');
		// wallet left exactly [4,2,1] — NOTHING new stored (no change proofs):
		const unspent = (await getUnspentProofs()).map((pr) => pr.amount).sort((a, b) => b - a);
		expect(unspent).toEqual([4, 2, 1]);
		expect(await getAllProofs()).toHaveLength(4);
		// counter untouched — send path derived nothing:
		expect(getCounterK(KEYSET_ID)).toBe(0);
		// NO-T4 — no scheduler was touched:
		expect(isAutoNormalizePending()).toBe(false);
		expect(isAutoNormalizeRunning()).toBe(false);
	});

	it('ขั้น 2 — denomination-first exact (14 = 8+4+2 จาก completeSet(15) กอง) → ไม่ swap ไม่มี change', async () => {
		await addPile([8, 4, 2, 1]);

		const result = await sendTokens(14, MINT_URL);

		expect(result.amount).toBe(14);
		expect(swapCalls()).not.toHaveBeenCalled();
		// token = the three originals; decoy 1 stays; no change stored:
		const decoded = decodeToken(result.token);
		expect(decoded.proofs.map((pr) => pr.amount).sort((a, b) => b - a)).toEqual([8, 4, 2]);
		const unspent = (await getUnspentProofs()).map((pr) => pr.amount);
		expect(unspent).toEqual([1]);
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect(isAutoNormalizePending()).toBe(false);
	});

	it('ขั้น 3 — DP-exact (5 = 1+{2,2}) → ไม่ swap ไม่มี change (excess = 0 จาก DP เกณฑ์ 1)', async () => {
		await addPile([2, 2, 1]);

		const result = await sendTokens(5, MINT_URL);

		expect(result.amount).toBe(5);
		expect(swapCalls()).not.toHaveBeenCalled();
		const decoded = decodeToken(result.token);
		expect(decoded.proofs.map((pr) => pr.amount).sort((a, b) => a - b)).toEqual([1, 2, 2]);
		expect(await getUnspentProofs()).toHaveLength(0); // everything sent, no change
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});

	// ─── เส้นที่ 2: ไม่เจอ subset → greedy fallback → swap path เดิม ─

	it('ขั้น 2/3 หา subset ไม่ได้ ([32] จ่าย 10) → swap path เดิม: change = completeSet(22) + counter auto-ตรง', async () => {
		await addPile([32]);

		const result = await sendTokens(10, MINT_URL);

		// send portion = decomposeAmount(10) = [8, 2] — exactly the request
		expect(result.amount).toBe(10);
		expect(swapCalls()).toHaveBeenCalledTimes(1);
		// submitted output denominations in deterministic order:
		// [8, 2] (send, decomposeAmount) + completeSet(22) (change — TASK-1305)
		const submitted = swapCalls().mock.calls[0][2] as Array<{ amount: number }>;
		expect(submitted.map((o) => o.amount))
			.toEqual([8, 2, 1, 1, 2, 4, 8, 1, 1, 2, 1, 1]);

		// change stored back = completeSet(22) — 10 coins
		const change = (await getAllProofs()).filter((pr) => !pr.spent);
		expect(change.map((pr) => pr.amount).sort((a, b) => b - a))
			.toEqual([8, 4, 2, 2, 1, 1, 1, 1, 1, 1]);
		expect(change).toHaveLength(completeSet(22).length);

		// :134 auto-ตรง — counter advanced by EXACTLY the number of change outputs
		expect(getCounterK(KEYSET_ID)).toBe(completeSet(22).length);

		// change secrets = the NUT-13 derivation band 0..9 (NOT random) AND
		// each change proof verifies against the real mint key (crypto round-trip)
		expect(change.map((pr) => pr.secret).sort())
			.toEqual(completeSet(22).map((_, i) => deriveSecret(seed, KEYSET_ID, i)).sort());
		for (const c of change) {
			expect(verifySignature(c.C, c.secret, mintK)).toBe(true);
		}

		// send portion is random — in no derivation slot 0..11
		const sent = decodeToken(result.token).proofs;
		expect(sent.map((pr) => pr.amount).sort((a, b) => b - a)).toEqual([8, 2]);
		for (let c = 0; c < 12; c++) {
			expect(sent.map((pr) => pr.secret)).not.toContain(deriveSecret(seed, KEYSET_ID, c));
		}
		expect(isAutoNormalizePending()).toBe(false);
	});

	it('swap path — [32,16,8] จ่าย 20: send [8,8,4] + change = completeSet(4) = [1,1,2] · counter = 3', async () => {
		await addPile([32, 16, 8]);

		const result = await sendTokens(20, MINT_URL);

		// 20 = 10100₂: denomination hit 16, DP เกณฑ์ 2 ยืม 8 (excess 4) — swap path
		expect(result.amount).toBe(20);
		expect(swapCalls()).toHaveBeenCalledTimes(1);
		// needFromSwap 12 → decomposeAmount [8,4] send + completeSet(4)=[1,1,2] change
		const submitted = swapCalls().mock.calls[0][2] as Array<{ amount: number }>;
		expect(submitted.map((o) => o.amount)).toEqual([8, 4, 1, 1, 2]);
		// send token [8 (kept), 8, 4] — the un-swapped 8 rides along in-place
		const sent = decodeToken(result.token);
		expect(sent.proofs.map((pr) => pr.amount).sort((a, b) => b - a)).toEqual([8, 8, 4]);
		expect(sent.proofs.map((pr) => pr.secret)).toContain('secret-t1305-2-8'); // kept original
		// change stored = completeSet(4) — derived secrets band 0..2, counter = 3
		const derivedBand = completeSet(4).map((_, i) => deriveSecret(seed, KEYSET_ID, i));
		const change = (await getAllProofs())
			.filter((pr) => !pr.spent && derivedBand.includes(pr.secret));
		expect(change.map((pr) => pr.amount).sort((a, b) => b - a)).toEqual([2, 1, 1]);
		expect(change.map((pr) => pr.secret).sort())
			.toEqual(derivedBand.sort());
		expect(getCounterK(KEYSET_ID)).toBe(completeSet(4).length);
		for (const c of change) {
			expect(verifySignature(c.C, c.secret, mintK)).toBe(true);
		}
		// wallet after send = the untouched 32 + change
		const unspent = (await getUnspentProofs()).map((pr) => pr.amount).sort((a, b) => b - a);
		expect(unspent).toEqual([32, 2, 1, 1]);
	});

	it('send portion — random ทุกครั้ง: สองรอบต่าง secret และไม่อยู่ใน band derive (integration มุมส่ง)', async () => {
		await addPile([32]);
		const first = await sendTokens(10, MINT_URL);
		const firstSecrets = decodeToken(first.token).proofs.map((pr) => pr.secret);
		expect(firstSecrets).toHaveLength(2); // decomposeAmount(10) = [8,2]

		// fresh pile + counter under the SAME seed → re-run
		localStorage.removeItem(STORAGE_KEY);
		await deleteProofDB();
		resetProofDB();
		await addPile([32]);
		const second = await sendTokens(10, MINT_URL);
		const secondSecrets = decodeToken(second.token).proofs.map((pr) => pr.secret);

		expect(secondSecrets).toHaveLength(2);
		expect(secondSecrets).not.toEqual(firstSecrets);
		for (let c = 0; c < 12; c++) {
			const d = deriveSecret(seed, KEYSET_ID, c);
			expect(firstSecrets).not.toContain(d);
			expect(secondSecrets).not.toContain(d);
		}
	});

	// ─── NO T4 — ruling_2: ยกเลิก force-normalize-after-send ────

	it('NO T4 — send ไม่ schedule auto-normalize ทุกเส้น (exact + swap) — ไม่มี lurker timer ต่อยอด', async () => {
		// exact-subset path
		await addPile([8, 4, 2, 1]);
		await sendTokens(14, MINT_URL);
		expect(isAutoNormalizePending()).toBe(false);
		expect(isAutoNormalizeRunning()).toBe(false);

		// swap path — exactly ONE swap (send's own), then nothing lingers behind it
		await addPile([32]);
		swapCalls().mockClear();
		await sendTokens(10, MINT_URL);
		expect(swapCalls()).toHaveBeenCalledTimes(1);

		// wait past the 2s debounce window — no deferred second swap may fire
		await sleep(AUTO_NORMALIZE_DEBOUNCE_MS + 250);
		expect(swapCalls()).toHaveBeenCalledTimes(1);
		expect(isAutoNormalizePending()).toBe(false);
		expect(isAutoNormalizeRunning()).toBe(false);
	}, 10000);

	// ─── guards คงเดิม ──────────────────────────────────────────

	it('InsufficientFundsError contract คงเดิม — ยอดไม่พอ throw ก่อนแตะอะไร', async () => {
		await addPile([2, 2]);
		await expect(sendTokens(5, MINT_URL)).rejects.toThrow();
		expect(swapCalls()).not.toHaveBeenCalled();
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});
});
