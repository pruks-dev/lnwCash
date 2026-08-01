/**
 * Base64url encoding/decoding tests
 */
import { describe, it, expect } from 'vitest';
import { base64url } from '../base64';

describe('base64url encoding', () => {
	describe('encode', () => {
		it('should encode bytes to base64url string', () => {
			const input = new Uint8Array([0x66, 0x6f, 0x6f]); // "foo"
			const encoded = base64url.encode(input);
			expect(encoded).toBe('Zm9v');
		});

		it('should produce URL-safe output (no +, /, or =)', () => {
			const bytes = crypto.getRandomValues(new Uint8Array(100));
			const encoded = base64url.encode(bytes);
			expect(encoded).not.toContain('+');
			expect(encoded).not.toContain('/');
			expect(encoded).not.toContain('=');
		});

		it('should encode empty array', () => {
			const encoded = base64url.encode(new Uint8Array(0));
			expect(encoded).toBe('');
		});

		it('should encode binary data', () => {
			const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x7f]);
			const encoded = base64url.encode(bytes);
			expect(encoded).toBeTruthy();
			expect(encoded.length).toBeGreaterThan(0);
		});
	});

	describe('decode', () => {
		it('should decode base64url string back to bytes', () => {
			const original = new Uint8Array([0x66, 0x6f, 0x6f]); // "foo"
			const encoded = base64url.encode(original);
			const decoded = base64url.decode(encoded);
			expect(decoded).toEqual(original);
		});

		it('should roundtrip random data', () => {
			for (let i = 0; i < 10; i++) {
				const original = crypto.getRandomValues(new Uint8Array(32));
				const encoded = base64url.encode(original);
				const decoded = base64url.decode(encoded);
				expect(decoded).toEqual(original);
			}
		});

		it('should handle edge case: single byte', () => {
			const original = new Uint8Array([0x00]);
			const encoded = base64url.encode(original);
			const decoded = base64url.decode(encoded);
			expect(decoded).toEqual(original);
		});

		it('should handle edge case: max byte', () => {
			const original = new Uint8Array([0xff]);
			const encoded = base64url.encode(original);
			const decoded = base64url.decode(encoded);
			expect(decoded).toEqual(original);
		});

		it('should handle long data', () => {
			const original = new Uint8Array(1000).fill(0xab);
			const encoded = base64url.encode(original);
			const decoded = base64url.decode(encoded);
			expect(decoded).toEqual(original);
		});
	});
});
