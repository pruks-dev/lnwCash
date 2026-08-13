/**
 * NUT-13 restore flow tests — deterministic regenerate + NUT-9 /v1/restore
 * round-trip using REAL crypto (blinding/unblinding) and a mocked mint.
 *
 * The "mint" is simulated with a real secp256k1 keypair: it signs each
 * regenerated blinded message the way a real mint would, so the round-trip
 * exercises the full derive → blind → re-issue → unblind → verify chain.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { verifySignature } from '../../cashu/blind';

// ─── Mock the mint HTTP client ───────────────────────────────
const restoreOutputsMock = vi.fn();
const checkStateMock = vi.fn();

vi.mock('../../cashu/client', () => ({
	restoreOutputs: (...args: unknown[]) => restoreOutputsMock(...args),
	checkState: (...args: unknown[]) => checkStateMock(...args)
}));

// ─── Mock keyset resolution (returns the mock mint's pubkey) ─
const getMintPubkeyMock = vi.fn();
vi.mock('../../cashu/keyset', () => ({
	getMintPubkey: (...args: unknown[]) => getMintPubkeyMock(...args)
}));

import { restoreBatch, restoreWallet } from '../restore';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';

const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';
const MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

describe('NUT-13 restore round-trip', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	// Mock mint keypair
	const mintSecret = secp256k1.utils.randomSecretKey();
	const mintSecretBigInt = bytesToBigInt(mintSecret);
	const mintPubkey = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.removeItem(STORAGE_KEY);
		getMintPubkeyMock.mockReturnValue(mintPubkey);
	});

	it('should regenerate the same blinded messages and recover valid proofs', async () => {
		const batchSize = 3;
		const amounts = [1, 2, 4];

		// Mock mint: signs every regenerated blinded message with its secret key
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => ({
				outputs,
				signatures: outputs.map((o, i) => ({
					id: KEYSET_ID,
					amount: amounts[i],
					C_: secp256k1.Point.fromHex(o.B_).multiply(mintSecretBigInt).toHex(true)
				}))
			})
		);

		const { proofs, signaturesCount } = await restoreBatch(
			MINT_URL,
			seed,
			KEYSET_ID,
			0,
			batchSize
		);

		expect(signaturesCount).toBe(batchSize);
		expect(proofs).toHaveLength(batchSize);

		proofs.forEach((proof, i) => {
			// secret matches deterministic derivation for counter i
			expect(proof.secret).toBe(deriveSecret(seed, KEYSET_ID, i));
			// unblinded C is a valid signature: C == k * hash_to_curve(secret)
			expect(verifySignature(proof.C, proof.secret, mintSecretBigInt)).toBe(true);
			expect(proof.amount).toBe(amounts[i]);
		});
	});

	it('should be deterministic across two restore runs (same secret, same C)', async () => {
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => ({
				outputs,
				signatures: outputs.map((o) => ({
					id: KEYSET_ID,
					amount: 1,
					C_: secp256k1.Point.fromHex(o.B_).multiply(mintSecretBigInt).toHex(true)
				}))
			})
		);

		const run1 = await restoreBatch(MINT_URL, seed, KEYSET_ID, 0, 5);
		const run2 = await restoreBatch(MINT_URL, seed, KEYSET_ID, 0, 5);

		expect(run1.proofs.map((p) => p.secret)).toEqual(run2.proofs.map((p) => p.secret));
		expect(run1.proofs.map((p) => p.C)).toEqual(run2.proofs.map((p) => p.C));
	});
});

describe('NUT-13 restoreWallet orchestration', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.removeItem(STORAGE_KEY);
		getMintPubkeyMock.mockReturnValue(
			bytesToHex(secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true))
		);
	});

	it('should stop after three empty batches and record the final counter_k', async () => {
		// First batch returns 2 signatures; all subsequent batches empty.
		let calls = 0;
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => {
				calls++;
				if (calls === 1) {
					const mintSecret = secp256k1.utils.randomSecretKey();
					const k = bytesToBigInt(mintSecret);
					// Sign using the SAME key returned by getMintPubkeyMock — simplest
					// to instead return signatures we can verify. Here we just return
					// signatures of the requested length.
					return {
						outputs,
						signatures: outputs.map((o) => ({
							id: KEYSET_ID,
							amount: 8,
							C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
						}))
					};
				}
				return { outputs, signatures: [] };
			}
		);

		checkStateMock.mockResolvedValue({
			states: [
				{ secret: 'x', state: 'UNSPENT', witness: null },
				{ secret: 'y', state: 'UNSPENT', witness: null }
			]
		});

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 2,
			emptyBatchLimit: 3,
			persist: false
		});

		expect(result.success).toBe(true);
		// first batch (counters 0,1) → 2 proofs recovered
		expect(result.proofs).toHaveLength(2);
		expect(result.counter).toBe(2);
		expect(getCounterK(KEYSET_ID)).toBe(2);
		// batch 0 + 3 empty batches = 4 restore requests
		expect(calls).toBe(4);
	});

	it('should filter SPENT proofs via NUT-7 checkState', async () => {
		let calls = 0;
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => {
				calls++;
				if (calls > 1) return { outputs, signatures: [] };
				return {
					outputs,
					signatures: outputs.map((o) => ({
						id: KEYSET_ID,
						amount: 4,
						C_: secp256k1.Point.fromHex(o.B_)
							.multiply(bytesToBigInt(secp256k1.utils.randomSecretKey()))
							.toHex(true)
					}))
				};
			}
		);
		// First proof SPENT, second UNSPENT
		checkStateMock.mockResolvedValue({
			states: [
				{ secret: 'x', state: 'SPENT', witness: 'w' },
				{ secret: 'y', state: 'UNSPENT', witness: null }
			]
		});

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 2,
			emptyBatchLimit: 1,
			persist: false
		});

		expect(result.success).toBe(true);
		expect(result.proofs).toHaveLength(1);
	});

	it('should return success=false when the mint rejects the restore', async () => {
		restoreOutputsMock.mockRejectedValue(new Error('restore not supported'));

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 2,
			emptyBatchLimit: 1,
			persist: false
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('restore not supported');
	});
});
