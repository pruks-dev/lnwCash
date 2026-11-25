/**
 * TASK-5603 — scoped vitest for grid catalog + tap-to-popup cards
 * (INTENT-056 BLUEPRINT-056 v2, approved mockup 1/3 R2).
 * Run scoped ONLY (L-P033 — never bare vitest).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
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

const here = dirname(fileURLToPath(import.meta.url));
function src(name: string): string {
	return readFileSync(resolve(here, '..', name), 'utf-8');
}

const now = 1_790_000_000_000;
const products: PosProduct[] = [
	{ id: 'latte', name: 'Latte', priceSat: 200, kind: 'drink', fiatPriced: true, active: true, updatedAt: now },
	{ id: 'tea', name: 'Tea', priceSat: 2100, kind: 'snack', fiatPriced: true, active: true, updatedAt: now }
];

function props(over: Record<string, unknown> = {}) {
	return {
		products,
		priceFor: (p: PosProduct) => `${p.priceSat} SAT (≈ MOCK)`,
		cartCount: 0,
		cartTotalSat: 0,
		cartFiat: '– THB',
		onSelect: vi.fn(),
		onOpenBill: vi.fn(),
		onOpenManage: vi.fn(),
		onOpenHistory: vi.fn(),
		...over
	};
}

afterEach(() => cleanup());

describe('5603 grid — responsive columns, no single-col', () => {
	it('base 2 cols → ≥640px 3 → ≥1024px 4; 1fr single-col is gone', () => {
		const css = src('PosCatalog.svelte');
		expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
		expect(css).toContain('@media (min-width: 640px)');
		expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
		expect(css).toContain('@media (min-width: 1024px)');
		expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
		expect(css).not.toContain('grid-template-columns: 1fr;');
	});

	it('TASK-5608 narrow fix — no bare 1fr tracks (minmax(auto,1fr) skewed cols <420-430px)', () => {
		const css = src('PosCatalog.svelte');
		expect(css).not.toContain('grid-template-columns: 1fr 1fr;');
		expect(css).not.toContain('grid-template-columns: 1fr 1fr 1fr;');
		expect(css).not.toContain('grid-template-columns: 1fr 1fr 1fr 1fr;');
	});

	it('TASK-5608 narrow fix — .card grid item carries min-width: 0 (shrinks below content min-width)', () => {
		const css = src('PosCatalog.svelte');
		const cardRule = css.match(/\.card\s*\{[^}]*\}/s);
		expect(cardRule, '.card rule present').toBeTruthy();
		expect(cardRule![0]).toMatch(/min-width:\s*0/);
	});

	it('frame is the 5604 wide frame: phone 480 → ≥640px 720 → ≥1024px 960 (mockup 3/3 R4)', () => {
		const css = src('PosCatalog.svelte');
		expect(css).toContain('max-width: 480px');
		expect(css).toContain('max-width: 720px');
		expect(css).toContain('max-width: 960px');
	});

	it('renders one tappable card per product inside a single grid', () => {
		render(PosCatalog, { props: props() });
		expect(screen.getByTestId('catalog-grid')).toBeTruthy();
		const rows = screen.getAllByTestId('catalog-row');
		expect(rows).toHaveLength(2);
		for (const r of rows) expect(r.tagName).toBe('BUTTON');
	});
});

describe('5603 cards — photo + name + price, no stepper, tap opens popup', () => {
	it('card shows name + price text; no stepper anywhere on the card', () => {
		render(PosCatalog, { props: props() });
		const rows = screen.getAllByTestId('catalog-row');
		expect(rows[0].textContent).toContain('Latte');
		expect(rows[0].textContent).toContain('200 SAT (≈ MOCK)');
		expect(screen.queryByTestId('catalog-inc')).toBeNull();
		expect(screen.queryByTestId('catalog-dec')).toBeNull();
		expect(screen.queryByTestId('catalog-qty')).toBeNull();
	});

	it('R6 strip: no photo — solar kind-icon tile per card (drink/donut…); tap fires onSelect(productId)', async () => {
		const p = props();
		render(PosCatalog, { props: p });
		// no IndexedDB photo: every card shows its kind icon, never an <img>
		const tiles = screen.getAllByTestId('product-kind-icon');
		expect(tiles).toHaveLength(2);
		expect(tiles.map((t) => t.getAttribute('data-kind'))).toEqual(['drink', 'snack']);
		expect(screen.queryByTestId('product-photo')).toBeNull();
		expect(screen.queryByTestId('product-fallback')).toBeNull();
		expect(document.querySelector('img')).toBeNull();
		await fireEvent.click(screen.getAllByTestId('catalog-row')[0]);
		expect(p.onSelect).toHaveBeenCalledTimes(1);
		expect(p.onSelect).toHaveBeenCalledWith('latte');
	});

	it('every touch target keeps 44px (cards min-height + header icon-btn)', () => {
		const css = src('PosCatalog.svelte');
		expect(css).toContain('width: 44px');
		expect(css).toContain('height: 44px');
		expect(css).toContain('min-height: 44px');
	});

	it('Bill CTA stays 56px sticky', () => {
		const css = src('PosCatalog.svelte');
		expect(css).toContain('min-height: 56px');
		expect(css).toContain('position: sticky');
	});
});
