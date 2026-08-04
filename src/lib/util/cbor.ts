/**
 * CBOR encode/decode for Cashu V4 tokens (NUT-00).
 *
 * V4 token format: cashuB[base64url_cbor]
 *
 * CBOR structure (text keys, single-char):
 *   {
 *     "m": mint_url (text),
 *     "u": unit (text),
 *     "d"?: memo (text, optional),
 *     "t": [
 *       {
 *         "i": keyset_id (bytes, short form = first 8 bytes),
 *         "p": [
 *           {
 *             "a": amount (uint),
 *             "s": secret (text),
 *             "c": C (bytes, 33-byte compressed pubkey),
 *             "d"?: { "e": bytes, "s": bytes, "r": bytes } (DLEQ, optional)
 *           }
 *         ]
 *       }
 *     ]
 *   }
 */

const MAJOR_TEXT = 3 << 5;   // 0x60
const MAJOR_BYTES = 2 << 5;  // 0x40
const MAJOR_UINT = 0 << 5;   // 0x00
const MAJOR_ARRAY = 4 << 5;  // 0x80
const MAJOR_MAP = 5 << 5;    // 0xa0

// ─── CBOR helpers ─────────────────────────────────────────

function headerLen(value: number): number {
	if (value < 24) return 1;
	if (value < 256) return 2;
	if (value < 65536) return 3;
	if (value < 4294967296) return 5;
	return 9;
}

function writeHeader(out: number[], major: number, value: number): void {
	if (value < 24) {
		out.push(major | value);
	} else if (value < 256) {
		out.push(major | 24, value);
	} else if (value < 65536) {
		out.push(major | 25, (value >> 8) & 0xff, value & 0xff);
	} else if (value < 4294967296) {
		out.push(major | 26, (value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
	} else {
		throw new Error('CBOR value too large');
	}
}

function writeText(out: number[], s: string): void {
	const encoded = new TextEncoder().encode(s);
	writeHeader(out, MAJOR_TEXT, encoded.length);
	for (let i = 0; i < encoded.length; i++) out.push(encoded[i]);
}

function writeBytes(out: number[], data: Uint8Array): void {
	writeHeader(out, MAJOR_BYTES, data.length);
	for (let i = 0; i < data.length; i++) out.push(data[i]);
}

function writeUint(out: number[], n: number): void {
	writeHeader(out, MAJOR_UINT, n);
}

function hexToBytes(hex: string): Uint8Array {
	const len = hex.length / 2;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Decoder state ────────────────────────────────────────

class CborReader {
	data: Uint8Array;
	offset: number;

	constructor(data: Uint8Array) {
		this.data = data;
		this.offset = 0;
	}

	readHeader(): { major: number; value: number } {
		const first = this.data[this.offset++];
		const major = first & 0xe0;
		const info = first & 0x1f;

		let value: number;
		if (info < 24) {
			value = info;
		} else if (info === 24) {
			value = this.data[this.offset++];
		} else if (info === 25) {
			value = (this.data[this.offset++] << 8) | this.data[this.offset++];
		} else if (info === 26) {
			value = (this.data[this.offset++] << 24) | (this.data[this.offset++] << 16)
				| (this.data[this.offset++] << 8) | this.data[this.offset++];
		} else {
			throw new Error(`Unsupported CBOR info: ${info}`);
		}
		return { major, value };
	}

	readBytes(len: number): Uint8Array {
		const slice = this.data.slice(this.offset, this.offset + len);
		this.offset += len;
		return slice;
	}

	readText(): string {
		const { major, value: len } = this.readHeader();
		const raw = this.readBytes(len);
		if (major === MAJOR_TEXT) {
			return new TextDecoder().decode(raw);
		}
		if (major === MAJOR_BYTES) {
			return new TextDecoder().decode(raw);
		}
		throw new Error(`Expected text, got major ${major >> 5}`);
	}

	readByteString(): Uint8Array {
		const { major, value: len } = this.readHeader();
		if (major !== MAJOR_BYTES) throw new Error(`Expected bytes, got major ${major >> 5}`);
		return this.readBytes(len);
	}

	readUint(): number {
		const { major, value } = this.readHeader();
		if (major !== MAJOR_UINT) throw new Error(`Expected uint, got major ${major >> 5}`);
		return value;
	}

	skipValue(): void {
		const { major, value } = this.readHeader();
		if (major === MAJOR_UINT) return;
		if (major === MAJOR_TEXT || major === MAJOR_BYTES) {
			this.offset += value;
			return;
		}
		if (major === MAJOR_ARRAY) {
			for (let i = 0; i < value; i++) this.skipValue();
			return;
		}
		if (major === MAJOR_MAP) {
			for (let i = 0; i < value; i++) {
				this.skipValue(); // key
				this.skipValue(); // value
			}
			return;
		}
	}

	readTextKeyedMap<T>(handlers: Record<string, (r: CborReader) => void>, target: T): T {
		const { major, value: mapLen } = this.readHeader();
		if (major !== MAJOR_MAP) throw new Error(`Expected map, got major ${major >> 5}`);
		for (let i = 0; i < mapLen; i++) {
			const key = this.readText();
			if (handlers[key]) {
				handlers[key](this);
			} else {
				this.skipValue();
			}
		}
		return target;
	}
}

// ─── Public API ───────────────────────────────────────────

export interface CborTokenProof {
	id: string;     // keyset ID (hex)
	amount: number;
	secret: string;
	C: string;      // hex
	dleq?: { e: string; s: string; r?: string };
}

export function cborEncodeToken(
	proofs: CborTokenProof[],
	mintUrl: string,
	unit?: string,
	memo?: string
): Uint8Array {
	const out: number[] = [];

	// Group proofs by keyset ID
	const grouped = new Map<string, { id: string; proofs: CborTokenProof[] }>();
	for (const p of proofs) {
		const g = grouped.get(p.id);
		if (g) {
			g.proofs.push(p);
		} else {
			grouped.set(p.id, { id: p.id, proofs: [p] });
		}
	}

	// Count total map entries
	let mapEntries = 2; // "m", "t"
	if (unit) mapEntries++;
	if (memo) mapEntries++;

	writeHeader(out, MAJOR_MAP, mapEntries);

	// "m": mint URL
	writeText(out, 'm');
	writeText(out, mintUrl);

	// "t": token entries
	writeText(out, 't');
	writeHeader(out, MAJOR_ARRAY, grouped.size);

	for (const [, group] of grouped) {
		writeHeader(out, MAJOR_MAP, 2); // "i", "p"

		// "i": keyset ID (short form, first 8 bytes)
		writeText(out, 'i');
		const idBytes = hexToBytes(group.id);
		writeBytes(out, idBytes.slice(0, 8));

		// "p": proofs array
		writeText(out, 'p');
		writeHeader(out, MAJOR_ARRAY, group.proofs.length);

		for (const p of group.proofs) {
			const hasDleq = !!(p.dleq && p.dleq.e && p.dleq.s);
			const proofEntries = hasDleq ? 4 : 3;
			writeHeader(out, MAJOR_MAP, proofEntries);

			// "a": amount
			writeText(out, 'a');
			writeUint(out, p.amount);

			// "s": secret
			writeText(out, 's');
			writeText(out, p.secret);

			// "c": C (bytes, 33-byte compressed pubkey)
			writeText(out, 'c');
			writeBytes(out, hexToBytes(p.C));

			// "d": DLEQ (optional)
			if (hasDleq) {
				writeText(out, 'd');
				const dleq = p.dleq!;
				const dleqEntries = dleq.r ? 3 : 2;
				writeHeader(out, MAJOR_MAP, dleqEntries);

				writeText(out, 'e');
				writeBytes(out, hexToBytes(dleq.e));

				writeText(out, 's');
				writeBytes(out, hexToBytes(dleq.s));

				if (dleq.r) {
					writeText(out, 'r');
					writeBytes(out, hexToBytes(dleq.r));
				}
			}
		}
	}

	// "u": unit (optional)
	if (unit) {
		writeText(out, 'u');
		writeText(out, unit);
	}

	// "d": memo (optional)
	if (memo) {
		writeText(out, 'd');
		writeText(out, memo);
	}

	return new Uint8Array(out);
}

export function cborDecodeToken(data: Uint8Array): {
	mint: string;
	proofs: CborTokenProof[];
	unit?: string;
	memo?: string;
} {
	const r = new CborReader(data);

	let mint = '';
	const proofs: CborTokenProof[] = [];
	let unit: string | undefined;
	let memo: string | undefined;

	// Top-level map
	const topMajor = r.readHeader();
	if (topMajor.major !== MAJOR_MAP) throw new Error('Expected top-level CBOR map');

	const topLen = topMajor.value;
	for (let i = 0; i < topLen; i++) {
		const key = r.readText();

		switch (key) {
			case 'm':
				mint = r.readText();
				break;

			case 'u':
				unit = r.readText();
				break;

			case 'd':
				memo = r.readText();
				break;

			case 't': {
				// Token entries array
				const tHeader = r.readHeader();
				if (tHeader.major !== MAJOR_ARRAY) throw new Error('Expected token array');
				const tLen = tHeader.value;

				for (let ti = 0; ti < tLen; ti++) {
					const eHeader = r.readHeader();
					if (eHeader.major !== MAJOR_MAP) {
						r.skipValue();
						continue;
					}
					const eLen = eHeader.value;

					let keysetId = '';

					for (let ei = 0; ei < eLen; ei++) {
						const ek = r.readText();

						if (ek === 'i') {
							// keyset ID (bytes → hex, could be short or long form)
							const idBytes = r.readByteString();
							keysetId = bytesToHex(idBytes);
						} else if (ek === 'p') {
							// Proofs array
							const pHdr = r.readHeader();
							if (pHdr.major !== MAJOR_ARRAY) throw new Error('Expected proofs array');
							const pLen = pHdr.value;

							for (let pi = 0; pi < pLen; pi++) {
								const proofHdr = r.readHeader();
								if (proofHdr.major !== MAJOR_MAP) {
									r.skipValue();
									continue;
								}
								const proofLen = proofHdr.value;

								const proof: Partial<CborTokenProof> = { id: keysetId };
								for (let pki = 0; pki < proofLen; pki++) {
									const pk = r.readText();
									switch (pk) {
										case 'a':
											proof.amount = r.readUint();
											break;
										case 's':
											proof.secret = r.readText();
											break;
										case 'c':
											proof.C = bytesToHex(r.readByteString());
											break;
										case 'd': {
											const dHdr = r.readHeader();
											if (dHdr.major !== MAJOR_MAP) {
												r.skipValue();
												break;
											}
											const dLen = dHdr.value;
											const dleq: { e: string; s: string; r?: string } = { e: '', s: '' };
											for (let di = 0; di < dLen; di++) {
												const dk = r.readText();
												if (dk === 'e') dleq.e = bytesToHex(r.readByteString());
												else if (dk === 's') dleq.s = bytesToHex(r.readByteString());
												else if (dk === 'r') dleq.r = bytesToHex(r.readByteString());
												else r.skipValue();
											}
											proof.dleq = dleq;
											break;
										}
										case 'w':
											// Optional witness — skip
											r.skipValue();
											break;
										default:
											r.skipValue();
									}
								}

								if (proof.amount != null && proof.secret && proof.C) {
									proofs.push(proof as CborTokenProof);
								}
							}
						} else {
							r.skipValue();
						}
					}
				}
				break;
			}

			default:
				r.skipValue();
		}
	}

	return { mint, proofs, unit, memo };
}

// Legacy helpers (kept for backward compat)
export function cborEncodeSecret(secret: string): Uint8Array {
	const out: number[] = [];
	writeText(out, secret);
	return new Uint8Array(out);
}

export function cborEncodeBytes(data: Uint8Array): Uint8Array {
	const out: number[] = [];
	writeBytes(out, data);
	return new Uint8Array(out);
}

export function cborEncodeUint(value: number): Uint8Array {
	const out: number[] = [];
	writeUint(out, value);
	return new Uint8Array(out);
}
