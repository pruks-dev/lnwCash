/**
 * TASK-5403 (INTENT-054, CHECKOUT-LN) — Lightning checkout for a frozen bill.
 *
 * Covers (reuse of the Receive.svelte read-only line + paid-first write):
 *   - invoice created from bill.totalSat (same NUT-04 POST {amount, unit:'sat'});
 *     QR + amount + expiry countdown render; NOTHING written before paid.
 *   - PAID → same paid path as Receive (CAS claim → completeMint) →
 *     recordSale() writes once (existing:getPosSales/save:setPosSales) →
 *     PosSuccess renders from r.value.
 *   - server EXPIRED stops polling (no further fetch), bill kept, re-issue
 *     mints a fresh quote without writing; cart/bill totals unchanged.
 *   - unmount mid-polling stops the poll loop (no further fetch).
 *   - local countdown expiry stops polling without any write.
 *   - Pos.svelte connection: Charge via Lightning opens checkout, Back
 *     returns to the identical frozen bill.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import PosCheckoutLn from '../../screens/PosCheckoutLn.svelte';
import Pos from '../../screens/Pos.svelte';
import { receiveInvoiceOpen } from '$lib/stores/receive-invoice';
import type { Bill } from '$lib/pos/cart';

const MINT_URL = 'https://mint.test';

// ─── Mock svelte-i18n ────────────────────────────────────────
vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: { subscribe(fn: (val: string) => void) { fn('en'); return () => {}; }, set() {} },
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

// ─── Mock router ─────────────────────────────────────────────
vi.mock('$lib/router', () => ({
	navigateTo: vi.fn(),
	getCurrentScreen: () => 'pos',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

// ─── Mock Receive.svelte pacing (TASK-4401 helpers, fast in tests) ──
// Real component imports resetPollDelay/nextRateLimitDelay from Receive;
// the mock only shortens delays — poll/stop/expiry logic stays real.
// pollDelayMs is per-test adjustable (countdown test needs slow pacing so
// the 60-poll timeout does not win over the 1s expiry ticker).
let pollDelayMs = 5;
vi.mock('../../screens/Receive.svelte', () => ({
	RECEIVE_POLL_BASE_MS: 5,
	RECEIVE_POLL_MAX_MS: 30,
	applyPollJitter: (d: number) => d,
	nextRateLimitDelay: (c: number) => Math.min(c * 2, 30),
	resetPollDelay: () => pollDelayMs
}));

// ─── Mock wallet/store ───────────────────────────────────────
vi.mock('$lib/wallet/store', () => ({
	getMintConfig: () => undefined,
	getActiveMintUrl: () => MINT_URL,
	setActiveMintUrl: vi.fn(),
	activeMintStore: {
		subscribe(fn: (v: string) => void) { fn(MINT_URL); return () => {}; },
		set: vi.fn()
	}
}));

// ─── Mock wallet/mint ────────────────────────────────────────
const mockCompleteMint = vi.fn(
	async (..._args: unknown[]): Promise<{ success: boolean; proofs: unknown[]; quote: string; amount: number }> => ({
		success: true,
		proofs: [],
		quote: 'q1',
		amount: 100
	})
);
vi.mock('$lib/wallet/mint', () => ({
	completeMint: (...args: unknown[]) => mockCompleteMint(...args)
}));

// ─── Mock wallet/autolock ────────────────────────────────────
vi.mock('$lib/wallet/autolock', () => ({
	withTransactionGuard: (fn: () => unknown) => (fn() as Promise<unknown>)
}));

// ─── Mock wallet/state ───────────────────────────────────────
vi.mock('$lib/wallet/state', () => ({
	getPrivateKey: vi.fn(() => '0xdeadbeef'),
	storeSessionPin: vi.fn(),
	unlockWallet: vi.fn()
}));

// ─── Mock wallet/errors ──────────────────────────────────────
vi.mock('$lib/wallet/errors', () => ({
	WalletLockedError: class WalletLockedError extends Error {
		constructor() {
			super('Wallet is locked');
			this.name = 'WalletLockedError';
		}
	}
}));

// ─── Mock cashu/client (CashuError + 429 path, cf. Receive:429) ──
vi.mock('$lib/cashu/client', () => ({
	CashuError: class CashuError extends Error {
		status?: number;
		constructor(message: string, status?: number) {
			super(message);
			this.name = 'CashuError';
			this.status = status;
		}
	},
	RateLimitedError: class RateLimitedError extends Error {
		retryAfterMs?: number;
		constructor(message: string, retryAfterMs?: number) {
			super(message);
			this.name = 'RateLimitedError';
			this.retryAfterMs = retryAfterMs;
		}
	},
	parseRetryAfterMs: () => undefined
}));

// ─── Mock cashu/keyset ───────────────────────────────────────
const mockFetchAndCacheKeysets = vi.fn(
	async (..._args: unknown[]): Promise<Array<{ id: string; active: boolean }>> => [{ id: 'ks1', active: true }]
);
vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: (...args: unknown[]) => mockFetchAndCacheKeysets(...args)
}));

// ─── Mock storage/db (best-effort tx bookkeeping, cf. Receive) ──
const mockAddTransaction = vi.fn(async (..._args: unknown[]): Promise<string> => 'mint-q1');
const mockGetTransactionById = vi.fn(
	async (..._args: unknown[]): Promise<{ status: string }> => ({ status: 'pending' })
);
const mockUpdateTransaction = vi.fn(async (..._args: unknown[]): Promise<void> => {});
const mockCAS = vi.fn(async (..._args: unknown[]): Promise<boolean> => true);
vi.mock('$lib/storage/db', () => ({
	addTransaction: (...a: unknown[]) => mockAddTransaction(...a),
	getTransactionById: (...a: unknown[]) => mockGetTransactionById(...a),
	updateTransaction: (...a: unknown[]) => mockUpdateTransaction(...a),
	compareAndSetTransactionStatus: (...a: unknown[]) => mockCAS(...a)
}));

// ─── Mock storage/local (5405 handoff: existing/getPosSales, save/setPosSales) ──
const mockGetPosSales = vi.fn((..._args: unknown[]): unknown[] => []);
const mockSetPosSales = vi.fn((..._args: unknown[]): boolean => true);
vi.mock('$lib/storage/local', () => ({
	getPosSales: (...a: unknown[]) => mockGetPosSales(...a),
	setPosSales: (...a: unknown[]) => mockSetPosSales(...a),
	getPosCatalog: vi.fn(() => ({
		schema: 1,
		updatedAt: 1,
		items: [
			{ id: 'tea', name: 'Tea', priceSat: 50, kind: 'drink', fiatPriced: false, active: true, updatedAt: 1 }
		]
	}))
}));

// ─── Mock mint-events ────────────────────────────────────────
const mockNotifyMintConfirmed = vi.fn();
vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: (...a: unknown[]) => mockNotifyMintConfirmed(...a)
}));

// ─── Mock fiat stack (Pos connection test) ───────────────────
vi.mock('$lib/fiat/currency', () => ({
	getFiatCurrency: vi.fn(() => 'THB'),
	satsToFiat: vi.fn((sats: number, price: number) => (sats * price) / 100_000_000),
	formatFiat: vi.fn((sats: number, price: number | null, cur: string) =>
		price == null ? `– ${cur}` : `${((sats * price) / 100_000_000).toFixed(2)} ${cur}`
	),
	FIAT_CURRENCY_EVENT: 'lnwcash:fiat-currency'
}));
vi.mock('$lib/fiat/rates', () => ({
	getBtcRate: vi.fn(async () => ({ price: 3_000_000, asOf: 1, where: 'cache', stale: false, expired: false }))
}));

// ─── fetch harness ───────────────────────────────────────────
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function quoteOk(over: Record<string, unknown> = {}) {
	return {
		ok: true,
		status: 200,
		headers: { get: () => null },
		json: async () => ({
			quote: 'q1',
			request: 'lnbc100n1testinvoice',
			state: 'UNPAID',
			expiry: Math.floor(Date.now() / 1000) + 300,
			...over
		})
	};
}

function stateOk(state: string) {
	return {
		ok: true,
		status: 200,
		headers: { get: () => null },
		json: async () => ({ state })
	};
}

function billFixture(): Bill {
	return {
		lines: [{ productId: 'tea', name: 'Tea', unitPriceSat: 50, qty: 2, lineTotalSat: 100 }],
		totalSat: 100,
		fiat: { currency: 'THB', pricePerBtc: 3_000_000, amount: 0.003, text: '0.01 THB', stale: false, asOf: 1 }
	};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TASK-5403 checkout-LN', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pollDelayMs = 5;
		mockFetch.mockReset();
		mockGetPosSales.mockImplementation((..._args: unknown[]): unknown[] => []);
		mockSetPosSales.mockImplementation((..._args: unknown[]): boolean => true);
		mockCompleteMint.mockImplementation(
			async (..._args: unknown[]): Promise<{ success: boolean; proofs: unknown[]; quote: string; amount: number }> => ({
				success: true,
				proofs: [],
				quote: 'q1',
				amount: 100
			})
		);
		receiveInvoiceOpen.set(false);
	});
	afterEach(() => {
		cleanup();
		receiveInvoiceOpen.set(false);
	});

	it('creates the invoice from bill.totalSat and shows QR + countdown — writes nothing', async () => {
		mockFetch
			.mockResolvedValueOnce(quoteOk())
			.mockResolvedValue(stateOk('UNPAID'));
		render(PosCheckoutLn, { bill: billFixture() });

		// Same NUT-04 POST as Receive:404 — amount from cart, unit sat.
		await screen.findByText('pos.checkout.waiting');
		expect(mockFetch).toHaveBeenCalledTimes(1); // POST landed; first GET still scheduled
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${MINT_URL}/v1/mint/quote/bolt11`);
		expect(JSON.parse(init.body as string)).toEqual({ amount: 100, unit: 'sat' });
		await vi.waitFor(() => {
			expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
		});

		// Amount + countdown on screen.
		expect(screen.getByText('100')).toBeTruthy();
		expect(screen.getByText(/pos.checkout.expires_in/)).toBeTruthy();
		expect(screen.getByText(/\d+:\d{2}/)).toBeTruthy();

		// Paid-first rule: polling is live but nothing is written.
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(mockCompleteMint).not.toHaveBeenCalled();
	});

	it('PAID → mints via the Receive path, recordSale writes once, PosSuccess renders from r.value', async () => {
		let firstGetSeen = false;
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			// Deterministic paid-first proof: while still UNPAID, nothing may be written.
			if (!firstGetSeen) {
				firstGetSeen = true;
				expect(mockSetPosSales).not.toHaveBeenCalled();
				expect(mockCompleteMint).not.toHaveBeenCalled();
				return stateOk('UNPAID') as unknown as Response;
			}
			return stateOk('PAID') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });

		// TASK-5411 R5: Paid pill duplicates the title text (heading + pill).
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		// Same paid call shape as Receive:656 — (mint, quote, amount, keyset, true).
		expect(mockCompleteMint).toHaveBeenCalledTimes(1);
		expect(mockCompleteMint).toHaveBeenCalledWith(MINT_URL, 'q1', 100, 'ks1', true);
		// 5405 handoff: recordSale(input,{existing:getPosSales(),save:setPosSales}) → render r.value.
		expect(mockGetPosSales).toHaveBeenCalled();
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ totalSat: 100, method: 'lightning', refId: 'q1' });
		// Success screen shows the persisted record.
		expect(screen.getByText('100 screen.balance.sats')).toBeTruthy();
		expect(screen.getAllByText('pos.method_lightning').length).toBe(2); // heading-free: pill + facts row (5411)
		expect(screen.getByText('q1')).toBeTruthy();
		// Polling stopped + invoice-open flag down on the paid exit.
		const callsAfter = mockFetch.mock.calls.length;
		await sleep(60);
		expect(mockFetch.mock.calls.length).toBe(callsAfter);
		expect(get(receiveInvoiceOpen)).toBe(false);
	});

	it('server EXPIRED stops polling, keeps the bill, and re-issue mints fresh without writing', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('EXPIRED') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });

		await screen.findByText('pos.checkout.expired');
		expect(mockFetch).toHaveBeenCalledTimes(2); // POST + GET(EXPIRED)
		await sleep(60);
		expect(mockFetch).toHaveBeenCalledTimes(2); // polling stopped — no further GET
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(mockCompleteMint).not.toHaveBeenCalled();
		expect(get(receiveInvoiceOpen)).toBe(false);
		// Bill kept on screen, cart untouched (prop never mutated).
		expect(screen.getByText('100')).toBeTruthy();

		// Re-issue: fresh quote, same bill, still no write.
		await fireEvent.click(screen.getByRole('button', { name: 'pos.checkout.reissue' }));
		await screen.findByText('pos.checkout.waiting');
		await vi.waitFor(() => {
			expect(mockFetch).toHaveBeenCalledTimes(4); // POST#2 + GET#2
		});
		const [, init2] = mockFetch.mock.calls[2] as [string, RequestInit];
		expect(JSON.parse(init2.body as string)).toEqual({ amount: 100, unit: 'sat' });
		expect(screen.getByText('100')).toBeTruthy();
		expect(mockSetPosSales).not.toHaveBeenCalled();
	});

	it('unmount mid-polling stops the poll loop', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('UNPAID') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });
		await screen.findByText('pos.checkout.waiting');

		cleanup();
		const callsAtExit = mockFetch.mock.calls.length;
		expect(callsAtExit).toBeGreaterThanOrEqual(1);
		await sleep(80);
		expect(mockFetch.mock.calls.length).toBe(callsAtExit);
		expect(get(receiveInvoiceOpen)).toBe(false);
	});

	it('local countdown expiry stops polling without any write', async () => {
		// Slow pacing: the 60-poll timeout (60 × 1000ms) must NOT win over
		// the ~2s local expiry — mirrors production where 3s pacing × 60
		// (180s) still loses to a short mint expiry.
		pollDelayMs = 1000;
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11'))
				return quoteOk({ expiry: Math.floor(Date.now() / 1000) + 2 }) as unknown as Response;
			return stateOk('UNPAID') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });

		await screen.findByText('pos.checkout.expired', {}, { timeout: 6000 });
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(mockCompleteMint).not.toHaveBeenCalled();
		expect(screen.queryByText('pos.success.title')).toBeNull();
		expect(get(receiveInvoiceOpen)).toBe(false);
		const callsAtExpiry = mockFetch.mock.calls.length;
		await sleep(60);
		expect(mockFetch.mock.calls.length).toBe(callsAtExpiry);
	});

	it('Pos Charge via Lightning opens checkout; Back returns to the identical bill', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('UNPAID') as unknown as Response;
		});
		render(Pos, {});

		await fireEvent.click(screen.getByRole('button', { name: 'Tea — 50 screen.balance.sats' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.confirm' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.checkout_charge' }));

		await screen.findByText('pos.checkout.waiting');
		expect(screen.getByText('pos.checkout.title')).toBeTruthy();
		expect(mockFetch).toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
		await screen.findByText('pos.bill_confirmed_title: 50 screen.balance.sats');
		expect(mockSetPosSales).not.toHaveBeenCalled();
	});

	it('TASK-5411 R5: awaiting ships Copy + Cancel; Cancel stops polling and keeps the bill', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('UNPAID') as unknown as Response;
		});
		render(Pos, {});

		await fireEvent.click(screen.getByRole('button', { name: 'Tea — 50 screen.balance.sats' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.confirm' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.checkout_charge' }));

		await screen.findByText('pos.checkout.waiting');
		// R5 S3 invoice-actions pair: Copy (secondary) + Cancel (ghost).
		// Scoped: QRDisplay (Receive reuse) owns a separate copy icon.
		const actions = document.querySelector('.invoice-actions');
		expect(actions).toBeTruthy();
		const pair = within(actions as HTMLElement);
		expect(pair.getByRole('button', { name: 'common.copy' })).toBeTruthy();
		expect(pair.getByRole('button', { name: 'common.cancel' })).toBeTruthy();

		const callsBefore = mockFetch.mock.calls.length;
		expect(callsBefore).toBeGreaterThanOrEqual(1);
		await fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
		await screen.findByText('pos.bill_confirmed_title: 50 screen.balance.sats');
		expect(mockSetPosSales).not.toHaveBeenCalled();
		// Polling stopped: after settling, the call count freezes (a
		// straggler in-flight at click time lands in the first window).
		await sleep(40);
		const settled = mockFetch.mock.calls.length;
		await sleep(80);
		expect(mockFetch.mock.calls.length).toBe(settled);
	});
});
