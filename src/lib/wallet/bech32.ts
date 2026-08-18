/**
 * Bech32 primitives (shared).
 *
 * F-062: Extracted from bolt11.ts so both bolt11 (BOLT #11) and lnurl (LUD-06)
 * can share the same decode/checksum machinery without an npm dependency.
 *
 * Reference: BIP-0173 / BOLT #11
 */

// ─── Bech32 Constants ──────────────────────────────────────

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const CHARSET_MAP: Record<string, number> = {};
for (let i = 0; i < CHARSET.length; i++) {
	CHARSET_MAP[CHARSET[i]] = i;
}

const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

// ─── Bech32 Polymod (Checksum) ─────────────────────────────

export function polymod(values: number[]): number {
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

export function hrpExpand(hrp: string): number[] {
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

export function verifyChecksum(hrp: string, data: number[]): boolean {
	return polymod([...hrpExpand(hrp), ...data]) === 1;
}

// ─── Bech32 Decode ─────────────────────────────────────────

/**
 * Decode a bech32 string into 5-bit data groups.
 * Returns { hrp, data (5-bit values) } or null on error.
 */
export function bech32Decode(bech32: string): { hrp: string; data: number[] } | null {
	// Must be lowercase (bolt11 / lnurl strings are always lowercase)
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
 * Convert an array of fromBits-width values to toBits-width values.
 * Used by bolt11 (5→8) and lnurl (5→8 for the URL payload).
 */
export function convertBits(
	data: number[],
	fromBits: number,
	toBits: number,
	pad: boolean
): number[] | null {
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
