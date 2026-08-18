import { describe, it, expect } from 'vitest';
import { parseLightningAddress, isLightningAddress } from '../lnurl';

describe('parseLightningAddress — valid', () => {
	it('parses alice@domain.com', () => {
		expect(parseLightningAddress('alice@domain.com')).toEqual({
			username: 'alice',
			domain: 'domain.com'
		});
	});

	it('preserves username case (PrukS@coinos.io)', () => {
		expect(parseLightningAddress('PrukS@coinos.io')).toEqual({
			username: 'PrukS',
			domain: 'coinos.io'
		});
	});

	it('lowercases the domain', () => {
		expect(parseLightningAddress('alice@Coinos.IO')).toEqual({
			username: 'alice',
			domain: 'coinos.io'
		});
	});

	it('trims surrounding whitespace', () => {
		expect(parseLightningAddress('  alice@domain.com  ')).toEqual({
			username: 'alice',
			domain: 'domain.com'
		});
	});

	it('isLightningAddress returns true for a valid address', () => {
		expect(isLightningAddress('alice@domain.com')).toBe(true);
	});
});

describe('parseLightningAddress — invalid', () => {
	it('rejects empty input', () => {
		expect(parseLightningAddress('')).toBeNull();
		expect(parseLightningAddress('   ')).toBeNull();
	});

	it('rejects non-string input', () => {
		expect(parseLightningAddress(null as unknown as string)).toBeNull();
		expect(parseLightningAddress(undefined as unknown as string)).toBeNull();
	});

	it('rejects missing @ separator', () => {
		expect(parseLightningAddress('alice')).toBeNull();
		expect(parseLightningAddress('alicedomain.com')).toBeNull();
	});

	it('rejects missing username or domain', () => {
		expect(parseLightningAddress('@domain.com')).toBeNull();
		expect(parseLightningAddress('alice@')).toBeNull();
	});

	it('rejects multiple @ separators', () => {
		expect(parseLightningAddress('a@b@domain.com')).toBeNull();
	});

	it('rejects scheme (mailto:)', () => {
		expect(parseLightningAddress('mailto:alice@domain.com')).toBeNull();
	});

	it('rejects path separators', () => {
		expect(parseLightningAddress('alice@domain.com/path')).toBeNull();
		expect(parseLightningAddress('alice/extra@domain.com')).toBeNull();
	});

	it('rejects spaces', () => {
		expect(parseLightningAddress('alice @domain.com')).toBeNull();
		expect(parseLightningAddress('alice@domain .com')).toBeNull();
	});

	it('rejects query/fragment characters', () => {
		expect(parseLightningAddress('alice@domain.com?x=1')).toBeNull();
		expect(parseLightningAddress('alice@domain.com#frag')).toBeNull();
	});

	it('rejects backslash path separators', () => {
		expect(parseLightningAddress('alice@domain\\com')).toBeNull();
	});

	it('isLightningAddress returns false for invalid input', () => {
		expect(isLightningAddress('alice@domain.com/path')).toBe(false);
		expect(isLightningAddress('mailto:alice@domain.com')).toBe(false);
		expect(isLightningAddress('alice')).toBe(false);
	});
});
