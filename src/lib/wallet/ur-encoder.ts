/**
 * ur-encoder.ts — UR (Uniform Resources) encoder for NUT-16 animated QR codes (TASK-401)
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
 * This module is self-contained and browser-safe:
 *   - Uses `bc-bech32` for BC32 (already installed via bc-ur)
 *   - Uses `@noble/hashes/sha2.js` for SHA-256 (already a project dep, no Buffer needed)
 *   - Re-implements the simple CBOR byte-string encoder (~10 lines) instead of
 *     dragging in `bc-ur`'s missing `bitcoinjs-lib` peer dep
 *
 * bc-ur@0.1.6 IS installed (per TASK-401) and its algorithm is mirrored here
 * for license/source-of-truth verification, but `encodeUR()` from bc-ur has
 * two blockers for our use case:
 *   (a) it requires `bitcoinjs-lib` (un-declared peer dep, ~5 MB, Node-only)
 *   (b) it hard-codes the UR type to `ur:bytes/` — NUT-16 requires `ur:crypto-token/`
 *
 * The byte-string CBOR encoder here is byte-identical to bc-ur's
 * `encodeSimpleCBOR` (see node_modules/bc-ur/src/miniCbor.ts) and the BC32 +
 * SHA-256 + sequencing wrapper mirrors `encodeUR` exactly.
 */
import { encodeBc32Data } from 'bc-bech32';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * NUT-16 UR type tag for cashu token payloads.
 * Reference: https://github.com/cashubtc/nuts/blob/main/16.md
 */
export const NUT16_UR_TYPE = 'crypto-token';

/**
 * Compose a single byte-string CBOR header for the given byte length.
 * Mirrors `composeHeader` in bc-ur/src/miniCbor.ts (BCR-05 major type 2).
 */
function cborByteStringHeader(length: number): Uint8Array {
	if (length <= 0) {
		throw new Error('ur-encoder: CBOR byte-string length must be > 0');
	}
	if (length > 0 && length <= 23) {
		return new Uint8Array([0x40 + length]);
	}
	if (length >= 24 && length <= 255) {
		return new Uint8Array([0x58, length]);
	}
	if (length >= 256 && length <= 65535) {
		const buf = new Uint8Array(3);
		buf[0] = 0x59;
		// big-endian uint16
		buf[1] = (length >> 8) & 0xff;
		buf[2] = length & 0xff;
		return buf;
	}
	if (length >= 65536 && length <= 2 ** 32 - 1) {
		const buf = new Uint8Array(5);
		buf[0] = 0x60;
		// big-endian uint32 (mask each byte to be safe)
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
 * Returns a Uint8Array. Mirrors `encodeSimpleCBOR` in bc-ur/src/miniCbor.ts
 * but operates on raw bytes (not hex) for clarity and to avoid Buffer.
 */
export function cborEncodeBytes(data: Uint8Array): Uint8Array {
	const header = cborByteStringHeader(data.length);
	const out = new Uint8Array(header.length + data.length);
	out.set(header, 0);
	out.set(data, header.length);
	return out;
}

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
 * BCR-2020-005 § "Single-fragment UR").
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

	// 2. BC32-encode the CBOR payload
	const bc32Payload = encodeBc32Data(bytesToHex(cborBytes));

	// 3. SHA-256 digest of the CBOR payload, BC32-encoded
	const digestHex = bytesToHex(sha256(cborBytes));
	const bc32Digest = encodeBc32Data(digestHex);

	// 4. Split into fixed-size fragments
	const fragments: string[] = [];
	for (let i = 0; i < bc32Payload.length; i += fragmentCapacity) {
		fragments.push(bc32Payload.slice(i, i + fragmentCapacity));
	}
	if (fragments.length === 0) {
		fragments.push(bc32Payload);
	}

	// 5. Wrap each fragment with the UR header
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
