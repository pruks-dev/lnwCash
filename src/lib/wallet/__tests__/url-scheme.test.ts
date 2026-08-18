import { describe, it, expect } from 'vitest';
import { validateLnurlUrl } from '../lnurl';

describe('validateLnurlUrl', () => {
	it('accepts https URLs', () => {
		expect(validateLnurlUrl('https://coinos.io/.well-known/lnurlp/PrukS')).toBe(true);
	});

	it('accepts http URLs', () => {
		expect(validateLnurlUrl('http://example.com/api')).toBe(true);
	});

	it('accepts https URLs with query strings', () => {
		expect(validateLnurlUrl('https://example.com/api?amount=1000&comment=hi')).toBe(true);
	});

	it('rejects javascript: scheme', () => {
		expect(validateLnurlUrl('javascript:alert(1)')).toBe(false);
	});

	it('rejects file: scheme', () => {
		expect(validateLnurlUrl('file:///etc/passwd')).toBe(false);
	});

	it('rejects data: scheme', () => {
		expect(validateLnurlUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
	});

	it('rejects other schemes (ftp, mailto, ws)', () => {
		expect(validateLnurlUrl('ftp://example.com/file')).toBe(false);
		expect(validateLnurlUrl('mailto:alice@example.com')).toBe(false);
		expect(validateLnurlUrl('ws://example.com/socket')).toBe(false);
	});

	it('rejects empty / non-string input', () => {
		expect(validateLnurlUrl('')).toBe(false);
		expect(validateLnurlUrl(null as unknown as string)).toBe(false);
		expect(validateLnurlUrl(undefined as unknown as string)).toBe(false);
	});

	it('rejects malformed URLs', () => {
		expect(validateLnurlUrl('not a url')).toBe(false);
		expect(validateLnurlUrl('//protocol-relative.example.com')).toBe(false);
	});
});
