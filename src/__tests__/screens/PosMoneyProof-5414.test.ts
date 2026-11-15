/**
 * TASK-5414 (INTENT-054, MONEY PROOF) — full money-line proof on the rebuild.
 *
 * LN (PosCheckoutLn.svelte): bill → mint quote → invoice → QRDisplay →
 *   polling → paid → completeMint → recordSale write-first → PosSuccess.
 * Cashu (PosCheckoutCashu.svelte): scan → ur-decode → receiveTokens →
 *   3-way compare (exact/short/over) → recordSale → PosSuccess.
 *
 * Guards proved here (beyond 5403/5404):
 *   - no stuck funds: polling/fetch freezes on EVERY exit
 *     (paid / expired / timeout / unmount / back) + receiveInvoiceOpen down.
 *   - no double-write: repeated PAID polls → 1 mint + 1 sale;
 *     double-click Receive → 1 receiveTokens + 1 sale (5414 fix).
 *   - reject guards: invalid / empty / receive-fail / persist-fail → no
 *     write, no success screen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import PosCheckoutLn from '../../screens/PosCheckoutLn.svelte';
import PosCheckoutCashu, {
	compareCashuPayment,
	cashuTokenRefId
} from '../../screens/PosCheckoutCashu.svelte';
import { receiveInvoiceOpen } from '$lib/stores/receive-invoice';
import { encodeToken, decodeToken, getTokenAmount } from '$lib/cashu/token';
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

// ─── Mock Receive.svelte pacing (fast in tests) ──────────────
let pollDelayMs = 5;
vi.mock('../../screens/Receive.svelte', () => ({
	RECEIVE_POLL_BASE_MS: 5,
	RECEIVE_POLL_MAX_MS: 30,
	applyPollJitter: (d: number) => d,
	nextRateLimitDelay: (c: number) => Math.min(c * 2, 30),
	resetPollDelay: () => pollDelayMs
}));

// ─── Mock wallet/store + mint + autolock + state + errors ─────
vi.mock('$lib/wallet/store', () => ({
	getMintConfig: () => undefined,
	getActiveMintUrl: () => MINT_URL,
	setActiveMintUrl: vi.fn(),
	activeMintStore: {
		subscribe(fn: (v: string) => void) { fn(MINT_URL); return () => {}; },
		set: vi.fn()
	}
}));
const mockCompleteMint = vi.fn(
	async (..._args: unknown[]): Promise<{ success: boolean; proofs: unknown[]; quote: string; amount: number }> => ({
		success: true, proofs: [], quote: 'q1', amount: 100
	})
);
vi.mock('$lib/wallet/mint', () => ({
	completeMint: (...args: unknown[]) => mockCompleteMint(...args)
}));
vi.mock('$lib/wallet/autolock', () => ({
	withTransactionGuard: (fn: () => unknown) => (fn() as Promise<unknown>)
}));
vi.mock('$lib/wallet/state', () => ({
	getPrivateKey: vi.fn(() => '0xdeadbeef'),
	storeSessionPin: vi.fn(),
	unlockWallet: vi.fn()
}));
vi.mock('$lib/wallet/errors', () => ({
	WalletLockedError: class WalletLockedError extends Error {
		constructor() { super('Wallet is locked'); this.name = 'WalletLockedError'; }
	}
}));
vi.mock('$lib/cashu/client', () => ({
	CashuError: class CashuError extends Error {
		status?: number;
		constructor(message: string, status?: number) { super(message); this.name = 'CashuError'; this.status = status; }
	},
	RateLimitedError: class RateLimitedError extends Error {
		retryAfterMs?: number;
		constructor(message: string, retryAfterMs?: number) { super(message); this.name = 'RateLimitedError'; this.retryAfterMs = retryAfterMs; }
	},
	parseRetryAfterMs: () => undefined
}));
const mockFetchAndCacheKeysets = vi.fn(
	async (..._args: unknown[]): Promise<Array<{ id: string; active: boolean }>> => [{ id: 'ks1', active: true }]
);
vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: (...args: unknown[]) => mockFetchAndCacheKeysets(...args)
}));
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
const mockGetPosSales = vi.fn((..._args: unknown[]): unknown[] => []);
const mockSetPosSales = vi.fn((..._args: unknown[]): boolean => true);
vi.mock('$lib/storage/local', () => ({
	getPosSales: (...a: unknown[]) => mockGetPosSales(...a),
	setPosSales: (...a: unknown[]) => mockSetPosSales(...a),
	getPosCatalog: vi.fn(() => ({ schema: 1, updatedAt: 1, items: [] }))
}));
const mockNotifyMintConfirmed = vi.fn();
vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: (...a: unknown[]) => mockNotifyMintConfirmed(...a)
}));

// ─── Mock @agicash/qr-scanner (cashu camera) ─────────────────
const scanEmitters: Array<(data: string) => void> = [];
vi.mock('@agicash/qr-scanner', () => {
	class QrScanner {
		static configureWasm() {}
		constructor(
			_el: unknown,
			cb: (r: { data: string; cornerPoints: unknown[] }) => void,
			_opts: unknown
		) {
			scanEmitters.push((data: string) => cb({ data, cornerPoints: [] }));
		}
		async start(): Promise<void> {}
		stop(): void {}
		destroy(): void {}
	}
	class CameraPermissionError extends Error {}
	class CameraNotFoundError extends Error {}
	return { default: QrScanner, CameraPermissionError, CameraNotFoundError };
});
function emitScan(data: string): void {
	expect(scanEmitters.length).toBeGreaterThan(0);
	scanEmitters[scanEmitters.length - 1](data);
}
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({
	default: 'mock-zxing-reader.wasm'
}));

// ─── Mock wallet/tokenStore (cashu receive boundary) ─────────
const mockReceiveTokens = vi.fn(
	async (token: string): Promise<{ amount: number; mint: string; unit: string; proofCount: number }> => {
		const decoded = decodeToken(token);
		return { amount: getTokenAmount(decoded), mint: decoded.mint, unit: 'sat', proofCount: decoded.proofs.length };
	}
);
vi.mock('$lib/wallet/tokenStore', () => ({
	receiveTokens: (token: string) => mockReceiveTokens(token)
}));

// ─── fetch harness (LN) ──────────────────────────────────────
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function quoteOk(over: Record<string, unknown> = {}) {
	return {
		ok: true, status: 200, headers: { get: () => null },
		json: async () => ({
			quote: 'q1', request: 'lnbc100n1testinvoice', state: 'UNPAID',
			expiry: Math.floor(Date.now() / 1000) + 300, ...over
		})
	};
}
function stateOk(state: string) {
	return {
		ok: true, status: 200, headers: { get: () => null },
		json: async () => ({ state })
	};
}
function billFixture(totalSat = 100): Bill {
	return {
		lines: [{ productId: 'tea', name: 'Tea', unitPriceSat: 50, qty: 2, lineTotalSat: totalSat }],
		totalSat,
		fiat: { currency: 'THB', pricePerBtc: 3_000_000, amount: 0.003, text: '0.01 THB', stale: false, asOf: 1 }
	};
}
function makeToken(amounts: number[]): string {
	const proofs = amounts.map((amount, i) => ({
		id: '009a1f293253e41e', amount,
		secret: `test-secret-${amount}-${i}`, C: `02${String(i).padStart(62, '0')}`
	}));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return encodeToken(proofs as any, MINT_URL, 'sat');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TASK-5414 MONEY PROOF — LN line', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pollDelayMs = 5;
		mockFetch.mockReset();
		mockGetPosSales.mockImplementation((..._args: unknown[]): unknown[] => []);
		mockSetPosSales.mockImplementation((..._args: unknown[]): boolean => true);
		mockCompleteMint.mockImplementation(
			async (..._args: unknown[]): Promise<{ success: boolean; proofs: unknown[]; quote: string; amount: number }> => ({
				success: true, proofs: [], quote: 'q1', amount: 100
			})
		);
		receiveInvoiceOpen.set(false);
	});
	afterEach(() => {
		cleanup();
		receiveInvoiceOpen.set(false);
	});

	it('L1 paid-twice → ONE mint + ONE sale (no double-write), polling frozen, flag down', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('PAID') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(mockCompleteMint).toHaveBeenCalledTimes(1);
		expect(mockCompleteMint).toHaveBeenCalledWith(MINT_URL, 'q1', 100, 'ks1', true);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ totalSat: 100, method: 'lightning', refId: 'q1' });
		// No stuck funds: fetch freezes after paid, invoice-open flag down.
		const callsAfter = mockFetch.mock.calls.length;
		await sleep(80);
		expect(mockFetch.mock.calls.length).toBe(callsAfter);
		expect(mockCompleteMint).toHaveBeenCalledTimes(1);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		expect(get(receiveInvoiceOpen)).toBe(false);
	});

	it('L2 unpaid polling → QR live, NO write (funds not yet arrived)', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('UNPAID') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });
		await screen.findByText('pos.checkout.waiting');
		await vi.waitFor(() => {
			expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
		});
		expect(screen.getByText('100')).toBeTruthy();
		expect(mockCompleteMint).not.toHaveBeenCalled();
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(screen.queryByText('pos.success.title')).toBeNull();
	});

	it('L3 server EXPIRED → polling stops, bill kept, zero writes, flag down', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('EXPIRED') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });
		await screen.findByText('pos.checkout.expired');
		expect(mockFetch).toHaveBeenCalledTimes(2);
		await sleep(60);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(mockCompleteMint).not.toHaveBeenCalled();
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(get(receiveInvoiceOpen)).toBe(false);
	});

	it('L4 60-poll timeout (always UNPAID) → error, polling stops, zero writes', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('UNPAID') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });
		await screen.findByText('pos.checkout.waiting');
		await screen.findByText('screen.receive.error_payment_timeout', {}, { timeout: 15000 });
		expect(mockCompleteMint).not.toHaveBeenCalled();
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(screen.queryByText('pos.success.title')).toBeNull();
		expect(get(receiveInvoiceOpen)).toBe(false);
		const frozen = mockFetch.mock.calls.length;
		await sleep(60);
		expect(mockFetch.mock.calls.length).toBe(frozen);
	});

	it('L5 unmount mid-polling → poll loop dead, flag down (no stuck funds)', async () => {
		mockFetch.mockImplementation(async (url: unknown) => {
			const u = String(url);
			if (u.endsWith('/v1/mint/quote/bolt11')) return quoteOk() as unknown as Response;
			return stateOk('UNPAID') as unknown as Response;
		});
		render(PosCheckoutLn, { bill: billFixture() });
		await screen.findByText('pos.checkout.waiting');
		cleanup();
		const atExit = mockFetch.mock.calls.length;
		expect(atExit).toBeGreaterThanOrEqual(1);
		await sleep(80);
		expect(mockFetch.mock.calls.length).toBe(atExit);
		expect(get(receiveInvoiceOpen)).toBe(false);
	});
});

describe('TASK-5414 MONEY PROOF — Cashu line', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		scanEmitters.length = 0;
		mockGetPosSales.mockImplementation((..._args: unknown[]): unknown[] => []);
		mockSetPosSales.mockImplementation((..._args: unknown[]): boolean => true);
		mockReceiveTokens.mockImplementation(async (token: string) => {
			const decoded = decodeToken(token);
			return { amount: getTokenAmount(decoded), mint: decoded.mint, unit: 'sat', proofCount: decoded.proofs.length };
		});
	});
	afterEach(() => {
		cleanup();
	});

	it('C0 pure 3-way compare: exact / short / over + guards + refId', () => {
		expect(compareCashuPayment(100, 100)).toEqual({ outcome: 'exact', remainingSat: 0, overSat: 0 });
		expect(compareCashuPayment(100, 60)).toEqual({ outcome: 'short', remainingSat: 40, overSat: 0 });
		expect(compareCashuPayment(100, 150)).toEqual({ outcome: 'over', remainingSat: 0, overSat: 50 });
		expect(() => compareCashuPayment(0, 0)).toThrow();
		expect(() => compareCashuPayment(100, -1)).toThrow();
		const t = makeToken([64, 32, 4]);
		expect(cashuTokenRefId(t, 100)).toMatch(/^cashu-100s-[0-9a-f]{8}$/);
		expect(cashuTokenRefId(t, 100)).toBe(cashuTokenRefId(t, 100));
	});

	it('C1 exact 100/100 → one sale of 100 from r.value', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		emitScan(makeToken([64, 32, 4]));
		await screen.findByText('pos.cashu.preview_title');
		expect(mockSetPosSales).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(mockReceiveTokens).toHaveBeenCalledTimes(1);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ totalSat: 100, method: 'cashu' });
		expect(String(saved[0]['refId'])).toMatch(/^cashu-100s-[0-9a-f]{8}$/);
	});

	it('C2 short 60/100 → writes 60 (actual), remaining 40 shown', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		emitScan(makeToken([32, 16, 8, 4]));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved[0]).toMatchObject({ totalSat: 60, method: 'cashu' });
		expect(screen.getByText('pos.cashu.short_note')).toBeTruthy();
	});

	it('C3 over 150/100 → writes 150 (actual), over-kept note, no change', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		emitScan(makeToken([128, 16, 4, 2]));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved[0]).toMatchObject({ totalSat: 150, method: 'cashu' });
		expect(screen.getByText('pos.cashu.over_note')).toBeTruthy();
	});

	it('C4 double-click Receive → ONE receive + ONE sale (5414 no-double-write fix)', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		emitScan(makeToken([64, 32, 4]));
		await screen.findByText('pos.cashu.preview_title');
		const btn = screen.getByRole('button', { name: 'pos.cashu.receive_btn' });
		// Same-tick double tap: both clicks dispatch before re-render.
		const p1 = fireEvent.click(btn);
		const p2 = fireEvent.click(btn);
		await Promise.all([p1, p2]);
		await screen.findAllByText('pos.success.title');
		expect(mockReceiveTokens).toHaveBeenCalledTimes(1);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved).toHaveLength(1);
	});

	it('C5 paste fallback (L-P007) receives without any scan', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		// TASK-5440 rev36: overlay X is hidden in PoS Cashu — hide via the
		// hide-scanner link (same showScanner=false path).
		expect(screen.queryByTestId('qr-scanner-close')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.hide_scanner' }));
		expect(screen.queryByTestId('qr-scanner-video')).toBeNull();
		// Rev34: buttons-only, NO textarea, NO typing — clipboard is the only way in.
		expect(screen.queryByTestId('cashu-paste-input')).toBeNull();
		expect(document.querySelector('textarea')).toBeNull();
		Object.defineProperty(navigator, 'clipboard', {
			value: { readText: vi.fn(async () => makeToken([100])) },
			configurable: true
		});
		await fireEvent.click(screen.getByRole('button', { name: 'common.paste' }));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(mockReceiveTokens).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved[0]).toMatchObject({ totalSat: 100, method: 'cashu' });
	});

	it('C6 invalid + empty guards → error/no-op, no receive, no write', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		emitScan('not-a-cashu-token');
		await screen.findByText('pos.cashu.error_invalid');
		expect(mockReceiveTokens).not.toHaveBeenCalled();
		expect(mockSetPosSales).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.retry_scan' }));
		// Rev34: paste buttons mounted, textarea gone.
		await screen.findByTestId('cashu-paste-btn');
		expect(document.querySelector('textarea')).toBeNull();
		// Empty/whitespace clipboard → error guard (no receive, no write, no success).
		Object.defineProperty(navigator, 'clipboard', {
			value: { readText: vi.fn(async () => '   ') },
			configurable: true
		});
		await fireEvent.click(screen.getByRole('button', { name: 'common.paste' }));
		await screen.findByText('pos.cashu.error_invalid');
		expect(mockReceiveTokens).not.toHaveBeenCalled();
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(screen.queryByText('pos.success.title')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.retry_scan' }));
		await screen.findByTestId('cashu-paste-btn');
		// Invalid clipboard content → error, no receive, no write.
		Object.defineProperty(navigator, 'clipboard', {
			value: { readText: vi.fn(async () => 'not-a-cashu-token') },
			configurable: true
		});
		await fireEvent.click(screen.getByRole('button', { name: 'common.paste' }));
		await screen.findByText('pos.cashu.error_invalid');
		expect(mockReceiveTokens).not.toHaveBeenCalled();
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(screen.queryByText('pos.success.title')).toBeNull();
	});

	it('C7 reject guards: receive-fail and persist-fail → error, never success', async () => {
		mockReceiveTokens.mockRejectedValueOnce(new Error('Swap failed — token may be spent or invalid'));
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		emitScan(makeToken([100]));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));
		await screen.findByText('Swap failed — token may be spent or invalid');
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(screen.queryByText('pos.success.title')).toBeNull();
		cleanup();

		mockSetPosSales.mockImplementation((..._args: unknown[]): boolean => false);
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');
		emitScan(makeToken([100]));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));
		await screen.findByText('could not persist sale');
		expect(screen.queryByText('pos.success.title')).toBeNull();
	});
});
