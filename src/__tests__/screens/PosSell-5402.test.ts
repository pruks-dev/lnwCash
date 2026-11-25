/**
 * TASK-5402 (INTENT-054, SELL-UI) — sell screen (#/pos).
 *
 * Covers (catalog/cart domain reuse, SAT display, fiat stack delegation):
 *   - only active (on-sale) products are offered; off-sale hidden.
 *   - tapping a product adds a bill line; +/- edits qty pre-confirm.
 *   - confirm freezes the bill (total SAT + fiat text); clear resets.
 *   - custom SAT amount via Numpad adds a manual line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
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
	getPosCatalog: vi.fn(() => ({
		schema: 1,
		updatedAt: 1,
		items: [
			{ id: 'tea', name: 'Tea', priceSat: 50, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 },
			{ id: 'cake', name: 'Cake', priceSat: 120, kind: 'snack', fiatPriced: false, active: false, updatedAt: 1 }
		]
	}))
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
	getBtcRate: vi.fn(async () => ({ price: 3_000_000, asOf: 1, where: 'cache', stale: false, expired: false }))
}));

describe('TASK-5402 sell screen (#/pos)', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	it('offers only active products; off-sale stays hidden', () => {
		render(Pos, {});
		expect(screen.getByRole('button', { name: 'Tea — 50 screen.balance.sats' })).toBeTruthy();
		expect(screen.queryByText('Cake')).toBeNull();
	});

	it('tap → bill line, + increments, − decrements, confirm freezes, clear resets', async () => {
		render(Pos, {});
		expect(screen.getByText('pos.cart_empty')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Tea — 50 screen.balance.sats' }));
		expect(screen.getByText('pos.total: 50 screen.balance.sats')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'pos.increase' }));
		expect(screen.getByText('pos.total: 100 screen.balance.sats')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'pos.decrease' }));
		expect(screen.getByText('pos.total: 50 screen.balance.sats')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'pos.confirm' }));
		expect(screen.getByRole('status')).toBeTruthy();
		expect(screen.getByText('pos.bill_confirmed_title: 50 screen.balance.sats')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'pos.clear' }));
		expect(screen.getByText('pos.cart_empty')).toBeTruthy();
	});

	it('custom SAT amount via Numpad adds a manual line', async () => {
		render(Pos, {});
		await fireEvent.click(screen.getByRole('button', { name: '2' }));
		await fireEvent.click(screen.getByRole('button', { name: '5' }));
		await fireEvent.click(screen.getByRole('button', { name: 'pos.custom_add' }));
		// Custom line: 25 SAT manual item on top of an empty bill.
		expect(screen.getByText('pos.total: 25 screen.balance.sats')).toBeTruthy();
	});
});
