import { describe, it, expect } from 'vitest';
import { isLnurlBech32, decodeLnurlBech32 } from '../lnurl';

const LNURL_VECTOR =
	'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';
const LNURL_VECTOR_URL =
	'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df';

describe('isLnurlBech32', () => {
	it('returns true for a valid lnurl bech32 string', () => {
		expect(isLnurlBech32(LNURL_VECTOR)).toBe(true);
	});

	it('returns false for empty string', () => {
		expect(isLnurlBech32('')).toBe(false);
	});

	it('returns false for a bolt11 invoice (HRP lnbc, not lnurl)', () => {
		const bolt11 =
			'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';
		expect(isLnurlBech32(bolt11)).toBe(false);
	});

	it('returns false for a non-bech32 string', () => {
		expect(isLnurlBech32('https://service.com/api')).toBe(false);
	});

	it('returns false for a tampered (invalid checksum) lnurl', () => {
		const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
		const pos = LNURL_VECTOR.lastIndexOf('1');
		const idx = pos + 1;
		const cur = LNURL_VECTOR[idx].toLowerCase();
		const next = CHARSET[(CHARSET.indexOf(cur) + 1) % CHARSET.length];
		const tampered = LNURL_VECTOR.slice(0, idx) + next + LNURL_VECTOR.slice(idx + 1);
		expect(isLnurlBech32(tampered)).toBe(false);
	});
});

describe('decodeLnurlBech32', () => {
	it('decodes a valid lnurl bech32 to its URL', () => {
		expect(decodeLnurlBech32(LNURL_VECTOR)).toBe(LNURL_VECTOR_URL);
	});

	it('decodes a lowercase lnurl bech32', () => {
		expect(decodeLnurlBech32(LNURL_VECTOR.toLowerCase())).toBe(LNURL_VECTOR_URL);
	});

	it('returns null for a non-lnurl HRP (bolt11 invoice)', () => {
		const bolt11 =
			'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';
		expect(decodeLnurlBech32(bolt11)).toBeNull();
	});

	it('returns null for invalid checksum', () => {
		const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
		const pos = LNURL_VECTOR.lastIndexOf('1');
		const idx = pos + 1;
		const cur = LNURL_VECTOR[idx].toLowerCase();
		const next = CHARSET[(CHARSET.indexOf(cur) + 1) % CHARSET.length];
		const tampered = LNURL_VECTOR.slice(0, idx) + next + LNURL_VECTOR.slice(idx + 1);
		expect(decodeLnurlBech32(tampered)).toBeNull();
	});

	it('returns null for empty input', () => {
		expect(decodeLnurlBech32('')).toBeNull();
	});
});
