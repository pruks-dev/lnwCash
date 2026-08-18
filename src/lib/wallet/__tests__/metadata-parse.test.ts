import { describe, it, expect } from 'vitest';
import { parseMetadata } from '../lnurl';

const FALLBACK = 'fallback.domain';

describe('parseMetadata — valid', () => {
	it('extracts the text/plain value', () => {
		const meta = JSON.stringify([
			['text/plain', 'Paying PrukS@coinos.io'],
			['text/identifier', 'PrukS@coinos.io']
		]);
		expect(parseMetadata(meta, FALLBACK)).toBe('Paying PrukS@coinos.io');
	});

	it('finds text/plain even when it is not the first entry', () => {
		const meta = JSON.stringify([
			['text/identifier', 'PrukS@coinos.io'],
			['image/png;base64', 'iVBORw0KGgo='],
			['text/plain', 'Tip for PrukS']
		]);
		expect(parseMetadata(meta, FALLBACK)).toBe('Tip for PrukS');
	});

	it('handles a single text/plain entry', () => {
		const meta = JSON.stringify([['text/plain', 'hello']]);
		expect(parseMetadata(meta, FALLBACK)).toBe('hello');
	});
});

describe('parseMetadata — malformed / fallback', () => {
	it('returns fallback for invalid JSON', () => {
		expect(parseMetadata('not json', FALLBACK)).toBe(FALLBACK);
	});

	it('returns fallback for empty string', () => {
		expect(parseMetadata('', FALLBACK)).toBe(FALLBACK);
	});

	it('returns fallback for a non-array JSON value', () => {
		expect(parseMetadata('{"foo":"bar"}', FALLBACK)).toBe(FALLBACK);
		expect(parseMetadata('123', FALLBACK)).toBe(FALLBACK);
		expect(parseMetadata('"string"', FALLBACK)).toBe(FALLBACK);
		expect(parseMetadata('null', FALLBACK)).toBe(FALLBACK);
	});

	it('returns fallback when text/plain is missing', () => {
		const meta = JSON.stringify([
			['text/identifier', 'PrukS@coinos.io'],
			['image/png;base64', 'iVBORw0KGgo=']
		]);
		expect(parseMetadata(meta, FALLBACK)).toBe(FALLBACK);
	});

	it('returns fallback for nested (non-flat) arrays', () => {
		const meta = JSON.stringify([[['text/plain'], 'nested']]);
		expect(parseMetadata(meta, FALLBACK)).toBe(FALLBACK);
	});

	it('returns fallback when text/plain value is empty string', () => {
		const meta = JSON.stringify([['text/plain', '']]);
		expect(parseMetadata(meta, FALLBACK)).toBe(FALLBACK);
	});

	it('returns fallback when text/plain value is not a string', () => {
		const meta = JSON.stringify([['text/plain', 12345]]);
		expect(parseMetadata(meta, FALLBACK)).toBe(FALLBACK);
	});

	it('returns empty fallback by default', () => {
		expect(parseMetadata('garbage')).toBe('');
	});

	it('does not crash on non-string metadata', () => {
		expect(parseMetadata(null as unknown as string, FALLBACK)).toBe(FALLBACK);
		expect(parseMetadata(undefined as unknown as string, FALLBACK)).toBe(FALLBACK);
		expect(parseMetadata(42 as unknown as string, FALLBACK)).toBe(FALLBACK);
	});
});
