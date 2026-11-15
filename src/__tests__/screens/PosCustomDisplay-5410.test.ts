/**
 * TASK-5410 (INTENT-054 fixforward) — CUSTOM-DISPLAY live preview.
 *
 * Covers (wallet Numpad pattern reuse — Receive .amount-display):
 *   - PosManage: typing the Numpad price updates the preview instantly
 *     (no blur/confirm wait).
 *   - Pos custom: sat mode typing updates primary + fiat secondary instantly;
 *     fiat mode typing updates the sats secondary via fiatPriceToSats
 *     (cart domain → convert.ts floor/dust, no local math).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import PosManage from '../../screens/PosManage.svelte';
import Pos from '../../screens/Pos.svelte';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) { fn('en'); return () => {}; },
			set() {}
		},
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn()
}));

vi.mock('$lib/storage/local', () => ({
	getPosCatalog: vi.fn(() => ({ schema: 1, updatedAt: 1, items: [] })),
	setPosCatalog: vi.fn(() => true)
}));

vi.mock('$lib/fiat/currency', () => ({
	getFiatCurrency: vi.fn(() => 'THB'),
	satsToFiat: vi.fn((sats: number, price: number) => (sats * price) / 100_000_000),
	formatFiat: vi.fn((sats: number, price: number | null, cur: string) =>
		price == null ? `– ${cur}` : `${((sats * price) / 100_000_000).toFixed(2)} ${cur}`
	),
	FIAT_CURRENCY_EVENT: 'lnwcash:fiat-currency'
}));

vi.mock('$lib/fiat/rates', () => ({
	getBtcRate: vi.fn(async () => ({ price: 2_655_537, asOf: 1, where: 'cache', stale: false, expired: false }))
}));

async function typeNumpad(digits: string) {
	for (const d of digits) {
		const label = d === '.' ? 'Decimal' : d;
		await fireEvent.click(screen.getByRole('button', { name: label }));
	}
}

describe('TASK-5410 custom live display', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	it('PosManage: Numpad typing updates the price preview instantly (no confirm)', async () => {
		render(PosManage, {});
		const preview = screen.getByTestId('pos-manage-price-preview');
		expect(preview.textContent).toContain('0');
		// Type 5 → preview shows 5 immediately, before any confirm.
		await fireEvent.click(screen.getByRole('button', { name: '5' }));
		expect(screen.getByTestId('pos-manage-price-preview').textContent).toContain('5');
		// Type 0 → preview shows 50 immediately.
		await fireEvent.click(screen.getByRole('button', { name: '0' }));
		expect(screen.getByTestId('pos-manage-price-preview').textContent).toContain('50');
	});

	it('Pos custom SAT: typing updates primary + fiat secondary instantly (no confirm)', async () => {
		render(Pos, {});
		expect(screen.getByTestId('pos-custom-preview').textContent).toContain('0');
		await typeNumpad('25');
		// Primary shows the typed digits instantly — no add/blur/confirm.
		expect(screen.getByTestId('pos-custom-preview').textContent).toContain('25');
		// Secondary (sat→fiat via formatFiat mock) updates on the same keystroke.
		expect(screen.getByTestId('pos-custom-secondary').textContent).not.toContain('– THB');
	});

	it('Pos custom FIAT: typing updates the sats secondary live via convert stack', async () => {
		render(Pos, {});
		// Switch to fiat mode (resets input to '0' → zero-display, never dash).
		await fireEvent.click(screen.getByRole('button', { name: 'pos.custom_mode_fiat (THB)' }));
		await waitFor(() => {
			expect(screen.getByTestId('pos-custom-secondary').textContent).toContain(
				'0 screen.balance.sats'
			);
		});
		// Type 500 THB → floor(500e8/2655537) = 18,828 sats via fiatPriceToSats.
		await typeNumpad('500');
		await waitFor(() => {
			expect(screen.getByTestId('pos-custom-secondary').textContent).toContain('18,828');
		});
		expect(screen.getByTestId('pos-custom-preview').textContent).toContain('500');
	});
});
