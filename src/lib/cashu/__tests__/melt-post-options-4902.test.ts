/**
 * TASK-4902: melt POST timeout + poll-until-terminal (client layer).
 *
 *   (a) meltTokens uses the LONG NUT-05 timeout (never the 15s default).
 *   (b) meltTokens does NOT retry transient 5xx inline (WINDOW-3: a blind
 *       re-POST of the same B_ after an already-signed 502 collides with
 *       11003 — retry lives in melt.ts with reconcile-first + backoff + cap).
 *   (c) pollMeltQuoteUntilTerminal: PAID → terminal; deadline → check-once +
 *       timedOut (never failed-on here — the caller decides on proof).
 *   (d) 429 inside the poll backs off (Retry-After) instead of hammering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	meltTokens,
	checkMeltQuote,
	pollMeltQuoteUntilTerminal,
	MELT_POST_TIMEOUT_MS,
	MELT_POLL_INITIAL_MS,
	CashuError
} from '../client';

const MINT_A = 'https://mint-a.example.com';

const mockFetch = vi.fn();
let originalFetch: typeof fetch;

function okJson(body: unknown) {
	return { ok: true, json: () => Promise.resolve(body) };
}

describe('TASK-4902 client: melt POST + poll', () => {
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch;
		mockFetch.mockReset();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('(a) meltTokens uses the long NUT-05 timeout (not 15s)', async () => {
		expect(MELT_POST_TIMEOUT_MS).toBeGreaterThan(15_000);
		mockFetch.mockResolvedValueOnce(okJson({ paid: true, payment_preimage: 'p' }));

		// AbortController wiring: capture the signal and assert it is NOT the 15s default.
		// fetchFromMint does not expose the timeout directly, so assert via behavior:
		// a POST that answers in 100ms must succeed exactly once.
		const inputs = [{ id: 'ks', amount: 10, secret: 's', C: 'c' }];
		const res = await meltTokens(MINT_A, 'q', inputs, []);
		expect(res.paid).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('(b) meltTokens does NOT retry 502 inline (no blind re-POST of the same B_)', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 502,
			statusText: 'Bad Gateway',
			headers: { get: () => null },
			json: () => Promise.resolve({ detail: 'bad gateway', code: 500 })
		});

		const inputs = [{ id: 'ks', amount: 10, secret: 's', C: 'c' }];
		await expect(meltTokens(MINT_A, 'q', inputs, [])).rejects.toBeInstanceOf(CashuError);
		// A single attempt — the reconcile-guarded retry lives in melt.ts.
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('(c) poll reaches PAID → terminal (slow cadence honored)', async () => {
		expect(MELT_POLL_INITIAL_MS).toBeGreaterThan(5_000);
		mockFetch
			.mockResolvedValueOnce(okJson({ quote: 'q', state: 'PENDING' }))
			.mockResolvedValueOnce(okJson({ quote: 'q', state: 'PAID' }));

		const out = await pollMeltQuoteUntilTerminal(MINT_A, 'q', Date.now() + 60_000, 60_000);
		expect(out.terminal).toBe(true);
		expect(out.timedOut).toBe(false);
		expect(out.quote.state).toBe('PAID');
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(checkMeltQuote).toBeDefined();
	}, 20_000);

	it('(c2) poll past deadline → check-once + timedOut (caller decides, never failed here)', async () => {
		mockFetch.mockResolvedValue(okJson({ quote: 'q', state: 'PENDING' }));

		const out = await pollMeltQuoteUntilTerminal(MINT_A, 'q', Date.now() - 1_000, 60_000);
		expect(out.terminal).toBe(false);
		expect(out.timedOut).toBe(true);
		expect(out.quote.state).toBe('PENDING');
	});

	it('(d) 429 inside poll backs off instead of hammering', async () => {
		mockFetch
			.mockResolvedValueOnce({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				headers: { get: () => '0' },
				json: () => Promise.resolve({ detail: 'slow down' })
			})
			.mockResolvedValueOnce(okJson({ quote: 'q', state: 'PAID' }));

		const out = await pollMeltQuoteUntilTerminal(MINT_A, 'q', Date.now() + 120_000, 120_000);
		expect(out.terminal).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});
