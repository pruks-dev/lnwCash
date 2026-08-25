/**
 * TASK-280 — LNURL-pay integration (Send.svelte).
 *
 * Lightning address → resolve (mock fetch) → description/domain → amount
 * → request invoice → decode/verify bolt11 → meltFlow(mintUrl, pr, amount).
 *
 * meltFlow is mocked (boundary) so the melt is not actually executed.
 * fetch is mocked for the LNURL network layer. decodeBolt11 is mocked so the
 * returned bolt11 invoice verifies cleanly with a controllable amount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
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

const mockMeltFlow = vi.fn();
vi.mock('$lib/wallet/melt', () => ({
	meltFlow: (...args: unknown[]) => mockMeltFlow(...args)
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
	CashuError: class CashuError extends Error { status?: number; constructor(m: string, s?: number) { super(m); this.status = s; } }
}));

vi.mock('$lib/wallet/errors', () => ({
	InsufficientFundsError: class InsufficientFundsError extends Error {},
	WalletLockedError: class WalletLockedError extends Error {}
}));

const mockDecodeBolt11 = vi.fn();
vi.mock('$lib/wallet/bolt11', () => ({
	decodeBolt11: (inv: string) => mockDecodeBolt11(inv),
	isValidBolt11: () => true
}));

const PAY_INFO = {
	tag: 'payRequest',
	callback: 'https://coinos.io/callback',
	minSendable: 1000,
	maxSendable: 100000000,
	metadata: '[["text/plain","Paying PrukS@coinos.io"]]',
	commentAllowed: 100
};

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('Send LNURL integration (TASK-280)', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockMeltFlow.mockResolvedValue({ success: true, preimage: 'ab', feeReserve: 0, spentAmount: 1 });
		mockDecodeBolt11.mockReturnValue({
			network: 'mainnet',
			amountSat: 1,
			paymentHash: 'ab',
			description: '',
			expiry: 3600,
			timestamp: 0,
			hrp: 'lnbc',
			tags: new Map()
		});
		fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/.well-known/lnurlp/')) return jsonResponse(PAY_INFO);
			if (url.includes('/callback')) return jsonResponse({ pr: 'lnbc1testinvoice' });
			throw new Error('unexpected fetch: ' + url);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('address → resolve → description/domain → amount → invoice → meltFlow(mintUrl, pr, amount)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });

		const textarea = document.querySelector('.paste-textarea') as HTMLTextAreaElement;
		// TASK-290: paste is the resolve trigger (typing no longer auto-resolves)
		await fireEvent.paste(textarea, { clipboardData: { getData: () => 'PrukS@coinos.io' } });

		// resolution completed → "Pay to {address}" rendered (text node, no HTML)
		expect(await screen.findByText('screen.send.lnaddr.pay_to PrukS@coinos.io')).toBeTruthy();

		// resolve hit the .well-known/lnurlp endpoint
		const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/.well-known/lnurlp/'));
		expect(resolveCall).toBeTruthy();
		expect(String(resolveCall![0])).toBe('https://coinos.io/.well-known/lnurlp/PrukS');

		// enter amount 1 sat via numpad
		await fireEvent.click(screen.getByRole('button', { name: '1' }));

		// confirm = request invoice
		await fireEvent.click(screen.getByRole('button', { name: /screen.send.lnaddr.request_invoice/ }));

		// meltFlow called with (mintUrl, pr, amountSat)
		await waitFor(() => expect(mockMeltFlow).toHaveBeenCalledTimes(1));
		expect(mockMeltFlow).toHaveBeenCalledWith('https://mint.lnw.cash', 'lnbc1testinvoice', 1);

		// invoice request URL carried amount=1000 (1 sat = 1000 msat)
		const invoiceCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/callback'));
		expect(invoiceCall).toBeTruthy();
		expect(String(invoiceCall![0])).toBe('https://coinos.io/callback?amount=1000');

		// decodeBolt11 verified the returned invoice
		expect(mockDecodeBolt11).toHaveBeenCalledWith('lnbc1testinvoice');
	});
});
