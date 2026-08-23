/**
 * ur-decoder.ts — UR (Uniform Resources) decoder for NUT-16 animated QR codes
 * Thin wrapper around @gandlaf21/bc-ur library URDecoder class.
 *
 * NUT-16 defines an animated-QR transport for cashu tokens. A scanner
 * (e.g. QRScanner.svelte, TASK-503) receives a stream of UR fragments
 * (one per camera frame), feeds each fragment to a decoder, and
 * periodically polls the decoder for completion. Once the decoder
 * reports the multi-part message is fully reassembled, the original
 * CBOR byte-string payload is decoded back to a UTF-8 string (the
 * cashu token itself).
 *
 * The library `URDecoder` class reassembles single-part and multi-part
 * (BCR-2020-008 fountain codes) UR fragments. This wrapper:
 *   1. Encapsulates the library's stateful `URDecoder` instance behind
 *      a factory function `createURDecoder()` — each call returns a
 *      fresh, independent decoder. This keeps the API tree-shakeable
 *      and lets a single scanner create + reset + discard decoders
 *      without module-level state pollution.
 *   2. Surfaces only the methods the caller (TASK-503) needs:
 *      `receivePart`, `getProgress`, `isComplete`, `getDecoded`, `reset`.
 *   3. Normalises cashu.me's combined `isComplete() && isSuccess()` check
 *      into a single `isComplete()` boolean, so the caller does not have
 *      to remember the redundancy.
 *   4. Catches malformed-UR exceptions from the library and degrades to
 *      a `console.warn` — a single bad frame in an animated-QR stream
 *      must not crash the scanner loop.
 *
 * Reference impl (cashu.me QrcodeReader.vue line 21, 53-72):
 *     import { URDecoder } from '@gandlaf21/bc-ur';
 *     ...
 *     urDecoder?.receivePart(data);
 *     urDecoderProgress = urDecoder?.estimatedPercentComplete() || 0;
 *     if (urDecoder?.isComplete() && urDecoder?.isSuccess()) {
 *       const decoded = urDecoder?.resultUR().decodeCBOR().toString();
 *       onDecode(decoded);
 *       stopScanner();
 *     }
 *
 * This file is a mirror of `ur-encoder.ts` (TASK-FIX-406): same top-level
 * JSDoc style, same duck-type guards where appropriate, same named
 * exports pattern. NUT-16 cashu token UR type tag is `bytes`
 * (BCR-2020-005 standard for arbitrary CBOR byte-string payloads —
 * matches cashu.me; see ur-encoder.ts for the encoder-side rationale).
 *
 * TASK-502: created as a wrapper for QRScanner.svelte (TASK-503) to
 * consume during NUT-16 animated-QR receive flow. The encoder side
 * already uses Buffer polyfill (TASK-FIX-401 / TASK-FIX-403 via
 * vite-plugin-node-polyfills include:['buffer']); the decoder does not
 * need an explicit Buffer import because it never constructs a
 * Buffer directly — it only passes strings to the library and reads
 * `.toString()` on the library-returned Buffer from `decodeCBOR()`.
 */
import { URDecoder } from '@gandlaf21/bc-ur';

/**
 * NUT-16 UR type tag for cashu token payloads.
 *
 * Mirrors `NUT16_UR_TYPE` from `ur-encoder.ts` so callers don't have
 * to import the type tag from the library directly. The library
 * `URDecoder` defaults to `bytes` which matches NUT-16.
 */
export const NUT16_UR_TYPE = 'bytes';

/**
 * Stateful UR-decoder handle returned by {@link createURDecoder}.
 *
 * Each instance owns one `URDecoder` from the underlying library. Use
 * {@link URDecoderHandle.receivePart} to feed a UR fragment, poll
 * {@link URDecoderHandle.getProgress} for UI feedback, and check
 * {@link URDecoderHandle.isComplete} to know when the full payload
 * has been reassembled. Call {@link URDecoderHandle.getDecoded} to
 * retrieve the UTF-8 string of the original payload once `isComplete`
 * is true. Use {@link URDecoderHandle.reset} to discard the current
 * state and start a fresh decoding cycle (e.g. when the user cancels
 * a scan or starts a new one).
 */
export interface URDecoderHandle {
	/**
	 * Feed a UR fragment string (one camera frame) to the decoder.
	 * Safe to call repeatedly with the same fragment (idempotent at
	 * the fountain-encoder level — the library deduplicates by
	 * fragment index). Throws are caught internally and logged via
	 * `console.warn` so a single malformed frame does not crash the
	 * scanner loop. Non-string input is rejected via duck-type guard
	 * (matches the encoder's input-validation style).
	 */
	receivePart(ur: string): void;

	/**
	 * Estimated decode progress as a fraction in the range [0, 1].
	 *
	 * Note: the library method `URDecoder.estimatedPercentComplete()`
	 * is named "Percent" but actually returns a 0-1 fraction, not a
	 * 0-100 integer. We pass it through unchanged so behaviour
	 * matches the cashu.me reference (`urDecoderProgress` is a 0-1
	 * value in their UI). Callers that want a percentage string
	 * should multiply by 100.
	 *
	 * Returns 0 before any fragment is received; returns 1 once the
	 * payload is fully reassembled.
	 */
	getProgress(): number;

	/**
	 * True when the decoder has successfully reassembled the full
	 * payload and `getDecoded()` is guaranteed to return the original
	 * UTF-8 string.
	 *
	 * Combines the library's `isComplete()` AND `isSuccess()` per the
	 * cashu.me QrcodeReader.vue pattern (line 57):
	 *     if (urDecoder?.isComplete() && urDecoder?.isSuccess())
	 * The library exposes both as separate methods; we fold the
	 * redundancy into a single boolean so the caller doesn't have to
	 * remember the two-step check.
	 */
	isComplete(): boolean;

	/**
	 * Returns the original UTF-8 payload (e.g. a cashu token string)
	 * if decoding is complete, otherwise returns `null`.
	 *
	 * Implementation: when `isComplete()` is true, call
	 * `resultUR().decodeCBOR().toString()` per the cashu.me pattern.
	 * CBOR-decode failures (corrupted/truncated bytes) are caught and
	 * logged via `console.warn`; this function then returns `null`
	 * rather than letting the exception bubble up to the scanner UI.
	 */
	getDecoded(): string | null;

	/**
	 * Discard the current decoder state and start a fresh decoding
	 * cycle. Used when:
	 *   - the user cancels a scan
	 *   - the user restarts scanning after a timeout
	 *   - the caller wants to decode a second token without keeping
	 *     a long-lived decoder around.
	 *
	 * Implementation: replaces the internal `URDecoder` instance with
	 * a fresh one (the library class has no `.reset()` method).
	 */
	reset(): void;
}

/**
 * Create a fresh, stateful UR decoder.
 *
 * Design choice (documented per TASK-502 brief): factory function,
 * not module-level singleton. Rationale:
 *   - The scanner UI (TASK-503) will create one decoder per active
 *     scan session. A factory keeps each session isolated — there's
 *     no risk of leaked state from a previous scan polluting the new
 *     one (e.g. stale `result` from a previously-decoded token
 *     showing up after a `reset()` call from a different code path).
 *   - Tree-shakeable: the factory is a named export; if a future
 *     bundle ships without any NUT-16 scan path, the decoder code
 *     can be eliminated by the bundler.
 *   - Easy to test: each test creates its own decoder via the
 *     factory, so there's no shared module state between test cases.
 *
 * Each call returns a new `URDecoderHandle` wrapping a fresh
 * `@gandlaf21/bc-ur` `URDecoder` instance. The default UR type is
 * `bytes` (NUT-16 standard; matches the encoder's default in
 * `ur-encoder.ts`).
 */
export function createURDecoder(): URDecoderHandle {
	let decoder: URDecoder = new URDecoder();

	return {
		receivePart(ur: string): void {
			// Duck-type guard: `URDecoder.receivePart` is typed as
			// `(s: string): boolean` but at runtime, a non-string
			// would still be coerced by the library's internal
			// `.toLowerCase()` call, producing confusing downstream
			// errors. Reject early with a clear message, matching
			// the encoder's payload-validation style.
			if (typeof ur !== 'string') {
				console.warn('ur-decoder: receivePart expected string, got', typeof ur);
				return;
			}
			if (ur.length === 0) {
				console.warn('ur-decoder: receivePart called with empty string, ignoring');
				return;
			}
			try {
				// Library returns `false` on most "expected" rejections
				// (type mismatch, bad seq number, already complete),
				// but THROWS on parse-level errors:
				//   - InvalidSchemeError  (missing `ur:` prefix)
				//   - InvalidPathLengthError (components.length < 2 OR !== 2 for multi-part)
				//   - InvalidTypeError    (UR type doesn't match isURType regex)
				//   - InvalidSequenceComponentError (seq-splitter failed)
				// We catch all of them: a single bad camera frame must
				// not crash the scanner loop.
				decoder.receivePart(ur);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.warn(`ur-decoder: receivePart rejected malformed UR fragment: ${msg}`);
			}
		},

		getProgress(): number {
			// Library returns 0-1 fraction (not 0-100) despite the
			// method name `estimatedPercentComplete`. Pass through
			// unchanged; the JSDoc on URDecoderHandle.getProgress
			// documents the actual range.
			return decoder.estimatedPercentComplete();
		},

		isComplete(): boolean {
			// cashu.me QrcodeReader.vue line 57:
			//   if (urDecoder?.isComplete() && urDecoder?.isSuccess())
			// `isSuccess` is `!error && isComplete` so it's
			// technically redundant — but we mirror the cashu.me
			// pattern exactly in case the library ever changes
			// `isComplete` semantics (e.g. reporting complete on
			// partial reconstruction).
			return decoder.isComplete() && decoder.isSuccess();
		},

		getDecoded(): string | null {
			if (!decoder.isComplete() || !decoder.isSuccess()) {
				return null;
			}
			try {
				// cashu.me QrcodeReader.vue line 58:
				//   const decoded = urDecoder?.resultUR().decodeCBOR().toString();
				// `resultUR()` returns a UR; `decodeCBOR()` returns a
				// Buffer; `.toString()` defaults to utf-8 which is
				// what NUT-16 cashu tokens use.
				const buffer = decoder.resultUR().decodeCBOR();
				return buffer.toString('utf-8');
			} catch (err) {
				// CBOR decode can throw on truncated/corrupted bytes
				// (e.g. if a multi-part message decoded its cbor
				// wrapper but the inner payload is malformed). We
				// don't want this to crash the scanner — return
				// null and let the caller decide whether to keep
				// scanning, reset, or surface a UI error.
				const msg = err instanceof Error ? err.message : String(err);
				console.warn(`ur-decoder: getDecoded failed during CBOR decode: ${msg}`);
				return null;
			}
		},

		reset(): void {
			// The library `URDecoder` class has no `reset()` method
			// (it carries internal fountain-decoder state that can't
			// be reset in place). Cheapest correct reset: replace
			// the instance with a fresh one. The old one becomes
			// garbage and is collected.
			decoder = new URDecoder();
		}
	};
}
