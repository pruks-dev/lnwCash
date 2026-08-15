/**
 * TASK-252 regression — BIP32 (keyset version `00`) restore with a counter gap.
 *
 * Continues F-V28-006 (TASK-251): the live mint uses keyset `00c25786d85a1dcd`
 * (version 00 → NUT-13 legacy BIP32 derivation). This test proves the full
 * round-trip — derive (BIP32) → blind → restore → unblind (by B_) → spent
 * filter — works through the BIP32 path even when the mint's FILTERED restore
 * response has a gap (counter 0 unsigned, 1 and 2 signed).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { mnemonicToSeed } from '../keys';
import { verifySignature } from '../../cashu/blind';

// ─── Mock the mint HTTP client ───────────────────────────────
const restoreOutputsMock = vi.fn();
const checkStateMock = vi.fn();

vi.mock('../../cashu/client', () => ({
	restoreOutputs: (...args: unknown[]) => restoreOutputsMock(...args),
	checkState: (...args: unknown[]) => checkStateMock(...args)
}));

// ─── Mock keyset resolution ──────────────────────────────────
const getMintPubkeyMock = vi.fn();
vi.mock('../../cashu/keyset', () => ({
	getMintPubkey: (...args: unknown[]) => getMintPubkeyMock(...args)
}));

import { restoreWallet } from '../restore';
import { clearAllCounters } from '../counterK';

const MINT_URL = 'https://mint.example.com';
const MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';

// Live-mint keyset (version 00 → BIP32 legacy derivation).
const KEYSET_ID_V00 = '00c25786d85a1dcd';

// Real BIP32 secrets for counters 0..2 — hardcoded so the test FAILS if the
// derivation routes through the HMAC path (these values only match BIP32).
const BIP32_SECRETS = [
	'81ba74fdabb0c4337e0eda9262dce21246c0b6c1dd0fdd2745032a4e46451a7c',
	'6f050b20feee6fbad8bea06d0ae16166187640ac6ae4818a0383dc5f09d688ba',
	'b6e9d83195d21bb8b9576efee9d126aa292461bb1a3ef8cc8754f78bbf7a80a8'
];

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

describe('TASK-252 BIP32 (version 00) restore with gap', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	const mintSecret = secp256k1.utils.randomSecretKey();
	const k = bytesToBigInt(mintSecret);
	const mintPubkey = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(() => {
		vi.clearAllMocks();
		clearAllCounters();
		getMintPubkeyMock.mockReturnValue(mintPubkey);
	});

	it('recovers BIP32 proofs through a counter-0 gap and advances counter to 3', async () => {
		// counter 0 unsigned, counters 1 and 2 signed (FILTERED response).
		let calls = 0;
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => {
				calls++;
				if (calls > 1) return { outputs: [], signatures: [] };
				const signed = outputs.filter((_o, idx) => idx !== 0);
				return {
					outputs: signed,
					signatures: signed.map((o) => ({
						id: KEYSET_ID_V00,
						amount: 4,
						C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
					}))
				};
			}
		);

		checkStateMock.mockResolvedValue({
			states: [
				{ secret: 'x', state: 'UNSPENT', witness: null },
				{ secret: 'y', state: 'UNSPENT', witness: null }
			]
		});

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID_V00, {
			batchSize: 3,
			emptyBatchLimit: 1,
			persist: false
		});

		expect(result.success).toBe(true);

		// The recovered secrets MUST be the real BIP32 values for counters 1 and 2.
		expect(result.proofs).toHaveLength(2);
		expect(result.proofs[0].secret).toBe(BIP32_SECRETS[1]);
		expect(result.proofs[1].secret).toBe(BIP32_SECRETS[2]);
		// And explicitly NOT counter 0 (what an index-mapped recovery would give).
		expect(result.proofs[0].secret).not.toBe(BIP32_SECRETS[0]);

		// No garbage proofs — unblinded C verifies against the BIP32 secret.
		expect(verifySignature(result.proofs[0].C, result.proofs[0].secret, k)).toBe(true);
		expect(verifySignature(result.proofs[1].C, result.proofs[1].secret, k)).toBe(true);

		// counter_k = highest signed (2) + 1 = 3.
		expect(result.counter).toBe(3);
	});
});
