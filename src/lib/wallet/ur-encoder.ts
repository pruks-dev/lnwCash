/**
 * ur-encoder.ts — UR (Uniform Resources) encoder for NUT-16 animated QR codes
 * Thin wrapper around @gandlaf21/bc-ur library (TASK-FIX-406)
 *
 * NUT-16 defines an animated-QR transport for cashu tokens. Each frame is a
 * Uniform Resource fragment. With the library used directly, the wire format
 * is exactly what cashu.me emits:
 *
 *   - Single-part: ur:bytes/<bc32-data>
 *     (one frame; payload fits in one BC32 string)
 *
 *   - Multi-part (BCR-2020-008 fountain codes):
 *     ur:bytes/<seqNum>-<seqLength>/<bytewords>
 *     (fountain-encoded fragments; first seqNum = 1, then monotonic;
 *      total parts is fragmentsLength from FountainEncoder)
 *
 * The library `UR.fromBuffer(buf)` uses the default UR type tag `bytes`
 * (BCR-2020-005 standard for arbitrary CBOR byte-string payloads — matches
 * cashu.me).
 *
 * Reference impl (cashu.me DisplayTokenComponent.vue line 477-484):
 *     const messageBuffer = Buffer.from(this.sendData.tokensBase64);
 *     const ur = UR.fromBuffer(messageBuffer);
 *     this.encoder = new UREncoder(ur, this.currentFragmentLength, 0);
 *     this.qrCodeFragment = this.encoder.nextPart();
 *
 * Browser-safety (TASK-FIX-401): the library ships the `buffer` package as a
 * transitive dependency, so importing UR/UREncoder from @gandlaf21/bc-ur also
 * initialises the browser-safe Buffer polyfill at module-load time. No
 * additional polyfill wiring required.
 *
 * TASK-FIX-406: this file is now a THIN WRAPPER. We removed all custom
 * CBOR/BC32/SHA-256/polymod/padding logic. The library UREncoder class is
 * the single source of truth for the UR wire format, so output is
 * byte-for-byte compatible with cashu.me and any other
 * @gandlaf21/bc-ur-based scanner.
 */
import { Buffer } from 'buffer';
import { UR, UREncoder } from '@gandlaf21/bc-ur';

/**
 * NUT-16 UR type tag for cashu token payloads.
 *
 * The library `UR.fromBuffer(buf)` defaults to `bytes`. We export the
 * constant for symmetry with the previous API surface so callers don't
 * need to import from the library directly.
 */
export const NUT16_UR_TYPE = 'bytes';

/**
 * Options for {@link encodeUR}.
 */
export interface EncodeUROptions {
	/**
	 * UR type tag. Defaults to `bytes` (TASK-FIX-405 / TASK-FIX-406 — matches
	 * cashu.me; NUT-16 does not specify a custom UR type). Use a different
	 * value only for non-cashu UR transports. Note: NUT-16 cashu tokens
	 * always use `bytes`.
	 */
	type?: string;
	/**
	 * Max BC32 characters per fragment's data portion. Default 150 matches
	 * the cashu.me reference implementation (TASK-FIX-405). Callers can
	 * pass 50 / 100 / 150 — smaller fragments are more scan-resilient on
	 * poor cameras but require more frames.
	 *
	 * This maps to the library's `maxFragmentLength` parameter on
	 * `UREncoder`. We also expose it under the name `fragmentCapacity`
	 * (deprecated alias) for backward compatibility with the previous
	 * hand-rolled implementation.
	 */
	maxFragmentLength?: number;
	/**
	 * @deprecated Use `maxFragmentLength`. Kept for backward compatibility
	 * with the previous TASK-FIX-404 / TASK-FIX-405 API surface.
	 */
	fragmentCapacity?: number;
}

/**
 * Encode a byte payload as a sequence of UR fragments using the
 * @gandlaf21/bc-ur library directly (TASK-FIX-406).
 *
 * Output formats produced by the library:
 *   - Single-part: `ur:bytes/<bc32-data>` (one frame; library calls this
 *     `encodeSinglePart` — no sequencing, no digest)
 *   - Multi-part: `ur:bytes/<seq>-<seqLen>/<bytewords>` (BCR-2020-008
 *     fountain codes — scanner can recover the payload even if some
 *     frames are dropped, as long as at least `seqLen` distinct frames
 *     are observed)
 *
 * @param payload  raw bytes to transmit (typically a cashu token v3/v4 string
 *                 converted via `new TextEncoder().encode(...)`)
 * @param options  optional `{ type, maxFragmentLength }`
 * @returns        array of UR fragment strings.
 *                 Single-part returns a length-1 array; multi-part returns
 *                 `fragmentsLength` strings (one per fountain part).
 */
export function encodeUR(
	payload: Uint8Array,
	options: EncodeUROptions = {}
): string[] {
	// Duck-type check (instead of `instanceof Uint8Array`) — `instanceof`
	// can fail across module realms (e.g. vitest jsdom env, multiple copies
	// of the Uint8Array constructor). The structural check below works
	// regardless of realm and also accepts Node.js Buffer (which extends
	// Uint8Array structurally).
	if (
		!payload ||
		typeof payload.length !== 'number' ||
		typeof payload[Symbol.iterator] !== 'function' ||
		payload.length < 0
	) {
		throw new Error('ur-encoder: payload must be a Uint8Array (or Buffer)');
	}
	if (payload.length === 0) {
		throw new Error('ur-encoder: payload must not be empty');
	}

	const type = options.type ?? NUT16_UR_TYPE;
	// Accept both new name (maxFragmentLength) and legacy name (fragmentCapacity).
	const maxFragmentLength =
		options.maxFragmentLength ?? options.fragmentCapacity ?? 150;

	if (maxFragmentLength < 10) {
		throw new Error('ur-encoder: maxFragmentLength must be >= 10');
	}

	// 1. Wrap the payload as a UR.
	//    The library's `UR.fromBuffer(buf)` CBOR-encodes `buf` as a
	//    byte-string (BCR-05 major type 2) and constructs a UR with the
	//    default type tag `bytes`. This is exactly what NUT-16 wants.
	const buffer = Buffer.from(payload);
	const ur = UR.fromBuffer(buffer);
	if (type !== NUT16_UR_TYPE) {
		// Library only supports the default 'bytes' type via fromBuffer.
		// Construct manually if the caller wants a different type (rare).
		// Re-use the CBOR bytes from the UR we just built — they're
		// identical for 'bytes' regardless of the type tag.
		const cborBytes = ur.cbor;
		const customUr = new UR(cborBytes, type);
		const encoder = new UREncoder(customUr, maxFragmentLength, 0);
		return encoder.encodeWhole();
	}

	// 2. Build a UREncoder with the requested max-fragment-length.
	//    Per the library source, `UREncoder` constructor signature:
	//      new UREncoder(_ur, maxFragmentLength?, firstSeqNum?, minFragmentLength?)
	//    We pass `firstSeqNum = 0` (cashu.me convention; first fragment
	//    becomes `1-N`, second `2-N`, etc.).
	const encoder = new UREncoder(ur, maxFragmentLength, 0);

	// 3. Library `encodeWhole()` returns all UR part strings in order:
	//    - For a single-part message, returns `[ ur:bytes/<bc32> ]`
	//    - For a multi-part message, returns N fountain-encoded parts.
	//
	//    This is exactly the cashu.me pattern: build encoder once, call
	//    nextPart() per frame. `encodeWhole()` is a convenience that does
	//    the same loop internally.
	const parts = encoder.encodeWhole();

	if (parts.length === 0) {
		throw new Error('ur-encoder: library encoder produced 0 fragments');
	}
	return parts;
}

/**
 * Convenience helper: encode a UTF-8 string (e.g. a cashuA/cashuB token)
 * into UR fragments.
 */
export function encodeURString(
	payload: string,
	options: EncodeUROptions = {}
): string[] {
	return encodeUR(new TextEncoder().encode(payload), options);
}

/**
 * Compute the maximum fragment count for a payload of the given UTF-8 byte
 * length, given a `maxFragmentLength`. Useful for pre-flight checks
 * (e.g. refuse to encode a payload that would need > 300 frames).
 *
 * NOTE: This is an estimate based on the library's FountainEncoder
 * partitioning (8→5 bit expansion + overhead). The actual count returned
 * by the library may differ slightly — call `encodeUR(...).length` for the
 * exact number.
 */
export function estimateFragmentCount(byteLength: number, maxFragmentLength = 150): number {
	if (byteLength <= 0) return 1;
	// Conservative upper bound: CBOR adds ~2 bytes for the byte-string header
	// (worst case length-prefixed), then BC32 expands 8→5 (×1.3) plus a
	// 6-byte checksum.
	const approxBc32Chars = Math.ceil((byteLength + 3) * 1.4) + 16;
	return Math.max(1, Math.ceil(approxBc32Chars / maxFragmentLength));
}

/**
 * Hard ceiling for the maximum number of frames NUT-16 animated-QR renderers
 * should reasonably support. Cashu tokens at v3/v4 rarely exceed this in
 * practice; anything beyond should be chunked at the caller layer.
 */
export const NUT16_MAX_FRAMES = 300;
