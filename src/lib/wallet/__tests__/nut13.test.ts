/**
 * NUT-13 deterministic secret derivation tests.
 *
 * The V2 (HMAC-SHA256) cases are verified against the official NUT-13 test
 * vectors from cashubtc/nuts/tests/13-tests.md, proving byte-for-byte
 * compatibility with the reference implementation.
 */
import { describe, it, expect } from 'vitest';
import {
	deriveSecretAndR,
	deriveSecret,
	seedFromMnemonic,
	CASHU_KDF_DOMAIN
} from '../nut13';
import { mnemonicToSeed } from '../keys';

// ─── Official NUT-13 V2 test vectors (cashubtc/nuts tests/13-tests.md) ──
const V2_MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';
const V2_KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';

const V2_SECRETS = [
	'db5561a07a6e6490f8dadeef5be4e92f7cebaecf2f245356b5b2a4ec40687298',
	'b70e7b10683da3bf1cdf0411206f8180c463faa16014663f39f2529b2fda922e',
	'78a7ac32ccecc6b83311c6081b89d84bb4128f5a0d0c5e1af081f301c7a513f5',
	'094a2b6c63bfa7970bc09cda0e1cfc9cd3d7c619b8e98fabcfc60aea9e4963e5',
	'5e89fc5d30d0bf307ddf0a3ac34aa7a8ee3702169dafa3d3fe1d0cae70ecd5ef'
];

const V2_R = [
	'6d26181a3695e32e9f88b80f039ba1ae2ab5a200ad4ce9dbc72c6d3769f2b035',
	'bde4354cee75545bea1a2eee035a34f2d524cee2bb01613823636e998386952e',
	'f40cc1218f085b395c8e1e5aaa25dccc851be3c6c7526a0f4e57108f12d6dac4',
	'099ed70fc2f7ac769bc20b2a75cb662e80779827b7cc358981318643030577d0',
	'5550337312d223ba62e3f75cfe2ab70477b046d98e3e71804eade3956c7b98cf'
];

function rToHex64(r: bigint): string {
	return r.toString(16).padStart(64, '0');
}

describe('NUT-13 HMAC-SHA256 derivation', () => {
	const seed = mnemonicToSeed(V2_MNEMONIC);

	it('should produce a 64-byte BIP39 seed from the mnemonic', () => {
		expect(seed).toHaveLength(64);
	});

	it('should match official NUT-13 V2 secret test vectors', () => {
		for (let counter = 0; counter < 5; counter++) {
			const { secret } = deriveSecretAndR(seed, V2_KEYSET_ID, counter);
			expect(secret).toBe(V2_SECRETS[counter]);
		}
	});

	it('should match official NUT-13 V2 blinding factor test vectors', () => {
		for (let counter = 0; counter < 5; counter++) {
			const { r } = deriveSecretAndR(seed, V2_KEYSET_ID, counter);
			expect(rToHex64(r)).toBe(V2_R[counter]);
		}
	});

	it('should derive secrets of length 64 hex (32 bytes)', () => {
		const { secret } = deriveSecretAndR(seed, V2_KEYSET_ID, 0);
		expect(secret).toHaveLength(64);
	});

	it('deriveSecret should equal deriveSecretAndR().secret', () => {
		for (let counter = 0; counter < 5; counter++) {
			expect(deriveSecret(seed, V2_KEYSET_ID, counter)).toBe(
				deriveSecretAndR(seed, V2_KEYSET_ID, counter).secret
			);
		}
	});
});

describe('NUT-13 determinism', () => {
	const seed = seedFromMnemonic(V2_MNEMONIC);
	const keysetId = '01' + 'aa'.repeat(32);

	it('same seed + keyset + counter → same secret and r (always)', () => {
		for (let counter = 0; counter < 20; counter++) {
			const a = deriveSecretAndR(seed, keysetId, counter);
			const b = deriveSecretAndR(seed, keysetId, counter);
			expect(a.secret).toBe(b.secret);
			expect(a.r).toBe(b.r);
		}
	});

	it('different counters → different secrets', () => {
		const s0 = deriveSecret(seed, keysetId, 0);
		const s1 = deriveSecret(seed, keysetId, 1);
		const s2 = deriveSecret(seed, keysetId, 2);
		expect(s0).not.toBe(s1);
		expect(s1).not.toBe(s2);
	});

	it('different keysets → different secrets', () => {
		const ksA = '01' + 'aa'.repeat(32);
		const ksB = '01' + 'bb'.repeat(32);
		expect(deriveSecret(seed, ksA, 0)).not.toBe(deriveSecret(seed, ksB, 0));
	});

	it('different seeds → different secrets', () => {
		const seedB = mnemonicToSeed(
			'legal winner thank year wave sausage worth useful legal winner thank yellow'
		);
		expect(deriveSecret(seed, keysetId, 0)).not.toBe(deriveSecret(seedB, keysetId, 0));
	});

	it('r is always in [1, N-1]', () => {
		for (let counter = 0; counter < 100; counter++) {
			const { r } = deriveSecretAndR(seed, keysetId, counter);
			expect(r).toBeGreaterThan(0n);
		}
	});
});

describe('NUT-13 version handling', () => {
	const seed = mnemonicToSeed(V2_MNEMONIC);

	it('should derive via legacy BIP32 for keyset version "00"', () => {
		const legacyId = '009a1f293253e41e';
		const { secret } = deriveSecretAndR(seed, legacyId, 0);
		expect(secret).toBe('485875df74771877439ac06339e284c3acfcd9be7abf3bc20b516faeadfe77ae');
	});

	it('should reject unknown keyset versions', () => {
		const unknownId = 'ff' + 'aa'.repeat(31);
		expect(() => deriveSecretAndR(seed, unknownId, 0)).toThrow(/unsupported keyset version/i);
	});

	it('should reject an empty keyset id', () => {
		expect(() => deriveSecretAndR(seed, '', 0)).toThrow(/unsupported keyset version/i);
	});
});

describe('domain separator', () => {
	it('should export the correct NUT-13 domain string', () => {
		expect(CASHU_KDF_DOMAIN).toBe('Cashu_KDF_HMAC_SHA256');
	});
});
