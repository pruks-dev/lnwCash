/**
 * TASK-287 — LNURL UI collapse (Send.svelte).
 *
 * After a lightning address / lnurl auto-resolves, the invoice textarea +
 * paste/QR buttons must be hidden (only LNURL card + amount + numpad remain),
 * and a back button ("Change address") must return the user to editing.
 *
 * The back button must NOT render while the address is still resolving.
 * bolt11 (lnbc) input must keep the textarea visible (idle path).
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

describe('Send LNURL UI collapse (TASK-287)', () => {
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

	it('resolve → textarea + paste/QR hidden; back button resets to idle and textarea reappears', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });

		// idle: textarea + paste are present
		expect(document.querySelector('.invoice-textarea')).toBeTruthy();
		expect(screen.getByText('common.paste')).toBeTruthy();

		// trigger auto-resolve (TASK-290: paste is the resolve trigger)
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;
		await fireEvent.paste(textarea, { clipboardData: { getData: () => 'PrukS@coinos.io' } });

		// resolution completed → LNURL card visible
		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();

		// textarea + paste/QR hidden while LNURL flow active
		expect(document.querySelector('.invoice-textarea')).toBeNull();
		expect(screen.queryByText('common.paste')).toBeNull();

		// back button present (ready state, not resolving)
		const back = screen.getByRole('button', { name: 'screen.send.lnaddr.back' });
		expect(back).toBeTruthy();

		// press back → reset → textarea reappears, LNURL card gone
		await fireEvent.click(back);
		expect(document.querySelector('.invoice-textarea')).toBeTruthy();
		expect(screen.queryByText('Paying PrukS@coinos.io')).toBeNull();
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.back' })).toBeNull();
	});

	it('back button does NOT render while resolving (only after resolve)', async () => {
		let resolveFetch: ((r: Response) => void) | undefined;
		fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
		vi.stubGlobal('fetch', fetchMock);

		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });

		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;
		await fireEvent.paste(textarea, { clipboardData: { getData: () => 'PrukS@coinos.io' } });

		// resolving state: spinner shown, textarea hidden, back button NOT shown
		expect(await screen.findByText('screen.send.lnaddr.resolving')).toBeTruthy();
		expect(document.querySelector('.invoice-textarea')).toBeNull();
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.back' })).toBeNull();

		// finish resolution → back button appears
		resolveFetch!(jsonResponse(PAY_INFO));
		expect(await screen.findByText('Paying PrukS@coinos.io')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'screen.send.lnaddr.back' })).toBeTruthy();
	});

	it('bolt11 (lnbc) input keeps textarea visible (idle path unaffected)', async () => {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });

		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;
		await fireEvent.input(textarea, {
			target: { value: 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp' }
		});

		// bolt11 path: textarea still present, no LNURL back button
		await waitFor(() => expect(document.querySelector('.invoice-textarea')).toBeTruthy());
		expect(document.querySelector('[data-flow="send-lnurl"]')).toBeNull();
		expect(screen.queryByRole('button', { name: 'screen.send.lnaddr.back' })).toBeNull();
	});
});
