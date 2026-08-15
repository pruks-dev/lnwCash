/**
 * TASK-241 regression — restore spent-filtering end-to-end with the REAL
 * checkState client (only `fetch` is mocked).
 *
 * RC-4 bug: checkState hex-decoded the proof secret instead of UTF-8 encoding
 * it (the way blind.ts does in blindMessage), so the mint could not match the
 * proof by Y and always reported UNSPENT — meaning SPENT proofs were restored
 * back as spendable. This test proves the fix:
 *   - the REAL checkState now sends the correct Y (matching blindMessage), and
 *   - restoreWallet drops proofs the mint reports as SPENT.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { hash_to_curve } from '../../cashu/blind';
import { deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { restoreWallet } from '../restore';
import { clearAllCounters } from '../counterK';

const getMintPubkeyMock = vi.fn();
vi.mock('../../cashu/keyset', () => ({
	getMintPubkey: (...args: unknown[]) => getMintPubkeyMock(...args)
}));

const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';
const MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

describe('TASK-241 restore spent-filter integration (real checkState)', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	const mockFetch = vi.fn();
	let originalFetch: typeof fetch;
	let capturedYs: string[] = [];

	// Mock mint keypair (real secp256k1, so unblinding in restoreBatch succeeds).
	const mintSecret = secp256k1.utils.randomSecretKey();
	const k = bytesToBigInt(mintSecret);
	const mintPubkey = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch;
		mockFetch.mockReset();
		capturedYs = [];
		vi.clearAllMocks();
		getMintPubkeyMock.mockReturnValue(mintPubkey);
		clearAllCounters();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('sends correct Y (UTF-8 secret) and filters SPENT proofs out', async () => {
		let restoreCalls = 0;
		mockFetch.mockImplementation(async (url: string, init: { body?: string }) => {
			if (url.includes('/v1/restore')) {
				restoreCalls++;
				const body = JSON.parse(init.body ?? '{}');
				const outputs: Array<{ B_: string }> = body.outputs ?? [];
				if (restoreCalls > 1) {
					return { ok: true, json: async () => ({ outputs, signatures: [] }) };
				}
				return {
					ok: true,
					json: async () => ({
						outputs,
						signatures: outputs.map((o) => ({
							id: KEYSET_ID,
							amount: 4,
							C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
						}))
					})
				};
			}
			if (url.includes('/v1/checkstate')) {
				const body = JSON.parse(init.body ?? '{}');
				const ys: string[] = body.Ys ?? [];
				capturedYs = ys;
				// Mint reports the first proof SPENT, the rest UNSPENT.
				return {
					ok: true,
					json: async () => ({
						states: ys.map((_y, i) => ({
							secret: `s${i}`,
							state: i === 0 ? 'SPENT' : 'UNSPENT',
							witness: i === 0 ? 'w' : null
						}))
					})
				};
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID, {
			batchSize: 2,
			emptyBatchLimit: 1,
			persist: false
		});

		// Expected Ys computed the way blindMessage does: hash_to_curve(utf8(secret)).
		const expectedSecrets = [0, 1].map((i) => deriveSecret(seed, KEYSET_ID, i));
		const expectedYs = expectedSecrets.map((s) => hash_to_curve(utf8ToBytes(s)).toHex(true));

		// The REAL checkState must have sent Ys matching blindMessage's encoding.
		expect(capturedYs).toHaveLength(2);
		expect(capturedYs).toEqual(expectedYs);

		expect(result.success).toBe(true);
		// Only the UNSPENT proof (counter 1) is kept; SPENT (counter 0) is dropped.
		expect(result.proofs).toHaveLength(1);
		expect(result.proofs[0].secret).toBe(expectedSecrets[1]);
	});

	it('restore round-trip with keyset version 00 (BIP32) — derive + blind + unblind + spent filter', async () => {
		// TASK-251 (RC-4 / F-V28-006): live mint uses keyset `00c25786d85a1dcd`
		// (version 00 → BIP32 legacy derivation). This proves the restore
		// round-trip (REAL deriveSecretAndR → blindMessage → restore → unblind →
		// checkState spent filter) works through the BIP32 path, not just HMAC.
		const KEYSET_ID_V00 = '00c25786d85a1dcd';
		const BIP32_COUNTER0 = '81ba74fdabb0c4337e0eda9262dce21246c0b6c1dd0fdd2745032a4e46451a7c';
		const BIP32_COUNTER1 = '6f050b20feee6fbad8bea06d0ae16166187640ac6ae4818a0383dc5f09d688ba';

		let restoreCalls = 0;
		mockFetch.mockImplementation(async (url: string, init: { body?: string }) => {
			if (url.includes('/v1/restore')) {
				restoreCalls++;
				const body = JSON.parse(init.body ?? '{}');
				const outputs: Array<{ B_: string }> = body.outputs ?? [];
				if (restoreCalls > 1) {
					return { ok: true, json: async () => ({ outputs, signatures: [] }) };
				}
				return {
					ok: true,
					json: async () => ({
						outputs,
						signatures: outputs.map((o) => ({
							id: KEYSET_ID_V00,
							amount: 4,
							C_: secp256k1.Point.fromHex(o.B_).multiply(k).toHex(true)
						}))
					})
				};
			}
			if (url.includes('/v1/checkstate')) {
				const body = JSON.parse(init.body ?? '{}');
				const ys: string[] = body.Ys ?? [];
				capturedYs = ys;
				// Mint reports the first proof SPENT, the rest UNSPENT.
				return {
					ok: true,
					json: async () => ({
						states: ys.map((_y, i) => ({
							secret: `s${i}`,
							state: i === 0 ? 'SPENT' : 'UNSPENT',
							witness: i === 0 ? 'w' : null
						}))
					})
				};
			}
			throw new Error(`unexpected fetch: ${url}`);
		});

		const result = await restoreWallet(MINT_URL, seed, KEYSET_ID_V00, {
			batchSize: 2,
			emptyBatchLimit: 1,
			persist: false
		});

		// Real BIP32 secrets for counters 0 and 1 — hardcoded so the test FAILS
		// if derivation routes through HMAC; also cross-checked against the
		// REAL deriveSecret (which itself goes through deriveSecretAndR → BIP32).
		const expectedSecrets = [BIP32_COUNTER0, BIP32_COUNTER1];
		expect(expectedSecrets).toEqual([
			deriveSecret(seed, KEYSET_ID_V00, 0),
			deriveSecret(seed, KEYSET_ID_V00, 1)
		]);
		const expectedYs = expectedSecrets.map((s) => hash_to_curve(utf8ToBytes(s)).toHex(true));

		// The REAL checkState must have sent Ys matching blindMessage's encoding.
		expect(capturedYs).toHaveLength(2);
		expect(capturedYs).toEqual(expectedYs);

		expect(result.success).toBe(true);
		// Only the UNSPENT proof (counter 1) is kept; SPENT (counter 0) is dropped.
		expect(result.proofs).toHaveLength(1);
		expect(result.proofs[0].secret).toBe(expectedSecrets[1]);
	});
});
