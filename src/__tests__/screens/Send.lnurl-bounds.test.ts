/**
 * TASK-280 — LNURL amount bounds + error handling (Send.svelte).
 *
 * amount_sat*1000 must be within [minSendable, maxSendable]; out-of-range →
 * clear i18n error. Also covers: no amount, amount-mismatch after invoice,
 * tag != payRequest, and resolve failure.
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
	CashuError: class CashuError extends Error {}
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

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('Send LNURL amount bounds + errors (TASK-280)', () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	let payInfo: Record<string, unknown>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockMeltFlow.mockResolvedValue({ success: true, preimage: 'ab', feeReserve: 0, spentAmount: 1 });
		mockDecodeBolt11.mockReturnValue({
			network: 'mainnet', amountSat: 3, paymentHash: 'ab', description: '',
			expiry: 3600, timestamp: 0, hrp: 'lnbc', tags: new Map()
		});
		// min 3 sat (3000 msat), max 7 sat (7000 msat)
		payInfo = {
			tag: 'payRequest',
			callback: 'https://coinos.io/callback',
			minSendable: 3000,
			maxSendable: 7000,
			metadata: '[["text/plain","Paying PrukS@coinos.io"]]',
			commentAllowed: 0
		};
		fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url.includes('/.well-known/lnurlp/')) return jsonResponse(payInfo);
			if (url.includes('/callback')) return jsonResponse({ pr: 'lnbc1testinvoice' });
			throw new Error('unexpected fetch: ' + url);
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	async function enterAddress() {
		render(Send, { defaultMintUrl: 'https://mint.lnw.cash' });
		const textarea = document.querySelector('.invoice-textarea') as HTMLTextAreaElement;
		// TASK-290: paste is the resolve trigger (typing no longer auto-resolves)
		await fireEvent.paste(textarea, { clipboardData: { getData: () => 'PrukS@coinos.io' } });
	}

	async function waitResolved() {
		await screen.findByText('Paying PrukS@coinos.io');
	}

	async function enterAmount(digits: string[]) {
		for (const d of digits) {
			await fireEvent.click(screen.getByRole('button', { name: d }));
		}
	}

	async function confirmRequest() {
		await fireEvent.click(screen.getByRole('button', { name: /screen.send.lnaddr.request_invoice/ }));
	}

	it('amount below minSendable → error_min_max', async () => {
		await enterAddress();
		await waitResolved();
		await enterAmount(['2']); // 2 sat < 3 sat min
		await confirmRequest();
		expect(await screen.findByText('screen.send.lnaddr.error_min_max')).toBeTruthy();
		expect(mockMeltFlow).not.toHaveBeenCalled();
		// no invoice request fired (bounded before network)
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/callback'))).toBe(false);
	});

	it('amount above maxSendable → error_min_max', async () => {
		await enterAddress();
		await waitResolved();
		await enterAmount(['8']); // 8 sat > 7 sat max
		await confirmRequest();
		expect(await screen.findByText('screen.send.lnaddr.error_min_max')).toBeTruthy();
		expect(mockMeltFlow).not.toHaveBeenCalled();
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/callback'))).toBe(false);
	});

	it('amount within bounds → meltFlow called', async () => {
		await enterAddress();
		await waitResolved();
		await enterAmount(['3']); // 3 sat ∈ [3, 7]
		await confirmRequest();
		await waitFor(() => expect(mockMeltFlow).toHaveBeenCalledTimes(1));
		expect(mockMeltFlow).toHaveBeenCalledWith('https://mint.lnw.cash', 'lnbc1testinvoice', 3);
	});

	it('empty amount → error_no_amount', async () => {
		await enterAddress();
		await waitResolved();
		await confirmRequest(); // amount still '0'
		expect(await screen.findByText('screen.send.lnaddr.error_no_amount')).toBeTruthy();
		expect(mockMeltFlow).not.toHaveBeenCalled();
	});

	it('invoice amount mismatch → error_amount_mismatch', async () => {
		mockDecodeBolt11.mockReturnValue({
			network: 'mainnet', amountSat: 999, paymentHash: 'ab', description: '',
			expiry: 3600, timestamp: 0, hrp: 'lnbc', tags: new Map()
		});
		await enterAddress();
		await waitResolved();
		await enterAmount(['3']);
		await confirmRequest();
		expect(await screen.findByText('screen.send.lnaddr.error_amount_mismatch')).toBeTruthy();
		expect(mockMeltFlow).not.toHaveBeenCalled();
	});

	it('tag != payRequest → error_tag', async () => {
		payInfo = { ...payInfo, tag: 'withdrawRequest' };
		await enterAddress();
		expect(await screen.findByText('screen.send.lnaddr.error_tag')).toBeTruthy();
		expect(mockMeltFlow).not.toHaveBeenCalled();
	});

	it('resolve failure (network error) → error_resolve', async () => {
		fetchMock.mockImplementation(async () => {
			throw new TypeError('Failed to fetch');
		});
		await enterAddress();
		expect(await screen.findByText('screen.send.lnaddr.error_resolve')).toBeTruthy();
		expect(mockMeltFlow).not.toHaveBeenCalled();
	});
});
