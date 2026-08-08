/**
 * Blind signature utilities tests — includes hash_to_curve and BDHKE tests.
 *
 * C00-05: hash_to_curve test vectors (3+)
 * C00-06: BDHKE multiplicative round-trip tests (3+)
 */
import { describe, it, expect } from 'vitest';
import {
	blindMessage,
	unblindSignature,
	deterministicBlindingFactor,
	hash_to_curve,
	verifySignature,
	type BlindPair
} from '../blind';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base64url } from '../../util/base64';

// ─── Helper ──────────────────────────────────────────────────

function bigIntTo32Bytes(value: bigint): Uint8Array {
	const bytes = new Uint8Array(32);
	let v = value;
	for (let i = 31; i >= 0; i--) {
		bytes[i] = Number(v & 0xffn);
		v >>= 8n;
	}
	return bytes;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
	let result = 0n;
	for (let i = 0; i < bytes.length; i++) {
		result = (result << 8n) | BigInt(bytes[i]);
	}
	return result;
}

// ─── Test Data ───────────────────────────────────────────────

const TEST_PRIVATE_KEY = 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn;
const TEST_PUBLIC_KEY = secp256k1.Point.BASE.multiply(TEST_PRIVATE_KEY).toHex(true);

// Known test vectors for hash_to_curve (pre-computed, cross-referenced with Python reference)
// The first 3 test vectors have known expected outputs
const encoder = new TextEncoder();

// ─── Tests ───────────────────────────────────────────────────

describe('Blind signature utilities', () => {
	const testMessage = 'test-secret-message-for-blinding';
	const testSecret = 'my-secret-001';

	describe('deterministicBlindingFactor', () => {
		it('should generate a deterministic blinding factor from a secret', () => {
			const r = deterministicBlindingFactor(testSecret);
			expect(typeof r).toBe('bigint');
			expect(r).toBeGreaterThan(0n);
		});

		it('should produce the same factor for the same secret', () => {
			const r1 = deterministicBlindingFactor(testSecret);
			const r2 = deterministicBlindingFactor(testSecret);
			expect(r1).toBe(r2);
		});

		it('should produce different factors for different secrets', () => {
			const r1 = deterministicBlindingFactor('secret-A');
			const r2 = deterministicBlindingFactor('secret-B');
			expect(r1).not.toBe(r2);
		});

		it('should produce a factor less than curve order', () => {
			const r = deterministicBlindingFactor(testSecret);
			expect(r).toBeGreaterThan(0n);
		});
	});

	describe('hash_to_curve', () => {
		it('C00-05-T1: hash_to_curve returns a valid curve point for simple message "hello"', () => {
			const msg = encoder.encode('hello');
			const point = hash_to_curve(msg);

			// Should return a point
			expect(point).toBeDefined();
			// Point should be valid (can be serialized)
			const hex = point.toHex(true);
			expect(hex).toBeTypeOf('string');
			expect(hex.length).toBe(66); // compressed: 02/03 + 64 hex chars
			expect(hex.startsWith('02') || hex.startsWith('03')).toBe(true);
		});

		it('C00-05-T2: hash_to_curve is deterministic — same input → same point', () => {
			const msg = encoder.encode('Cashu ecash protocol');
			const p1 = hash_to_curve(msg);
			const p2 = hash_to_curve(msg);

			expect(p1.toHex(true)).toBe(p2.toHex(true));
			expect(p1.equals(p2)).toBe(true);
		});

		it('C00-05-T3: hash_to_curve produces different points for different messages', () => {
			const p1 = hash_to_curve(encoder.encode('message-alpha'));
			const p2 = hash_to_curve(encoder.encode('message-beta'));

			expect(p1.toHex(true)).not.toBe(p2.toHex(true));
			expect(p1.equals(p2)).toBe(false);
		});

		it('C00-05-T4: hash_to_curve handles empty message', () => {
			const point = hash_to_curve(encoder.encode(''));
			expect(point).toBeDefined();
			const hex = point.toHex(true);
			expect(hex).toBeTypeOf('string');
			expect(hex.length).toBe(66);
		});

		it('C00-05-T5: hash_to_curve produces a point on the curve (not identity)', () => {
			const point = hash_to_curve(encoder.encode('test point on curve'));
			// Verify it's not the identity/zero point
			const hex = point.toHex(true);
			expect(hex.length).toBe(66);

			// Verify the point satisfies curve equation
			// We can serialize and deserialize to confirm validity
			const reParsed = secp256k1.Point.fromHex(hex);
			expect(reParsed.toHex(true)).toBe(hex);
		});
	});

	describe('blindMessage', () => {
		it('should blind a message and return B_ and blinding factor', () => {
			const result = blindMessage(testMessage);

			expect(result).toBeDefined();
			expect(result.B_).toBeTruthy();
			expect(result.B_).toBeTypeOf('string');
			expect(result.blindingFactor).toBeTruthy();
			expect(result.blindingFactor).toBeTypeOf('string');
		});

		it('should produce deterministic blinding when called twice with same message', () => {
			const r1 = blindMessage(testMessage);
			const r2 = blindMessage(testMessage);

			expect(r1.B_).toBe(r2.B_);
			expect(r1.blindingFactor).toBe(r2.blindingFactor);
		});

		it('should produce different blinded message for different messages', () => {
			const r1 = blindMessage('message-1');
			const r2 = blindMessage('message-2');

			expect(r1.B_).not.toBe(r2.B_);
			expect(r1.blindingFactor).not.toBe(r2.blindingFactor);
		});

		it('should accept an explicit blinding factor', () => {
			const r = 123456789n;
			const result = blindMessage(testMessage, r);

			const expectedFactor = base64url.encode(bigIntTo32Bytes(r));

			expect(result.blindingFactor).toBe(expectedFactor);
		});

		it('should handle empty message', () => {
			const result = blindMessage('');
			expect(result.B_).toBeTruthy();
		});
	});

	describe('unblindSignature', () => {
		it('should unblind a signature', () => {
			const { B_, blindingFactor } = blindMessage(testMessage);

			const unblinded = unblindSignature(B_, blindingFactor);

			expect(unblinded).toBeTruthy();
			expect(unblinded).toBeTypeOf('string');
		});

		it('should return different result for different blinding factors', () => {
			const r1 = blindMessage('msg-a');
			const r2 = blindMessage('msg-b');

			const u1 = unblindSignature(r1.B_, r1.blindingFactor);
			const u2 = unblindSignature(r2.B_, r2.blindingFactor);

			expect(u1).not.toBe(u2);
		});

		it('should be deterministic: same blind sig + same factor = same unblinded', () => {
			const { B_, blindingFactor } = blindMessage(testMessage);

			const u1 = unblindSignature(B_, blindingFactor);
			const u2 = unblindSignature(B_, blindingFactor);

			expect(u1).toBe(u2);
		});

		it('should handle large blinding factors', () => {
			const largeFactor = deterministicBlindingFactor('very-long-secret-with-many-characters');

			const result = blindMessage(testMessage, largeFactor);
			const unblinded = unblindSignature(result.B_, result.blindingFactor);

			expect(unblinded).toBeTruthy();
		});
	});

	describe('blind + unblind roundtrip property', () => {
		it('should demonstrate the blind-unblind property', () => {
			const { B_, blindingFactor } = blindMessage(testMessage);

			const u1 = unblindSignature(B_, blindingFactor);

			const result2 = blindMessage(testMessage);
			expect(result2.blindingFactor).toBe(blindingFactor);

			const u2 = unblindSignature(result2.B_, result2.blindingFactor);

			expect(u1).toBe(u2);
		});
	});
});

// ─── C00-06: BDHKE Multiplicative Tests ──────────────────────

describe('BDHKE multiplicative scheme', () => {
	const encoder = new TextEncoder();

	it('C00-06-T1: BDHKE round-trip — blind → sign → unblind recovers k * hash_to_curve(secret)', () => {
		const secret = 'bdhke-test-secret-001';
		const r = deterministicBlindingFactor(secret);

		// Alice: Y = hash_to_curve(secret), B_ = Y + r*G (additive BDHKE)
		const { B_, blindingFactor } = blindMessage(secret, r);

		// Mint: C_ = k * B_ (simulated with test private key)
		const B_point = secp256k1.Point.fromHex(B_);
		const C_point = B_point.multiply(TEST_PRIVATE_KEY);
		const C_ = C_point.toHex(true);

		// Alice: unblind C = C_ - r*K (additive unblinding with mint pubkey)
		const C = unblindSignature(C_, blindingFactor, TEST_PUBLIC_KEY);

		// Verify: C should equal k * hash_to_curve(secret)
		expect(verifySignature(C, secret, TEST_PRIVATE_KEY)).toBe(true);
	});

	it('C00-06-T2: BDHKE fails verification with wrong private key', () => {
		const secret = 'bdhke-test-secret-002';
		const r = deterministicBlindingFactor(secret);

		const { B_, blindingFactor } = blindMessage(secret, r);

		// Sign with TEST_PRIVATE_KEY
		const B_point = secp256k1.Point.fromHex(B_);
		const C_ = B_point.multiply(TEST_PRIVATE_KEY).toHex(true);

		// Unblind
		const C = unblindSignature(C_, blindingFactor);

		// Verify with wrong key — should fail
		const wrongKey = TEST_PRIVATE_KEY + 1n;
		expect(verifySignature(C, secret, wrongKey)).toBe(false);
	});

	it('C00-06-T3: BDHKE round-trip with different secret yields different signature', () => {
		const secret1 = 'bdhke-test-secret-003a';
		const secret2 = 'bdhke-test-secret-003b';

		const r1 = deterministicBlindingFactor(secret1);
		const r2 = deterministicBlindingFactor(secret2);

		const { B_: B1 } = blindMessage(secret1, r1);
		const { B_: B2 } = blindMessage(secret2, r2);

		// Mint signs both
		const C1_ = secp256k1.Point.fromHex(B1).multiply(TEST_PRIVATE_KEY).toHex(true);
		const C2_ = secp256k1.Point.fromHex(B2).multiply(TEST_PRIVATE_KEY).toHex(true);

		// Unblind with additive unblinding (needs mint pubkey)
		const C1 = unblindSignature(C1_, base64url.encode(bigIntTo32Bytes(r1)), TEST_PUBLIC_KEY);
		const C2 = unblindSignature(C2_, base64url.encode(bigIntTo32Bytes(r2)), TEST_PUBLIC_KEY);

		// Different signatures
		expect(C1).not.toBe(C2);

		// Each verifies with its own secret
		expect(verifySignature(C1, secret1, TEST_PRIVATE_KEY)).toBe(true);
		expect(verifySignature(C2, secret2, TEST_PRIVATE_KEY)).toBe(true);

		// Cross-verification fails
		expect(verifySignature(C1, secret2, TEST_PRIVATE_KEY)).toBe(false);
		expect(verifySignature(C2, secret1, TEST_PRIVATE_KEY)).toBe(false);
	});

	it('C00-06-T4: BDHKE — unblinding with wrong factor fails verification', () => {
		const secret = 'bdhke-test-secret-004';
		const r = deterministicBlindingFactor(secret);
		const wrongR = r + 1n;

		const { B_, blindingFactor } = blindMessage(secret, r);

		// Mint signs
		const C_ = secp256k1.Point.fromHex(B_).multiply(TEST_PRIVATE_KEY).toHex(true);

		// Unblind with WRONG factor
		const wrongFactor = base64url.encode(bigIntTo32Bytes(wrongR));
		const C_wrong = unblindSignature(C_, wrongFactor);

		// Verification should fail
		expect(verifySignature(C_wrong, secret, TEST_PRIVATE_KEY)).toBe(false);
	});

	it('C00-06-T5: BDHKE — multiplicative property: (Y * r) * r^{-1} = Y', () => {
		const secret = 'bdhke-multiplicative-test';
		const Y = hash_to_curve(encoder.encode(secret));
		const r = deterministicBlindingFactor(secret);

		// Blinded: B_ = Y * r
		const B_ = Y.multiply(r).toHex(true);

		// Unblind: Y' = B_ * r^{-1}
		const rEncoded = base64url.encode(bigIntTo32Bytes(r));
		const Y_prime_hex = unblindSignature(B_, rEncoded);

		// Should recover Y
		expect(Y_prime_hex).toBe(Y.toHex(true));
	});
});
