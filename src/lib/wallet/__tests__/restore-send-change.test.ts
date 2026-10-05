/**
 * TASK-1305 (INTENT-013) — NUT-9 restore re-verification over SEND-produced
 * complete-set piles ("ยืนยันซ้ำเพื่อครอบ 1305").
 *
 * The send-side change (TASK-1305: completeSet(excess), secrets = the NUT-13
 * derivation band) must be FULLY recoverable by the NUT-9 restore scan:
 *   1. swap-path send ([32] → 10): change = completeSet(22) (10 coins,
 *      counters 0..9) → wipe the proof DB → restoreWallet re-issues EXACTLY
 *      the 10-coin change and lands counter = 10. The random send portion's
 *      blinded messages were never derived from the seed → NOT in the scan.
 *   2. exact-subset send from a completeSet(10) pile: the originals go in
 *      place, the pile stays derived → restore recovers the whole
 *      completeSet(10) (6 coins, counter = 6).
 *
 * FULLY REAL crypto round-trip (pattern of restore-complete-set.test.ts /
 * TASK-1304): real blindMessage/unblind + mock mint that signs with a real
 * secp256k1 key and REMEMBERS {B_ → amount} for the /v1/restore endpoint.
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
	// transfer.ts swap-path needs a completion guard on decode/check calls only;
	// melt/mint quote mocks are irrelevant here but keep the module shape whole.
	requestMeltQuote: vi.fn(),
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
import { deleteProofDB, resetProofDB, getAllProofs, addProofs, getUnspentProofs } from '../proofsDb';
import { completeMint } from '../mint';
import { sendTokens } from '../transfer';
import { restoreWallet } from '../restore';
import { decodeToken } from '../../cashu/token';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeSet } from '../completeSet';
import { cancelScheduledNormalize } from '../normalizeWiring';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('TASK-1305: NUT-9 restore over send-produced complete-set piles', () => {
	const seed = mnemonicToSeed(MNEMONIC);
	// One real mock-mint keypair used by EVERY signing site (swap/mint/restore).
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

		// Mock mint: NUT-03 swap — records {B_ → amount}, signs with the real key.
		vi.mocked(client.swapProofs as ReturnType<typeof vi.fn>).mockImplementation(
			async (_url: string, _inputs: unknown, outputs: Array<{ id: string; amount: number; B_: string }>) => {
				const signatures = outputs.map((o) => {
					mintedRegistry.set(o.B_, o.amount);
					return { id: o.id, amount: o.amount, C_: signB(o.B_) };
				});
				return { signatures };
			}
		);

		// Mock mint: /v1/mint — records + signs (completeMint path).
		vi.mocked(client.mintTokens as ReturnType<typeof vi.fn>).mockImplementation(
			async (_url: string, _quote: string, postBody: Array<{ id: string; amount: number; B_: string }>) => {
				for (const o of postBody) mintedRegistry.set(o.B_, o.amount);
				return {
					signatures: postBody.map((o) => ({ id: o.id, amount: o.amount, C_: signB(o.B_) }))
				};
			}
		);

		// Mock mint: /v1/restore — re-issues ONLY outputs it once signed (filtered).
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

		// Every queried secret is UNSPENT (matches restore-complete-set harness).
		vi.mocked(client.checkState as ReturnType<typeof vi.fn>).mockImplementation(
			async (_url: string, proofs: Array<{ secret: string }>) => ({
				states: proofs.map((p) => ({ secret: p.secret, state: 'UNSPENT' as const, witness: null }))
			})
		);

		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	afterEach(async () => {
		cancelScheduledNormalize();
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('swap-path send → change completeSet(22) — NUT-9 restore คืนครบ 10 ก้อน · counter = 10', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);

		// one 32-sat stub input (counter band starts at 0 — the change derive zone)
		await addProofs([makeProof('stub32', 32)], MINT_URL, KEYSET_ID);

		const sent = await sendTokens(10, MINT_URL);
		expect(sent.amount).toBe(10);
		// change = completeSet(22), derived at counters 0..9
		expect(getCounterK(KEYSET_ID)).toBe(completeSet(22).length); // 10

		// simulate a device wipe — everything lives in the mint registry + seed
		await deleteProofDB();
		resetProofDB();

		const restored = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 100,
			emptyBatchLimit: 3,
			persist: true
		});

		expect(restored.success).toBe(true);
		// scan landed at highestSigned+1 = 10 — the whole derivation band intact
		expect(restored.counter).toBe(10);
		expect(getCounterK(KEYSET_ID)).toBe(10);
		// EXACTLY the 10 change coins — the random send portion was never derived,
		// so the seed scan cannot (and must not) see it:
		expect(restored.proofs).toHaveLength(completeSet(22).length);
		expect(restored.proofs.map((p) => p.amount).sort((a, b) => a - b))
			.toEqual(completeSet(22).sort((a, b) => a - b));
		for (const proof of restored.proofs) {
			expect(verifySignature(proof.C, proof.secret, mintK)).toBe(true);
		}
		// persisted unspent
		const stored = await getAllProofs();
		expect(stored.map((p) => p.amount).reduce((s, a) => s + a, 0)).toBe(22);
		expect(stored.every((p) => !p.spent)).toBe(true);
	});

	it('exact-subset send จากกอง completeSet(10) — กองคง derived · restore คืน completeSet(10) ครบ 6 ก้อน', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);

		// mint completeSet(10) = [1,1,2,4,1,1] — 6 derived proofs, counters 0..5
		const minted = await completeMint(MINT_URL, 'q', 10, KEYSET_ID, false, seed);
		expect(minted.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(completeSet(10).length); // 6
		cancelScheduledNormalize(); // T2 timer off — pile stays as minted

		// exact subset send — 7 = 111₂ → in-place originals {4,2,1}; NO swap at all
		const swapFn = client.swapProofs as ReturnType<typeof vi.fn>;
		const sent = await sendTokens(7, MINT_URL);
		expect(sent.amount).toBe(7);
		expect(swapFn).not.toHaveBeenCalled();
		// wallet left = the un-sent remainder of completeSet(10) = {1,1,1} (still derived):
		const left = (await getUnspentProofs()).map((p) => p.amount).sort((a, b) => a - b);
		expect(left).toEqual([1, 1, 1]);

		// wipe — then the NUT-9 scan re-issues the WHOLE minted complete set
		// (the 3 sent in-place proofs are also mint-signed — they restorable too)
		await deleteProofDB();
		resetProofDB();

		const restored = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 100,
			emptyBatchLimit: 3,
			persist: true
		});

		expect(restored.success).toBe(true);
		expect(restored.counter).toBe(completeSet(10).length); // 6
		expect(getCounterK(KEYSET_ID)).toBe(6);
		expect(restored.proofs).toHaveLength(completeSet(10).length);
		expect(restored.proofs.map((p) => p.amount).sort((a, b) => a - b))
			.toEqual(completeSet(10).sort((a, b) => a - b));
		for (const proof of restored.proofs) {
			expect(verifySignature(proof.C, proof.secret, mintK)).toBe(true);
		}
	});
});
