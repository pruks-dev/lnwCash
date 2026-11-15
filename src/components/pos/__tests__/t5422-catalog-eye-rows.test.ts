/**
 * TASK-5422 rev27 catalog-eye — FRESH proof tests (no reuse of any prior suite).
 * Truth: Commander rev27 MUST_DO 6 items (R5-only, fixforward catalog_eye_r27).
 *
 * This file: items 2+3+4 (row format, stepper, Bill CTA) + pos-ui unit pins.
 * - row: "2,100 SAT (≈ 63.00 THB)" — parens + ≈ lead, NO "· R=" suffix
 * - stepper: "- qty +" per row verbatim Bill pattern, 44px, qty incl. 0 visible
 * - CTA: taller (56px) + "Bill N items T SAT (fiat)" — NO •/· separators
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import fs from 'node:fs';
import path from 'node:path';
import PosCatalog from '../PosCatalog.svelte';
import { fiatRowText, billCtaText } from '$lib/pos-ui';
import type { PosProduct } from '$lib/pos/catalog';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

afterEach(() => cleanup());

const PRODUCTS: PosProduct[] = [
	{ id: 'thai-tea', name: 'Thai Tea', priceSat: 200, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 },
	{ id: 'coffee', name: 'Coffee', priceSat: 1800, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 }
];

function catalogProps(over: Record<string, unknown> = {}) {
	return {
		products: PRODUCTS,
		fiatFor: (s: number) => `≈ ${(s * 0.315).toFixed(2)} THB`,
		cartCount: 0,
		cartTotalSat: 0,
		cartFiat: '≈ 0.00 THB',
		qtyFor: (_id: string) => 0,
		onInc: vi.fn(),
		onDec: vi.fn(),
		onOpenBill: vi.fn(),
		onOpenManage: vi.fn(),
		onOpenHistory: vi.fn(),
		...over
	};
}

describe('5422 eye-2 — row text "200 SAT (≈ 63.00 THB)", no · R=', () => {
	it('subtitle wraps fiat in parens with ≈ lead; R= gone everywhere', () => {
		render(PosCatalog, { props: catalogProps() });
		const fiats = screen.getAllByTestId('catalog-fiat');
		expect(fiats).toHaveLength(2);
		expect(fiats[0].textContent).toContain('200 SAT (≈ 63.00 THB)');
		expect(fiats[1].textContent).toContain('1,800 SAT (≈');
		for (const f of fiats) {
			expect(f.textContent).not.toContain('R=');
			expect(f.textContent).not.toContain('·');
			expect(f.textContent).not.toContain('•');
		}
	});

	it('fiatRowText unit: ≈ + formatted fiat, never R=; null rate → – CUR', () => {
		// 200 SAT @ 3,000,000 THB/BTC = 6.00 THB (real fiat-stack math)
		expect(fiatRowText(200, 'THB', { price: 3000000 } as never)).toBe('≈ 6.00 THB');
		expect(fiatRowText(200, 'THB', { price: 3000000 } as never)).not.toContain('R=');
		expect(fiatRowText(200, 'THB', null)).toBe('– THB');
		expect(fiatRowText(200, 'THB', { price: NaN } as never)).toBe('– THB');
	});
});

describe('5422 eye-3 — stepper "- qty +" per row, qty incl. 0 visible', () => {
	it('no +Add-only button; every row carries dec/qty/inc with pending count', async () => {
		const onInc = vi.fn();
		const onDec = vi.fn();
		render(
			PosCatalog,
			{
				props: catalogProps({
					qtyFor: (id: string) => (id === 'thai-tea' ? 2 : 0),
					onInc,
					onDec
				})
			}
		);
		expect(screen.queryByTestId('catalog-add')).toBeNull();
		expect(screen.getAllByTestId('catalog-dec')).toHaveLength(2);
		expect(screen.getAllByTestId('catalog-inc')).toHaveLength(2);
		const qtys = screen.getAllByTestId('catalog-qty');
		expect(qtys.map((q) => q.textContent)).toEqual(['2', '0']);
		await fireEvent.click(screen.getAllByTestId('catalog-inc')[1]);
		expect(onInc).toHaveBeenCalledWith('coffee');
		await fireEvent.click(screen.getAllByTestId('catalog-dec')[0]);
		expect(onDec).toHaveBeenCalledWith('thai-tea');
	});

	it('stepper buttons are 44px touch targets (Bill-verbatim CSS contract)', () => {
		const { container } = render(PosCatalog, { props: catalogProps() });
		const css = fs.readFileSync(
			path.join(__dirname, '..', 'PosCatalog.svelte'),
			'utf8'
		);
		const stepperBlock = css.slice(css.indexOf('.stepper button'));
		expect(stepperBlock).toContain('width: 44px');
		expect(stepperBlock).toContain('height: 44px');
		expect(container.querySelector('.stepper')).toBeTruthy();
	});
});

describe('5422 eye-4 — Bill CTA taller + "Bill N items T SAT (fiat)", no •', () => {
	it('label carries count + total + fiat-paren; separators are spaces only', () => {
		render(
			PosCatalog,
			{
				props: catalogProps({
					cartCount: 2,
					cartTotalSat: 400,
					cartFiat: '≈ 126.00 THB'
				})
			}
		);
		const bill = screen.getByTestId('catalog-bill');
		expect(bill.textContent).toContain('Order 2 items 400 SAT (≈ 126.00 THB)');
		expect(bill.textContent).not.toContain('·');
		expect(bill.textContent).not.toContain('•');
	});

	it('CTA is taller touch (56px class contract)', () => {
		const { container } = render(PosCatalog, { props: catalogProps() });
		const css = fs.readFileSync(
			path.join(__dirname, '..', 'PosCatalog.svelte'),
			'utf8'
		);
		const ctaBlock = css.slice(css.indexOf('.catalog-bill'));
		expect(ctaBlock).toContain('min-height: 56px');
		expect(container.querySelector('[data-testid="catalog-bill"].catalog-bill')).toBeTruthy();
	});

	it('billCtaText unit: spaces only, fiat in parens, singular/plural', () => {
		expect(billCtaText(2, 400, '≈ 126.00 THB')).toBe('Order 2 items 400 SAT (≈ 126.00 THB)');
		expect(billCtaText(1, 200, '≈ 63.00 THB')).toBe('Order 1 item 200 SAT (≈ 63.00 THB)');
		expect(billCtaText(0, 0, '– THB')).toBe('Order 0 items 0 SAT (– THB)');
		for (const label of [
			billCtaText(2, 400, '≈ 126.00 THB'),
			billCtaText(1, 200, '≈ 63.00 THB')
		]) {
			expect(label).not.toContain('·');
			expect(label).not.toContain('•');
		}
	});
});
