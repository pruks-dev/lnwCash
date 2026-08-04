/**
 * Cashu token encode/decode tests — NUT-00 V4 cashuB + legacy cashuA
 */
import { describe, it, expect } from 'vitest';
import {
	encodeToken,
	decodeToken,
	isCashuToken,
	getTokenAmount,
	TOKEN_PREFIX,
	TOKEN_PREFIX_V4
} from '../token';
import { base64url } from '../../util/base64';
import type { TokenProof } from '../../types';

describe('Cashu token encode/decode (NUT-00 V4)', () => {
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

	// ══════════════════ encodeToken ══════════════════

	describe('encodeToken', () => {
		it('should encode proofs into a valid token string (default cashuB)', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(token).toBeTruthy();
			expect(token.startsWith(TOKEN_PREFIX_V4)).toBe(true);
			expect(token.length).toBeGreaterThan(TOKEN_PREFIX_V4.length);
		});

		it('should encode with cashuB prefix by default', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(token.startsWith(TOKEN_PREFIX_V4)).toBe(true);
			expect(token.startsWith(TOKEN_PREFIX)).toBe(false);
		});

		it('should encode with legacy cashuA prefix when legacy=true', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', undefined, true);
			expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
			expect(token.startsWith(TOKEN_PREFIX_V4)).toBe(false);
		});

		it('should encode with custom unit', () => {
			const token = encodeToken(mockProofs, mintUrl, 'usd');
			const decoded = decodeToken(token);
			expect(decoded.unit).toBe('usd');
			expect(token.startsWith(TOKEN_PREFIX_V4)).toBe(true);
		});

		it('should encode with optional memo', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', 'Test memo');
			const decoded = decodeToken(token);
			// Memo is on the token level, not decoded directly
			expect(decoded).toBeDefined();
		});

		it('should produce URL-safe base64 (no +, /, or =)', () => {
			const token = encodeToken(mockProofs, mintUrl);
			const encoded = token.slice(TOKEN_PREFIX_V4.length);
			expect(encoded).not.toContain('+');
			expect(encoded).not.toContain('/');
			expect(encoded).not.toContain('=');
		});

		it('should produce URL-safe base64 for legacy cashuA too', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', undefined, true);
			const encoded = token.slice(TOKEN_PREFIX.length);
			expect(encoded).not.toContain('+');
			expect(encoded).not.toContain('/');
			expect(encoded).not.toContain('=');
		});
	});

	// ══════════════════ decodeToken ══════════════════

	describe('decodeToken', () => {
		it('should decode a cashuB token back to original proofs', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(token.startsWith(TOKEN_PREFIX_V4)).toBe(true);
			const decoded = decodeToken(token);

			expect(decoded.mint).toBe(mintUrl);
			expect(decoded.unit).toBe('sat');
			expect(decoded.proofs).toHaveLength(mockProofs.length);
			expect(decoded.proofs[0].amount).toBe(64);
			expect(decoded.proofs[1].amount).toBe(32);
		});

		it('should decode a cashuA legacy token back to original proofs', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', undefined, true);
			expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
			const decoded = decodeToken(token);

			expect(decoded.mint).toBe(mintUrl);
			expect(decoded.unit).toBe('sat');
			expect(decoded.proofs).toHaveLength(mockProofs.length);
			expect(decoded.proofs[0].amount).toBe(64);
			expect(decoded.proofs[1].amount).toBe(32);
		});

		// ─── cashuB roundtrip ────

		it('cashuB roundtrip: encode → decode → proofs match', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(token.startsWith(TOKEN_PREFIX_V4)).toBe(true);

			const decoded = decodeToken(token);

			for (let i = 0; i < mockProofs.length; i++) {
				expect(decoded.proofs[i].id).toBe(mockProofs[i].id);
				expect(decoded.proofs[i].amount).toBe(mockProofs[i].amount);
				expect(decoded.proofs[i].secret).toBe(mockProofs[i].secret);
				expect(decoded.proofs[i].C).toBe(mockProofs[i].C);
			}
		});

		// ─── cashuA roundtrip (no regression) ────

		it('cashuA roundtrip: encode → decode → proofs match (legacy)', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', undefined, true);
			expect(token.startsWith(TOKEN_PREFIX)).toBe(true);

			const decoded = decodeToken(token);

			for (let i = 0; i < mockProofs.length; i++) {
				expect(decoded.proofs[i].id).toBe(mockProofs[i].id);
				expect(decoded.proofs[i].amount).toBe(mockProofs[i].amount);
				expect(decoded.proofs[i].secret).toBe(mockProofs[i].secret);
				expect(decoded.proofs[i].C).toBe(mockProofs[i].C);
			}
		});

		// ─── cross-format ────

		it('cross-format: decode cashuA → re-encode as cashuB → matching proofs', () => {
			// Create a cashuA token
			const tokenA = encodeToken(mockProofs, mintUrl, 'sat', undefined, true);
			expect(tokenA.startsWith(TOKEN_PREFIX)).toBe(true);

			// Decode it
			const decoded = decodeToken(tokenA);
			expect(decoded.proofs).toHaveLength(mockProofs.length);

			// Re-encode as cashuB
			const tokenB = encodeToken(decoded.proofs, decoded.mint, decoded.unit);
			expect(tokenB.startsWith(TOKEN_PREFIX_V4)).toBe(true);

			// Decode the cashuB token and verify proofs match original
			const decodedB = decodeToken(tokenB);
			for (let i = 0; i < mockProofs.length; i++) {
				expect(decodedB.proofs[i].id).toBe(mockProofs[i].id);
				expect(decodedB.proofs[i].amount).toBe(mockProofs[i].amount);
				expect(decodedB.proofs[i].secret).toBe(mockProofs[i].secret);
				expect(decodedB.proofs[i].C).toBe(mockProofs[i].C);
			}
		});

		it('cross-format reverse: decode cashuB → re-encode as cashuA → matching proofs', () => {
			const tokenB = encodeToken(mockProofs, mintUrl);
			expect(tokenB.startsWith(TOKEN_PREFIX_V4)).toBe(true);

			const decoded = decodeToken(tokenB);
			const tokenA = encodeToken(decoded.proofs, decoded.mint, decoded.unit, undefined, true);
			expect(tokenA.startsWith(TOKEN_PREFIX)).toBe(true);

			const decodedA = decodeToken(tokenA);
			for (let i = 0; i < mockProofs.length; i++) {
				expect(decodedA.proofs[i].id).toBe(mockProofs[i].id);
				expect(decodedA.proofs[i].amount).toBe(mockProofs[i].amount);
			}
		});

		// ─── no prefix (backward compat) ────

		it('should decode token without prefix', () => {
			const token = encodeToken(mockProofs, mintUrl);
			const withoutPrefix = token.slice(TOKEN_PREFIX_V4.length);
			const decoded = decodeToken(withoutPrefix);
			expect(decoded.mint).toBe(mintUrl);
		});

		it('should decode cashuA token without prefix', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', undefined, true);
			const withoutPrefix = token.slice(TOKEN_PREFIX.length);
			const decoded = decodeToken(withoutPrefix);
			expect(decoded.mint).toBe(mintUrl);
		});

		// ─── error cases ────

		it('should throw on invalid token string', () => {
			expect(() => decodeToken('not-a-valid-token')).toThrow();
			expect(() => decodeToken('')).toThrow();
		});

		it('should throw on malformed JSON inside token', () => {
			const badToken = TOKEN_PREFIX_V4 + 'this-is-not-json!!!';
			expect(() => decodeToken(badToken)).toThrow();
		});

		it('should throw on malformed JSON inside cashuA token', () => {
			const badToken = TOKEN_PREFIX + 'this-is-not-json!!!';
			expect(() => decodeToken(badToken)).toThrow();
		});

		it('should throw on token with empty token array', () => {
			const enc = new TextEncoder();
			const badBytes = enc.encode(JSON.stringify({ token: [] }));
			const token = TOKEN_PREFIX_V4 + base64url.encode(badBytes);
			expect(() => decodeToken(token)).toThrow();
		});

		// ─── unknown prefix ────

		it('should throw on unknown cashu prefix (e.g. cashuC)', () => {
			const enc = new TextEncoder();
			const goodBytes = enc.encode(JSON.stringify({
				token: [{ mint: mintUrl, proofs: mockProofs }],
				unit: 'sat'
			}));
			const token = 'cashuC' + base64url.encode(goodBytes);
			expect(() => decodeToken(token)).toThrow(/Unknown Cashu token prefix/);
		});

		it('should throw on unknown cashu prefix (e.g. cashuX)', () => {
			const enc = new TextEncoder();
			const goodBytes = enc.encode(JSON.stringify({
				token: [{ mint: mintUrl, proofs: mockProofs }],
				unit: 'sat'
			}));
			const token = 'cashuX' + base64url.encode(goodBytes);
			expect(() => decodeToken(token)).toThrow(/Unknown Cashu token prefix/);
		});

		it('should throw on unknown cashu prefix starting with valid prefix pattern', () => {
			// "cashuBETA" starts with "cashuB" which IS a valid prefix,
			// so it should fail during base64 decode, not as unknown prefix.
			// This is expected — "cashuB" prefix means it's a cashuB token with bad content.
			const enc = new TextEncoder();
			const goodBytes = enc.encode(JSON.stringify({
				token: [{ mint: mintUrl, proofs: mockProofs }],
				unit: 'sat'
			}));
			// Test that "cashuB" followed by invalid base64 fails with decode error
			const token = 'cashuB' + '!!!not-valid-base64!!!';
			expect(() => decodeToken(token)).toThrow();
		});
	});

	// ══════════════════ isCashuToken ══════════════════

	describe('isCashuToken', () => {
		it('should return true for valid cashuB token', () => {
			const token = encodeToken(mockProofs, mintUrl);
			expect(isCashuToken(token)).toBe(true);
		});

		it('should return true for valid cashuA token', () => {
			const token = encodeToken(mockProofs, mintUrl, 'sat', undefined, true);
			expect(isCashuToken(token)).toBe(true);
		});

		it('should return false for invalid string', () => {
			expect(isCashuToken('random-string')).toBe(false);
			expect(isCashuToken('')).toBe(false);
		});

		it('should return false for unknown prefix', () => {
			const enc = new TextEncoder();
			const goodBytes = enc.encode(JSON.stringify({
				token: [{ mint: mintUrl, proofs: mockProofs }],
				unit: 'sat'
			}));
			const token = 'cashuC' + base64url.encode(goodBytes);
			expect(isCashuToken(token)).toBe(false);
		});
	});

	// ══════════════════ getTokenAmount ══════════════════

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

	// ══════════════════ multi-mint support ══════════════════

	describe('multi-mint support', () => {
		it('should preserve mint URL per token (cashuB default)', () => {
			const mintA = 'https://mint-a.example.com';
			const mintB = 'https://mint-b.example.com';

			const tokenA = encodeToken(mockProofs, mintA);
			const tokenB = encodeToken(mockProofs, mintB);

			expect(decodeToken(tokenA).mint).toBe(mintA);
			expect(decodeToken(tokenB).mint).toBe(mintB);
		});

		it('should preserve mint URL per token (cashuA legacy)', () => {
			const mintA = 'https://mint-a.example.com';
			const mintB = 'https://mint-b.example.com';

			const tokenA = encodeToken(mockProofs, mintA, 'sat', undefined, true);
			const tokenB = encodeToken(mockProofs, mintB, 'sat', undefined, true);

			expect(decodeToken(tokenA).mint).toBe(mintA);
			expect(decodeToken(tokenB).mint).toBe(mintB);
		});
	});
});
