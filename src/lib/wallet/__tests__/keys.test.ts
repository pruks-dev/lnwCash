/**
 * Key generation tests
 */
import { describe, it, expect } from 'vitest';
import {
	generateKeyPair,
	getPublicKey,
	verifyKeyPair,
	privateKeyToSeed,
	seedToPrivateKey
} from '../keys';

describe('Key generation', () => {
	describe('generateKeyPair', () => {
		it('should generate a valid secp256k1 keypair', () => {
			const pair = generateKeyPair();
			expect(pair).toBeDefined();
			expect(pair.privateKey).toBeTruthy();
			expect(pair.privateKey).toBeTypeOf('string');
			expect(pair.publicKey).toBeTruthy();
			expect(pair.publicKey).toBeTypeOf('string');
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

	describe('Seed phrase roundtrip', () => {
		it('should convert private key to seed and back', () => {
			const { privateKey } = generateKeyPair();
			const seed = privateKeyToSeed(privateKey);
			const restored = seedToPrivateKey(seed);
			expect(restored).toBe(privateKey);
		});

		it('should produce a 24-word seed phrase', () => {
			const { privateKey } = generateKeyPair();
			const seed = privateKeyToSeed(privateKey);
			const words = seed.split(' ');
			expect(words.length).toBe(24);
			// Each word should be lowercase and valid
			for (const word of words) {
				expect(word).toBe(word.toLowerCase());
			}
		});

		it('should reject seed with wrong word count', () => {
			expect(() => seedToPrivateKey('one two three')).toThrow(/expected 24 words/i);
		});

		it('should reject seed with invalid words', () => {
			const badSeed = Array(24).fill('notaword').join(' ');
			expect(() => seedToPrivateKey(badSeed)).toThrow(/not found in wordlist/i);
		});

		it('should reject seed with checksum mismatch', () => {
			const { privateKey } = generateKeyPair();
			const seed = privateKeyToSeed(privateKey);
			const words = seed.split(' ');
			// Change last word to corrupt checksum
			const lastWord = words[words.length - 1];
			const differentWord = lastWord === 'abandon' ? 'ability' : 'abandon';
			words[words.length - 1] = differentWord;
			expect(() => seedToPrivateKey(words.join(' '))).toThrow(/checksum/i);
		});

		it('should handle multiple roundtrips consistent', () => {
			const { privateKey } = generateKeyPair();

			for (let i = 0; i < 3; i++) {
				const seed = privateKeyToSeed(privateKey);
				const restored = seedToPrivateKey(seed);
				expect(restored).toBe(privateKey);
			}
		});

		it('should reject invalid private key length for seed generation', () => {
			// 'short' is not valid base64url, will throw decoding error
			expect(() => privateKeyToSeed('short')).toThrow();
		});
	});
});
