import { describe, it, expect, vi } from 'vitest';
import { requestLnurlInvoice, resolveLnurl, LnurlError } from '../lnurl';

const LNURL_VECTOR =
	'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';
const LNURL_VECTOR_URL =
	'https://service.com/api?q=3fc3645b439ce8e7f2553a69e5267081d96dcd340693afabe04be7b0ccd178df';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** A fetch stub that records the URL and returns a canned Response. */
function captureFetch(result: (url: string) => Response): { fetchFn: typeof fetch; urls: string[] } {
	const urls: string[] = [];
	const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input.toString();
		urls.push(url);
		void init;
		return result(url);
	}) as typeof fetch;
	return { fetchFn, urls };
}

describe('requestLnurlInvoice — callback URL construction', () => {
	it('appends amount with "?" when callback has no query string', async () => {
		const { fetchFn, urls } = captureFetch(() => jsonResponse({ pr: 'lnbc1mockinvoice' }));
		const pr = await requestLnurlInvoice('https://example.com/lnurlp', 1000, undefined, { fetchFn });
		expect(pr).toBe('lnbc1mockinvoice');
		expect(urls).toEqual(['https://example.com/lnurlp?amount=1000']);
	});

	it('appends amount with "&" when callback already has a query string', async () => {
		const { fetchFn, urls } = captureFetch(() => jsonResponse({ pr: 'lnbc1mockinvoice' }));
		await requestLnurlInvoice('https://example.com/lnurlp?tag=pay', 1000, undefined, { fetchFn });
		expect(urls).toEqual(['https://example.com/lnurlp?tag=pay&amount=1000']);
	});

	it('URL-encodes the comment parameter', async () => {
		const { fetchFn, urls } = captureFetch(() => jsonResponse({ pr: 'lnbc1mockinvoice' }));
		await requestLnurlInvoice('https://example.com/lnurlp', 1000, 'hello world & more', { fetchFn });
		expect(urls[0]).toBe('https://example.com/lnurlp?amount=1000&comment=hello%20world%20%26%20more');
	});

	it('omits the comment parameter when empty/undefined', async () => {
		const { fetchFn, urls } = captureFetch(() => jsonResponse({ pr: 'lnbc1mockinvoice' }));
		await requestLnurlInvoice('https://example.com/lnurlp', 1000, '', { fetchFn });
		expect(urls[0]).toBe('https://example.com/lnurlp?amount=1000');
	});

	it('floors fractional msat amounts', async () => {
		const { fetchFn, urls } = captureFetch(() => jsonResponse({ pr: 'lnbc1mockinvoice' }));
		await requestLnurlInvoice('https://example.com/lnurlp', 1000.9, undefined, { fetchFn });
		expect(urls[0]).toBe('https://example.com/lnurlp?amount=1000');
	});

	it('rejects non-http callback scheme before fetching (SSRF guard)', async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;
		await expect(
			requestLnurlInvoice('javascript:alert(1)', 1000, undefined, { fetchFn })
		).rejects.toThrow(LnurlError);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('throws LnurlError when response is missing "pr"', async () => {
		const { fetchFn } = captureFetch(() => jsonResponse({ status: 'ERROR' }));
		await expect(
			requestLnurlInvoice('https://example.com/lnurlp', 1000, undefined, { fetchFn })
		).rejects.toThrow(/missing "pr"/);
	});
});

describe('resolveLnurl', () => {
	it('resolves a bech32 lnurl → validates tag=payRequest → returns callback', async () => {
		const info = {
			tag: 'payRequest',
			callback: 'https://example.com/cb',
			minSendable: 1000,
			maxSendable: 1000000,
			metadata: '[["text/plain","hi"]]'
		};
		const { fetchFn, urls } = captureFetch(() => jsonResponse(info));
		const result = await resolveLnurl(LNURL_VECTOR, { fetchFn });
		expect(result.info.tag).toBe('payRequest');
		expect(result.callbackUrl).toBe('https://example.com/cb');
		expect(urls).toEqual([LNURL_VECTOR_URL]);
	});

	it('throws LnurlError (invalid_tag) when tag !== payRequest', async () => {
		const { fetchFn } = captureFetch(() =>
			jsonResponse({ tag: 'withdrawRequest', callback: 'https://example.com/cb' })
		);
		await expect(resolveLnurl('https://example.com/lnurlp', { fetchFn })).rejects.toThrow(/payRequest/);
	});

	it('throws LnurlError (invalid_url) for non-http URL before fetch', async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;
		await expect(resolveLnurl('file:///etc/passwd', { fetchFn })).rejects.toThrow(/SSRF/);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('throws LnurlError (invalid_lnurl) for an undecodable bech32', async () => {
		const fetchFn = vi.fn() as unknown as typeof fetch;
		await expect(resolveLnurl('lnurl1invalidchecksum', { fetchFn })).rejects.toThrow(LnurlError);
		expect(fetchFn).not.toHaveBeenCalled();
	});
});
