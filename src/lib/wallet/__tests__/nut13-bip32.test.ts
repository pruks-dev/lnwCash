/**
 * NUT-13 legacy BIP32 derivation tests (keyset version `00`).
 *
 * Verified against the official NUT-13 test vectors from
 * cashubtc/nuts tests/13-tests.md (Legacy Derivation), proving byte-for-byte
 * compatibility with the reference implementation.
 */
import { describe, it, expect } from 'vitest';
import { deriveSecretAndR, deriveSecretAndRBip32 } from '../nut13';
import { mnemonicToSeed } from '../keys';

// ─── Official NUT-13 V1 (BIP32) test vectors (cashubtc/nuts tests/13-tests.md) ──
const V1_MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';
const V1_KEYSET_ID = '009a1f293253e41e';
const V1_KEYSET_ID_INT = 864559728n;

const V1_SECRETS = [
	'485875df74771877439ac06339e284c3acfcd9be7abf3bc20b516faeadfe77ae',
	'8f2b39e8e594a4056eb1e6dbb4b0c38ef13b1b2c751f64f810ec04ee35b77270',
	'bc628c79accd2364fd31511216a0fab62afd4a18ff77a20deded7b858c9860c8',
	'59284fd1650ea9fa17db2b3acf59ecd0f2d52ec3261dd4152785813ff27a33bf',
	'576c23393a8b31cc8da6688d9c9a96394ec74b40fdaf1f693a6bb84284334ea0'
];

const V1_R = [
	'ad00d431add9c673e843d4c2bf9a778a5f402b985b8da2d5550bf39cda41d679',
	'967d5232515e10b81ff226ecf5a9e2e2aff92d66ebc3edf0987eb56357fd6248',
	'b20f47bb6ae083659f3aa986bfa0435c55c6d93f687d51a01f26862d9b9a4899',
	'fb5fca398eb0b1deb955a2988b5ac77d32956155f1c002a373535211a2dfdc29',
	'5f09bfbfe27c439a597719321e061e2e40aad4a36768bb2bcc3de547c9644bf9'
];

function rToHex64(r: bigint): string {
	return r.toString(16).padStart(64, '0');
}

describe('NUT-13 legacy BIP32 derivation (keyset version 00)', () => {
	const seed = mnemonicToSeed(V1_MNEMONIC);

	it('should produce a 64-byte BIP39 seed from the mnemonic', () => {
		expect(seed).toHaveLength(64);
	});

	it('should compute the expected keyset_id_int', () => {
		const keysetIdInt = BigInt('0x' + V1_KEYSET_ID) % (2n ** 31n - 1n);
		expect(keysetIdInt).toBe(V1_KEYSET_ID_INT);
	});

	it('should match official NUT-13 V1 secret test vectors (BIP32)', () => {
		for (let counter = 0; counter < 5; counter++) {
			const { secret } = deriveSecretAndRBip32(seed, V1_KEYSET_ID, counter);
			expect(secret).toBe(V1_SECRETS[counter]);
		}
	});

	it('should match official NUT-13 V1 blinding factor test vectors (BIP32)', () => {
		for (let counter = 0; counter < 5; counter++) {
			const { r } = deriveSecretAndRBip32(seed, V1_KEYSET_ID, counter);
			expect(rToHex64(r)).toBe(V1_R[counter]);
			expect(r).toBe(BigInt('0x' + V1_R[counter]));
		}
	});

	it('deriveSecretAndR should route version "00" through BIP32 derivation', () => {
		for (let counter = 0; counter < 5; counter++) {
			expect(deriveSecretAndR(seed, V1_KEYSET_ID, counter)).toEqual(
				deriveSecretAndRBip32(seed, V1_KEYSET_ID, counter)
			);
		}
	});
});
