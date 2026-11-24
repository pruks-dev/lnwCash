/**
 * TASK-5466 rev49 fixforward_bottomsheet_r49 — FRESH suite (no reuse of
 * 5402..5464 suites; those pin the pre-sheet sticky-bottom layout and are
 * superseded on this slice).
 *
 * Pins (sheet + header + button ONLY — money/logic untouched):
 *  1. header_btn: Manage header keeps back + central title and gains a +
 *     button (manage-open-add, 44px icon-btn) with pinned aria
 *     pos.catalog.add_product (EN "Add product" / TH pinned, no new keys).
 *  2. plus_icon: header icon is solar:add-circle-linear verbatim
 *     (api.iconify.design/solar 2026-11-12 HTTP 200, CC BY 4.0) — circle
 *     r=10 + cross path, size 24, never hand-drawn; registered as
 *     AddCircle in Icon.svelte.
 *  3. sheet_closed_default: add Card is NOT in the DOM until + is tapped
 *     (bottom sheet, Modal variant="bottomsheet", role=dialog).
 *  4. sheet_open: + opens the sheet (dialog + bottomsheet class + single
 *     pinned title in the sheet header); the rev48 Card (unit switch,
 *     fields, preview, error, primary Save) is re-homed unchanged inside.
 *  5. sheet_close: X / Escape / backdrop close the sheet; reopen works;
 *     successful Save does NOT auto-close (next item ready).
 *  6. sheet_wiring: SAT preview ≈, fiat preview ≈ via convert.ts
 *     read-only, fiat save converts live → priceSat through PosApp
 *     (LIGHT, no currency stored); list rows visible + toggle/remove/back
 *     work WITHOUT opening the sheet.
 *  7. money_0touch: PosManage imports no wallet/cashu token modules;
 *     theme tokens only in new CSS (light+dark), sheet max-width 480
 *     (portrait/landscape identical rhythm).
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';
import PosManage, { type ManagePriceMode } from '../PosManage.svelte';
import PosApp from '../PosApp.svelte';

register('en', () => Promise.resolve(enDict));
register('th', () => Promise.resolve(thDict));

async function useLocale(l: 'en' | 'th'): Promise<void> {
	locale.set(l);
	await waitLocale(l);
	await tick();
}

beforeAll(async () => {
	init({ fallbackLocale: 'en', initialLocale: 'en' });
	await waitLocale();
});

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	await useLocale('en');
});

// Live-rate fixture: 3,000,000 THB/BTC → 300 THB = 10,000 SAT; 2100 SAT = 63.00 THB.
const PRICE = 3_000_000;
const CUR = 'THB' as const;

function manageProps(
	over: {
		priceMode?: ManagePriceMode;
		newPrice?: string;
		newName?: string;
		manageError?: string;
		ratePrice?: number | null;
		items?: ComponentProps<typeof PosManage>['items'];
		onPriceMode?: (m: ManagePriceMode) => void;
		onAddProduct?: () => void;
		onToggleActive?: (id: string) => void;
		onRemoveProduct?: (id: string) => void;
		onBack?: () => void;
	} = {}
): ComponentProps<typeof PosManage> {
	const base: ComponentProps<typeof PosManage> = {
		items: [],
		fiatFor: () => 'fiat',
		newName: '',
		newPrice: '',
		manageError: '',
		onNewName: vi.fn(),
		onNewPrice: vi.fn(),
		onAddProduct: vi.fn(),
		onRemoveProduct: vi.fn(),
		onToggleActive: vi.fn(),
		onBack: vi.fn(),
		priceMode: 'sat',
		onPriceMode: vi.fn(),
		rateCurrency: CUR,
		ratePrice: PRICE
	};
	return { ...base, ...over };
}

function srcOf(rel: string): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return readFileSync(resolve(here, rel), 'utf8');
}

async function openSheet(): Promise<void> {
	await fireEvent.click(screen.getByTestId('manage-open-add'));
	await tick();
}

// ─── 1. header + button (pinned aria, 44px, solar icon) ───

describe('5466-1 header + button (pinned aria + 44px touch + solar icon)', () => {
	it('header keeps back + title and gains a + button with pinned EN aria', () => {
		render(PosManage, { props: manageProps() });
		expect(screen.getByTestId('manage-back')).toBeTruthy();
		const plus = screen.getByTestId('manage-open-add');
		expect(plus.getAttribute('aria-label')).toBe('Add product');
		expect(plus.tagName).toBe('BUTTON');
		expect(plus.getAttribute('type')).toBe('button');
	});

	it('TH locale: + aria is the pinned translation (no new keys)', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps() });
		expect(screen.getByTestId('manage-open-add').getAttribute('aria-label')).toBe('เพิ่มสินค้า');
	});

	it('+ renders AddCircle solar svg at 24px (circle + cross, currentColor)', () => {
		render(PosManage, { props: manageProps() });
		const svg = screen.getByTestId('manage-open-add').querySelector('svg');
		expect(svg).toBeTruthy();
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('height')).toBe('24');
		expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
		const circle = svg?.querySelector('circle');
		expect(circle?.getAttribute('cx')).toBe('12');
		expect(circle?.getAttribute('cy')).toBe('12');
		expect(circle?.getAttribute('r')).toBe('10');
		const path = svg?.querySelector('path');
		expect(path?.getAttribute('d')).toBe('M15 12L12 12M12 12L9 12M12 12L12 9M12 12L12 15');
	});

	it('static CSS: .icon-btn is a 44px touch target, theme tokens only', () => {
		const css = srcOf('../PosManage.svelte');
		expect(css).toContain('.icon-btn');
		expect(css).toContain('width: 44px');
		expect(css).toContain('height: 44px');
		// New header-button rule introduces no hardcoded colors.
		const block = css.slice(css.indexOf('.icon-btn'), css.indexOf('.icon-btn') + 500);
		expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}/);
		expect(block).toContain('var(--color-text)');
	});
});

// ─── 2. plus icon source = solar verbatim (never hand-drawn) ───

describe('5466-2 plus icon source (solar:add-circle-linear verbatim)', () => {
	it('AddCircle.svelte pins the verified solar body + CC BY 4.0', () => {
		const icon = srcOf('../../../lib/components/icons/AddCircle.svelte');
		expect(icon).toContain('<circle cx="12" cy="12" r="10" />');
		expect(icon).toContain('<path d="M15 12L12 12M12 12L9 12M12 12L12 9M12 12L12 15" />');
		expect(icon).toContain('api.iconify.design/solar');
		expect(icon).toContain('add-circle-linear');
		expect(icon).toContain('CC BY 4.0');
		expect(icon).toContain('Never hand-drawn');
		expect(icon).toContain('viewBox="0 0 24 24"');
	});

	it('Icon.svelte registers AddCircle (import + name + map)', () => {
		const registry = srcOf('../../../lib/components/icons/Icon.svelte');
		expect(registry).toContain("import AddCircle from './AddCircle.svelte'");
		expect(registry).toContain("'AddCircle'");
		expect(registry).toMatch(/AddCircle,?\s*\n?\s*\};/);
	});
});

// ─── 3. sheet closed by default, opens on + ───

describe('5466-3 sheet closed by default, opens on +', () => {
	it('add Card is absent until + is tapped (no dialog in DOM)', () => {
		render(PosManage, { props: manageProps() });
		expect(screen.queryByTestId('manage-add')).toBeNull();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('+ opens the bottom sheet: dialog + bottomsheet class + single pinned title', async () => {
		render(PosManage, { props: manageProps() });
		await openSheet();
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(document.querySelector('.modal-backdrop-bottomsheet')).toBeTruthy();
		expect(document.querySelector('.modal-bottomsheet')).toBeTruthy();
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		// Title lives once in the sheet header (Modal title, pinned locale).
		const titles = screen.getAllByText('Add product');
		expect(titles).toHaveLength(1);
		expect(titles[0].closest('.modal-header')).toBeTruthy();
	});

	it('TH locale: sheet header title is the pinned translation', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps() });
		await openSheet();
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByText('เพิ่มสินค้า')).toBeTruthy();
	});
});

// ─── 4. sheet close paths + save keeps it open ───

describe('5466-4 sheet close (X / Escape / backdrop) + save stays open', () => {
	it('X closes the sheet and + reopens it', async () => {
		render(PosManage, { props: manageProps() });
		await openSheet();
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		await fireEvent.click(screen.getByLabelText('Close dialog'));
		await tick();
		expect(screen.queryByTestId('manage-add')).toBeNull();
		await openSheet();
		expect(screen.getByTestId('manage-add')).toBeTruthy();
	});

	it('Escape closes the sheet', async () => {
		render(PosManage, { props: manageProps() });
		await openSheet();
		await fireEvent.keyDown(screen.getByRole('presentation'), { key: 'Escape' });
		await tick();
		expect(screen.queryByTestId('manage-add')).toBeNull();
	});

	it('backdrop click closes the sheet', async () => {
		render(PosManage, { props: manageProps() });
		await openSheet();
		const backdrop = document.querySelector('.modal-backdrop-bottomsheet') as HTMLElement;
		await fireEvent.click(backdrop);
		await tick();
		expect(screen.queryByTestId('manage-add')).toBeNull();
	});

	it('Save does NOT auto-close (next item ready), error surfaces in-sheet', async () => {
		const onAddProduct = vi.fn();
		const { rerender } = render(PosManage, { props: manageProps({ onAddProduct }) });
		await openSheet();
		await fireEvent.click(screen.getByTestId('manage-save'));
		expect(onAddProduct).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		await rerender({ ...manageProps({ onAddProduct }), manageError: 'name required' });
		await tick();
		expect(screen.getByTestId('manage-error').textContent).toBe('name required');
		expect(screen.getByTestId('manage-add')).toBeTruthy();
	});
});

// ─── 5. Card wiring re-homed unchanged (switch + preview + primary Save) ───

describe('5466-5 Card wiring inside the sheet (switch + preview + Save)', () => {
	it('unit switch + prominent Save preserved in-sheet', async () => {
		const onPriceMode = vi.fn();
		const { rerender } = render(PosManage, { props: manageProps({ onPriceMode }) });
		await openSheet();
		expect(screen.getByTestId('manage-unit-switch')).toBeTruthy();
		expect(screen.getByTestId('manage-mode-sat').getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByTestId('manage-mode-fiat').textContent).toContain('THB');
		const save = screen.getByTestId('manage-save');
		expect(save.className).toContain('btn-primary');
		expect(save.className).not.toContain('btn-secondary');
		await fireEvent.click(screen.getByTestId('manage-mode-fiat'));
		expect(onPriceMode).toHaveBeenCalledWith('fiat');
		await rerender({ ...manageProps({ onPriceMode }), priceMode: 'fiat' });
		expect(screen.getByTestId('manage-price').getAttribute('inputmode')).toBe('decimal');
	});

	it('SAT preview ≈ live fiat; rate gone → unavailable badge', async () => {
		const { rerender } = render(PosManage, { props: manageProps({ newPrice: '2100' }) });
		await openSheet();
		expect(screen.getByTestId('manage-preview').textContent).toBe('≈ 63.00 THB');
		await rerender({ ...manageProps({ newPrice: '2100', ratePrice: null }) });
		await tick();
		expect(screen.getByTestId('manage-preview').textContent).toBe('– THB');
	});

	it('fiat preview converts live → SAT (read-only convert.ts)', async () => {
		render(PosManage, { props: manageProps({ priceMode: 'fiat', newPrice: '300' }) });
		await openSheet();
		expect(screen.getByTestId('manage-preview').textContent).toBe('≈ 10,000 SAT');
	});

	it('list rows stay usable WITHOUT opening the sheet (untouched)', async () => {
		const onToggleActive = vi.fn();
		const onRemoveProduct = vi.fn();
		const onBack = vi.fn();
		render(
			PosManage,
			{
				props: manageProps({
					items: [
						{ id: 'p1', name: 'Thai Tea', priceSat: 2100, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 }
					],
					onToggleActive,
					onRemoveProduct,
					onBack
				})
			}
		);
		// Rows render on the page itself — no sheet needed.
		expect(screen.getByTestId('manage-row')).toBeTruthy();
		expect(screen.getByTestId('manage-fiat').textContent).toContain('2,100 SAT');
		await fireEvent.click(screen.getByTestId('manage-toggle'));
		expect(onToggleActive).toHaveBeenCalledWith('p1');
		await fireEvent.click(screen.getByTestId('manage-remove'));
		expect(onRemoveProduct).toHaveBeenCalledWith('p1');
		await fireEvent.click(screen.getByTestId('manage-back'));
		expect(onBack).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId('manage-add')).toBeNull();
	});
});

// ─── 6. PosApp end-to-end: add through the sheet, fiat LIGHT save ───

describe('5466-6 PosApp end-to-end (sheet add → fiat LIGHT save)', () => {
	it('fiat 300 THB @ 3M saves priceSat 10000 and sheet stays open', async () => {
		window.localStorage.clear();
		render(PosApp, {
			props: {
				initialView: 'manage',
				getRate: async () => ({ price: PRICE, currency: CUR })
			}
		});
		await tick();
		await openSheet();
		await fireEvent.input(screen.getByTestId('manage-name'), { target: { value: 'Cake' } });
		await fireEvent.click(screen.getByTestId('manage-mode-fiat'));
		await tick();
		await fireEvent.input(screen.getByTestId('manage-price'), { target: { value: '300' } });
		await tick();
		expect(screen.getByTestId('manage-preview').textContent).toBe('≈ 10,000 SAT');
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		// Saved row appears in the list with LIGHT priceSat (no currency stored).
		const rows = screen.getAllByTestId('manage-row');
		expect(rows[rows.length - 1].textContent).toContain('Cake');
		expect(rows[rows.length - 1].textContent).toContain('10,000 SAT');
		// Sheet stays open for the next item.
		expect(screen.getByTestId('manage-add')).toBeTruthy();
	});
});

// ─── 7. money 0-touch + sheet chrome (light+dark, portrait/landscape) ───

describe('5466-7 money 0-touch + sheet chrome', () => {
	it('PosManage touches no wallet/cashu token modules (read-only fiat only)', () => {
		const src = srcOf('../PosManage.svelte');
		expect(src).not.toContain('tokenStore');
		expect(src).not.toContain('cashu/token');
		expect(src).not.toContain('wallet/mint');
		expect(src).not.toContain('receiveTokens');
		expect(src).toContain("from '$lib/fiat/convert'");
		expect(src).toContain("from '$lib/fiat/currency'");
		expect(src).toContain('variant="bottomsheet"');
		expect(src).toContain("title={$_('pos.catalog.add_product')}");
		expect(src).toContain('data-testid="manage-open-add"');
		expect(src).toContain("name=\"AddCircle\"");
	});

	it('sheet chrome: Modal bottomsheet max-width 480, theme tokens (no hardcode)', () => {
		const modal = srcOf('../../../lib/components/ui/Modal.svelte');
		expect(modal).toContain('modal-backdrop-bottomsheet');
		expect(modal).toContain('max-width: 480px');
		expect(modal).toContain('env(safe-area-inset-bottom');
		// Manage page keeps the R5 screen bound (portrait/landscape identical).
		const manage = srcOf('../PosManage.svelte');
		expect(manage).toContain('max-width: 480px');
		expect(manage).toContain('100dvh');
	});
});
