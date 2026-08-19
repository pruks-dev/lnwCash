/**
 * TASK-290 — LNURL resolve trigger (Send.svelte).
 *
 * A lightning address has NO checksum, so auto-resolving on every `oninput`
 * fails prematurely mid-typing (e.g. `user@dom`). The trigger is now:
 *   - typing  → does NOT resolve (bolt11 still auto-validates: it has a checksum)
 *   - Enter   → resolves lightning address / lnurl
 *   - paste   → auto-resolves immediately
 * On resolve error the invoice textarea must return for editing (no longer
 * hidden behind `lnurlFlowState !== 'idle'`).
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

describe('Send LNURL resolve trigger (TASK-290)', () => {
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

	it('typing user@domain char-by-char does NOT resolve (no fetch, no premature error)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		// simulate typing the address one character at a time
		const chars = ['u', 'us', 'use', 'user', 'user@', 'user@c', 'user@co', 'user@coinos.io'];
		for (const value of chars) {
			await fireEvent.input(textarea, { target: { value } });
		}

		// no LNURL resolve was kicked off during typing, no error surfaced
		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByText('screen.send.lnaddr.resolving')).toBeNull();
		expect(screen.queryByText('screen.send.lnaddr.error_resolve')).toBeNull();
		// textarea still present for continued typing
		expect(document.querySelector('.invoice-textarea')).toBeTruthy();
	});

	it('typing a complete address does NOT resolve; Enter resolves', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'PrukS@coinos.io' } });
		// typing only → no resolve yet
		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByText('screen.send.lnaddr.resolving')).toBeNull();

		// press Enter → resolve
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		expect(await screen.findByText('screen.send.lnaddr.pay_to PrukS@coinos.io')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalled();
	});

	it('paste user@domain.com auto-resolves immediately', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => 'PrukS@coinos.io' }
		});

		expect(await screen.findByText('screen.send.lnaddr.pay_to PrukS@coinos.io')).toBeTruthy();
		// resolve hit the .well-known/lnurlp endpoint
		const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/.well-known/lnurlp/'));
		expect(resolveCall).toBeTruthy();
	});

	it('paste a lnurl bech32 auto-resolves immediately', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		// valid lnurl bech32 (lnurl1...) — resolveLnurl path
		await fireEvent.paste(textarea, {
			clipboardData: {
				getData: () =>
					'LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS'
			}
		});

		expect(await screen.findByText('screen.send.lnaddr.pay_to coinos.io')).toBeTruthy();
		// resolve hit the decoded lnurl URL (not the .well-known lightning-address path)
		const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('service.com'));
		expect(resolveCall).toBeTruthy();
	});

	it('resolve error → textarea returns for editing + error message shown + back/reset works', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'user@bad.invalid' } });
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		// error surfaced
		expect(await screen.findByText('screen.send.lnaddr.error_resolve')).toBeTruthy();
		// textarea returns so the user can fix the address
		expect(document.querySelector('.invoice-textarea')).toBeTruthy();

		// dismiss/reset returns to idle editing (textarea still present)
		const dismiss = screen.getByRole('button', { name: 'Dismiss' });
		await fireEvent.click(dismiss);
		expect(screen.queryByText('screen.send.lnaddr.error_resolve')).toBeNull();
		expect(document.querySelector('.invoice-textarea')).toBeTruthy();
	});

	it('editing/typing again clears lnurlError', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'user@bad.invalid' } });
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		expect(await screen.findByText('screen.send.lnaddr.error_resolve')).toBeTruthy();

		// edit the address → error cleared, textarea remains.
		// (re-query: the error state re-renders the textarea node)
		const textareaAfterError = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;
		await fireEvent.input(textareaAfterError, { target: { value: 'user@bad.invalidX' } });
		await waitFor(() => expect(screen.queryByText('screen.send.lnaddr.error_resolve')).toBeNull());
		expect(document.querySelector('.invoice-textarea')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledTimes(1); // no auto re-resolve on typing
	});
});
