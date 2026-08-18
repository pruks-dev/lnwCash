/**
 * TASK-297 — unified "Send" button (Send.svelte).
 *
 * Supersedes TASK-293's "Resolve" button (which was rendered ONLY for
 * lnurl / lightning_address). The Send button is now shown ALWAYS — even for
 * an empty textarea — and dispatches by input type:
 *
 *   - bolt11            → validateInvoiceSimple (re-validate)
 *   - lnurl / address   → resolveLnurlInput (resolve)
 *   - unknown / empty   → no-op (focus the textarea)
 *
 * It is hidden ONLY when:
 *   (1) the bolt11 preview is active (lightningInvoiceValid === true), or
 *   (2) a LNURL resolve has left idle (lnurlFlowState !== 'idle').
 *
 * Auto behaviours (bolt11 auto-validate on input, paste auto-resolve, Enter
 * keydown resolve) are unchanged and asserted for regression.
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

const VALID_BOLT11 =
	'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function validDecode() {
	return {
		network: 'mainnet',
		amountSat: 1,
		paymentHash: 'ab',
		description: '',
		expiry: 3600,
		timestamp: 0,
		hrp: 'lnbc',
		tags: new Map()
	};
}

describe('Send unified button (TASK-297)', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockMeltFlow.mockResolvedValue({ success: true, preimage: 'ab', feeReserve: 0, spentAmount: 1 });
		mockDecodeBolt11.mockReturnValue(validDecode());
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

	it('empty textarea → Send button shown; click is a no-op (no fetch / no decode / no error)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });

		// Send button visible even with an empty textarea
		const sendButton = screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' });
		expect(sendButton).toBeTruthy();

		await fireEvent.click(sendButton);

		// no resolve, no validation, no error surfaced
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mockDecodeBolt11).not.toHaveBeenCalled();
		expect(screen.queryByText('screen.send.error_invalid_invoice')).toBeNull();
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
	});

	it('typing a lightning address → Send button shown; click resolves', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'PrukS@coinos.io' } });

		// Send button shown for the address (typing did NOT auto-resolve)
		const sendButton = screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' });
		expect(sendButton).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();

		// click Send → resolveLnurlInput
		await fireEvent.click(sendButton);
		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/.well-known/lnurlp/'));
		expect(resolveCall).toBeTruthy();
	});

	it('typing a lnurl bech32 → Send button shown; click resolves', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: LNURL_BECH32 } });

		const sendButton = screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' });
		expect(sendButton).toBeTruthy();

		await fireEvent.click(sendButton);
		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		const resolveCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('service.com'));
		expect(resolveCall).toBeTruthy();
	});

	it('bolt11 (invalid) → Send button shown; click re-validates', async () => {
		mockDecodeBolt11.mockReturnValue({ code: 'invalid_bech32' });
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'lnbcinvalid' } });

		// auto-validate on input already failed → error, not valid
		expect(await screen.findByText('screen.send.error_invalid_invoice')).toBeTruthy();
		// Send button shown (bolt11 preview NOT active)
		const sendButton = screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' });
		expect(sendButton).toBeTruthy();

		// click → dispatch validateInvoiceSimple (decode called again), no fetch
		mockDecodeBolt11.mockClear();
		await fireEvent.click(sendButton);
		expect(mockDecodeBolt11).toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('valid bolt11 → auto-validates + preview; Send button NOT shown', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: VALID_BOLT11 } });

		// bolt11 preview active (check fee action renders)
		expect(await screen.findByText('screen.send.check_fee')).toBeTruthy();
		// Send button hidden on bolt11 preview
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.send_button' })).toBeNull();
		// no LNURL resolve
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('paste address → auto-resolve; Send button hidden after resolve (before it was shown)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		// Send button visible before any interaction
		expect(screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' })).toBeTruthy();

		// paste → auto-resolve (unchanged behaviour)
		await fireEvent.paste(textarea, {
			clipboardData: { getData: () => 'PrukS@coinos.io' }
		});

		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalled();

		// resolve succeeded → Send button NOT shown (LNURL card + numpad instead)
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.send_button' })).toBeNull();
		expect(screen.getByRole('button', { name: /screen.send.lnaddr.request_invoice/ })).toBeTruthy();
	});

	it('resolve success (LNURL card + numpad) → Send button NOT shown', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'PrukS@coinos.io' } });
		await fireEvent.click(screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' }));

		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();

		// Send button hidden; "Request invoice" (numpad confirm) present instead
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.send_button' })).toBeNull();
		expect(screen.getByRole('button', { name: /screen.send.lnaddr.request_invoice/ })).toBeTruthy();
	});

	it('Enter keydown still resolves (kept)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'PrukS@coinos.io' } });
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalled();
	});

	it('unknown input → Send button shown; click is a no-op (focuses textarea)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;

		await fireEvent.input(textarea, { target: { value: 'not an address' } });

		const sendButton = screen.getByRole('button', { name: 'screen.send.lnaddr.send_button' });
		expect(sendButton).toBeTruthy();

		await fireEvent.click(sendButton);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(mockDecodeBolt11).not.toHaveBeenCalled();
		expect(screen.queryByText('screen.send.error_invalid_invoice')).toBeNull();
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
	});
});
