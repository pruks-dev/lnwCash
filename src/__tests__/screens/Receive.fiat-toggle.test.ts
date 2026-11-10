/**
 * Test: Receive.svelte — TASK-5202R fiat input mode (INTENT-052 / mockup option B unit-tap)
 * Single point (lightning only): unit toggle top-right + dual display (D3) +
 * floor conversion + dust/unavailable block (D4/D2) + maxDecimals per decimals.
 * Mint unit stays sat (requestMintQuoteWithUnit unchanged).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import Receive, { zeroSatsDisplay } from '../../screens/Receive.svelte';
import { fiatToSats, parseFiatAmount } from '$lib/fiat/convert';
import { getBtcRate } from '$lib/fiat/rates';

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

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn(),
	getCurrentScreen: () => 'receive',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

const mockGetMintConfig = vi.fn().mockReturnValue({ name: 'Test Mint', url: 'https://test.mint' });
vi.mock('$lib/wallet/store', () => ({
	getMintConfig: (url: string) => mockGetMintConfig(url),
	getActiveMintUrl: () => 'https://mint.lnw.cash',
	setActiveMintUrl: vi.fn(),
	activeMintStore: { subscribe: vi.fn(() => () => {}), set: vi.fn() }
}));

// Controlled rate entry: price set per-test (number | null).
let mockPrice: number | null = 2655537;
let mockStale = false;
vi.mock('$lib/fiat/rates', () => ({
	getBtcRate: vi.fn(async () => ({
		price: mockPrice,
		asOf: mockPrice === null ? null : 1234567890,
		where: 'cache' as const,
		stale: mockStale,
		expired: false
	}))
}));

vi.mock('$lib/fiat/currency', () => ({
	getFiatCurrency: () => 'THB',
	// TASK-5219: == null so a not-yet-loaded entry (undefined price) renders
	// the dash exactly like the real formatFiat — never "NaN THB".
	formatFiat: (sats: number, price: number | null, cur: string) =>
		price == null ? `– ${cur}` : `${(sats * price) / 100_000_000} ${cur}`,
	FIAT_CURRENCY_EVENT: 'lnwcash:fiat-currency'
}));

async function toggleToFiat() {
	// sat mode: aria-label names the TARGET unit (THB); after toggle it
	// flips to the sats key
	const toggle = screen.getByRole('button', { name: 'THB' });
	await fireEvent.click(toggle);
	// async ensureFiatUsable → flush microtasks
	await Promise.resolve();
	await new Promise((r) => setTimeout(r, 0));
}

async function typeNumpad(digits: string) {
	for (const d of digits) {
		const label = d === '.' ? 'Decimal' : d;
		await fireEvent.click(screen.getByRole('button', { name: label }));
	}
}

describe('Receive fiat toggle (TASK-5202R option B)', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		mockPrice = 2655537;
		mockStale = false;
	});
	afterEach(() => cleanup());

	it('lightning point shows a unit toggle in sat mode', async () => {
		const { unmount } = render(Receive, { props: {} });
		// lightning tab is default — toggle visible without tab switch
		expect(screen.getByRole('button', { name: 'THB' })).toBeTruthy();
		expect(screen.getByText('screen.receive.amount')).toBeTruthy();
		unmount();
	});

	it('toggle enters fiat mode and shows floored sats as secondary', async () => {
		render(Receive, { props: {} });
		await toggleToFiat();
		// unit now targets sats again (aria-label flips to the sats key)
		expect(screen.getByRole('button', { name: 'screen.balance.sats' })).toBeTruthy();
		// type 500 (THB) → floor(500e8/2655537) = 18828 sats
		await typeNumpad('500');
		expect(screen.getByText('18,828 screen.balance.sats')).toBeTruthy();
	});

	it('dust in fiat mode blocks invoice with the dust error', async () => {
		render(Receive, { props: {} });
		await toggleToFiat();
		// 0.01 THB → floor = 0 sats → DUST_ZERO_SAT
		await typeNumpad('0.01');
		await fireEvent.click(screen.getByText('screen.receive.create_invoice'));
		expect(screen.getByText('screen.receive.error_fiat_dust')).toBeTruthy();
	});

	it('unavailable rate blocks fiat mode (stays sat + error)', async () => {
		mockPrice = null;
		render(Receive, { props: {} });
		await toggleToFiat();
		expect(screen.getByText('screen.receive.error_fiat_unavailable')).toBeTruthy();
		// still in sat mode
		expect(screen.getByText('screen.receive.amount')).toBeTruthy();
	});

	it('stale rate shows the STALE badge in fiat mode', async () => {
		mockStale = true;
		render(Receive, { props: {} });
		await toggleToFiat();
		expect(screen.getByText('screen.receive.fiat_stale')).toBeTruthy();
	});

	it('convert lib: floor only, JPY 0 decimals, dust blocked (D4)', () => {
		const ok = fiatToSats('500', 'THB', 2655537);
		expect(ok).toMatchObject({ ok: true, sats: 18828 });
		const jpy = fiatToSats('3000', 'JPY', 14_800_000);
		expect(jpy).toMatchObject({ ok: true, sats: 20270 });
		expect(parseFiatAmount('1000.5', 'JPY').ok).toBe(false);
		const dust = fiatToSats('0.01', 'THB', 2655537);
		expect(dust).toMatchObject({ ok: false, code: 'DUST_ZERO_SAT' });
		const noRate = fiatToSats('500', 'THB', null);
		expect(noRate).toMatchObject({ ok: false, code: 'RATE_UNAVAILABLE' });
	});

	it('TASK-5218 ZERO-DISPLAY: fiat 0 shows 0 sats immediately after toggle (no dash)', async () => {
		render(Receive, { props: {} });
		await toggleToFiat();
		// initial input is '0' in fiat mode → secondary must be 0 sats, not dash
		expect(screen.getByText('0 screen.balance.sats')).toBeTruthy();
	});

	it('TASK-5218 zeroSatsDisplay vectors: 0 → 0 sats every currency; non-zero/blank → null (quote path decides)', () => {		// fiat 0 → 0 sats ทุกสกุล (THB/USD/JPY/KRW) + TH/EN sats word
		for (const satsWord of ['sats', 'แซต']) {
			expect(zeroSatsDisplay('0', satsWord)).toBe(`0 ${satsWord}`);
			expect(zeroSatsDisplay('0.00', satsWord)).toBe(`0 ${satsWord}`);
			expect(zeroSatsDisplay('00', satsWord)).toBe(`0 ${satsWord}`);
		}
		// no-entry 0 → same 0 sats: helper runs BEFORE !entry, so entry state
		// never matters for the zero case (no dash even with null entry)
		expect(zeroSatsDisplay('0', 'sats')).toBe('0 sats');
		// non-zero + blank pass through (null) → quote/stale/dust/unavailable
		// labels unchanged: display never pre-empts them
		expect(zeroSatsDisplay('500', 'sats')).toBeNull();
		expect(zeroSatsDisplay('0.01', 'sats')).toBeNull();
		expect(zeroSatsDisplay('', 'sats')).toBeNull();
		expect(zeroSatsDisplay('   ', 'sats')).toBeNull();
	});

	it('TASK-5219 SECONDARY-ALWAYS: mount preloads the rate — sat sub-line shows fiat after resolve (no toggle)', async () => {
		render(Receive, { props: {} });
		// sat mode secondary: formatFiat(0 sats, price) → "0 THB" once the
		// background preload lands (before: "– THB" while entry is null)
		await waitFor(() => {
			expect(screen.getByText('0 THB')).toBeTruthy();
		});
		expect(vi.mocked(getBtcRate)).toHaveBeenCalledTimes(1);
	});

	it('TASK-5219: first toggle after preload issues no extra fetch (cache/single-flight dedup)', async () => {
		render(Receive, { props: {} });
		await waitFor(() => {
			expect(screen.getByText('0 THB')).toBeTruthy();
		});
		expect(vi.mocked(getBtcRate)).toHaveBeenCalledTimes(1);
		await toggleToFiat();
		expect(screen.getByRole('button', { name: 'screen.balance.sats' })).toBeTruthy();
		expect(vi.mocked(getBtcRate)).toHaveBeenCalledTimes(1);
	});

	it('TASK-5219: offline mount keeps the sat sub-line as a dash (entry null → –)', async () => {
		mockPrice = null;
		render(Receive, { props: {} });
		await waitFor(() => {
			expect(vi.mocked(getBtcRate)).toHaveBeenCalled();
		});
		await typeNumpad('210');
		expect(screen.getByText('– THB')).toBeTruthy();
	});
});
