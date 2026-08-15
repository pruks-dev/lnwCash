/**
 * TASK-252 (F-V29-004) regression — counter_k must advance to the HIGHEST
 * signed counter + 1, not the signature count.
 *
 * `lastNonEmptyCounter = counter + proofs.length` undercounts when the mint's
 * response has gaps: if counter 0 was never signed but 1 and 2 were, the old
 * code recorded counter 2 (0 + 2) instead of 3. That lets a later restore
 * re-derive/re-mint the wrong counters.
 *
 * This test drives restoreWallet through a gap scenario and asserts counter = 3.
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

// ─── Mock keyset resolution ──────────────────────────────────
const getMintPubkeyMock = vi.fn();
vi.mock('../../cashu/keyset', () => ({
	getMintPubkey: (...args: unknown[]) => getMintPubkeyMock(...args)
}));

import { restoreWallet } from '../restore';
import { getCounterK, clearAllCounters } from '../counterK';

const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';
const MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

describe('TASK-252 counter = highest signed + 1 (gap)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	const mintSecret = secp256k1.utils.randomSecretKey();
	const k = bytesToBigInt(mintSecret);
	const mintPubkey = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(() => {
		vi.clearAllMocks();
		clearAllCounters();
		getMintPubkeyMock.mockReturnValue(mintPubkey);
	});

	it('counter 0 unsigned + 1,2 signed → counter = 3 (not 2)', async () => {
		// First batch (counters 0,1,2): sign only counters 1 and 2 (gap at 0).
		// All subsequent batches: empty.
		let calls = 0;
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => {
				calls++;
				if (calls > 1) return { outputs: [], signatures: [] };
				const signed = outputs.filter((_o, idx) => idx !== 0);
				return {
					outputs: signed,
					signatures: signed.map((o) => ({
						id: KEYSET_ID,
						amount: 8,
						C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
					}))
				};
			}
		);

		// Both recovered proofs are UNSPENT.
		checkStateMock.mockResolvedValue({
			states: [
				{ secret: 'x', state: 'UNSPENT', witness: null },
				{ secret: 'y', state: 'UNSPENT', witness: null }
			]
		});

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 3,
			emptyBatchLimit: 1,
			persist: false
		});

		expect(result.success).toBe(true);
		// Two proofs recovered (counters 1 and 2).
		expect(result.proofs).toHaveLength(2);
		expect(result.proofs[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 1));
		expect(result.proofs[1].secret).toBe(deriveSecret(seed, KEYSET_ID, 2));
		// No garbage: unblinded C verifies against the matched secret.
		expect(verifySignature(result.proofs[0].C, result.proofs[0].secret, k)).toBe(true);
		expect(verifySignature(result.proofs[1].C, result.proofs[1].secret, k)).toBe(true);

		// Counter must be highest signed (2) + 1 = 3 — NOT signature count (2).
		expect(result.counter).toBe(3);
		expect(getCounterK(KEYSET_ID)).toBe(3);
	});

	it('counter = highest signed + 1 even when a signed proof is SPENT', async () => {
		// counter 0 unsigned; 1,2 signed; counter 1 SPENT, counter 2 UNSPENT.
		let calls = 0;
		restoreOutputsMock.mockImplementation(
			async (_url: string, outputs: Array<{ B_: string }>) => {
				calls++;
				if (calls > 1) return { outputs: [], signatures: [] };
				const signed = outputs.filter((_o, idx) => idx !== 0);
				return {
					outputs: signed,
					signatures: signed.map((o) => ({
						id: KEYSET_ID,
						amount: 8,
						C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
					}))
				};
			}
		);

		// First (counter 1) SPENT, second (counter 2) UNSPENT.
		checkStateMock.mockResolvedValue({
			states: [
				{ secret: 'x', state: 'SPENT', witness: 'w' },
				{ secret: 'y', state: 'UNSPENT', witness: null }
			]
		});

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 3,
			emptyBatchLimit: 1,
			persist: false
		});

		expect(result.success).toBe(true);
		expect(result.proofs).toHaveLength(1);
		expect(result.proofs[0].secret).toBe(deriveSecret(seed, KEYSET_ID, 2));
		// counter_k still reflects the highest SIGNED counter (2) + 1 = 3.
		expect(result.counter).toBe(3);
		expect(getCounterK(KEYSET_ID)).toBe(3);
	});
});
