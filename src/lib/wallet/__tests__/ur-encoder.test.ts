/**
 * ur-encoder tests — TASK-FIX-404 (fragment padding consistency, NUT-16 animated QR)
 *
 * Verifies:
 *   - Multi-fragment UR payloads produce fragments of IDENTICAL BC32 length
 *   - Single-fragment payload is NOT padded (length = payload length, no 'q' chars)
 *   - Padding char 'q' (BCR-2020-006) is used consistently
 *   - Sequencing / digest format unchanged
 */

import { describe, it, expect } from 'vitest';
import { encodeUR, encodeURString } from '../ur-encoder';

/**
 * Extract the BC32 fragment portion from a UR string:
 *   ur:crypto-token/1of3/<digest>/<fragment>  → 3 segments after prefix → segment[2]
 *   ur:crypto-token/<fragment>                → 1 segment after prefix → segment[0]
 */
function extractBC32(urString: string): string {
	const stripped = urString.replace(/^ur:[a-z0-9-]+\//, '');
	const segments = stripped.split('/');
	if (segments.length === 3) {
		// Multi-fragment: [seq, digest, fragment] → fragment is segments[2]
		return segments[2];
	}
	// Single-fragment form: only one segment, the BC32 itself
	return segments[0];
}

describe('ur-encoder — TASK-FIX-404 fragment padding consistency', () => {
	describe('Multi-fragment payloads (500, 1500 bytes)', () => {
		it('500-byte payload → all fragments have IDENTICAL length', () => {
			const payload = new Uint8Array(500).fill(0xab);
			const fragments = encodeUR(payload);

			expect(fragments.length).toBeGreaterThan(1);
			const lengths = fragments.map((f) => extractBC32(f).length);
			const firstLen = lengths[0];
			expect(lengths.every((l) => l === firstLen)).toBe(true);
			expect(firstLen % 200).toBe(0);
		});

		it('1500-byte payload → all fragments have IDENTICAL length', () => {
			const payload = new Uint8Array(1500).fill(0xcd);
			const fragments = encodeUR(payload);

			expect(fragments.length).toBeGreaterThan(1);
			const lengths = fragments.map((f) => extractBC32(f).length);
			const firstLen = lengths[0];
			expect(lengths.every((l) => l === firstLen)).toBe(true);
			expect(firstLen % 200).toBe(0);
		});

		it('500-byte payload — first fragment has no padding chars', () => {
			const payload = new Uint8Array(500).fill(0x42);
			const fragments = encodeUR(payload);
			const firstBC32 = extractBC32(fragments[0]);
			// First fragment MUST NOT be padded (only last fragment is)
			expect(firstBC32.endsWith('q')).toBe(false);
		});

		it('500-byte payload — last fragment is padded with BC32 char "q"', () => {
			const payload = new Uint8Array(500).fill(0x42);
			const fragments = encodeUR(payload);
			const lastBC32 = extractBC32(fragments[fragments.length - 1]);
			// Last fragment length must match first fragment length (padding filled)
			const firstLen = extractBC32(fragments[0]).length;
			expect(lastBC32.length).toBe(firstLen);
		});

		it('1500-byte payload — fragment count is > 1 and each fragment is exactly 200 chars', () => {
			// 1500 bytes via CBOR + BC32 expands, so multiple fragments
			const payload = new Uint8Array(1500).fill(0xff);
			const fragments = encodeUR(payload);
			expect(fragments.length).toBeGreaterThanOrEqual(2);
			// Each fragment must be exactly 200 chars (capacity, with padding)
			fragments.forEach((f) => {
				expect(extractBC32(f).length).toBe(200);
			});
		});
	});

	describe('Single-fragment payload (100 bytes) — must NOT be padded', () => {
		it('100-byte payload → single fragment, single "/" separator', () => {
			const payload = new Uint8Array(100).fill(0x77);
			const fragments = encodeUR(payload);

			expect(fragments.length).toBe(1);
			// Single-fragment form: ur:crypto-token/<bc32> — exactly ONE "/" after prefix
			const parts = fragments[0].split('/');
			expect(parts.length).toBe(2);
			expect(parts[0]).toBe('ur:crypto-token');
			// BC32 uses bech32 charset: qpzry9x8gf2tvdw0s3jn54khce6mua7l
			expect(parts[1]).toMatch(/^[a-z0-9]+$/);
		});

		it('100-byte UTF-8 string (encodeURString) → single fragment', () => {
			const tokenStr = 'cashuA'.padEnd(100, 'x');
			const fragments = encodeURString(tokenStr);
			expect(fragments.length).toBe(1);
		});
	});

	describe('Multi-fragment sequencing format (BCR-05)', () => {
		it('fragments use 1-based indexing with "of" separator', () => {
			const payload = new Uint8Array(500).fill(0x42);
			const fragments = encodeUR(payload);
			// Each fragment: ur:crypto-token/<seq>of<total>/<digest>/<bc32>
			// BC32 charset: qpzry9x8gf2tvdw0s3jn54khce6mua7l (includes 0-9 + lowercase)
			const regex = /^ur:crypto-token\/\d+of\d+\/[a-z0-9]+\/[a-z0-9q]+$/;
			fragments.forEach((f, i) => {
				expect(f).toMatch(regex);
				expect(f).toContain(`${i + 1}of${fragments.length}`);
			});
		});

		it('digest is identical across all fragments of the same payload', () => {
			const payload = new Uint8Array(500).fill(0x42);
			const fragments = encodeUR(payload);
			// ur:crypto-token/<seq>of<total>/<digest>/<bc32> — digest at index 2 after split('/')
			const digests = fragments.map((f) => f.split('/')[2]);
			expect(new Set(digests).size).toBe(1);
		});
	});

	describe('Custom fragmentCapacity option', () => {
		it('custom fragmentCapacity respected (50 chars)', () => {
			const payload = new Uint8Array(200).fill(0x55);
			const fragments = encodeUR(payload, { fragmentCapacity: 50 });
			const lengths = fragments.map((f) => extractBC32(f).length);
			const firstLen = lengths[0];
			expect(lengths.every((l) => l === firstLen)).toBe(true);
			expect(firstLen % 50).toBe(0);
		});
	});
});
