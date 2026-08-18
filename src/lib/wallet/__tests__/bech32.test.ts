import { describe, it, expect } from 'vitest';
import { bech32Decode, convertBits, hrpExpand, polymod, verifyChecksum } from '../bech32';

// Known-good LNURL bech32 vector (LUD-06 canonical example):
//   https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df
const LNURL_VECTOR =
	'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';
const LNURL_VECTOR_URL =
	'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df';

describe('bech32Decode', () => {
	it('decodes a valid bech32 string with correct HRP', () => {
		const decoded = bech32Decode(LNURL_VECTOR);
		expect(decoded).not.toBeNull();
		expect(decoded!.hrp).toBe('lnurl');
		expect(decoded!.data.length).toBeGreaterThan(0);
	});

	it('decodes case-insensitively (uppercase input → lowercase hrp)', () => {
		const decoded = bech32Decode(LNURL_VECTOR.toLowerCase());
		expect(decoded).not.toBeNull();
		expect(decoded!.hrp).toBe('lnurl');
	});

	it('returns null for empty string', () => {
		expect(bech32Decode('')).toBeNull();
	});

	it('returns null for string without separator', () => {
		expect(bech32Decode('lnurlwithoutseparator')).toBeNull();
	});

	it('returns null for invalid checksum (data char mutated)', () => {
		// Mutate the first data character (after the '1' separator) — this
		// changes the payload and therefore must fail the checksum.
		const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
		const pos = LNURL_VECTOR.lastIndexOf('1');
		const idx = pos + 1;
		const cur = LNURL_VECTOR[idx].toLowerCase();
		const next = CHARSET[(CHARSET.indexOf(cur) + 1) % CHARSET.length];
		const tampered = LNURL_VECTOR.slice(0, idx) + next + LNURL_VECTOR.slice(idx + 1);
		expect(tampered).not.toBe(LNURL_VECTOR);
		expect(bech32Decode(tampered)).toBeNull();
	});

	it('returns null for invalid characters', () => {
		// 'b' is not in the bech32 charset (only lowercase charset chars allowed)
		const bad = LNURL_VECTOR.slice(0, 10) + 'b1zzzzzz' + LNURL_VECTOR.slice(10);
		expect(bech32Decode(bad)).toBeNull();
	});
});

describe('convertBits round-trip', () => {
	it('8→5→8 round-trips an ASCII byte array', () => {
		const bytes = Array.from(LNURL_VECTOR_URL).map((c) => c.charCodeAt(0));
		const fiveBit = convertBits(bytes, 8, 5, true);
		expect(fiveBit).not.toBeNull();
		const back = convertBits(fiveBit!, 5, 8, false);
		expect(back).toEqual(bytes);
	});

	it('5→8→5 round-trips (no padding)', () => {
		const decoded = bech32Decode(LNURL_VECTOR);
		const bytes = convertBits(decoded!.data, 5, 8, false);
		const back = convertBits(bytes!, 8, 5, true);
		expect(back).toEqual(decoded!.data);
	});

	it('returns null when a value exceeds fromBits range', () => {
		expect(convertBits([32], 5, 8, false)).toBeNull(); // 32 >= 2^5
		expect(convertBits([256], 8, 5, false)).toBeNull(); // 256 >= 2^8
	});

	it('returns null when negative values are given', () => {
		expect(convertBits([-1], 5, 8, false)).toBeNull();
	});
});

describe('checksum primitives', () => {
	it('hrpExpand produces the spec-defined expansion', () => {
		// 'lnurl' → high-bits [3,3,3,3,3], separator 0, low-bits [12,14,21,18,12]
		expect(hrpExpand('lnurl')).toEqual([3, 3, 3, 3, 3, 0, 12, 14, 21, 18, 12]);
	});

	it('polymod of empty input is the bech32 checksum constant 1', () => {
		expect(polymod([])).toBe(1);
	});

	it('verifyChecksum accepts a valid bech32 data payload', () => {
		const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
		const map: Record<string, number> = {};
		for (let i = 0; i < CHARSET.length; i++) map[CHARSET[i]] = i;

		const str = LNURL_VECTOR.toLowerCase();
		const pos = str.lastIndexOf('1');
		const hrp = str.substring(0, pos);
		const dataStr = str.substring(pos + 1);
		const fullData = Array.from(dataStr).map((c) => map[c]);

		expect(verifyChecksum(hrp, fullData)).toBe(true);
	});

	it('verifyChecksum rejects a tampered payload', () => {
		const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
		const map: Record<string, number> = {};
		for (let i = 0; i < CHARSET.length; i++) map[CHARSET[i]] = i;

		const str = LNURL_VECTOR.toLowerCase();
		const pos = str.lastIndexOf('1');
		const hrp = str.substring(0, pos);
		const dataStr = str.substring(pos + 1);
		const fullData = Array.from(dataStr).map((c) => map[c]);
		// Flip one data value
		const tampered = [...fullData];
		tampered[3] = (tampered[3] + 1) % 32;
		expect(verifyChecksum(hrp, tampered)).toBe(false);
	});
});
