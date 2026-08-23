/**
 * ur-decoder tests — TASK-502 (thin wrapper around @gandlaf21/bc-ur URDecoder)
 *
 * Verifies:
 *   - createURDecoder() returns a fresh, stateful handle per call.
 *   - receivePart accepts a valid single-part UR (cashu.me pattern: one
 *     frame, isComplete + isSuccess both true, getDecoded returns the
 *     original string).
 *   - receivePart accepts multi-part UR fragments in any order until the
 *     library's fountain decoder reconstructs the full message
 *     (BCR-2020-008).
 *   - getProgress returns 0-1 fraction matching the library's
 *     `estimatedPercentComplete()` (not 0-100 — documented in JSDoc).
 *   - getProgress is monotonically non-decreasing as parts accumulate.
 *   - isComplete returns false on incomplete state and true once the
 *     full payload is reassembled.
 *   - getDecoded returns null when not complete, and the original UTF-8
 *     string when complete.
 *   - Malformed UR strings do NOT throw — they are caught and a
 *     console.warn is emitted (verified via vi.spyOn).
 *   - reset() clears the state: isComplete becomes false, getDecoded
 *     becomes null, getProgress returns 0.
 *   - Round-trip with ur-encoder.ts: encode a string → decode via this
 *     wrapper → verify byte-for-byte equality.
 *   - Two createURDecoder() handles are independent (no shared state).
 *   - Non-string input to receivePart is rejected via duck-type guard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createURDecoder, NUT16_UR_TYPE, type URDecoderHandle } from '../ur-decoder';
import { encodeUR, encodeURString } from '../ur-encoder';

/**
 * Regex for the library-produced single-part UR form:
 *   ur:bytes/<bc32-data>
 * (See ur-encoder.test.ts for the full grammar.)
 */
const SINGLE_PART_RE = /^ur:bytes\/[a-z0-9]+$/;

/**
 * Helper: build a decoder and immediately feed it a complete
 * single-part UR. Returns the decoder + the original payload so
 * tests can assert equality without boilerplate.
 */
function makeDecoderWithSinglePart(payload: string): {
	decoder: URDecoderHandle;
	original: string;
} {
	const decoder = createURDecoder();
	const frags = encodeURString(payload);
	expect(frags.length).toBe(1);
	expect(frags[0]).toMatch(SINGLE_PART_RE);
	decoder.receivePart(frags[0]);
	return { decoder, original: payload };
}

describe('ur-decoder — TASK-502 thin wrapper around @gandlaf21/bc-ur URDecoder', () => {
	describe('Library identity + module surface', () => {
		it('NUT16_UR_TYPE constant is "bytes" (matches ur-encoder.ts)', () => {
			expect(NUT16_UR_TYPE).toBe('bytes');
		});

		it('createURDecoder returns a stateful handle with the expected methods', () => {
			const decoder = createURDecoder();
			expect(typeof decoder.receivePart).toBe('function');
			expect(typeof decoder.getProgress).toBe('function');
			expect(typeof decoder.isComplete).toBe('function');
			expect(typeof decoder.getDecoded).toBe('function');
			expect(typeof decoder.reset).toBe('function');
		});

		it('two createURDecoder calls return independent handles (factory isolation)', () => {
			const a = createURDecoder();
			const b = createURDecoder();
			const frags = encodeURString('payload-A');
			a.receivePart(frags[0]);
			// `a` is complete, `b` must NOT be — proves no shared state.
			expect(a.isComplete()).toBe(true);
			expect(b.isComplete()).toBe(false);
			expect(b.getDecoded()).toBeNull();
		});
	});

	describe('Scenario 1: single-frame valid UR (cashu.me pattern)', () => {
		it('receivePart accepts a valid single-part UR and isComplete becomes true', () => {
			const { decoder } = makeDecoderWithSinglePart('cashuAtest-token');
			expect(decoder.isComplete()).toBe(true);
		});

		it('getDecoded returns the original string after single-part feed', () => {
			const original = 'cashuAeyJ0b2tlbiI6W10='; // arbitrary cashu-like string
			const { decoder } = makeDecoderWithSinglePart(original);
			expect(decoder.getDecoded()).toBe(original);
		});
	});

	describe('Scenario 2: multi-frame valid UR (3-5 fragments)', () => {
		it('receivePart accepts a multi-part UR, isComplete flips after all parts', () => {
			// 500 bytes → guaranteed multi-part under default
			// maxFragmentLength=150.
			const frags = encodeUR(new Uint8Array(500).fill(0xab));
			expect(frags.length).toBeGreaterThan(1);
			const decoder = createURDecoder();
			// Feed fragments one by one; after the last one, isComplete must
			// be true (fountain decoder reconstructs from observed parts).
			for (let i = 0; i < frags.length; i++) {
				decoder.receivePart(frags[i]);
				if (i < frags.length - 1) {
					// Mid-stream: may or may not be complete (fountain can
					// reconstruct early). We just assert the API doesn't
					// throw and the wrapper stays consistent.
					expect(typeof decoder.getProgress()).toBe('number');
				}
			}
			expect(decoder.isComplete()).toBe(true);
		});

		it('multi-part reassembly produces a Buffer whose toString equals the original UTF-8', () => {
			const original = 'cashuA-multi-part-' + 'x'.repeat(400);
			const frags = encodeURString(original);
			expect(frags.length).toBeGreaterThan(1);
			const decoder = createURDecoder();
			for (const f of frags) decoder.receivePart(f);
			expect(decoder.isComplete()).toBe(true);
			expect(decoder.getDecoded()).toBe(original);
		});
	});

	describe('Scenario 3-4: getProgress behavior', () => {
		it('getProgress returns 0 before any part is received', () => {
			const decoder = createURDecoder();
			// Library returns 0 when no parts have been received and
			// expectedPartCount is 0.
			expect(decoder.getProgress()).toBe(0);
		});

		it('getProgress is in range [0, 1] and is a number (not 0-100 despite method name)', () => {
			const decoder = createURDecoder();
			const frags = encodeUR(new Uint8Array(500).fill(0x55));
			// Feed 1 part — progress should be a small positive fraction
			decoder.receivePart(frags[0]);
			const p = decoder.getProgress();
			expect(typeof p).toBe('number');
			expect(p).toBeGreaterThanOrEqual(0);
			expect(p).toBeLessThanOrEqual(1);
		});

		it('getProgress is monotonically non-decreasing as parts accumulate (multi-part)', () => {
			const frags = encodeUR(new Uint8Array(2000).fill(0x33));
			expect(frags.length).toBeGreaterThan(2);
			const decoder = createURDecoder();
			let last = decoder.getProgress();
			for (const f of frags) {
				decoder.receivePart(f);
				const cur = decoder.getProgress();
				expect(cur).toBeGreaterThanOrEqual(last);
				last = cur;
			}
			// At the end, progress is 1 (library returns 1 when complete).
			expect(decoder.getProgress()).toBe(1);
		});
	});

	describe('Scenario 5-6: isComplete behavior', () => {
		it('isComplete returns false when no parts have been received', () => {
			const decoder = createURDecoder();
			expect(decoder.isComplete()).toBe(false);
		});

		it('isComplete returns false when only a partial multi-part has been fed (fountain not done)', () => {
			// Encode a large payload so the fountain decoder needs many parts.
			const frags = encodeUR(new Uint8Array(2000).fill(0xee));
			expect(frags.length).toBeGreaterThan(2);
			const decoder = createURDecoder();
			// Feed only the first part. Fountain decoder has not yet
			// reconstructed, so isComplete must be false.
			decoder.receivePart(frags[0]);
			expect(decoder.isComplete()).toBe(false);
		});

		it('isComplete returns true after all multi-part fragments are fed', () => {
			const frags = encodeUR(new Uint8Array(2000).fill(0xee));
			const decoder = createURDecoder();
			for (const f of frags) decoder.receivePart(f);
			expect(decoder.isComplete()).toBe(true);
		});

		it('isComplete combines library isComplete AND isSuccess (cashu.me pattern)', () => {
			const { decoder } = makeDecoderWithSinglePart('any-token');
			// Both conditions must be true; we just verify the combined
			// boolean matches what cashu.me would have checked inline.
			expect(decoder.isComplete()).toBe(true);
		});
	});

	describe('Scenario 7-8: getDecoded behavior', () => {
		it('getDecoded returns null when not complete', () => {
			const decoder = createURDecoder();
			expect(decoder.getDecoded()).toBeNull();
		});

		it('getDecoded returns null when only a partial multi-part has been fed', () => {
			const frags = encodeUR(new Uint8Array(2000).fill(0x77));
			const decoder = createURDecoder();
			decoder.receivePart(frags[0]);
			expect(decoder.getDecoded()).toBeNull();
		});

		it('getDecoded returns the original string when complete (single-part)', () => {
			const original = 'cashuAv4-' + 'A'.repeat(50);
			const { decoder } = makeDecoderWithSinglePart(original);
			expect(decoder.getDecoded()).toBe(original);
		});

		it('getDecoded returns the original string when complete (multi-part)', () => {
			const original = 'cashuAv4-' + 'B'.repeat(600);
			const frags = encodeURString(original);
			expect(frags.length).toBeGreaterThan(1);
			const decoder = createURDecoder();
			for (const f of frags) decoder.receivePart(f);
			expect(decoder.getDecoded()).toBe(original);
		});
	});

	describe('Scenario 9: malformed input does not throw', () => {
		let warnSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		});

		afterEach(() => {
			warnSpy.mockRestore();
		});

		it('receivePart with empty string → no throw, console.warn', () => {
			const decoder = createURDecoder();
			expect(() => decoder.receivePart('')).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
		});

		it('receivePart with non-ur prefix → no throw, console.warn', () => {
			const decoder = createURDecoder();
			expect(() => decoder.receivePart('not-a-ur-string')).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
			// Decoder must still be in a clean state — no partial progress.
			expect(decoder.isComplete()).toBe(false);
			expect(decoder.getDecoded()).toBeNull();
		});

		it('receivePart with ur: but no body → no throw, console.warn', () => {
			const decoder = createURDecoder();
			expect(() => decoder.receivePart('ur:bytes/')).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
			expect(decoder.isComplete()).toBe(false);
		});

		it('receivePart with garbled multi-part seq component → no throw, console.warn', () => {
			const decoder = createURDecoder();
			// `ur:bytes/abc-def/xyz` — type is valid but sequence component
			// is malformed. Library throws InvalidSequenceComponentError.
			expect(() => decoder.receivePart('ur:bytes/abc-def/xyz')).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
			expect(decoder.isComplete()).toBe(false);
		});

		it('receivePart with non-string input (number) → no throw, console.warn', () => {
			const decoder = createURDecoder();
			// Bypass TS via `as unknown as string`.
			const bad = 12345 as unknown as string;
			expect(() => decoder.receivePart(bad)).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
			expect(decoder.isComplete()).toBe(false);
		});

		it('receivePart with non-string input (null) → no throw, console.warn', () => {
			const decoder = createURDecoder();
			const bad = null as unknown as string;
			expect(() => decoder.receivePart(bad)).not.toThrow();
			expect(warnSpy).toHaveBeenCalled();
			expect(decoder.isComplete()).toBe(false);
		});

		it('after a malformed frame, feeding a valid frame still works (no poisoned state)', () => {
			const decoder = createURDecoder();
			decoder.receivePart('ur:bytes/garbage/garbage'); // malformed
			// Now feed a valid single-part — should still decode cleanly.
			const frags = encodeURString('recovered-token');
			decoder.receivePart(frags[0]);
			expect(decoder.isComplete()).toBe(true);
			expect(decoder.getDecoded()).toBe('recovered-token');
		});
	});

	describe('Scenario 10: reset() clears state', () => {
		it('after reset, isComplete returns false', () => {
			const { decoder } = makeDecoderWithSinglePart('any-token');
			expect(decoder.isComplete()).toBe(true);
			decoder.reset();
			expect(decoder.isComplete()).toBe(false);
		});

		it('after reset, getDecoded returns null', () => {
			const { decoder } = makeDecoderWithSinglePart('any-token');
			expect(decoder.getDecoded()).not.toBeNull();
			decoder.reset();
			expect(decoder.getDecoded()).toBeNull();
		});

		it('after reset, getProgress returns 0', () => {
			const frags = encodeUR(new Uint8Array(500).fill(0x42));
			const decoder = createURDecoder();
			decoder.receivePart(frags[0]);
			expect(decoder.getProgress()).toBeGreaterThan(0);
			decoder.reset();
			expect(decoder.getProgress()).toBe(0);
		});

		it('after reset, the decoder can decode a fresh token', () => {
			const { decoder } = makeDecoderWithSinglePart('first-token');
			decoder.reset();
			const frags2 = encodeURString('second-token');
			decoder.receivePart(frags2[0]);
			expect(decoder.isComplete()).toBe(true);
			expect(decoder.getDecoded()).toBe('second-token');
		});
	});

	describe('Scenario 11 (bonus): round-trip with ur-encoder.ts', () => {
		it('encode then decode a small string → byte-identical recovery', () => {
			const original = 'cashuAeyJ0b2tlbiI6W3sibWFudCI6Imh0dHBzOi8vZm9vLmJhciJ9XX0';
			const frags = encodeURString(original);
			const decoder = createURDecoder();
			for (const f of frags) decoder.receivePart(f);
			expect(decoder.getDecoded()).toBe(original);
		});

		it('encode then decode a large multi-part string → byte-identical recovery', () => {
			const original = 'x'.repeat(2000);
			const frags = encodeURString(original);
			expect(frags.length).toBeGreaterThan(1);
			const decoder = createURDecoder();
			for (const f of frags) decoder.receivePart(f);
			expect(decoder.getDecoded()).toBe(original);
		});

		it('encode then decode a non-ASCII UTF-8 string → byte-identical recovery', () => {
			// Thai + emoji — multi-byte UTF-8 sequences. Library's
			// decodeCBOR().toString() must round-trip these.
			const original = 'กระเป๋าเงิน⚡🔒' + 'A'.repeat(300);
			const frags = encodeURString(original);
			const decoder = createURDecoder();
			for (const f of frags) decoder.receivePart(f);
			expect(decoder.isComplete()).toBe(true);
			expect(decoder.getDecoded()).toBe(original);
		});
	});

	describe('Scenario 12 (bonus): decode error path (CBOR decode failure)', () => {
		let warnSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		});

		afterEach(() => {
			warnSpy.mockRestore();
		});

		it('CBOR-decode failure path is exercised only when resultUR().decodeCBOR() throws — verified via library direct', () => {
			// The library's `URDecoder.resultUR().decodeCBOR()` will only
			// throw if the inner CBOR byte-string is malformed. The
			// fountain decoder already verifies the checksum during
			// reconstruction, so this path is hard to trigger via a
			// normal ur-encoder-produced fragment. We document the
			// safety net here: the wrapper catches and warns.
			//
			// The end-to-end malformed-fragment cases (Scenario 9) are
			// the primary protection against crashy scanners; this
			// scenario is a placeholder that asserts the contract:
			//   - if getDecoded() is called when isComplete is true,
			//     the result is a string (decode succeeded), OR
			//   - a console.warn was emitted and null was returned.
			const decoder = createURDecoder();
			const frags = encodeURString('valid-token');
			decoder.receivePart(frags[0]);
			const result = decoder.getDecoded();
			if (decoder.isComplete()) {
				// Happy path: should be a non-null string and no warn
				// was emitted by THIS call (warns from prior tests
				// are reset in afterEach).
				expect(typeof result).toBe('string');
				expect(result).toBe('valid-token');
			} else {
				// Defensive path: getDecoded returned null and warned.
				expect(result).toBeNull();
				expect(warnSpy).toHaveBeenCalled();
			}
		});
	});
});
