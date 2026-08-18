/**
 * TASK-293 — LNURL Resolve button (Send.svelte).
 *
 * Mobile/tablet has no physical Enter key, so TASK-290's Enter-only trigger is
 * not reachable on touch devices. This task adds a "Resolve" button below the
 * invoice textarea, rendered ONLY when the input classifies as lnurl or
 * lightning_address. The button is the tap-equivalent of Enter.
 *
 *   - typing a lightning address / lnurl → Resolve button appears
 *   - clicking Resolve → resolveLnurlInput(text)
 *   - paste → still auto-resolves (button not required)
 *   - Enter → still resolves (kept)
 *   - bolt11 / unknown → no Resolve button (bolt11 path intact)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
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

const LNURL_BECH32 =
	'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('Send LNURL Resolve button (TASK-293)', () => {
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
			if (url.includes('service.com')) return jsonResponse(PAY_INFO);
			if (url.includes('/callback')) return jsonResponse({ pr: 'lnbc1testinvoice' });
			throw new Error('unexpected fetch: ' + url);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('typing a lightning address shows the Resolve button; clicking resolves', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		// before typing → no Resolve button
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.resolve_button' })).toBeNull();

		await fireEvent.input(textarea, { target: { value: 'PrukS@coinos.io' } });

		// Resolve button now visible (lightning address)
		const resolveButton = screen.getByRole('button', { name: 'screen.send.lnaddr.resolve_button' });
		expect(resolveButton).toBeTruthy();
		// typing alone did NOT resolve (fetch not called yet)
		expect(fetchMock).not.toHaveBeenCalled();

		// click Resolve → resolveLnurlInput
		await fireEvent.click(resolveButton);
		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/.well-known/lnurlp/'));
		expect(resolveCall).toBeTruthy();
	});

	it('typing a lnurl bech32 shows the Resolve button; clicking resolves', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: LNURL_BECH32 } });

		const resolveButton = screen.getByRole('button', { name: 'screen.send.lnaddr.resolve_button' });
		expect(resolveButton).toBeTruthy();

		await fireEvent.click(resolveButton);
		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('service.com'));
		expect(resolveCall).toBeTruthy();
	});

	it('paste still auto-resolves (button not required)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => 'PrukS@coinos.io' }
		});

		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalled();
	});

	it('Enter keydown still resolves (kept)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'PrukS@coinos.io' } });
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalled();
	});

	it('bolt11 input → NO Resolve button (bolt11 path intact)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, {
			target: { value: 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq' }
		});

		// bolt11 path taken (validated → check fee action renders)
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
		// no Resolve button for bolt11
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.resolve_button' })).toBeNull();
		// no lnurl resolve
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('unknown / empty input → NO Resolve button', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		// empty → no button
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.resolve_button' })).toBeNull();

		// unknown string → no button
		await fireEvent.input(textarea, { target: { value: 'not an address' } });
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.resolve_button' })).toBeNull();
	});
});
