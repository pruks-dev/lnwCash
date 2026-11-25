/**
 * TASK-5404 (INTENT-054, CHECKOUT-CASHU) — Cashu checkout for a frozen bill.
 *
 * Covers (reuse read-only + paid-first write):
 *   - pure 3-way compare (compareCashuPayment exact/short/over + guards)
 *     and deterministic token refId (cashuTokenRefId).
 *   - scanner path: QRScanner onDecode (static token) → preview (amount /
 *     mint / proofs + bill total) → Receive → receiveTokens (same wallet) →
 *     recordSale writes ONCE with what actually entered → PosSuccess from
 *     r.value. Nothing written before receive (preview asserts no write).
 *   - 3-way bill reconciliation: exact (100/100) writes 100; short (60/100)
 *     writes 60 + remaining 40 + "Receive remaining" re-opens scan, second
 *     receipt (40) writes its own partial sale; over (150/100) writes 150
 *     with the over-kept note (no change v1).
 *   - paste fallback (L-P007): scanner X hides camera, clipboard Paste
 *     (buttons-only, no textarea) validates + receives without any scan;
 *     invalid token → error, no write.
 *   - receive failure / persist failure → error, no success screen.
 *   - Pos.svelte connection: Accept Cashu opens the cashu checkout, Back
 *     returns to the identical bill; Charge via Lightning still opens the
 *     5403 LN checkout (wiring intact).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PosCheckoutCashu, {
	compareCashuPayment,
	cashuTokenRefId
} from '../../screens/PosCheckoutCashu.svelte';
import Pos from '../../screens/Pos.svelte';
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

// ─── Mock @agicash/qr-scanner (controllable camera) ──────────
// QRScanner.svelte constructs `new QrScanner(videoEl, handleResult, opts)`.
// The stub records every decode callback so tests can emit camera scans
// (static tokens AND ur: fragments route through the real handleResult +
// the real ur-decoder wrapper — nothing in the reuse chain is bypassed).
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

// ─── Mock wasm url (QRScanner ?url import) ───────────────────
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({
	default: 'mock-zxing-reader.wasm'
}));

// ─── Mock Receive.svelte pacing (PosCheckoutLn module import) ─
vi.mock('../../screens/Receive.svelte', () => ({
	RECEIVE_POLL_BASE_MS: 5,
	RECEIVE_POLL_MAX_MS: 30,
	applyPollJitter: (d: number) => d,
	nextRateLimitDelay: (c: number) => Math.min(c * 2, 30),
	resetPollDelay: () => 5
}));

// ─── Mock wallet/tokenStore (receiveTokens only — SUT boundary) ─
const mockReceiveTokens = vi.fn(
	async (token: string): Promise<{ amount: number; mint: string; unit: string; proofCount: number }> => {
		const decoded = decodeToken(token);
		return {
			amount: getTokenAmount(decoded),
			mint: decoded.mint,
			unit: 'sat',
			proofCount: decoded.proofs.length
		};
	}
);
vi.mock('$lib/wallet/tokenStore', () => ({
	receiveTokens: (token: string) => mockReceiveTokens(token)
}));

// ─── Mock storage/local (5405 handoff + Pos catalog) ─────────
// getPosSales/setPosSales simulate the real localStorage round-trip: the
// store accumulates across calls so multi-receipt sessions (short top-up)
// see the previously persisted sales, exactly like production.
let posSalesStore: unknown[] = [];
const mockGetPosSales = vi.fn((..._args: unknown[]): unknown[] => [...posSalesStore]);
const mockSetPosSales = vi.fn((..._args: unknown[]): boolean => {
	posSalesStore = [...(( _args[0] as unknown[]) ?? [])];
	return true;
});
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

// ─── Fixtures (real NUT-00 tokens, offline encode) ───────────
function makeToken(amounts: number[]): string {
	const proofs = amounts.map((amount, i) => ({
		id: '009a1f293253e41e',
		amount,
		secret: `test-secret-${amount}-${i}`,
		C: `02${String(i).padStart(62, '0')}`
	}));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return encodeToken(proofs as any, MINT_URL, 'sat');
}

function billFixture(totalSat = 100): Bill {
	// TASK-5704-FIX (F-5704-01): v3 truth-pair BillLine (no stored-sats fields).
	return {
		lines: [{ productId: 'tea', name: 'Tea', currency: 'SAT', amount: 50, unitSats: 50, qty: 2, lineTotalSat: 100, rate: null }],
		totalSat,
		fiat: { currency: 'THB', pricePerBtc: 3_000_000, amount: 0.003, text: '0.01 THB', stale: false, asOf: 1 }
	};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TASK-5404 checkout-Cashu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		scanEmitters.length = 0;
		posSalesStore = [];
		mockGetPosSales.mockImplementation((..._args: unknown[]): unknown[] => [...posSalesStore]);
		mockSetPosSales.mockImplementation((..._args: unknown[]): boolean => {
			posSalesStore = [...((_args[0] as unknown[]) ?? [])];
			return true;
		});
		mockReceiveTokens.mockImplementation(async (token: string) => {
			const decoded = decodeToken(token);
			return {
				amount: getTokenAmount(decoded),
				mint: decoded.mint,
				unit: 'sat',
				proofCount: decoded.proofs.length
			};
		});
	});
	afterEach(() => {
		cleanup();
	});

	it('pure compare: exact / short / over + guards', () => {
		expect(compareCashuPayment(100, 100)).toEqual({ outcome: 'exact', remainingSat: 0, overSat: 0 });
		expect(compareCashuPayment(100, 60)).toEqual({ outcome: 'short', remainingSat: 40, overSat: 0 });
		expect(compareCashuPayment(100, 150)).toEqual({ outcome: 'over', remainingSat: 0, overSat: 50 });
		expect(compareCashuPayment(1, 0)).toEqual({ outcome: 'short', remainingSat: 1, overSat: 0 });
		expect(() => compareCashuPayment(0, 0)).toThrow();
		expect(() => compareCashuPayment(100, -1)).toThrow();
	});

	it('token refId: deterministic cashu-<amount>s-<hash8>', () => {
		const token = makeToken([64, 32, 4]);
		const a = cashuTokenRefId(token, 100);
		expect(a).toMatch(/^cashu-100s-[0-9a-f]{8}$/);
		expect(cashuTokenRefId(token, 100)).toBe(a);
		expect(cashuTokenRefId(makeToken([50]), 50)).not.toBe(a);
	});

	it('scan exact 100/100: preview shows amount, receive writes 100, PosSuccess from r.value', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');

		emitScan(makeToken([64, 32, 4]));
		await screen.findByText('pos.cashu.preview_title');
		// Preview amount row + bill total row both read 100 (pre-receive).
		expect(screen.getAllByText('100 screen.balance.sats').length).toBeGreaterThanOrEqual(2);
		// Preview is pre-receive: nothing written, nothing received.
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(mockReceiveTokens).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));
		// TASK-5411 R5: Paid pill duplicates the title text (heading + pill).
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);

		expect(mockReceiveTokens).toHaveBeenCalledTimes(1);
		expect(mockGetPosSales).toHaveBeenCalled();
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ totalSat: 100, method: 'cashu' });
		expect(String(saved[0]['refId'])).toMatch(/^cashu-100s-[0-9a-f]{8}$/);
		expect(screen.getAllByText('pos.method_cashu').length).toBe(2); // pill + facts row (5411)
	});

	it('scan short 60/100: writes actual 60, shows remaining 40, top-up scan writes 40', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');

		emitScan(makeToken([32, 16, 8, 4])); // 60
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));

		// TASK-5411 R5: Paid pill duplicates the title text (heading + pill).
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		let saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		// Short writes what actually entered — NOT the bill total.
		expect(saved[0]).toMatchObject({ totalSat: 60, method: 'cashu' });
		expect(screen.getByText('pos.cashu.short_note')).toBeTruthy();
		expect(screen.getByText(/pos\.cashu\.remaining_label/)).toBeTruthy();
		// TASK-5411 R5 risk-a: UNDER status pill heads the short banner.
		expect(screen.getByText('pos.cashu.short_pill')).toBeTruthy();

		// Top-up: receive the remainder in a second scan → own partial sale.
		await fireEvent.click(screen.getByRole('button', { name: /pos.cashu.receive_more/ }));
		await screen.findByTestId('qr-scanner-video');
		emitScan(makeToken([32, 8])); // 40
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));

		await vi.waitFor(() => {
			expect(mockSetPosSales).toHaveBeenCalledTimes(2);
		});
		saved = mockSetPosSales.mock.calls[1][0] as unknown as Array<Record<string, unknown>>;
		expect(saved).toHaveLength(2);
		expect(saved[1]).toMatchObject({ totalSat: 40, method: 'cashu' });
		// Cumulative 100/100 — short banner is gone.
		expect(screen.queryByText('pos.cashu.short_note')).toBeNull();
		expect(screen.getAllByText('pos.success.title').length).toBe(2); // heading + Paid pill (5411)
	});

	it('scan over 150/100: writes actual 150, over-kept note, no change', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');

		emitScan(makeToken([128, 16, 4, 2])); // 150
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));

		// TASK-5411 R5: Paid pill duplicates the title text (heading + pill).
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(mockSetPosSales).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		// Over writes what actually entered the wallet — no auto-change v1.
		expect(saved[0]).toMatchObject({ totalSat: 150, method: 'cashu' });
		expect(screen.getByText('pos.cashu.over_note')).toBeTruthy();
		// TASK-5411 R5 risk-a: OVER status pill heads the over banner.
		expect(screen.getByText('pos.cashu.over_pill')).toBeTruthy();
		expect(screen.queryByText('pos.cashu.short_note')).toBeNull();
	});

	it('paste fallback (L-P007): hide-scanner hides camera, clipboard Paste receives without scan', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');

		// Camera killed → hide-scanner falls back to Paste buttons, never forces a scan.
		// TASK-5440 rev36: the overlay X is hidden in PoS Cashu (hideClose) —
		// the hide-scanner link (same showScanner=false path) + header back
		// own the exit now. Rev34: buttons-only, NO textarea, NO typing —
		// clipboard is the only way in.
		expect(screen.queryByTestId('qr-scanner-close')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.hide_scanner' }));
		expect(screen.queryByTestId('qr-scanner-video')).toBeNull();
		expect(screen.queryByTestId('cashu-paste-input')).toBeNull();
		expect(document.querySelector('textarea')).toBeNull();
		expect(screen.getByTestId('cashu-paste-btn')).toBeTruthy();
		expect(screen.getByTestId('cashu-confirm-btn')).toBeTruthy();

		Object.defineProperty(navigator, 'clipboard', {
			value: { readText: vi.fn(async () => makeToken([100])) },
			configurable: true
		});
		await fireEvent.click(screen.getByRole('button', { name: 'common.paste' }));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));

		// TASK-5411 R5: Paid pill duplicates the title text (heading + pill).
		expect((await screen.findAllByText('pos.success.title')).length).toBe(2);
		expect(scanEmitters.length).toBeGreaterThanOrEqual(1);
		expect(mockReceiveTokens).toHaveBeenCalledTimes(1);
		const saved = mockSetPosSales.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
		expect(saved[0]).toMatchObject({ totalSat: 100, method: 'cashu' });
	});

	it('invalid token: error, no receive, no write — Try again returns to scan', async () => {
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');

		emitScan('not-a-cashu-token');
		await screen.findByText('pos.cashu.error_invalid');
		expect(mockReceiveTokens).not.toHaveBeenCalled();
		expect(mockSetPosSales).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.retry_scan' }));
		await screen.findByTestId('cashu-paste-btn');
		expect(mockSetPosSales).not.toHaveBeenCalled();
	});

	it('receive failure: error banner, no write, no success screen', async () => {
		mockReceiveTokens.mockRejectedValueOnce(new Error('Swap failed — token may be spent or invalid'));
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');

		emitScan(makeToken([100]));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));

		await screen.findByText('Swap failed — token may be spent or invalid');
		expect(mockSetPosSales).not.toHaveBeenCalled();
		expect(screen.queryByText('pos.success.title')).toBeNull();
	});

	it('persist failure: recordSale PERSIST_FAIL → error, never shows success', async () => {
		mockSetPosSales.mockImplementation((..._args: unknown[]): boolean => false);
		render(PosCheckoutCashu, { bill: billFixture() });
		await screen.findByTestId('qr-scanner-video');

		emitScan(makeToken([100]));
		await screen.findByText('pos.cashu.preview_title');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.cashu.receive_btn' }));

		await screen.findByText('could not persist sale');
		expect(screen.queryByText('pos.success.title')).toBeNull();
	});

	it('Pos Accept Cashu opens cashu checkout; Back returns to the identical bill', async () => {
		render(Pos, {});
		await fireEvent.click(screen.getByRole('button', { name: 'Tea — 50 screen.balance.sats' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.confirm' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.checkout_accept_cashu' }));

		await screen.findByText('pos.cashu.title');
		expect(screen.getByText('pos.cashu.scan_hint')).toBeTruthy();
		expect(mockSetPosSales).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
		await screen.findByText('pos.bill_confirmed_title: 50 screen.balance.sats');
		expect(mockSetPosSales).not.toHaveBeenCalled();
		await sleep(20);
		expect(mockSetPosSales).not.toHaveBeenCalled();
	});

	it('5403 wiring intact: Charge via Lightning still opens the LN checkout', async () => {
		const { unmount } = render(Pos, {});
		await fireEvent.click(screen.getByRole('button', { name: 'Tea — 50 screen.balance.sats' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.confirm' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.checkout_charge' }));

		// LN checkout (5403) renders its own title — cashu title must NOT appear.
		await screen.findByText('pos.checkout.title');
		expect(screen.queryByText('pos.cashu.title')).toBeNull();
		unmount();
	});
});
