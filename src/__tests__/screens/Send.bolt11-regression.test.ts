/**
 * TASK-280 — bolt11 invoice path regression (Send.svelte).
 * TASK-4600 — valid bolt11 auto-quotes (melt quote, exactly once per distinct
 * invoice). The quote fetch is EXPECTED; what MUST NOT happen is entering the
 * LNURL/lightning-address resolve flow.
 *
 * decodeBolt11 is the REAL implementation here (NOT mocked) so a real bolt11
 * invoice validates end-to-end through the existing path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Send from '../../screens/Send.svelte';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: { subscribe(fn: (v: string) => void) { fn('en'); return () => {}; }, set() {} },
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn(),
	getCurrentScreen: () => 'send',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

vi.mock('$lib/wallet/store', () => ({
	getMintConfig: () => ({ name: 'Test Mint', url: 'https://mint.lnw.cash' }),
	getActiveMintUrl: () => 'https://mint.lnw.cash',
	setActiveMintUrl: vi.fn(),
	activeMintStore: { subscribe: vi.fn(() => () => {}), set: vi.fn() }
}));

vi.mock('$lib/wallet/melt', () => ({
	meltFlow: vi.fn().mockResolvedValue({ success: true, preimage: 'ab', feeReserve: 0, spentAmount: 1 })
}));

vi.mock('$lib/wallet/transfer', () => ({
	sendTokens: vi.fn().mockResolvedValue({ token: 'cashuAeyJ0', amount: 1, mint: 'https://mint.lnw.cash' })
}));

vi.mock('$lib/wallet/balance', () => ({
	getBalance: () => Promise.resolve({ total: 0, byMint: {}, proofCount: 0, lastUpdated: Date.now() }),
	getBalanceByMint: () => Promise.resolve(0)
}));

vi.mock('$lib/cashu/client', () => ({
	requestMeltQuote: vi.fn(),
	CashuError: class CashuError extends Error {}
}));

vi.mock('$lib/wallet/errors', () => ({
	InsufficientFundsError: class InsufficientFundsError extends Error {},
	WalletLockedError: class WalletLockedError extends Error {}
}));

// BOLT #11 spec vector — 250000 sat mainnet invoice (real decoder).
const BOLT11_2500U =
	'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';

describe('Send bolt11 regression (TASK-280)', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		// TASK-4600: the melt-quote fetch IS expected (auto-quote, once per
		// distinct invoice). Anything LNURL-shaped still fails loudly.
		fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/v1/melt/quote/bolt11')) {
				return new Response(JSON.stringify({ quote: 'q-test', amount: 250000, fee_reserve: 2, state: 'UNPAID' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			throw new Error('LNURL fetch must not be called for bolt11 input: ' + url);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	const quoteCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/v1/melt/quote/bolt11'));
	const lnurlCalls = () => fetchMock.mock.calls.filter((c) => {
		const u = String(c[0]);
		return !u.includes('/v1/melt/quote/bolt11');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('lnbc invoice → bolt11 preview (real decode) + auto-quote once; NO lnurl resolve', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		await tick();

		const textarea = document.querySelector('.paste-textarea') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: BOLT11_2500U } });

		// TASK-4600: auto-quote fired exactly once (melt quote — not LNURL)
		await waitFor(() => expect(quoteCalls().length).toBe(1));
		expect(lnurlCalls().length).toBe(0);

		// success (fee>0): merged single card — total visible, check_fee hidden,
		// no desc/memo row in render
		expect(await screen.findByText('screen.send.total')).toBeTruthy();
		expect(document.querySelector('.detail-row-total')).toBeTruthy();
		expect(screen.queryByText('screen.send.check_fee')).toBeNull();
		expect(screen.queryByText('screen.send.description')).toBeNull();

		// guard: same invoice re-validated → NO second quote
		await fireEvent.input(textarea, { target: { value: BOLT11_2500U } });
		await tick();
		expect(quoteCalls().length).toBe(1);

		// did NOT enter the LNURL flow
		expect(screen.queryByText('screen.send.lnaddr.resolving')).toBeNull();
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
		expect(lnurlCalls().length).toBe(0);
	});

	it('lntb-prefixed input → routed to bolt11 path (not lnurl)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });

		const textarea = document.querySelector('.paste-textarea') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'lntb1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq' } });

		// bolt11 path attempted → invalid-invoice error (not a lnurl resolve)
		expect(await screen.findByText('screen.send.error_invalid_invoice')).toBeTruthy();
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
		expect(screen.queryByText('screen.send.lnaddr.resolving')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('lnbcrt-prefixed input → routed to bolt11 path (not lnurl)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });

		const textarea = document.querySelector('.paste-textarea') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'lnbcrt1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq' } });

		expect(await screen.findByText('screen.send.error_invalid_invoice')).toBeTruthy();
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
		expect(screen.queryByText('screen.send.lnaddr.resolving')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
