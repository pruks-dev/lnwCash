import { describe, it, expect } from 'vitest';
import { decodeBolt11, isValidBolt11, quickAmount } from '../bolt11';

// BOLT #11 spec test vectors.
// v1 = "donation of any amount" (zero-amount, mainnet)
// v2 = "3 mBTC for a cup of coffee" (2500u = 250000 sat, mainnet)
const V1 =
	'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w';
const V2 =
	'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';

describe('bolt11 regression — decodeBolt11 behavior unchanged', () => {
	it('decodes a valid mainnet invoice without error', () => {
		const result = decodeBolt11(V1);
		expect(result).not.toHaveProperty('code');
		expect(result).toHaveProperty('network');
	});

	it('extracts network=mainnet for lnbc HRP', () => {
		const result = decodeBolt11(V1);
		expect((result as { network: string }).network).toBe('mainnet');
	});

	it('extracts zero amount for a zero-amount invoice', () => {
		const result = decodeBolt11(V1);
		expect((result as { amountSat: number }).amountSat).toBe(0);
	});

	it('extracts amount=250000 sat for lnbc2500u (2500 micro-BTC)', () => {
		const result = decodeBolt11(V2);
		expect((result as { amountSat: number }).amountSat).toBe(250000);
	});

	it('extracts the raw HRP', () => {
		expect((decodeBolt11(V1) as { hrp: string }).hrp).toBe('lnbc');
		expect((decodeBolt11(V2) as { hrp: string }).hrp).toBe('lnbc2500u');
	});

	it('extracts the invoice timestamp (BOLT-11 spec: 1496314658)', () => {
		expect((decodeBolt11(V1) as { timestamp: number }).timestamp).toBe(1496314658);
		expect((decodeBolt11(V2) as { timestamp: number }).timestamp).toBe(1496314658);
	});

	it('defaults expiry to 3600 seconds', () => {
		expect((decodeBolt11(V1) as { expiry: number }).expiry).toBe(3600);
	});

	it('returns a Map for the tags field', () => {
		const result = decodeBolt11(V2);
		expect((result as { tags: unknown }).tags).toBeInstanceOf(Map);
	});

	it('isValidBolt11 returns true for a valid invoice', () => {
		expect(isValidBolt11(V1)).toBe(true);
		expect(isValidBolt11(V2)).toBe(true);
	});

	it('isValidBolt11 returns false for garbage', () => {
		expect(isValidBolt11('garbage')).toBe(false);
		expect(isValidBolt11('')).toBe(false);
	});

	it('quickAmount extracts amount from HRP without full decode', () => {
		expect(quickAmount(V1)).toBe(0);
		expect(quickAmount(V2)).toBe(250000);
	});
});

describe('bolt11 regression — error cases unchanged', () => {
	it('returns invalid_format for empty input', () => {
		const result = decodeBolt11('');
		expect((result as { code: string }).code).toBe('invalid_format');
	});

	it('returns invalid_format for non-string input', () => {
		const result = decodeBolt11(null as unknown as string);
		expect((result as { code: string }).code).toBe('invalid_format');
	});

	it('returns invalid_network for non-bolt11 prefix', () => {
		const result = decodeBolt11('not-an-invoice');
		expect((result as { code: string }).code).toBe('invalid_network');
	});

	it('returns invalid_checksum for a malformed invoice', () => {
		const result = decodeBolt11('lnbc1abc');
		expect((result as { code: string }).code).toBe('invalid_checksum');
	});
});
