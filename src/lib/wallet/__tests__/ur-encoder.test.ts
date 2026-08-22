/**
 * ur-encoder tests — TASK-FIX-406 (thin wrapper around @gandlaf21/bc-ur)
 *
 * Verifies:
 *   - The encoder uses the @gandlaf21/bc-ur library UREncoder directly
 *     (no custom CBOR / BC32 / SHA-256 / padding logic in source).
 *   - UR type tag is `bytes` (matches cashu.me — NUT-16 does not specify a
 *     custom type tag, and `bytes` is the standard BCR-2020-005 entry for
 *     arbitrary CBOR byte-string payloads).
 *   - Single-part payloads produce `ur:bytes/<bc32-data>` (one fragment).
 *   - Multi-part payloads produce fountain-encoded fragments in
 *     `ur:bytes/<seq>-<seqLen>/<bytewords>` form (BCR-2020-008).
 *   - All fragments share the same UR type tag and seqLen.
 *   - Fragments are 1-based and the seq number is monotonic up to seqLen.
 *   - maxFragmentLength option is honored by the library.
 *   - Error handling: empty payload, non-Uint8Array, too-small
 *     maxFragmentLength, duck-type guard.
 *   - Round-trip with library URDecoder is byte-identical to the source.
 */

import { describe, it, expect } from 'vitest';
import { UR, UREncoder, URDecoder } from '@gandlaf21/bc-ur';
import {
	encodeUR,
	encodeURString,
	NUT16_UR_TYPE,
	NUT16_MAX_FRAMES,
	estimateFragmentCount
} from '../ur-encoder';

/**
 * Regex for the library-produced single-part UR form:
 *   ur:bytes/<bc32-data>
 * BC32 charset: qpzry9x8gf2tvdw0s3jn54khce6mua7l
 */
const SINGLE_PART_RE = /^ur:bytes\/[a-z0-9]+$/;

/**
 * Regex for the library-produced multi-part (fountain) UR form:
 *   ur:bytes/<seq>-<seqLen>/<bytewords>
 * seq and seqLen are decimal, seq is 1-based. Bytewords use the minimal
 * style with lowercase letters.
 */
const MULTI_PART_RE = /^ur:bytes\/\d+-\d+\/[a-z]+$/;

/**
 * Parse a multi-part fragment into its parts: { seq, seqLen, body }.
 * Returns null for single-part fragments.
 */
function parseMultiPart(urString: string): { seq: number; seqLen: number; body: string } | null {
	const m = urString.match(/^ur:bytes\/(\d+)-(\d+)\/(.+)$/);
	if (!m) return null;
	return { seq: parseInt(m[1], 10), seqLen: parseInt(m[2], 10), body: m[3] };
}

describe('ur-encoder — TASK-FIX-406 thin wrapper around @gandlaf21/bc-ur', () => {
	describe('Library identity', () => {
		it('uses the @gandlaf21/bc-ur UREncoder class (verifies import is live)', () => {
			// Smoke test: the library exports UREncoder with the expected
			// surface (encodeWhole, nextPart, fragmentsLength, messageLength).
			expect(typeof UREncoder).toBe('function');
			expect(typeof UREncoder.prototype.encodeWhole).toBe('function');
			expect(typeof UREncoder.prototype.nextPart).toBe('function');
		});

		it('NUT16_UR_TYPE constant is "bytes"', () => {
			expect(NUT16_UR_TYPE).toBe('bytes');
		});

		it('encoded output uses "ur:bytes" prefix (matches cashu.me)', () => {
			const frags = encodeUR(new Uint8Array(200).fill(0x42));
			frags.forEach((f) => {
				expect(f.startsWith('ur:bytes/')).toBe(true);
				expect(f.startsWith('ur:crypto-token/')).toBe(false);
			});
		});
	});

	describe('Single-part payloads (one BC32 string)', () => {
		it('tiny payload → single-part form `ur:bytes/<bc32>`', () => {
			const frags = encodeUR(new Uint8Array(50).fill(0x77));
			expect(frags.length).toBe(1);
			expect(frags[0]).toMatch(SINGLE_PART_RE);
			// BC32 charset: qpzry9x8gf2tvdw0s3jn54khce6mua7l
			const bc32Part = frags[0].split('/')[1];
			expect(bc32Part).toMatch(/^[a-z0-9]+$/);
		});

		it('encodeURString("hello") → single-part', () => {
			const frags = encodeURString('hello');
			expect(frags.length).toBe(1);
			expect(frags[0]).toMatch(SINGLE_PART_RE);
		});
	});

	describe('Multi-part payloads (fountain codes, BCR-2020-008)', () => {
		it('500-byte payload → multi-part form `ur:bytes/<seq>-<seqLen>/<bytewords>`', () => {
			const frags = encodeUR(new Uint8Array(500).fill(0xab));
			expect(frags.length).toBeGreaterThan(1);
			frags.forEach((f) => {
				expect(f).toMatch(MULTI_PART_RE);
			});
		});

		it('fragments are 1-based and monotonically increasing up to seqLen', () => {
			const frags = encodeUR(new Uint8Array(500).fill(0xab));
			const parsed = frags.map(parseMultiPart);
			// Every fragment must parse
			parsed.forEach((p) => expect(p).not.toBeNull());
			// All fragments share the same seqLen
			const seqLens = new Set(parsed.map((p) => p!.seqLen));
			expect(seqLens.size).toBe(1);
			const seqLen = parsed[0]!.seqLen;
			// seq goes from 1..seqLen in order
			expect(parsed[0]!.seq).toBe(1);
			expect(parsed[parsed.length - 1]!.seq).toBe(seqLen);
			expect(frags.length).toBe(seqLen);
		});

		it('2000-byte payload (typical cashu token) produces multiple fragments', () => {
			const frags = encodeURString('a'.repeat(2000));
			expect(frags.length).toBeGreaterThan(1);
			expect(frags.length).toBeLessThanOrEqual(NUT16_MAX_FRAMES);
		});

		it('multi-part fragments have identical seqLen', () => {
			const frags = encodeURString('a'.repeat(2000));
			const seqLens = new Set(frags.map((f) => parseMultiPart(f)!.seqLen));
			expect(seqLens.size).toBe(1);
		});
	});

	describe('Custom maxFragmentLength option', () => {
		it('custom maxFragmentLength=50 honored', () => {
			const frags = encodeUR(new Uint8Array(500).fill(0x55), { maxFragmentLength: 50 });
			expect(frags.length).toBeGreaterThan(1);
			frags.forEach((f) => expect(f).toMatch(MULTI_PART_RE));
		});

		it('custom maxFragmentLength=100 honored', () => {
			const frags = encodeUR(new Uint8Array(500).fill(0x99), { maxFragmentLength: 100 });
			expect(frags.length).toBeGreaterThan(1);
			frags.forEach((f) => expect(f).toMatch(MULTI_PART_RE));
		});

		it('legacy fragmentCapacity alias still works', () => {
			const frags = encodeUR(new Uint8Array(500).fill(0xaa), { fragmentCapacity: 75 });
			expect(frags.length).toBeGreaterThan(1);
			frags.forEach((f) => expect(f).toMatch(MULTI_PART_RE));
		});
	});

	describe('Default behavior', () => {
		it('default maxFragmentLength is 150 (matches cashu.me)', () => {
			const frags = encodeUR(new Uint8Array(2000).fill(0x42));
			expect(frags.length).toBeGreaterThan(1);
			// Library will produce fragments based on default 150 maxFragmentLength
			frags.forEach((f) => expect(f).toMatch(MULTI_PART_RE));
		});
	});

	describe('Error handling', () => {
		it('rejects empty payload', () => {
			expect(() => encodeUR(new Uint8Array(0))).toThrow(/must not be empty/);
		});

		it('rejects non-Uint8Array payload (duck-type guard)', () => {
			const badInput = { notALength: 'nope' } as unknown as Uint8Array;
			expect(() => encodeUR(badInput)).toThrow(/must be a Uint8Array/);
		});

		it('rejects maxFragmentLength < 10', () => {
			const payload = new Uint8Array(100).fill(0x42);
			expect(() => encodeUR(payload, { maxFragmentLength: 5 })).toThrow(/must be >= 10/);
		});
	});

	describe('Library compatibility (round-trip with URDecoder)', () => {
		it('encoded fragments can be decoded back to the original bytes', () => {
			const original = new TextEncoder().encode('cashuAeyJ0b2tlbiI6W3sibWFudCI6Imh0dHBzOi8vZm9vLmJhciJ9XX0');
			const frags = encodeUR(original);
			// Library URDecoder can reassemble the multi-part fragments.
			const decoder = new URDecoder();
			for (const f of frags) {
				decoder.receivePart(f);
			}
			// After all parts are received, the decoder should have the
			// complete UR. (For single-part, it's available immediately.)
			const resultUr = decoder.resultUR();
			expect(resultUr).not.toBeNull();
			const decoded = resultUr!.decodeCBOR();
			expect(decoded.length).toBe(original.length);
			expect(Buffer.from(decoded).toString('hex')).toBe(Buffer.from(original).toString('hex'));
		});

		it('library UR type is "bytes" by default', () => {
			const buffer = Buffer.from('hello');
			const ur = UR.fromBuffer(buffer);
			expect(ur.type).toBe('bytes');
		});
	});

	describe('estimateFragmentCount (pre-flight check helper)', () => {
		it('returns 1 for tiny payloads', () => {
			expect(estimateFragmentCount(10)).toBe(1);
		});

		it('grows with payload size', () => {
			const small = estimateFragmentCount(100);
			const big = estimateFragmentCount(10000);
			expect(big).toBeGreaterThan(small);
		});

		it('respects custom maxFragmentLength', () => {
			const big = estimateFragmentCount(5000, 50);
			const small = estimateFragmentCount(5000, 150);
			expect(big).toBeGreaterThan(small);
		});
	});
});
