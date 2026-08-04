/**
 * Minimal CBOR encode/decode for Cashu token secrets.
 *
 * The secret field should be stored as CBOR text string (major type 3),
 * not as raw bytes (major type 2). This ensures interop with wallets
 * that use CBOR-encoded token format (Cashu V4).
 *
 * Supports:
 *  - Major type 3: text string encoding/decoding
 *  - Basic major type 0/1: unsigned/negative int
 */

const MAJOR_TEXT = 3 << 5; // 0x60
const MAJOR_BYTES = 2 << 5; // 0x40
const MAJOR_UINT = 0 << 5; // 0x00

function encodeCBORHeader(major: number, value: number): Uint8Array {
	if (value < 24) {
		return new Uint8Array([major | value]);
	}
	if (value < 256) {
		return new Uint8Array([major | 24, value]);
	}
	return new Uint8Array([major | 25, (value >> 8) & 0xff, value & 0xff]);
}

function decodeCBORHeader(bytes: Uint8Array): { major: number; value: number; offset: number } {
	const first = bytes[0];
	const major = first & 0xe0;
	const info = first & 0x1f;

	if (info < 24) {
		return { major, value: info, offset: 1 };
	}
	if (info === 24) {
		return { major, value: bytes[1], offset: 2 };
	}
	if (info === 25) {
		return { major, value: (bytes[1] << 8) | bytes[2], offset: 3 };
	}
	throw new Error(`Unsupported CBOR additional info: ${info}`);
}

/**
 * Encode a secret string as CBOR text string (major type 3).
 * This is the correct format for Cashu token secrets in CBOR mode.
 */
export function cborEncodeSecret(secret: string): Uint8Array {
	const encoder = new TextEncoder();
	const encoded = encoder.encode(secret);
	const header = encodeCBORHeader(MAJOR_TEXT, encoded.length);
	const result = new Uint8Array(header.length + encoded.length);
	result.set(header, 0);
	result.set(encoded, header.length);
	return result;
}

/**
 * Decode a CBOR text string (major type 3) back to a string.
 * If the input uses major type 2 (raw bytes), decodes as UTF-8.
 */
export function cborDecodeSecret(data: Uint8Array): string {
	if (data.length === 0) return '';

	const { major, value: length, offset } = decodeCBORHeader(data);
	const payload = data.slice(offset, offset + length);

	if (major === MAJOR_TEXT) {
		const decoder = new TextDecoder();
		return decoder.decode(payload);
	}
	if (major === MAJOR_BYTES) {
		// Legacy: raw bytes — decode as UTF-8
		const decoder = new TextDecoder();
		return decoder.decode(payload);
	}
	throw new Error(`Unexpected CBOR major type: ${major >> 5} (expected 3 for text string)`);
}

/**
 * Encode a uint value as CBOR unsigned int (major type 0).
 */
export function cborEncodeUint(value: number): Uint8Array {
	return encodeCBORHeader(MAJOR_UINT, value);
}

/**
 * Decode a CBOR unsigned int (major type 0).
 */
export function cborDecodeUint(data: Uint8Array): number {
	const { major, value } = decodeCBORHeader(data);
	if (major !== MAJOR_UINT) {
		throw new Error(`Expected unsigned int (major 0), got ${major >> 5}`);
	}
	return value;
}
