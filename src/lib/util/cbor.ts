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
 *  - Major type 2: byte string (for binary data fields like C, dleq)
 *  - Major type 4: array
 *  - Major type 5: map
 */

const MAJOR_TEXT = 3 << 5; // 0x60
const MAJOR_BYTES = 2 << 5; // 0x40
const MAJOR_UINT = 0 << 5; // 0x00
const MAJOR_ARRAY = 4 << 5; // 0x80
const MAJOR_MAP = 5 << 5; // 0xa0

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
 * Encode a byte array as CBOR byte string (major type 2).
 */
export function cborEncodeBytes(data: Uint8Array): Uint8Array {
	const header = encodeCBORHeader(MAJOR_BYTES, data.length);
	const result = new Uint8Array(header.length + data.length);
	result.set(header, 0);
	result.set(data, header.length);
	return result;
}

/**
 * Encode a uint value as CBOR unsigned int (major type 0).
 */
export function cborEncodeUint(value: number): Uint8Array {
	return encodeCBORHeader(MAJOR_UINT, value);
}

/**
 * Encode a CBOR map with integer keys.
 * Returns the serialized map bytes (flat encoding of key-value pairs followed by break).
 */
function cborEncodeMap(entries: Array<[number, Uint8Array]>): Uint8Array {
	const parts: Uint8Array[] = [];
	for (const [key, value] of entries) {
		parts.push(cborEncodeUint(key));
		parts.push(value);
	}
	const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
	// Map header: 0xbf = map with indefinite length (break-terminated)
	// Actually use definite-length map: 0xa0 | length
	const header = encodeCBORHeader(MAJOR_MAP, entries.length);
	const result = new Uint8Array(header.length + totalLen);
	let offset = 0;
	result.set(header, offset); offset += header.length;
	for (const p of parts) {
		result.set(p, offset); offset += p.length;
	}
	return result;
}

// ─── Token encode/decode (NUT-00 V4 CBOR format) ─────────────

/**
 * Token proof shape for CBOR encoding.
 */
export interface CborTokenProof {
	amount: number;
	id: string;
	secret: string;
	C: string;
	dleq?: { e: string; s: string; r?: string };
}

/**
 * Encode a list of token proofs into a CBOR-encoded token.
 *
 * NUT-00 V4 CBOR format:
 *   Map {
 *     token: Array [
 *       Map {
 *         mint: text,
 *         proofs: Array [
 *           Map {
 *             amount: uint,
 *             id: text,
 *             secret: text (NOT bytes),
 *             C: bytes,
 *             dleq?: Map { e: text, s: text, r?: text }
 *           }
 *         ]
 *       }
 *     ],
 *     unit?: text,
 *     memo?: text
 *   }
 *
 * Secrets are encoded as CBOR text strings (major type 3) using 78 40 prefix
 * for 64-byte text secrets, NOT as raw bytes (major type 2).
 */
export function cborEncodeToken(proofs: CborTokenProof[], mintUrl: string, unit?: string, memo?: string): Uint8Array {
	const encoder = new TextEncoder();

	function encodeField(key: number, value: Uint8Array): Array<[number, Uint8Array]> {
		return [[key, value]];
	}

	function encodeText(s: string): Uint8Array {
		const bytes = encoder.encode(s);
		const header = encodeCBORHeader(MAJOR_TEXT, bytes.length);
		const result = new Uint8Array(header.length + bytes.length);
		result.set(header, 0);
		result.set(bytes, header.length);
		return result;
	}

	function encodeHexBytes(hex: string): Uint8Array {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < hex.length; i += 2) {
			bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
		}
		const header = encodeCBORHeader(MAJOR_BYTES, bytes.length);
		const result = new Uint8Array(header.length + bytes.length);
		result.set(header, 0);
		result.set(bytes, header.length);
		return result;
	}

	// Encode each proof
	const proofArrays = proofs.map(p => {
		const fields: Array<[number, Uint8Array]> = [];
		fields.push([0, cborEncodeUint(p.amount)]);      // amount
		fields.push([1, encodeText(p.id)]);              // id
		fields.push([2, encodeText(p.secret)]);          // secret (TEXT, not bytes)
		fields.push([3, encodeHexBytes(p.C)]);            // C (bytes)
		if (p.dleq) {
			const dleqFields: Array<[number, Uint8Array]> = [];
			dleqFields.push([0, encodeText(p.dleq.e)]);
			dleqFields.push([1, encodeText(p.dleq.s)]);
			if (p.dleq.r) {
				dleqFields.push([2, encodeText(p.dleq.r)]);
			}
			fields.push([4, cborEncodeMap(dleqFields)]);
		}
		return cborEncodeMap(fields);
	});

	// proofs array
	let proofsArrayLen = 0;
	for (const pa of proofArrays) {
		proofsArrayLen += pa.length;
	}
	const proofsArrayHeader = encodeCBORHeader(MAJOR_ARRAY, proofArrays.length);
	const proofsArray = new Uint8Array(proofsArrayHeader.length + proofsArrayLen);
	let offset = 0;
	proofsArray.set(proofsArrayHeader, offset); offset += proofsArrayHeader.length;
	for (const pa of proofArrays) {
		proofsArray.set(pa, offset); offset += pa.length;
	}

	// token entry: Map { mint: text, proofs: array }
	const mintBytes = encodeText(mintUrl);
	const tokenEntryHeader = encodeCBORHeader(MAJOR_MAP, 2);
	const tokenEntry = new Uint8Array(
		tokenEntryHeader.length +
		1 + mintBytes.length +               // key 0: mint
		cborEncodeUint(1).length + proofsArray.length // key 1: proofs
	);
	offset = 0;
	tokenEntry.set(tokenEntryHeader, offset); offset += tokenEntryHeader.length;
	// key 0
	const key0 = cborEncodeUint(0);
	tokenEntry.set(key0, offset); offset += key0.length;
	tokenEntry.set(mintBytes, offset); offset += mintBytes.length;
	// key 1
	const key1 = cborEncodeUint(1);
	tokenEntry.set(key1, offset); offset += key1.length;
	tokenEntry.set(proofsArray, offset); offset += proofsArray.length;

	// token array
	const tokenArrayHeader = encodeCBORHeader(MAJOR_ARRAY, 1);
	const tokenBytes = new Uint8Array(tokenArrayHeader.length + tokenEntry.length);
	tokenBytes.set(tokenArrayHeader, 0);
	tokenBytes.set(tokenEntry, tokenArrayHeader.length);

	// Top-level map
	const topFields: Array<[number, Uint8Array]> = [];
	topFields.push([0, tokenBytes]); // token
	if (unit) {
		topFields.push([1, encodeText(unit)]);
	}
	if (memo) {
		topFields.push([2, encodeText(memo)]);
	}
	return cborEncodeMap(topFields);
}

/**
 * Decode a CBOR-encoded token back to its components.
 *
 * Reads the CBOR byte sequence and extracts:
 * - mint URL (text string)
 * - proofs (array of maps with amount, id, secret, C, dleq)
 * - unit (optional)
 * - memo (optional)
 */
export function cborDecodeToken(data: Uint8Array): {
	mint: string;
	proofs: CborTokenProof[];
	unit?: string;
	memo?: string;
} {
	const decoder = new TextDecoder();
	let offset = 0;

	function readHeader(): { major: number; value: number } {
		const { major, value, offset: off } = decodeCBORHeader(data.slice(offset));
		offset += off;
		return { major, value };
	}

	function readBytes(len: number): Uint8Array {
		const slice = data.slice(offset, offset + len);
		offset += len;
		return slice;
	}

	function readText(): string {
		const { major, value: len } = readHeader();
		const raw = readBytes(len);
		if (major === MAJOR_TEXT || major === MAJOR_BYTES) {
			return decoder.decode(raw);
		}
		throw new Error(`Expected text or bytes, got major type ${major >> 5}`);
	}

	function readBytesValue(): Uint8Array {
		const { major, value: len } = readHeader();
		if (major === MAJOR_BYTES) {
			return readBytes(len);
		}
		throw new Error(`Expected bytes, got major type ${major >> 5}`);
	}

	function readHexBytes(): string {
		const bytes = readBytesValue();
		return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
	}

	function readUint(): number {
		const { major, value } = readHeader();
		if (major !== MAJOR_UINT) {
			throw new Error(`Expected unsigned int, got major type ${major >> 5}`);
		}
		return value;
	}

	function readMap(expectedKeys?: number[]): Record<number, unknown> {
		const { major, value: mapLen } = readHeader();
		if (major !== MAJOR_MAP) {
			throw new Error(`Expected map, got major type ${major >> 5}`);
		}
		const result: Record<number, unknown> = {};
		for (let i = 0; i < mapLen; i++) {
			const key = readUint();
			if (expectedKeys && !expectedKeys.includes(key)) {
				// Unknown key — skip its value
				readNextValue();
				continue;
			}
			result[key] = readNextValue(key);
		}
		return result;
	}

	function readNextValue(contextKey?: number): unknown {
		const { major, value: val } = readHeader();
		switch (major) {
			case MAJOR_UINT:
				return val;
			case MAJOR_TEXT:
				offset += val;
				return val; // caller needs to decode
			case MAJOR_BYTES:
				offset += val;
				return val;
			case MAJOR_ARRAY:
				return val; // array length
			case MAJOR_MAP:
				offset -= 1; // rewind to re-read the map header in readMap
				// Need to know original major/value
				offset -= ('offset' in readHeader ? 0 : 0);
				return readMap();
			default:
				throw new Error(`Unexpected major type ${major >> 5}`);
		}
	}

	// Actually, the readNextValue approach is complex. Let me do iterative parsing.

	// Start over with a simple parser
	offset = 0;

	function parse(): { mint: string; proofs: CborTokenProof[]; unit?: string; memo?: string } {
		// Top-level map
		let { major: topMajor } = decodeCBORHeader(data.slice(offset));
		if (topMajor !== MAJOR_MAP) throw new Error('Expected top-level CBOR map');

		// Read map-length
		const topHeader = decodeCBORHeader(data.slice(offset));
		offset += topHeader.offset;
		const topLen = topHeader.value;

		let mint = '';
		const proofs: CborTokenProof[] = [];
		let unit: string | undefined;
		let memo: string | undefined;

		for (let i = 0; i < topLen; i++) {
			const key = readUint();
			switch (key) {
				case 0: { // token
					const tokenArrHeader = decodeCBORHeader(data.slice(offset));
					offset += tokenArrHeader.offset;
					const tokenArrLen = tokenArrHeader.value;
					if (tokenArrHeader.major !== MAJOR_ARRAY) throw new Error('Expected token array');
					for (let t = 0; t < tokenArrLen; t++) {
						const entryMapHeader = decodeCBORHeader(data.slice(offset));
						offset += entryMapHeader.offset;
						const entryMapLen = entryMapHeader.value;
						if (entryMapHeader.major !== MAJOR_MAP) continue;
						for (let e = 0; e < entryMapLen; e++) {
							const ek = readUint();
							if (ek === 0) mint = readText();
							else if (ek === 1) {
								// Proofs array
								const proofsHeader = decodeCBORHeader(data.slice(offset));
								offset += proofsHeader.offset;
								const proofsLen = proofsHeader.value;
								if (proofsHeader.major !== MAJOR_ARRAY) continue;
								for (let p = 0; p < proofsLen; p++) {
									const proof = readProofMap();
									if (proof) proofs.push(proof);
								}
							} else {
								skipNextValue();
							}
						}
					}
					break;
				}
				case 1: unit = readText(); break;
				case 2: memo = readText(); break;
				default: skipNextValue(); break;
			}
		}
		return { mint, proofs, unit, memo };
	}

	function readProofMap(): CborTokenProof | null {
		const header = decodeCBORHeader(data.slice(offset));
		offset += header.offset;
		const mapLen = header.value;
		if (header.major !== MAJOR_MAP) {
			skipByteString(mapLen);
			return null;
		}
		const proof: Partial<CborTokenProof> = {};
		for (let i = 0; i < mapLen; i++) {
			const key = readUint();
			switch (key) {
				case 0: proof.amount = readUint(); break;
				case 1: proof.id = readText(); break;
				case 2: proof.secret = readText(); break;
				case 3: proof.C = readHexBytes(); break;
				case 4: {
					// DLEQ map
					const dleqHdr = decodeCBORHeader(data.slice(offset));
					offset += dleqHdr.offset;
					const dleqLen = dleqHdr.value;
					const dleq: { e: string; s: string; r?: string } = { e: '', s: '' };
					for (let d = 0; d < dleqLen; d++) {
						const dk = readUint();
						const val = readText();
						if (dk === 0) dleq.e = val;
						else if (dk === 1) dleq.s = val;
						else if (dk === 2) dleq.r = val;
					}
					proof.dleq = dleq;
					break;
				}
				default: skipNextValue(); break;
			}
		}
		if (!proof.amount || !proof.id || !proof.secret || !proof.C) return null;
		return proof as CborTokenProof;
	}

	function skipNextValue(): void {
		// Peek and skip
		const { major, value } = decodeCBORHeader(data.slice(offset));
		offset += decodeCBORHeader(data.slice(offset)).offset;
		if (major === MAJOR_UINT || major === MAJOR_UINT - (1 << 5)) {
			return;
		}
		if (major === MAJOR_TEXT || major === MAJOR_BYTES) {
			offset += value;
			return;
		}
		if (major === MAJOR_ARRAY) {
			for (let i = 0; i < value; i++) skipNextValue();
			return;
		}
		if (major === MAJOR_MAP) {
			for (let i = 0; i < value * 2; i++) skipNextValue();
			return;
		}
	}

	function skipByteString(len: number): void {
		offset += len;
	}

	return parse();
}
