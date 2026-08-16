/**
 * TASK-261 (F-V30-003) regression — restore must match the mint's echoed B_
 * by its NORMALIZED form (lowercase hex, no `0x` prefix, no leading-zero
 * padding), not the raw string.
 *
 * A mint may reformat the echoed B_ (uppercase, an `0x` prefix, or extra
 * leading zeros). If `byB` matched raw strings, the lookup would miss and fall
 * back to index alignment (`prepared[i]`) — reintroducing the F-V29-003 bug.
 *
 * This test drives `restoreBatch` through a gap (counter 0 unsigned) while the
 * mock mint echoes B_ in three different formats, proving the B_ still matches
 * and the recovered proof belongs to the CORRECT counter (no index fallback).
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

/** Reformat an echoed B_ the way a mint might (without changing the point). */
type BFormat = 'uppercase' | '0x-prefix' | 'leading-zero-padding';
function reformat(B_: string, format: BFormat): string {
	switch (format) {
		case 'uppercase':
			return B_.toUpperCase();
		case '0x-prefix':
			// Uppercase `X` also exercises the case-insensitive prefix strip.
			return `0X${B_}`;
		case 'leading-zero-padding':
			return `00${B_}`; // 68 hex chars instead of the canonical 66
	}
}

describe('TASK-261 restore matches normalized B_ (case / 0x / padding)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	const mintSecret = secp256k1.utils.randomSecretKey();
	const k = bytesToBigInt(mintSecret);
	const mintPubkey = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(() => {
		vi.clearAllMocks();
		getMintPubkeyMock.mockReturnValue(mintPubkey);
	});

	it.each<BFormat>(['uppercase', '0x-prefix', 'leading-zero-padding'])(
		'echoes B_ as %s and still matches by B_ (no index fallback)',
		async (format) => {
			// Gap scenario: the mint signs only counters 1 and 2 (counter 0 was
			// never signed), and echoes each B_ reformatted per `format`.
			restoreOutputsMock.mockImplementation(
				async (_url: string, outputs: Array<{ B_: string }>) => {
					const signed = outputs.filter((_o, idx) => idx !== 0);
					return {
						outputs: signed.map((o) => ({ ...o, B_: reformat(o.B_, format) })),
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

			// B_ match must resolve counters 1 and 2 — NOT index fallback
			// (which would have assigned counters 0 and 1).
			expect(proofs[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 1));
			expect(proofs[1].secret).toBe(deriveSecret(seed, KEYSET_ID, 2));
			expect(proofs[0].secret).not.toBe(deriveSecret(seed, KEYSET_ID, 0));

			// No garbage: unblinded C verifies against the MATCHED secret.
			expect(verifySignature(proofs[0].C, proofs[0].secret, k)).toBe(true);
			expect(verifySignature(proofs[1].C, proofs[1].secret, k)).toBe(true);
		}
	);

	it('still keeps the index fallback when the mint omits `outputs` (compat)', async () => {
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
