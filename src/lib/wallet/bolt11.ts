/**
 * Bolt11 (Lightning Network Invoice) Decoder
 *
 * F-062: Full bech32 + tagged fields decoder (Option 2 — no npm dependency).
 *
 * Implements:
 *   - Bech32 decode with checksum verification
 *   - Human-Readable Part (HRP) parsing: network + amount + multiplier
 *   - Tagged fields: payment_hash (1), description (13), expiry (6), etc.
 *   - Checksum validation → reject invalid invoices early
 *
 * Reference: BOLT #11 (https://github.com/lightning/bolts/blob/master/11-payment-encoding.md)
 */

// ─── Bech32 Constants ──────────────────────────────────────

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const CHARSET_MAP: Record<string, number> = {};
for (let i = 0; i < CHARSET.length; i++) {
	CHARSET_MAP[CHARSET[i]] = i;
}

const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

// ─── Types ──────────────────────────────────────────────────

export type Bolt11Network = 'mainnet' | 'testnet' | 'regtest';

export interface Bolt11Decoded {
	/** Network: mainnet (lnbc), testnet (lntb), regtest (lnbcrt) */
	network: Bolt11Network;
	/** Amount in satoshis (0 if zero-amount invoice) */
	amountSat: number;
	/** Payment hash (hex string, tag 1) */
	paymentHash: string;
	/** Short description (tag 13) */
	description: string;
	/** Expiry in seconds from timestamp (tag 6, default 3600) */
	expiry: number;
	/** Unix timestamp of invoice creation (seconds) */
	timestamp: number;
	/** Raw HRP (e.g. "lnbc2500u") */
	hrp: string;
	/** All parsed tagged fields (for debugging) */
	tags: Map<number, Uint8Array>;
}

export interface Bolt11Error {
	code: 'invalid_format' | 'invalid_checksum' | 'invalid_hrp' | 'invalid_network' | 'decode_error';
	message: string;
}

// ─── Bech32 Polymod (Checksum) ─────────────────────────────

function polymod(values: number[]): number {
	let chk = 1;
	for (const v of values) {
		const top = chk >> 25;
		chk = ((chk & 0x1ffffff) << 5) ^ v;
		for (let i = 0; i < 5; i++) {
			if ((top >> i) & 1) {
				chk ^= GENERATOR[i];
			}
		}
	}
	return chk;
}

function hrpExpand(hrp: string): number[] {
	const result: number[] = [];
	for (let i = 0; i < hrp.length; i++) {
		const c = hrp.charCodeAt(i);
		result.push(c >> 5);
	}
	result.push(0);
	for (let i = 0; i < hrp.length; i++) {
		const c = hrp.charCodeAt(i);
		result.push(c & 31);
	}
	return result;
}

function verifyChecksum(hrp: string, data: number[]): boolean {
	return polymod([...hrpExpand(hrp), ...data]) === 1;
}

// ─── Bech32 Decode ─────────────────────────────────────────

/**
 * Decode a bech32 string into 5-bit data groups.
 * Returns { hrp, data (5-bit values) } or null on error.
 */
function bech32Decode(bech32: string): { hrp: string; data: number[] } | null {
	// Must be lowercase (bolt11 invoices are always lowercase)
	const str = bech32.toLowerCase();

	// Check characters are valid
	let pos = str.lastIndexOf('1');
	if (pos < 1 || pos + 7 > str.length) {
		return null;
	}

	const hrp = str.substring(0, pos);
	const dataStr = str.substring(pos + 1);

	const data: number[] = [];
	for (let i = 0; i < dataStr.length; i++) {
		const c = dataStr[i];
		const v = CHARSET_MAP[c];
		if (v === undefined) return null;
		data.push(v);
	}

	if (!verifyChecksum(hrp, data)) {
		return null;
	}

	// Remove the last 6 checksum characters
	return {
		hrp,
		data: data.slice(0, data.length - 6)
	};
}

// ─── 5-bit to 8-bit Conversion ─────────────────────────────

/**
 * Convert an array of 5-bit values to 8-bit bytes.
 * BOLT 11 data uses 5-bit groups packed into bytes.
 */
function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
	let acc = 0;
	let bits = 0;
	const result: number[] = [];
	const maxv = (1 << toBits) - 1;

	for (const value of data) {
		if (value < 0 || (value >> fromBits) !== 0) {
			return null;
		}
		acc = (acc << fromBits) | value;
		bits += fromBits;
		while (bits >= toBits) {
			bits -= toBits;
			result.push((acc >> bits) & maxv);
		}
	}

	if (pad) {
		if (bits > 0) {
			result.push((acc << (toBits - bits)) & maxv);
		}
	} else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
		return null;
	}

	return result;
}

// ─── Amount Parsing ────────────────────────────────────────

const MULTIPLIER_MAP: Record<string, number> = {
	'm': 100000,   // milli-bitcoin → 100000 sat
	'u': 100,      // micro-bitcoin → 100 sat
	'n': 0.1,      // nano-bitcoin → 0.1 sat = 10 millisat
	'p': 0.0001    // pico-bitcoin → 0.0001 sat = 1 millisat
};

/**
 * Parse amount from HRP (e.g., "lnbc2500u" → 2500 sat).
 * Returns 0 for zero-amount invoices.
 */
function parseAmountFromHrp(hrp: string): number {
	// Match: lnbc[rt]?[digits][multiplier]?
	const match = hrp.match(/^ln(bc(?:rt)?|tb)(\d+)?([munp])?$/);
	if (!match) return 0;

	const digits = match[2];
	const multiplier = match[3];

	if (!digits) return 0;

	const num = parseInt(digits, 10);
	if (!multiplier) return num;

	const factor = MULTIPLIER_MAP[multiplier];
	if (factor >= 1) {
		return num * factor;
	} else {
		// n and p are fractional - convert to satoshis
		// 1 sat = 1000 millisat
		// n → num * 0.1 sat (10 millisat each)
		// p → num * 0.0001 sat (0.1 millisat each)
		return Math.round(num * factor);
	}
}

/**
 * Parse network from HRP.
 */
function parseNetworkFromHrp(hrp: string): Bolt11Network | null {
	if (hrp.startsWith('lnbcrt')) return 'regtest';
	if (hrp.startsWith('lntb')) return 'testnet';
	if (hrp.startsWith('lnbc')) return 'mainnet';
	return null;
}

// ─── Tagged Field Parsing ──────────────────────────────────

/**
 * Parse tagged fields from the data bytes.
 * Returns map of tag → value bytes, plus timestamp.
 */
function parseTaggedFields(data: Uint8Array): { tags: Map<number, Uint8Array>; timestamp: number } | null {
	try {
		// First 7 bytes (35 bits) are timestamp - but bolt11 uses 35 bits = 4 bytes + 3 bits
		// Actually BOLT 11 says: timestamp is a 35-bit unsigned integer
		// In practice, implementations use 7 x 5-bit groups after convertBits, which
		// gives us 4 bytes with some padding.
		// After convertBits from 5 to 8 bits:
		// The timestamp occupies bytes 0-4 (with the top 3 bits of byte 4 being part of it)
		// Actually for simplicity: bolt11 timestamp is in seconds, encoded in 35 bits.
		// After 5→8 bit conversion, this typically occupies the first 5 bytes,
		// with the last byte partially used.
		
		// Standard approach: read first 4 bytes as 32-bit unsigned, then read 3 more bits from 5th byte
		if (data.length < 5) return null;
		
		const timestamp = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0;
		// The 35-bit timestamp is: top 32 bits from first 4 bytes, lower 3 bits from bits 5-7 of 5th byte
		// But for simplicity and wide compatibility, most decoders just treat the timestamp
		// as a regular 32-bit value stored in first 4 bytes (the 5th byte carries only 3 extra bits),
		// but since timestamps are well within 32-bit range until 2106, this is fine.
		// More precisely: after convertBits(5→8), first 4 bytes hold 32 bits of timestamp, 
		// 5th byte holds remaining 3 bits at its top.
		// For practical use, just use the 32-bit timestamp from first 4 bytes.
		// Actually let's do it properly:
		let ts = timestamp;
		if (data.length > 4) {
			ts = (timestamp * 8) + ((data[4] >> 5) & 0x07);
		}
		
		// Tagged fields start after the timestamp bits.
		// With 35 bits, that's 4 bytes (32 bits) + 3/8 of 5th byte.
		// In the byte stream, we need to bit-shift to read tags.
		// Simpler approach: work with the original 5-bit groups for tag parsing.
		// But we've already converted to 8-bit. Let me re-examine:
		
		// Actually, the standard approach for bolt11 decoding is:
		// 1. Get 5-bit groups
		// 2. Read 7 groups (35 bits) as timestamp
		// 3. Read remaining groups as tagged fields
		
		// Since we already have the bech32-decoded data in 5-bit groups,
		// we should parse tags from 5-bit groups, not from the converted 8-bit bytes.
		// But we called convertBits already... 
		
		// Let me restructure: we should parse tags directly from 5-bit groups.
		// The convertBits is only really needed for binary values (payment_hash, etc.)
		
		return { tags: new Map(), timestamp: ts };
	} catch {
		return null;
	}
}

/**
 * Parse tagged fields from 5-bit data groups.
 * This is the primary parsing method.
 */
function parseTagsFrom5Bit(data5bit: number[]): { tags: Map<number, Uint8Array>; timestamp: number; signatureStart: number } | null {
	if (data5bit.length < 7) return null;

	// Timestamp: first 7 x 5-bit groups = 35 bits
	let timestamp = 0;
	for (let i = 0; i < 7; i++) {
		timestamp = (timestamp << 5) | data5bit[i];
	}

	let pos = 7;
	const tags = new Map<number, Uint8Array>();

	while (pos + 3 <= data5bit.length) {
		const tagType = data5bit[pos];
		pos++;

		if (tagType === 0) {
			// End of tagged fields - remainder is signature
			break;
		}

		// Read length — bolt11 tagged field data_length encoding:
		// - if < 31: single 5-bit value
		// - if >= 31: first 5-bit = 31, then 10 more bits (2×5-bit groups)
		//   data_length = 31 + (second << 5) + third
		const firstLen5 = data5bit[pos];
		pos++;
		let length: number;

		if (firstLen5 < 31) {
			// Short length: 5 bits (0–30)
			length = firstLen5;
		} else if (firstLen5 === 31 && pos + 1 < data5bit.length) {
			// Extended length: 10 more bits (handles up to ~1054)
			const second = data5bit[pos];
			const third = data5bit[pos + 1];
			pos += 2;
			length = 31 + (second << 5) + third;
		} else {
			// Invalid length
			break;
		}

		// Read value (length × 5-bit groups)
		if (pos + length > data5bit.length) break;

		const value5bit = data5bit.slice(pos, pos + length);
		pos += length;

		// Convert value from 5-bit groups to 8-bit bytes (no padding — bolt11 pads with zeros)
		const valueBytes = convertBits(value5bit, 5, 8, false);
		if (valueBytes) {
			tags.set(tagType, new Uint8Array(valueBytes));
		}
	}

	return { tags, timestamp, signatureStart: pos };
}

// ─── Hex Conversion ────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToAscii(bytes: Uint8Array): string {
	return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
}

// ─── Main Decode Function ──────────────────────────────────

/**
 * Decode a bolt11 Lightning Network invoice.
 *
 * @param invoice - The bolt11 invoice string (e.g. "lnbc2500u1...")
 * @returns Decoded invoice data or an error object
 */
export function decodeBolt11(invoice: string): Bolt11Decoded | Bolt11Error {
	if (!invoice || typeof invoice !== 'string') {
		return { code: 'invalid_format', message: 'Invoice is empty or not a string' };
	}

	const trimmed = invoice.trim().toLowerCase();

	// Basic bolt11 format check
	if (!trimmed.match(/^ln(bc|tb|bcrt)/)) {
		return { code: 'invalid_network', message: 'Invoice must start with lnbc, lntb, or lnbcrt' };
	}

	// Bech32 decode
	const decoded = bech32Decode(trimmed);
	if (!decoded) {
		return { code: 'invalid_checksum', message: 'Invalid bech32 checksum — invoice may be malformed' };
	}

	const hrp = decoded.hrp;
	const network = parseNetworkFromHrp(hrp);
	if (!network) {
		return { code: 'invalid_hrp', message: `Could not determine network from HRP: ${hrp}` };
	}

	const amountSat = parseAmountFromHrp(hrp);

	// Parse tagged fields from 5-bit data
	const parsed = parseTagsFrom5Bit(decoded.data);
	if (!parsed) {
		return { code: 'decode_error', message: 'Failed to parse tagged fields from invoice data' };
	}

	const { tags, timestamp } = parsed;

	// Extract payment_hash (tag 1)
	let paymentHash = '';
	const paymentHashBytes = tags.get(1);
	if (paymentHashBytes) {
		paymentHash = bytesToHex(paymentHashBytes);
	}

	// Extract description (tag 13)
	let description = '';
	const descBytes = tags.get(13);
	if (descBytes) {
		description = bytesToAscii(descBytes);
	}

	// Extract short description (tag 'd' = 100)
	if (!description) {
		const shortDescBytes = tags.get(13); // actually tag 13 *is* the short description
		// BOLT 11: tag 13 is short ASCII description
		// Some implementations use tag for purpose_of_payment (tag 23 = 'd')
		// but bolt11 standard uses 13 for description.
	}
	
	// Also check for description hash (tag 'h' = 104)
	// (no human-readable form for hash-based descriptions)

	// Extract expiry (tag 6)
	let expiry = 3600; // default: 1 hour
	const expiryBytes = tags.get(6);
	if (expiryBytes && expiryBytes.length >= 4) {
		expiry = ((expiryBytes[0] << 24) | (expiryBytes[1] << 16) | (expiryBytes[2] << 8) | expiryBytes[3]) >>> 0;
	}

	return {
		network,
		amountSat,
		paymentHash,
		description,
		expiry,
		timestamp,
		hrp,
		tags
	};
}

/**
 * Quick check: is this a valid bolt11 invoice?
 * Returns true if decode succeeds without error.
 */
export function isValidBolt11(invoice: string): boolean {
	const result = decodeBolt11(invoice);
	return !('code' in result);
}

/**
 * Try to extract amount from bolt11 invoice without full decode.
 * Returns 0 for zero-amount invoices.
 */
export function quickAmount(invoice: string): number {
	const trimmed = invoice.trim().toLowerCase();
	const sepIdx = trimmed.indexOf('1');
	if (sepIdx <= 0) return 0;
	const hrp = trimmed.substring(0, sepIdx);
	return parseAmountFromHrp(hrp);
}
