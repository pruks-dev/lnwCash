/**
 * PIN-based encryption tests
 */
import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, encryptKey, decryptKey } from '../encrypt';

describe('PIN-based encryption', () => {
	const testPin = '123456';
	const testPrivateKey = 'supersecretprivatekey1234567890abcdef';

	describe('hashPin + verifyPin', () => {
		it('should hash a PIN and verify it successfully', async () => {
			const stored = await hashPin(testPin);
			expect(stored.salt).toBeTruthy();
			expect(stored.hash).toBeTruthy();
			expect(stored.iterations).toBeGreaterThan(0);

			const result = await verifyPin(testPin, stored);
			expect(result).toBe(true);
		});

		it('should reject wrong PIN', async () => {
			const stored = await hashPin(testPin);
			const result = await verifyPin('wrong-pin', stored);
			expect(result).toBe(false);
		});

		it('should handle empty PIN', async () => {
			const stored = await hashPin('');
			const result = await verifyPin('', stored);
			expect(result).toBe(true);
		});

		it('should produce different hashes for different PINs', async () => {
			const h1 = await hashPin('111111');
			const h2 = await hashPin('222222');
			expect(h1.hash).not.toBe(h2.hash);
		});

		it('should handle special characters in PIN', async () => {
			const pin = '!@#$%^&*()_+-=[]{}|;:,.<>?';
			const stored = await hashPin(pin);
			const result = await verifyPin(pin, stored);
			expect(result).toBe(true);
		});
	});

	describe('encryptKey + decryptKey', () => {
		it('should encrypt and decrypt private key successfully (roundtrip)', async () => {
			const encrypted = await encryptKey(testPrivateKey, testPin);
			expect(encrypted.salt).toBeTruthy();
			expect(encrypted.iv).toBeTruthy();
			expect(encrypted.data).toBeTruthy();
			expect(encrypted.data).not.toBe(testPrivateKey); // ไม่ใช่ plain text

			const decrypted = await decryptKey(encrypted, testPin);
			expect(decrypted).toBe(testPrivateKey);
		});

		it('should fail to decrypt with wrong PIN', async () => {
			const encrypted = await encryptKey(testPrivateKey, testPin);

			await expect(decryptKey(encrypted, 'wrong-pin'))
				.rejects.toThrow();
		});

		it('should produce different ciphertexts for same key (different salts)', async () => {
			const enc1 = await encryptKey(testPrivateKey, testPin);
			const enc2 = await encryptKey(testPrivateKey, testPin);

			// Different salts → different IVs → different ciphertexts
			expect(enc1.data).not.toBe(enc2.data);
			expect(enc1.iv).not.toBe(enc2.iv);

			// Both should decrypt to the same plaintext
			const dec1 = await decryptKey(enc1, testPin);
			const dec2 = await decryptKey(enc2, testPin);
			expect(dec1).toBe(testPrivateKey);
			expect(dec2).toBe(testPrivateKey);
		});

		it('should handle long private keys', async () => {
			const longKey = 'x'.repeat(1000);
			const encrypted = await encryptKey(longKey, testPin);
			const decrypted = await decryptKey(encrypted, testPin);
			expect(decrypted).toBe(longKey);
		});

		it('should handle unicode characters in private key', async () => {
			const unicodeKey = '🔑🔐💰private-key-with-unicode-你好';
			const encrypted = await encryptKey(unicodeKey, testPin);
			const decrypted = await decryptKey(encrypted, testPin);
			expect(decrypted).toBe(unicodeKey);
		});

		it('CRITICAL: encrypted data must NOT contain plain text key', async () => {
			const encrypted = await encryptKey(testPrivateKey, testPin);
			expect(encrypted.data).not.toContain(testPrivateKey);
			expect(encrypted.data).not.toContain('supersecret');
			// The encrypted string should look like random base64
			expect(encrypted.data).toMatch(/^[A-Za-z0-9_-]+$/);
		});
	});
});
