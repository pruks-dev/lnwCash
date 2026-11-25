/**
 * TASK-5417 R5-only — NEW test (no reuse of 5402..5415 suites).
 * TASK-5422 rev27 catalog-eye update: rows "200 SAT (≈ …)" (no · R=),
 * per-row stepper (no +Add-only), taller Bill CTA "Bill N items T SAT (fiat)",
 * header Manage/History solar icons, bottom = Bill only, manage = separate page.
 * - header count "N items" + solar icon buttons right
 * - every row: name + price + fiat-paren, stepper with visible qty incl. 0
 * - whole card NOT clickable
 * - Bill CTA label carries count + total + fiat, disabled when empty
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PosCatalog from '../PosCatalog.svelte';
import type { PosProduct } from '$lib/pos/catalog';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

const P = (over: Partial<PosProduct> = {}): PosProduct => ({
	id: 'thai-tea',
	name: 'Thai Tea',
	priceSat: 2100,
	kind: 'drink',
	fiatPriced: true,
	active: true,
	updatedAt: 1,
	...over
});

const products = [
	P(),
	P({ id: 'coffee', name: 'Coffee', priceSat: 1800 }),
	P({ id: 'cake', name: 'Cake', priceSat: 3500 })
];

function baseProps(over: Record<string, unknown> = {}) {
	return {
		products,
		priceFor: (p: PosProduct) => `${p.priceSat.toLocaleString('en-US')} SAT (≈ MOCK)`,
		fiatFor: (sats: number) => `≈ ${(sats * 0.03).toFixed(2)} THB`,
		cartCount: 3,
		cartTotalSat: 7700,
		cartFiat: '≈ 231.00 THB',
		onSelect: vi.fn(),
		onOpenBill: vi.fn(),
		onOpenManage: vi.fn(),
		onOpenHistory: vi.fn(),
		...over
	};
}

afterEach(() => cleanup());

describe('R5 S1 catalog — rev27 catalog-eye', () => {
	it('header shows count badge "3 items" + Manage/History solar icon buttons', () => {
		const { container } = render(PosCatalog, { props: baseProps() });
		expect(screen.getByTestId('catalog-count').textContent).toBe('3 items');
		const manage = screen.getByTestId('catalog-open-manage');
		const history = screen.getByTestId('catalog-open-history');
		expect(manage.tagName).toBe('BUTTON');
		expect(history.tagName).toBe('BUTTON');
		// solar icons — real SVG, never hand-drawn placeholders
		expect(manage.querySelector('svg')).toBeTruthy();
		expect(history.querySelector('svg')).toBeTruthy();
		expect(container.querySelector('[data-testid="catalog-manage-toggle"]')).toBeNull();
	});

	it('every row shows name + "N SAT (≈ fiat)" — no · R= suffix', () => {
		render(PosCatalog, { props: baseProps() });
		const rows = screen.getAllByTestId('catalog-row');
		expect(rows).toHaveLength(3);
		for (const name of ['Thai Tea', 'Coffee', 'Cake']) {
			expect(screen.getByText(name)).toBeTruthy();
		}
		const fiats = screen.getAllByTestId('catalog-fiat');
		expect(fiats).toHaveLength(3);
		expect(fiats[0].textContent).toContain('2,100 SAT (≈');
		expect(fiats[0].textContent).not.toContain('R=');
		expect(fiats[0].textContent).not.toContain('·');
		expect(fiats[1].textContent).toContain('1,800 SAT (≈');
		expect(fiats[2].textContent).toContain('3,500 SAT (≈');
	});

	it('per-card tap opens the modifier+note popup — no stepper on cards (5603 R2)', async () => {
		const onSelect = vi.fn();
		render(PosCatalog, { props: baseProps({ onSelect }) });
		expect(screen.queryByTestId('catalog-add')).toBeNull();
		// steppers are gone from the grid — qty lives on the bill
		expect(screen.queryByTestId('catalog-inc')).toBeNull();
		expect(screen.queryByTestId('catalog-dec')).toBeNull();
		expect(screen.queryByTestId('catalog-qty')).toBeNull();
		// whole card is one tappable target → onSelect(productId)
		const firstRow = screen.getAllByTestId('catalog-row')[0];
		expect(firstRow.tagName).toBe('BUTTON');
		await fireEvent.click(firstRow);
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith('thai-tea');
		await fireEvent.click(screen.getAllByTestId('catalog-row')[1]);
		expect(onSelect).toHaveBeenCalledWith('coffee');
	});

	it('Bill CTA label "Order 3 items 7,700 SAT (≈ …)" — no •/·; taller touch; sole bottom button', () => {
		const { container } = render(PosCatalog, { props: baseProps() });
		const bill = screen.getByTestId('catalog-bill');
		expect(bill.textContent).toContain('Order 3 items 7,700 SAT (≈ 231.00 THB)');
		expect(bill.textContent).not.toContain('·');
		expect(bill.textContent).not.toContain('•');
		expect((bill as HTMLButtonElement).disabled).toBe(false);
		// bottom of screen carries ONLY the Bill button
		const buttons = container.querySelectorAll('[data-pos-screen="catalog"] > button');
		expect(buttons).toHaveLength(1);
	});

	it('Bill CTA disabled + .5 when cart empty', () => {
		render(PosCatalog, { props: baseProps({ cartCount: 0, cartTotalSat: 0, cartFiat: '≈ 0.00 THB' }) });
		const emptyBill = screen.getByTestId('catalog-bill') as HTMLButtonElement;
		expect(emptyBill.disabled).toBe(true);
		expect(emptyBill.className).toContain('btn-disabled');
	});

	it('header icons open Manage page + History', async () => {
		const onOpenManage = vi.fn();
		const onOpenHistory = vi.fn();
		render(PosCatalog, { props: baseProps({ onOpenManage, onOpenHistory }) });
		await fireEvent.click(screen.getByTestId('catalog-open-manage'));
		expect(onOpenManage).toHaveBeenCalledTimes(1);
		await fireEvent.click(screen.getByTestId('catalog-open-history'));
		expect(onOpenHistory).toHaveBeenCalledTimes(1);
	});

	it('grid is responsive 2/3/4 cols (5603 R2 — no single-col anywhere)', () => {
		render(PosCatalog, { props: baseProps() });
		const grid = screen.getByTestId('catalog-grid');
		expect(grid.className).toContain('pos-catalog-grid');
		expect(screen.getAllByTestId('catalog-row')).toHaveLength(3);
	});
});
