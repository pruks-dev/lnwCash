/**
 * TASK-1304 (INTENT-013) — integration: NUT-9 restore over a COMPLETE-SET pile.
 *
 * completeMint(10) now mints completeSet(10) = [1,1,2,4,1,1] — SIX counters
 * consumed (pow2-only decomposition would consume TWO). The NUT-9 restore
 * flow restores by scanning counters 0..counter_k-1 in batches until the
 * mint stops signing — so it MUST recover the full six-coin complete set and
 * land the counter back at highestSigned+1 = 6 (longer scan than pow2).
 *
 * FULLY REAL crypto round-trip (same pattern as restore.test.ts): real
 * blindMessage/unblind + a mock mint that signs each blinded message with a
 * real secp256k1 key and REMEMBERS {B_ → amount} so the restore endpoint can
 * re-issue exactly what it once signed.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { verifySignature } from '../../cashu/blind';

const { MINT_URL, KEYSET_ID, MNEMONIC, mintedRegistry, restoreCalls } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	mintedRegistry: new Map<string, number>(),
	restoreCalls: { n: 0 }
}));

vi.mock('../../cashu/client', () => ({
	mintTokens: vi.fn(),
	restoreOutputs: vi.fn(),
	swapProofs: vi.fn(),
	checkState: vi.fn(),
	requestMintQuote: vi.fn(),
	checkMintQuote: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	pollMintQuoteUntil: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	getMintInfo: vi.fn(),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
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
import { deleteProofDB, resetProofDB, getAllProofs } from '../proofsDb';
import { completeMint } from '../mint';
import { restoreWallet } from '../restore';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeSet } from '../completeSet';
import { normalizeToCompleteSet } from '../proofs';
import { boundSwapFn, cancelScheduledNormalize } from '../normalizeWiring';
const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

describe('TASK-1304: NUT-9 restore over a complete-set pile', () => {
	const seed = mnemonicToSeed(MNEMONIC);
	// One real mock-mint keypair used by EVERY signing site in this file.
	const mintSecret = secp256k1.utils.randomSecretKey();
	const mintK = bytesToBigInt(mintSecret);
	const mintPubkeyHex = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(async () => {
		vi.clearAllMocks();
		cancelScheduledNormalize();
		mintedRegistry.clear();
		restoreCalls.n = 0;
		localStorage.removeItem(STORAGE_KEY);

		vi.mocked(getMintPubkey).mockReturnValue(mintPubkeyHex);
		const signB = (B_: string) => secp256k1.Point.fromHex(B_).multiply(mintK).toHex(true);

		// Mock mint: /v1/mint — records {B_ → amount}, signs with the real key.
		vi.mocked(client.mintTokens as ReturnType<typeof vi.fn>).mockImplementation(
			async (_url: string, _quote: string, postBody: Array<{ id: string; amount: number; B_: string }>) => {
				for (const o of postBody) mintedRegistry.set(o.B_, o.amount);
				return {
					signatures: postBody.map((o) => ({ id: o.id, amount: o.amount, C_: signB(o.B_) }))
				};
			}
		);

		// Mock mint: /v1/restore — re-issues ONLY outputs it once signed, exactly
		// like a Nutshell FILTERED restore response (echo the signed outputs).
		vi.mocked(client.restoreOutputs as ReturnType<typeof vi.fn>).mockImplementation(
			async (_url: string, outputs: Array<{ id: string; amount: number; B_: string }>) => {
				restoreCalls.n++;
				const signed = outputs.filter((o) => mintedRegistry.has(o.B_));
				return {
					outputs: signed,
					signatures: signed.map((o) => ({
						id: o.id,
						amount: mintedRegistry.get(o.B_),
						C_: signB(o.B_)
					}))
				};
			}
		);

		// Every queried secret is UNSPENT (fresh mint).
		vi.mocked(client.checkState as ReturnType<typeof vi.fn>).mockImplementation(
			async (_url: string, proofs: Array<{ secret: string }>) => ({
				states: proofs.map((p) => ({ secret: p.secret, state: 'UNSPENT' as const, witness: null }))
			})
		);

		// Wallet state hygiene between tests:
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	afterEach(async () => {
		cancelScheduledNormalize(); // stop any T2/T1 debounce timer
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('construction sanity: verifySignature validates a minted round-trip C', async () => {
		// Lens test for the mock's crypto consistency (same contract as restore.test.ts).
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);

		const minted = await completeMint(MINT_URL, 'q', 10, KEYSET_ID, false, seed);
		expect(minted.success).toBe(true);
		const target = completeSet(10);
		expect(minted.proofs).toHaveLength(target.length);
		for (const proof of minted.proofs) {
			// C == k * hash_to_curve(secret) — checked against the SAME mint key:
			expect(verifySignature(proof.C, proof.secret, mintK)).toBe(true);
		}
	});

	it('restoreWallet recovers the whole six-coin completeSet(10) pile and counter = 6 (longer than pow2)', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);

		const minted = await completeMint(MINT_URL, 'q', 10, KEYSET_ID, false, seed);
		expect(minted.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(6); // completeSet(10) — pow2 would be 2
		cancelScheduledNormalize(); // T2 timer off — the restore asserts exact ash states

		const restored = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 100,
			emptyBatchLimit: 3,
			persist: true
		});

		expect(restored.success).toBe(true);
		// Scan landed at highestSigned+1 = 6 — the counter band is intact.
		expect(restored.counter).toBe(6);
		expect(getCounterK(KEYSET_ID)).toBe(6);
		expect(restored.proofs).toHaveLength(6); // หกก้อน — pow2-only จะได้แค่ 2
		expect(restored.proofs.map((p) => p.amount).sort((a, b) => a - b))
			.toEqual([...completeSet(10)].sort((a, b) => a - b));
		// ALL recovered proofs verify against the mint's key:
		for (const proof of restored.proofs) {
			expect(verifySignature(proof.C, proof.secret, mintK)).toBe(true);
		}
		// Persisted as unspent:
		const stored = await getAllProofs();
		expect(stored).toHaveLength(6);
		expect(stored.every((p) => !p.spent)).toBe(true);
		// Batches: 1 signed + 3 consecutive empty → exactly 4 restore calls.
		expect(restoreCalls.n).toBe(4);
	});

	it('a restorable pile is zero-swap (complete set lands on its own shape)', async () => {
		// Lens test: the restored pile from the mint above is ALREADY a complete
		// set → TASK-1303's zero-swap short-circuit fires — no second swap.
		vi.mocked(client.swapProofs as ReturnType<typeof vi.fn>).mockResolvedValue({
			signatures: []
		});

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);

		const minted = await completeMint(MINT_URL, 'q', 20, KEYSET_ID, false, seed);
		expect(minted.success).toBe(true);
		const target = completeSet(20); // 16 coins
		expect(minted.proofs).toHaveLength(target.length);

		const result = await normalizeToCompleteSet(
			minted.proofs.map((p) => ({
				...p,
				local_id: `restored:${p.secret.slice(0, 8)}`,
				mint_url: MINT_URL,
				keyset_id: KEYSET_ID,
				stored_at: Date.now(),
				spent: false
			})),
			boundSwapFn // the TASK-1304-bound SwapFn — NOT called when zeroSwap fires
		);

		expect(result.zeroSwap).toBe(true);
		expect(result.swapped).toBe(false); // no mint round-trip needed
		expect(result.sum).toBe(20);
		expect(result.target).toEqual(target);
	});
});
