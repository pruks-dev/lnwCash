/**
 * TASK-5424 rev28 catalog_box_wide_r28 — FRESH proof tests (written new for this task).
 *
 * Covers:
 * - box-1: catalog header Manage icon is solar:box-linear (Box) + History unchanged,
 *   both 44px touch, Manage opens the separate Manage page.
 * - wide-1: ≥640px keeps a single 1fr column, max-width 480 centered — no 1fr 1fr.
 * - step-1: per-row stepper (- qty +) verbatim, 44px, callbacks fire.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import fs from 'node:fs';
import path from 'node:path';
import PosCatalog from '../PosCatalog.svelte';
import PosManage from '../PosManage.svelte';
import Icon from '$lib/components/icons/Icon.svelte';
import type { PosProduct } from '$lib/pos/catalog';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

const POS_DIR = path.join(__dirname, '..');
const ICONS_DIR = path.join(__dirname, '..', '..', '..', 'lib', 'components', 'icons');
const src = (f: string) => fs.readFileSync(path.join(POS_DIR, f), 'utf8');

// solar:box-linear body verified live via api.iconify.design/solar
// (GET /solar.json?icons=box-linear, HTTP 200) — first path anchor:
const BOX_ANCHOR = 'M17.5777 4.43152L15.5777 3.38197';
const BOX_ANCHOR_2 = 'M12 12L3 7.5M12 12V21.5';

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => cleanup());

const PRODUCTS: PosProduct[] = [
	{ id: 'thai-tea', name: 'Thai Tea', priceSat: 200, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 },
	{ id: 'coffee', name: 'Coffee', priceSat: 300, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 }
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

describe('5424 box-1 — header Manage is solar:box-linear Box, History unchanged, 44px pair', () => {
	it('manage + history buttons render solar SVGs, Box carries the live box-linear path', () => {
		const { container } = render(PosCatalog, { props: catalogProps() });
		const manage = screen.getByTestId('catalog-open-manage');
		const history = screen.getByTestId('catalog-open-history');
		expect(manage.querySelector('svg')).toBeTruthy();
		expect(history.querySelector('svg')).toBeTruthy();
		// Box icon file inlines the live-verified solar path verbatim (never hand-drawn)
		const boxSrc = fs.readFileSync(path.join(ICONS_DIR, 'Box.svelte'), 'utf8');
		expect(boxSrc).toContain('api.iconify.design/solar');
		expect(boxSrc).toContain(BOX_ANCHOR);
		expect(boxSrc).toContain(BOX_ANCHOR_2);
		expect(boxSrc).not.toContain('<circle');
		// manage button DOM carries the box path
		expect(manage.innerHTML).toContain(BOX_ANCHOR);
		// catalog sources both icons from the shared solar wrapper only
		expect(src('PosCatalog.svelte')).toContain('<Icon name="Box"');
		expect(src('PosCatalog.svelte')).toContain('<Icon name="History"');
		expect(src('PosCatalog.svelte')).not.toContain('<Icon name="Settings"');
		expect(src('PosCatalog.svelte')).not.toContain('<svg');
		expect(container.querySelectorAll('.head-actions button')).toHaveLength(2);
	});

	it('Icon wrapper resolves Box + History to solar components', () => {
		for (const name of ['Box', 'History'] as const) {
			const { container, unmount } = render(Icon, { props: { name, size: 24 } });
			expect(container.querySelector('svg')).toBeTruthy();
			unmount();
		}
		const iconSrc = fs.readFileSync(path.join(ICONS_DIR, 'Icon.svelte'), 'utf8');
		expect(iconSrc).toContain(`import Box from './Box.svelte'`);
		expect(iconSrc).toContain('api.iconify.design/solar');
	});

	it('both header buttons keep 44px touch targets', () => {
		const css = src('PosCatalog.svelte');
		expect(css).toContain('width: 44px');
		expect(css).toContain('height: 44px');
		const { container } = render(PosCatalog, { props: catalogProps() });
		for (const b of Array.from(container.querySelectorAll('.head-actions button'))) {
			expect((b as HTMLElement).className).toContain('icon-btn');
		}
	});

	it('Manage button still opens the separate Manage page (Manage flow untouched)', async () => {
		const props = catalogProps();
		render(PosCatalog, { props });
		await fireEvent.click(screen.getByTestId('catalog-open-manage'));
		expect(props.onOpenManage).toHaveBeenCalledTimes(1);
		await fireEvent.click(screen.getByTestId('catalog-open-history'));
		expect(props.onOpenHistory).toHaveBeenCalledTimes(1);
		// Manage remains its own screen with back affordance
		const manage = src('PosManage.svelte');
		expect(manage).toContain('data-pos-screen="manage"');
		expect(manage).toContain('data-testid="manage-back"');
	});
});

describe('5424 wide-1 — ≥640px single column, max-width 480 centered', () => {
	it('no 1fr 1fr split anywhere in catalog CSS; ≥640 keeps 1fr', () => {
		const css = src('PosCatalog.svelte');
		expect(css).not.toContain('grid-template-columns: 1fr 1fr');
		expect(css).toContain('grid-template-columns: 1fr');
		expect(css).toContain('@media (min-width: 640px)');
	});

	it('.pos-screen stays max-width 480 with auto-center margins', () => {
		const css = src('PosCatalog.svelte');
		expect(css).toContain('max-width: 480px');
		expect(css).toContain('margin: 0 auto');
	});

	it('grid renders one row-card per product in a single grid container', () => {
		const { container } = render(PosCatalog, { props: catalogProps() });
		const grid = screen.getByTestId('catalog-grid');
		expect(grid).toBeTruthy();
		expect(container.querySelectorAll('[data-testid="catalog-row"]')).toHaveLength(2);
	});
});

describe('5424 step-1 — stepper intact (verbatim Bill pattern, callbacks fire)', () => {
	it('every row shows dec/qty/inc with pending 0 visible; inc+dec call back', async () => {
		const props = catalogProps();
		render(PosCatalog, { props });
		const rows = screen.getAllByTestId('catalog-row');
		expect(rows).toHaveLength(2);
		for (const r of rows) {
			expect(r.querySelector('[data-testid="catalog-dec"]')).toBeTruthy();
			expect(r.querySelector('[data-testid="catalog-inc"]')).toBeTruthy();
			expect(r.querySelector('[data-testid="catalog-qty"]')?.textContent).toBe('0');
			expect(r.querySelector('[data-testid="catalog-fiat"]')?.textContent).toMatch(/SAT \(≈/);
		}
		const incs = screen.getAllByTestId('catalog-inc');
		const decs = screen.getAllByTestId('catalog-dec');
		await fireEvent.click(incs[0]);
		expect(props.onInc).toHaveBeenCalledWith('thai-tea');
		await fireEvent.click(decs[1]);
		expect(props.onDec).toHaveBeenCalledWith('coffee');
	});

	it('stepper buttons keep 44px touch in CSS', () => {
		const css = src('PosCatalog.svelte');
		expect(css).toContain('.stepper button');
		// the 44px pair appears for header icon-btn AND stepper (≥2 rule hits)
		const hits = (css.match(/width: 44px/g) ?? []).length;
		expect(hits).toBeGreaterThanOrEqual(2);
	});
});
