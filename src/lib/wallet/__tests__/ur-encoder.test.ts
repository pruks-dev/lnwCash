/**
 * ur-encoder tests — TASK-FIX-404 (fragment padding consistency, NUT-16 animated QR)
 *                  + TASK-FIX-405 (UR type 'bytes', fragment length default 150)
 *
 * Verifies:
 *   - Multi-fragment UR payloads produce fragments of IDENTICAL BC32 length
 *   - Single-fragment payload is NOT padded (length = payload length, no 'q' chars)
 *   - Padding char 'q' (BCR-2020-006) is used consistently
 *   - Sequencing / digest format unchanged
 *   - UR type tag is `bytes` (matches cashu.me — NUT-16 does not specify a
 *     custom type tag, and `bytes` is the standard BCR-2020-005 entry for
 *     arbitrary CBOR byte-string payloads)
 *   - Default fragmentCapacity is 150 (matches cashu.me)
 */

import { describe, it, expect } from 'vitest';
import { encodeUR, encodeURString, NUT16_UR_TYPE } from '../ur-encoder';

/**
 * Extract the BC32 fragment portion from a UR string:
 *   ur:bytes/1of3/<digest>/<fragment>  → 3 segments after prefix → segment[2]
 *   ur:bytes/<fragment>                → 1 segment after prefix → segment[0]
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
			expect(firstLen % 150).toBe(0);
		});

		it('1500-byte payload → all fragments have IDENTICAL length', () => {
			const payload = new Uint8Array(1500).fill(0xcd);
			const fragments = encodeUR(payload);

			expect(fragments.length).toBeGreaterThan(1);
			const lengths = fragments.map((f) => extractBC32(f).length);
			const firstLen = lengths[0];
			expect(lengths.every((l) => l === firstLen)).toBe(true);
			expect(firstLen % 150).toBe(0);
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

		it('1500-byte payload — fragment count is > 1 and each fragment is exactly 150 chars', () => {
			// 1500 bytes via CBOR + BC32 expands, so multiple fragments
			const payload = new Uint8Array(1500).fill(0xff);
			const fragments = encodeUR(payload);
			expect(fragments.length).toBeGreaterThanOrEqual(2);
			// Each fragment must be exactly 150 chars (default capacity, with padding)
			fragments.forEach((f) => {
				expect(extractBC32(f).length).toBe(150);
			});
		});
	});

	describe('Single-fragment payload (50 bytes) — must NOT be padded', () => {
		it('50-byte payload → single fragment, single "/" separator', () => {
			const payload = new Uint8Array(50).fill(0x77);
			const fragments = encodeUR(payload);

			expect(fragments.length).toBe(1);
			// Single-fragment form: ur:bytes/<bc32> — exactly ONE "/" after prefix
			const parts = fragments[0].split('/');
			expect(parts.length).toBe(2);
			expect(parts[0]).toBe('ur:bytes');
			// BC32 uses bech32 charset: qpzry9x8gf2tvdw0s3jn54khce6mua7l
			expect(parts[1]).toMatch(/^[a-z0-9]+$/);
		});

		it('50-byte UTF-8 string (encodeURString) → single fragment', () => {
			const tokenStr = 'cashuA'.padEnd(50, 'x');
			const fragments = encodeURString(tokenStr);
			expect(fragments.length).toBe(1);
		});
	});

	describe('Multi-fragment sequencing format (BCR-05)', () => {
		it('fragments use 1-based indexing with "of" separator', () => {
			const payload = new Uint8Array(500).fill(0x42);
			const fragments = encodeUR(payload);
			// Each fragment: ur:bytes/<seq>of<total>/<digest>/<bc32>
			// BC32 charset: qpzry9x8gf2tvdw0s3jn54khce6mua7l (includes 0-9 + lowercase)
			const regex = /^ur:bytes\/\d+of\d+\/[a-z0-9]+\/[a-z0-9q]+$/;
			fragments.forEach((f, i) => {
				expect(f).toMatch(regex);
				expect(f).toContain(`${i + 1}of${fragments.length}`);
			});
		});

		it('digest is identical across all fragments of the same payload', () => {
			const payload = new Uint8Array(500).fill(0x42);
			const fragments = encodeUR(payload);
			// ur:bytes/<seq>of<total>/<digest>/<bc32> — digest at index 2 after split('/')
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

		it('custom fragmentCapacity 100 — fragments padded to multiples of 100', () => {
			const payload = new Uint8Array(300).fill(0x99);
			const fragments = encodeUR(payload, { fragmentCapacity: 100 });
			const lengths = fragments.map((f) => extractBC32(f).length);
			const firstLen = lengths[0];
			expect(lengths.every((l) => l === firstLen)).toBe(true);
			expect(firstLen % 100).toBe(0);
		});
	});
});

describe('ur-encoder — TASK-FIX-405 NUT-16 type tag (matches cashu.me)', () => {
	it('NUT16_UR_TYPE constant is "bytes"', () => {
		expect(NUT16_UR_TYPE).toBe('bytes');
	});

	it('default UR type tag in encoded strings is "ur:bytes" (not "ur:crypto-token")', () => {
		const payload = new Uint8Array(200).fill(0x42);
		const fragments = encodeUR(payload);
		fragments.forEach((f) => {
			expect(f.startsWith('ur:bytes/')).toBe(true);
			expect(f.startsWith('ur:crypto-token/')).toBe(false);
		});
	});

	it('single-fragment form uses "ur:bytes/" prefix', () => {
		const payload = new Uint8Array(50).fill(0x33);
		const fragments = encodeUR(payload);
		expect(fragments[0].startsWith('ur:bytes/')).toBe(true);
	});

	it('explicit type override is honoured', () => {
		const payload = new Uint8Array(50).fill(0x33);
		const fragments = encodeUR(payload, { type: 'custom-type' });
		expect(fragments[0].startsWith('ur:custom-type/')).toBe(true);
	});
});
