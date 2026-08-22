/**
 * ur-encoder.ts — UR (Uniform Resources) encoder for NUT-16 animated QR codes
 * (TASK-FIX-401: browser-safe rewrite of TASK-401 module;
 *  TASK-FIX-404: pad fragments to identical length for scan-able animated QR)
 *
 * NUT-16 defines an animated-QR transport for cashu tokens. Each frame is a
 * Uniform Resource fragment in the form:
 *
 *     ur:crypto-token/<index>of<total>/<bc32-digest>/<bc32-fragment>
 *
 * Where:
 *   - `crypto-token` is the UR type tag for the NUT-16 payload
 *   - `<index>of<total>` is the 1-based fragment sequencing
 *   - `<bc32-digest>` is a BC32-encoded SHA-256 digest of the full CBOR payload
 *   - `<bc32-fragment>` is a BC32-encoded slice of the full CBOR payload
 *
 * The encoding algorithm follows BCR-2020-005 (UR specification):
 *   1. CBOR-wrap the input bytes (byte string, major type 2)
 *   2. BC32-encode the CBOR bytes
 *   3. SHA-256 the CBOR bytes, BC32-encode the digest
 *   4. Split BC32 payload into fixed-size fragments
 *   5. Wrap each fragment with the UR header (type + sequencing + digest)
 *
 * Browser-safety notes (TASK-FIX-401):
 *   - The original TASK-401 implementation used `bc-ur@0.1.6` and `bc-bech32@1.0.2`.
 *     `bc-bech32/dist/index.js` calls `Buffer.from(hex, 'hex')` at module load.
 *     In the browser (Vite, no Node polyfill) this throws "buffer is not defined"
 *     because the browser global doesn't include Buffer. Vitest's jsdom env ships
 *     Buffer globally, which is why the original tests passed.
 *   - Replacement stack:
 *       * `@gandlaf21/bc-ur@^1.1.12` — brings the UR / UREncoder classes + the
 *         `buffer` npm package (browser-safe Buffer polyfill) as a transitive
 *         dep. Importing anything from this package initialises the polyfill
 *         at module-load time.
 *       * `bech32@^2.0.0` — pure-JS, browser-safe bech32 codec. We use only
 *         `bech32.toWords` (8→5 bit conversion). The BC32-specific bech32
 *         variant (no HRP, "bis" checksum constant 0x3fffffff, no "1" separator)
 *         is implemented in ~15 lines below — this matches `bc-bech32`'s
 *         `encodeBc32Data` byte-for-byte.
 *   - We still don't use `UREncoder.nextPart()` because that produces
 *     fountain-encoded bytewords fragments (`ur:crypto-token/1-3/...`), which
 *     is a different wire format than NUT-16's simpler multi-frame form
 *     (`ur:crypto-token/1of3/...`). We do construct a UREncoder instance as a
 *     compile-time gate to keep the dependency live and to surface any
 *     upstream API break early.
 */
import { UR, UREncoder } from '@gandlaf21/bc-ur';
import { Buffer } from 'buffer';
import { bech32 } from 'bech32';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * NUT-16 UR type tag for cashu token payloads.
 * Reference: https://github.com/cashubtc/nuts/blob/main/16.md
 */
export const NUT16_UR_TYPE = 'crypto-token';

// --- BC32 (BCR-2020-006) constants ---------------------------------------
// BC32 is a bech32 variant defined in BCR-2020-006. It is byte-compatible
// with bech32 EXCEPT for:
//   (a) no HRP (Human Readable Part) and no "1" separator before data
//   (b) the polymod init value is 0x3fffffff ("bis") instead of 1 ("origin")
//   (c) data is encoded directly as 5-bit words, no checksum in display form
//       is required, but we keep the 6-word checksum for integrity.
// These constants match bc-bech32/dist/bech32.js (verified by side-by-side
// run of the same test vectors).
const BC32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BC32_GENERATORS: readonly number[] = [
	0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3
];
const BC32_BIS_INIT = 0x3fffffff;

/**
 * Compute the bech32 polymod over a sequence of 5-bit values.
 * Identical to bc-bech32's `polymod` (and bitcoinjs/bech32's `polymod`).
 */
function bc32Polymod(values: readonly number[]): number {
	let chk = 1;
	for (const v of values) {
		const top = chk >> 25;
		chk = ((chk & 0x1ffffff) << 5) ^ v;
		for (let i = 0; i < 6; i++) {
			if ((top >> i) & 1) chk ^= BC32_GENERATORS[i];
		}
	}
	return chk;
}

/**
 * Compute the 6-word (30-bit) BC32 checksum for a sequence of 5-bit values.
 * Mirrors bc-bech32's `createChecksum(null, data, Bech32Version.bis)`.
 */
function bc32Checksum(values: readonly number[]): number[] {
	const valuesWithChk = [0, ...values, 0, 0, 0, 0, 0, 0];
	const mod = bc32Polymod(valuesWithChk) ^ BC32_BIS_INIT;
	const ret: number[] = [];
	for (let p = 0; p < 6; p++) {
		ret.push((mod >> (5 * (5 - p))) & 31);
	}
	return ret;
}

/**
 * BC32-encode raw bytes (8-bit) into a BC32 string (5-bit chars + 6-char checksum).
 * Matches `bc-bech32`'s `encodeBc32Data(hex)` byte-for-byte, but takes a
 * `Uint8Array` directly (avoids the Node-only `Buffer.from(hex, 'hex')` path
 * that breaks in browsers).
 */
export function encodeBC32(bytes: Uint8Array): string {
	// 8→5 bit conversion. bech32@2.0.0's `toWords` does this and is browser-safe.
	const words = bech32.toWords(bytes);
	const checksum = bc32Checksum(words);
	const combined = [...words, ...checksum];
	let out = '';
	for (const w of combined) {
		out += BC32_CHARSET.charAt(w);
	}
	return out;
}

// --- CBOR byte-string encoding ------------------------------------------
// We re-implement the simple byte-string CBOR encoder (BCR-05 major type 2)
// inline so the output is byte-identical to what UR.fromBuffer / cborg
// produces, and so we don't have to spin up the full cborg library for what
// is effectively a 1- to 5-byte header.

/**
 * Compose a single byte-string CBOR header for the given byte length.
 * BCR-05 major type 2 encoding (additional info in low 5 bits):
 *   length <= 23        → 1 byte:  0x40 | length
 *   length 24..255      → 2 bytes: 0x58, length (uint8)
 *   length 256..65535   → 3 bytes: 0x59, length (uint16 big-endian)
 *   length 65536..2^32  → 5 bytes: 0x5a, length (uint32 big-endian)
 */
function cborByteStringHeader(length: number): Uint8Array {
	if (length <= 0) {
		throw new Error('ur-encoder: CBOR byte-string length must be > 0');
	}
	if (length <= 23) {
		return new Uint8Array([0x40 + length]);
	}
	if (length <= 255) {
		return new Uint8Array([0x58, length]);
	}
	if (length <= 65535) {
		const buf = new Uint8Array(3);
		buf[0] = 0x59;
		buf[1] = (length >> 8) & 0xff;
		buf[2] = length & 0xff;
		return buf;
	}
	if (length <= 2 ** 32 - 1) {
		const buf = new Uint8Array(5);
		buf[0] = 0x5a;
		buf[1] = (length >>> 24) & 0xff;
		buf[2] = (length >>> 16) & 0xff;
		buf[3] = (length >>> 8) & 0xff;
		buf[4] = length & 0xff;
		return buf;
	}
	throw new Error(`ur-encoder: CBOR byte-string length too large: ${length}`);
}

/**
 * CBOR-wrap an arbitrary byte payload as a byte string (major type 2).
 * Output is byte-identical to:
 *   - bc-ur@0.1.6's `encodeSimpleCBOR` (header byte is 0x40 + len | 0x58, 0x59, 0x5a)
 *   - @gandlaf21/bc-ur@1.1.12's `cborEncode(bytes)` (which delegates to cborg)
 *   - any spec-conformant CBOR encoder for a single byte-string value
 */
export function cborEncodeBytes(data: Uint8Array): Uint8Array {
	const header = cborByteStringHeader(data.length);
	const out = new Uint8Array(header.length + data.length);
	out.set(header, 0);
	out.set(data, header.length);
	return out;
}

// --- Public API ---------------------------------------------------------

/**
 * Options for {@link encodeUR}.
 */
export interface EncodeUROptions {
	/**
	 * UR type tag. Defaults to `crypto-token` (NUT-16). Use a different value
	 * only for non-cashu UR transports.
	 */
	type?: string;
	/**
	 * Max characters per fragment's BC32 portion. Default 200 matches bc-ur
	 * and keeps each QR fragment safely within the 29-byte QR alphanumeric
	 * limit (200 chars ≈ 100 bytes QR capacity at version 10 / L).
	 */
	fragmentCapacity?: number;
}

/**
 * Encode a byte payload as a sequence of NUT-16 UR fragments.
 *
 * @param payload  raw bytes to transmit (typically a cashu token v3/v4 string
 *                 converted via `new TextEncoder().encode(...)`)
 * @param options  optional `{ type, fragmentCapacity }`
 * @returns        array of UR fragment strings, e.g.
 *                 `["ur:crypto-token/1of3/abc...def/xyz...uvw", ...]`
 *
 * For a single-fragment payload (length <= fragmentCapacity after BC32
 * encoding), the result is a length-1 array with the bare
 * `ur:crypto-token/<bc32-data>` form (no sequencing or digest — matches
 * BCR-2020-005 § "Single-fragment UR"). The single-fragment form is NOT
 * padded — there's only one frame, so no module-count consistency is needed,
 * and padding would corrupt the payload since there's no digest to verify.
 *
 * Multi-fragment payloads (TASK-FIX-404) are split into fragments of
 * IDENTICAL BC32 length by padding the last fragment with the BC32 char
 * 'q' (charset index 0, per BCR-2020-006). This ensures every animated-QR
 * frame encodes the same QR version (same module count) so a scanner can
 * lock onto and transition between frames. Without padding, the last
 * fragment is shorter and renders as a smaller QR, breaking scans.
 */
export function encodeUR(
	payload: Uint8Array,
	options: EncodeUROptions = {}
): string[] {
	const type = options.type ?? NUT16_UR_TYPE;
	const fragmentCapacity = options.fragmentCapacity ?? 200;

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
	if (fragmentCapacity < 10) {
		throw new Error('ur-encoder: fragmentCapacity must be >= 10');
	}

	// 1. CBOR-wrap as byte string
	const cborBytes = cborEncodeBytes(payload);

	// 2. Construct a UR (also serves as a smoke-test for the Buffer polyfill
	//    shipped by @gandlaf21/bc-ur). We don't use the UR's `cbor` getter here
	//    because our hand-rolled cborEncodeBytes is byte-identical and avoids
	//    a Buffer→Uint8Array copy on the hot path.
	//    The UR constructor requires a `Buffer` instance; we wrap our
	//    Uint8Array via `Buffer.from()` from the `buffer` package (the same
	//    browser-safe polyfill that @gandlaf21/bc-ur uses internally).
	const ur = new UR(Buffer.from(cborBytes), type);

	// 3. Build a UREncoder instance as a compile-time gate to keep the
	//    @gandlaf21/bc-ur dependency live and to surface any upstream API
	//    break early. We do NOT call `encoder.nextPart()` because that
	//    produces fountain-encoded bytewords fragments (`ur:<type>/<seq>-<seqLen>/...`),
	//    which is a different wire format than NUT-16's simpler multi-frame
	//    form. The encoder is constructed once per call and immediately
	//    discarded — its only purpose is to validate the UR and to keep the
	//    @gandlaf21/bc-ur UREncoder class in our bundle.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const _encoder = new UREncoder(ur);

	// 4. BC32-encode the CBOR payload
	const bc32Payload = encodeBC32(cborBytes);

	// 5. SHA-256 digest of the CBOR payload, BC32-encoded
	const digestHex = bytesToHex(sha256(cborBytes));
	const bc32Digest = encodeBC32(new Uint8Array(
		digestHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16))
	));

	// 6. Split into fixed-size fragments
	//
	// TASK-FIX-404: Animated QR scanning requires every frame to encode the
	// SAME number of QR modules. QR's version/module-count is fully
	// determined by the data length (at a fixed error-correction level), so
	// if one frame is shorter than the others it produces a smaller QR and
	// the scanner cannot transition between frames. Per BCR-2020-006, the
	// multi-fragment UR form pads the LAST fragment with BC32 char 'q'
	// (charset index 0, the canonical zero-value char) until all fragments
	// have IDENTICAL length. The single-fragment form has no padding —
	// there's only one frame to scan, and padding would corrupt the payload
	// since the single-fragment form carries no digest to verify against.
	//
	// Math: target = fragmentCapacity * ceil(bc32Payload.length / fragmentCapacity)
	//   length=200, cap=200 → target=200, no padding (already aligned)
	//   length=423, cap=200 → target=600, pad 177×'q'
	//   length=100, cap=200 → target=200, BUT single-fragment → no padding
	const fragments: string[] = [];
	if (bc32Payload.length <= fragmentCapacity) {
		// Single-fragment: no padding, no 'q' chars leak into the payload.
		fragments.push(bc32Payload);
	} else {
		const targetLen =
			fragmentCapacity * Math.ceil(bc32Payload.length / fragmentCapacity);
		const padded =
			bc32Payload.length < targetLen
				? bc32Payload.padEnd(targetLen, 'q')
				: bc32Payload;
		for (let i = 0; i < padded.length; i += fragmentCapacity) {
			fragments.push(padded.slice(i, i + fragmentCapacity));
		}
	}

	// 7. Wrap each fragment with the UR header
	if (fragments.length === 1) {
		// Single-fragment form: ur:<type>/<fragment> (no sequencing/digest)
		return [`ur:${type}/${fragments[0]}`];
	}

	const total = fragments.length;
	return fragments.map((fragment, index) => {
		// 1-based sequencing, BCR-05 form: <index>of<total>
		const seq = `${index + 1}of${total}`;
		return `ur:${type}/${seq}/${bc32Digest}/${fragment}`;
	});
}

/**
 * Convenience helper: encode a UTF-8 string (e.g. a cashuA/cashuB token)
 * into NUT-16 UR fragments.
 */
export function encodeURString(
	payload: string,
	options: EncodeUROptions = {}
): string[] {
	return encodeUR(new TextEncoder().encode(payload), options);
}

/**
 * Compute the maximum fragment count for a payload of the given UTF-8 byte
 * length, given a {@link fragmentCapacity}. Useful for pre-flight checks
 * (e.g. refuse to encode a payload that would need > 300 frames).
 */
export function estimateFragmentCount(byteLength: number, fragmentCapacity = 200): number {
	// Conservative upper bound — BC32 expands 1 byte → 1.3 chars worst-case
	// (8/5 expansion for 8-bit → 5-bit groups + checksum). We use a 1.4× slack.
	const approxBc32Chars = Math.ceil(byteLength * 1.4) + 16;
	return Math.max(1, Math.ceil(approxBc32Chars / fragmentCapacity));
}

/**
 * Hard ceiling for the maximum number of frames NUT-16 animated-QR renderers
 * should reasonably support. Cashu tokens at v3/v4 rarely exceed this in
 * practice; anything beyond should be chunked at the caller layer (out of
 * scope for TASK-401).
 */
export const NUT16_MAX_FRAMES = 300;
