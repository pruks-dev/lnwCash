/**
 * Key generation tests — BIP39 (12-word) + legacy (24-word) dual support.
 */
import { describe, it, expect } from 'vitest';
import {
	generateKeyPair,
	generateMnemonic,
	mnemonicToSeed,
	mnemonicToPrivateKey,
	getPublicKey,
	verifyKeyPair,
	privateKeyToSeed,
	seedToPrivateKey,
	BIP39_SEED_WORD_COUNT,
	LEGACY_SEED_WORD_COUNT
} from '../keys';
import { WORDLIST } from '../wordlist';

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// ─── BIP39 known test vectors (Trezor 128-bit entropy, empty passphrase) ──
// Verified against the canonical BIP39 reference value and Node's built-in
// crypto.pbkdf2Sync (independent oracle).
const BIP39_VECTORS: Array<{ mnemonic: string; seed: string }> = [
	{
		mnemonic:
			'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
		seed: '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'
	},
	{
		mnemonic:
			'legal winner thank year wave sausage worth useful legal winner thank yellow',
		seed: '878386efb78845b3355bd15ea4d39ef97d179cb712b77d5c12b6be415fffeffe5f377ba02bf3f8544ab800b955e51fbff09828f682052a20faa6addbbddfb096'
	},
	{
		mnemonic:
			'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
		seed: '77d6be9708c8218738934f84bbbb78a2e048ca007746cb764f0673e4b1812d176bbb173e1a291f31cf633f1d0bad7d3cf071c30e98cd0688b5bcce65ecaceb36'
	}
];

describe('Key generation', () => {
	describe('generateKeyPair', () => {
		it('should generate a valid secp256k1 keypair with a 12-word mnemonic', () => {
			const pair = generateKeyPair();
			expect(pair).toBeDefined();
			expect(pair.privateKey).toBeTruthy();
			expect(pair.publicKey).toBeTruthy();
			expect(pair.mnemonic).toBeTruthy();
			expect(pair.mnemonic.split(' ').length).toBe(BIP39_SEED_WORD_COUNT);
		});

		it('should have a compressed public key (66 hex chars)', () => {
			const pair = generateKeyPair();
			expect(pair.publicKey.length).toBe(66);
			expect(pair.publicKey.startsWith('02') || pair.publicKey.startsWith('03')).toBe(true);
		});

		it('should generate unique keypairs each time', () => {
			const p1 = generateKeyPair();
			const p2 = generateKeyPair();
			expect(p1.privateKey).not.toBe(p2.privateKey);
			expect(p1.publicKey).not.toBe(p2.publicKey);
		});

		it('mnemonic should deterministically derive the matching private key', () => {
			const { mnemonic, privateKey } = generateKeyPair();
			expect(mnemonicToPrivateKey(mnemonic)).toBe(privateKey);
		});
	});

	describe('getPublicKey', () => {
		it('should derive public key from private key', () => {
			const { privateKey, publicKey } = generateKeyPair();
			const derived = getPublicKey(privateKey);
			expect(derived).toBe(publicKey);
		});

		it('should return 66-char hex compressed key', () => {
			const { privateKey } = generateKeyPair();
			const pub = getPublicKey(privateKey);
			expect(pub.length).toBe(66);
			expect(pub.startsWith('02') || pub.startsWith('03')).toBe(true);
		});
	});

	describe('verifyKeyPair', () => {
		it('should return true for valid keypair', () => {
			const { privateKey, publicKey } = generateKeyPair();
			expect(verifyKeyPair(privateKey, publicKey)).toBe(true);
		});

		it('should return false for mismatched keypair', () => {
			const p1 = generateKeyPair();
			const p2 = generateKeyPair();
			expect(verifyKeyPair(p1.privateKey, p2.publicKey)).toBe(false);
		});

		it('should return false for invalid private key', () => {
			expect(verifyKeyPair('invalid-key', '02' + 'ff'.repeat(32))).toBe(false);
		});
	});
});

describe('BIP39 standard derivation (12-word)', () => {
	it('should produce a 12-word mnemonic from generateMnemonic', () => {
		const mnemonic = generateMnemonic();
		expect(mnemonic.split(' ').length).toBe(BIP39_SEED_WORD_COUNT);
		for (const word of mnemonic.split(' ')) {
			expect(WORDLIST).toContain(word);
		}
	});

	it('should match known BIP39 test vectors (mnemonic → 512-bit seed)', () => {
		for (const { mnemonic, seed } of BIP39_VECTORS) {
			expect(toHex(mnemonicToSeed(mnemonic))).toBe(seed);
		}
	});

	it('should derive a valid private key from a known mnemonic', () => {
		for (const { mnemonic } of BIP39_VECTORS) {
			const privateKey = mnemonicToPrivateKey(mnemonic);
			const pub = getPublicKey(privateKey);
			expect(pub.length).toBe(66);
		}
	});

	it('should round-trip: mnemonic → private key is deterministic', () => {
		for (const { mnemonic } of BIP39_VECTORS) {
			expect(mnemonicToPrivateKey(mnemonic)).toBe(mnemonicToPrivateKey(mnemonic));
		}
	});

	it('should route 12-word seed through seedToPrivateKey (BIP39 path)', () => {
		const mnemonic = generateMnemonic();
		expect(seedToPrivateKey(mnemonic)).toBe(mnemonicToPrivateKey(mnemonic));
	});

	it('should reject a 12-word mnemonic with invalid checksum', () => {
		const mnemonic =
			'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
		expect(() => mnemonicToPrivateKey(mnemonic)).toThrow(/checksum/i);
	});

	it('should reject a 12-word mnemonic with an unknown word', () => {
		const bad =
			'notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword notaword';
		expect(() => mnemonicToPrivateKey(bad)).toThrow(/not found in wordlist/i);
	});
});

describe('Legacy seed phrase (24-word, backward compatible)', () => {
	it('privateKeyToSeed should produce a 24-word phrase', () => {
		const { privateKey } = generateKeyPair();
		const seed = privateKeyToSeed(privateKey);
		expect(seed.split(' ').length).toBe(LEGACY_SEED_WORD_COUNT);
	});

	it('should round-trip a legacy 24-word phrase to the same key', () => {
		const { privateKey } = generateKeyPair();
		const seed = privateKeyToSeed(privateKey);
		const restored = seedToPrivateKey(seed);
		expect(restored).toBe(privateKey);
	});

	it('should route 24-word seed through seedToPrivateKey (legacy path)', () => {
		const { privateKey } = generateKeyPair();
		const seed = privateKeyToSeed(privateKey);
		expect(seedToPrivateKey(seed)).toBe(privateKey);
	});

	it('should reject a 24-word legacy seed with checksum mismatch', () => {
		const { privateKey } = generateKeyPair();
		const seed = privateKeyToSeed(privateKey);
		const words = seed.split(' ');
		const lastWord = words[words.length - 1];
		const differentWord = lastWord === 'abandon' ? 'ability' : 'abandon';
		words[words.length - 1] = differentWord;
		expect(() => seedToPrivateKey(words.join(' '))).toThrow(/checksum/i);
	});

	it('should reject a 24-word legacy seed with an unknown word', () => {
		const badSeed = Array(LEGACY_SEED_WORD_COUNT).fill('notaword').join(' ');
		expect(() => seedToPrivateKey(badSeed)).toThrow(/not found in wordlist/i);
	});
});

describe('Seed phrase validation (dual)', () => {
	it('should reject an unsupported word count', () => {
		expect(() => seedToPrivateKey('one two three')).toThrow(
			/expected 12 or 24 words/i
		);
	});

	it('should reject invalid private key length for legacy seed generation', () => {
		// 'short' is not valid base64url, will throw decoding error
		expect(() => privateKeyToSeed('short')).toThrow();
	});

	it('should handle multiple roundtrips consistently (12-word)', () => {
		const { mnemonic, privateKey } = generateKeyPair();
		for (let i = 0; i < 3; i++) {
			expect(mnemonicToPrivateKey(mnemonic)).toBe(privateKey);
			expect(seedToPrivateKey(mnemonic)).toBe(privateKey);
		}
	});
});
