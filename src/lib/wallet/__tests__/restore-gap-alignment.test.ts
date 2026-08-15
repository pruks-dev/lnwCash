/**
 * TASK-252 (F-V29-003) regression — restore must align the mint's FILTERED
 * /v1/restore signatures by B_ (not by index).
 *
 * Nutshell returns only the outputs it actually signed, so `signatures[i]` does
 * NOT correspond to `prepared[i]` when there is a gap. Mapping by index unblinds
 * with the wrong blinding factor and produces garbage proofs.
 *
 * This test simulates a gap (counter 0 unsigned, counters 1 and 2 signed) and
 * proves the unblinded C + secret both match the CORRECT counter.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { verifySignature } from '../../cashu/blind';

// ─── Mock the mint HTTP client ───────────────────────────────
const restoreOutputsMock = vi.fn();

vi.mock('../../cashu/client', () => ({
	restoreOutputs: (...args: unknown[]) => restoreOutputsMock(...args)
}));

// ─── Mock keyset resolution (returns the mock mint's pubkey) ─
const getMintPubkeyMock = vi.fn();
vi.mock('../../cashu/keyset', () => ({
	getMintPubkey: (...args: unknown[]) => getMintPubkeyMock(...args)
}));

import { restoreBatch } from '../restore';

const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';
const MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

describe('TASK-252 restore gap alignment (B_ not index)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	// Mock mint keypair (real secp256k1)
	const mintSecret = secp256k1.utils.randomSecretKey();
	const k = bytesToBigInt(mintSecret);
	const mintPubkey = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(() => {
		vi.clearAllMocks();
		getMintPubkeyMock.mockReturnValue(mintPubkey);
	});

	it('aligns FILTERED signatures by B_ and unblinds with the correct factor (no garbage)', async () => {
		// The mint signs only counters 1 and 2 — counter 0 was never signed.
		// The returned `outputs` and `signatures` are FILTERED (length 2).
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => {
				const signed = outputs.filter((_o, idx) => idx !== 0);
				return {
					outputs: signed,
					signatures: signed.map((o) => ({
						id: KEYSET_ID,
						amount: 1,
						C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
					}))
				};
			}
		);

		const { proofs, signaturesCount, highestSignedCounter } = await restoreBatch(
			MINT_URL,
			seed,
			KEYSET_ID,
			0,
			3
		);

		expect(signaturesCount).toBe(2);
		expect(proofs).toHaveLength(2);
		expect(highestSignedCounter).toBe(2);

		// The recovered proofs must belong to counters 1 and 2 — NOT 0 and 1
		// (which is what index-based mapping would have produced).
		expect(proofs[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 1));
		expect(proofs[1].secret).toBe(deriveSecret(seed, KEYSET_ID, 2));
		expect(proofs[0].secret).not.toBe(deriveSecret(seed, KEYSET_ID, 0));

		// No garbage proof: unblinded C must verify against the MATCHED secret.
		expect(verifySignature(proofs[0].C, proofs[0].secret, k)).toBe(true);
		expect(verifySignature(proofs[1].C, proofs[1].secret, k)).toBe(true);
	});

	it('keeps 1:1 index fallback when the mint omits `outputs` (compat)', async () => {
		// Compat mint: returns signatures aligned 1:1 with the request, no
		// `outputs` field. The fallback must still recover the right proofs.
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => ({
				signatures: outputs.map((o, i) => ({
					id: KEYSET_ID,
					amount: i + 1,
					C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
				}))
			})
		);

		const { proofs, signaturesCount, highestSignedCounter } = await restoreBatch(
			MINT_URL,
			seed,
			KEYSET_ID,
			0,
			3
		);

		expect(signaturesCount).toBe(3);
		expect(proofs).toHaveLength(3);
		expect(highestSignedCounter).toBe(2);

		proofs.forEach((proof, i) => {
			expect(proof.secret).toBe(deriveSecret(seed, KEYSET_ID, i));
			expect(verifySignature(proof.C, proof.secret, k)).toBe(true);
		});
	});
});
