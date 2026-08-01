/**
 * Cashu token encode/decode tests
 */
import { describe, it, expect } from 'vitest';
import { encodeToken, decodeToken, isCashuToken, getTokenAmount, TOKEN_PREFIX } from '../token';
import { base64url } from '../../util/base64';
import type { TokenProof } from '../../types';

describe('Cashu token encode/decode', () => {
	const mockProofs: TokenProof[] = [
		{
			id: 'keyset-001',
			amount: 64,
			secret: 'secret1',
			C: 'signature1'
		},
		{
			id: 'keyset-001',
			amount: 32,
			secret: 'secret2',
			C: 'signature2'
		},
		{
			id: 'keyset-002',
			amount: 4,
			secret: 'secret3',
			C: 'signature3'
		}
	];

	const mintUrl = 'https://mint.example.com';

	describe('encodeToken', () => {
		it('should encode proofs into a valid token string', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(token).toBeTruthy();
			expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
			expect(token.length).toBeGreaterThan(TOKEN_PREFIX.length);
		});

		it('should include the correct prefix', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
		});

		it('should encode with custom unit', () => {
			const token = encodeToken(mockProofs, mintUrl, 'usd');
			const decoded = decodeToken(token);
			expect(decoded.unit).toBe('usd');
		});

		it('should encode with optional memo', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', 'Test memo');
			const decoded = decodeToken(token);
			// Memo is on the token level, not decoded directly
			expect(decoded).toBeDefined();
		});

		it('should produce URL-safe base64 (no +, /, or =)', () => {
			const token = encodeToken(mockProofs, mintUrl);
			const encoded = token.slice(TOKEN_PREFIX.length);
			expect(encoded).not.toContain('+');
			expect(encoded).not.toContain('/');
			expect(encoded).not.toContain('=');
		});
	});

	describe('decodeToken', () => {
		it('should decode a token back to original proofs', () => {
			const token = encodeToken(mockProofs, mintUrl);
			const decoded = decodeToken(token);

			expect(decoded.mint).toBe(mintUrl);
			expect(decoded.unit).toBe('sat');
			expect(decoded.proofs).toHaveLength(mockProofs.length);
			expect(decoded.proofs[0].amount).toBe(64);
			expect(decoded.proofs[1].amount).toBe(32);
		});

		it('should roundtrip: encode → decode → proofs match', () => {
			const token = encodeToken(mockProofs, mintUrl);
			const decoded = decodeToken(token);

			// All proofs should match
			for (let i = 0; i < mockProofs.length; i++) {
				expect(decoded.proofs[i].id).toBe(mockProofs[i].id);
				expect(decoded.proofs[i].amount).toBe(mockProofs[i].amount);
				expect(decoded.proofs[i].secret).toBe(mockProofs[i].secret);
				expect(decoded.proofs[i].C).toBe(mockProofs[i].C);
			}
		});

		it('should decode token without prefix', () => {
			const token = encodeToken(mockProofs, mintUrl);
			const withoutPrefix = token.slice(TOKEN_PREFIX.length);
			const decoded = decodeToken(withoutPrefix);
			expect(decoded.mint).toBe(mintUrl);
		});

		it('should throw on invalid token string', () => {
			expect(() => decodeToken('not-a-valid-token')).toThrow();
			expect(() => decodeToken('')).toThrow();
		});

		it('should throw on malformed JSON inside token', () => {
			const badToken = TOKEN_PREFIX + 'this-is-not-json!!!';
			expect(() => decodeToken(badToken)).toThrow();
		});

		it('should throw on token with empty token array', () => {
			const enc = new TextEncoder();
		const badBytes = enc.encode(JSON.stringify({ token: [] }));
		const token = TOKEN_PREFIX + base64url.encode(badBytes);
			expect(() => decodeToken(token)).toThrow();
		});
	});

	describe('isCashuToken', () => {
		it('should return true for valid token', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(isCashuToken(token)).toBe(true);
		});

		it('should return false for invalid string', () => {
			expect(isCashuToken('random-string')).toBe(false);
			expect(isCashuToken('')).toBe(false);
		});
	});

	describe('getTokenAmount', () => {
		it('should calculate total amount from proofs', () => {
			const decoded = { proofs: mockProofs, mint: mintUrl, unit: 'sat' };
			const total = getTokenAmount(decoded);
			expect(total).toBe(100); // 64 + 32 + 4
		});

		it('should return 0 for empty proofs', () => {
			const decoded = { proofs: [], mint: mintUrl, unit: 'sat' };
			expect(getTokenAmount(decoded)).toBe(0);
		});
	});

	describe('multi-mint support', () => {
		it('should preserve mint URL per token', () => {
			const mintA = 'https://mint-a.example.com';
			const mintB = 'https://mint-b.example.com';

			const tokenA = encodeToken(mockProofs, mintA);
			const tokenB = encodeToken(mockProofs, mintB);

			expect(decodeToken(tokenA).mint).toBe(mintA);
			expect(decodeToken(tokenB).mint).toBe(mintB);
		});
	});
});
