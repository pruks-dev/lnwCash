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

import { bech32Decode, convertBits } from './bech32';

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
 *
 * BOLT #11 (https://github.com/lightning/bolts/blob/master/11-payment-encoding.md):
 *   - timestamp: first 7 x 5-bit groups = 35-bit big-endian integer
 *   - tagged fields: type (5 bits) + data_length (10 bits = TWO 5-bit
 *     groups, big-endian count of 5-bit data groups) + data
 *   - tagged fields run until the 512-bit signature at the end
 *     (104 x 5-bit groups). The spec defines NO terminator: a type-0
 *     group is an ordinary value, never an end-marker.
 *
 * TASK-4910: previous revisions used a single-group length with a `31`
 * escape rule the spec has no trace of, plus a zero-break on type 0 —
 * both desynced parsing on real invoices (e.g. the BOLT #11 coffee
 * vector: `p` length field (1,20)=52 was misread as 1, then the first
 * zero data group killed the whole parse → empty hash/desc + default
 * expiry). This rewrite follows the spec exactly.
 */
function parseTagsFrom5Bit(data5bit: number[]): { tags: Map<number, Uint8Array>; timestamp: number; signatureStart: number } | null {
	if (data5bit.length < 7) return null;

	// Timestamp: first 7 x 5-bit groups = 35-bit big-endian integer.
	// (Multiply-add, not bit-shift: 35 bits overflow JS 32-bit ops
	// past 2038; 35 bits are exactly representable as a double.)
	let timestamp = 0;
	for (let i = 0; i < 7; i++) {
		timestamp = timestamp * 32 + data5bit[i];
	}

	// Tagged section ends where the trailing 104-group signature begins.
	const SIGNATURE_GROUPS = 104;
	const tagsEnd = data5bit.length - SIGNATURE_GROUPS;
	if (tagsEnd < 7) return null;

	let pos = 7;
	const tags = new Map<number, Uint8Array>();

	while (pos + 3 <= tagsEnd) {
		const tagType = data5bit[pos];
		// data_length: TWO 5-bit groups = 10-bit big-endian count.
		// No escape rule, no zero-break — spec has neither.
		const length = data5bit[pos + 1] * 32 + data5bit[pos + 2];
		pos += 3;

		// Truncated field — stop, keep what parsed so far.
		if (pos + length > tagsEnd) break;

		const value5bit = data5bit.slice(pos, pos + length);
		pos += length;

		if (tagType === 6) {
			// `x` (expiry): BOLT #11 encodes the seconds as a big-endian
			// integer OVER THE 5-BIT GROUPS directly (same base-32 fold as
			// the timestamp), not as bytes. E.g. groups [1,28] = 60s
			// (byte-folding those groups would wrongly give 15).
			// Store the minimal big-endian byte form so the generic
			// bytes→int expiry read below yields the true value.
			// A zero-length `x` is malformed — leave it absent so the
			// 3600 default applies.
			if (value5bit.length === 0) continue;
			let v = 0;
			for (const g of value5bit) v = v * 32 + g;
			const be: number[] = [];
			if (v === 0) {
				be.push(0);
			} else {
				let n = v;
				while (n > 0) {
					be.unshift(n % 256);
					n = Math.floor(n / 256);
				}
			}
			tags.set(tagType, new Uint8Array(be));
			continue;
		}

		// Convert value from 5-bit groups to 8-bit bytes (no padding — bolt11 pads with zeros)
		const valueBytes = convertBits(value5bit, 5, 8, false);
		if (valueBytes) {
			tags.set(tagType, new Uint8Array(valueBytes));
		}
	}

	return { tags, timestamp, signatureStart: tagsEnd };
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

	// Extract expiry (tag 6) — BOLT #11: `x` data is the seconds as a
	// big-endian integer OVER THE 5-BIT GROUPS (base-32 fold, same as the
	// timestamp — e.g. groups [1,28] = 60s). parseTagsFrom5Bit above
	// already folds the groups and stores the minimal big-endian byte
	// form, so reading ANY length here as a bytes big-endian int yields
	// the true value. Default 3600 applies ONLY when tag x is absent
	// (TASK-4908: the old `>= 4 bytes` gate is gone; TASK-4910: the fold
	// moved into the parser where the raw groups are visible).
	let expiry = 3600; // default: 1 hour (no `x` tag)
	const expiryBytes = tags.get(6);
	if (expiryBytes && expiryBytes.length > 0) {
		let v = 0;
		for (const b of expiryBytes) v = v * 256 + b;
		expiry = v;
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
