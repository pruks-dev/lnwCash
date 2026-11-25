/**
 * TASK-5702-R7 — simplify 9 (INTENT-057 BLUEPRINT v3 rev19, Commander ORDER
 * verbatim: สั่งแก้เท่านี้ก่อน — 9 งาน simplify).
 *
 * Pins (one per simplify item):
 *  1. add_icon_box_gone: add sheet has NO icon box (no manage-photo-row /
 *     manage-photo-thumb) — kind is picked by chips only.
 *  2. icon_desc_gone: NO icon-description prose in either sheet; the detail
 *     sheet keeps a PURE icon (thumb holds only the kind tile).
 *  3. secondary_fiat_gone: add sheet is SAT|THB pure — unit switch has
 *     exactly 2 buttons (SAT + THB), NO manage-currency select, fiat = THB.
 *  4. fiatpriced_switch_gone: NO fiatPriced UI in either sheet; saved detail
 *     + update patch always carry fiatPriced:true (pair always shows).
 *  5. active_switch_gone: NO manage-active in the add sheet; onAddProduct
 *     detail always carries active:true.
 *  6. detail_same_shape: detail sheet = icon + kind + price + preset +
 *     หยุดขาย + ลบ + บันทึก (manage-toggle/manage-remove/manage-detail-save
 *     all present, zero selects).
 *  7. kind_10 (R13 — was 4): drink/coffee/food/medicine/snack/bakery/
 *     dessert/fruit/general/other + solar (CupHot/Mug/Burger/Pill/
 *     Donut/Cake/IceCream/Apple/Bag/Box), ''→other; food chip is tappable.
 *  8. price_preset_desc_gone: no description paragraphs after price or
 *     options in either sheet (no truth-label, no ตั้งด้วย, no ความจริง —).
 *  9. kind_chips_both: 10 chips tap-to-pick in BOTH sheets — tap moves
 *     chip-on + aria-pressed, save carries the picked kind.
 *
 * Run scoped ONLY (L-P033 — never bare vitest):
 *   npx vitest run --project=product src/components/pos/__tests__/t5702-simplify-r7.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import PosManage, { type ManageAddDetail } from '../PosManage.svelte';
import { POS_KINDS, POS_KIND_LABEL_TH, POS_KIND_ICON, kindIconFor } from '$lib/pos/kind-icons';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

register('en', () => Promise.resolve(enDict));

async function useEn(): Promise<void> {
	init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set('en');
	await waitLocale();
	await tick();
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function pairFor(p: { currency: string; amount: number }): string {
	if (p.currency === 'SAT') return `${p.amount.toLocaleString('en-US')} SAT (≈ … THB)`;
	return `฿${p.amount} (≈ … SAT)`;
}

type ManageProps = ComponentProps<typeof PosManage>;

function manageProps(over: Partial<ManageProps> = {}): ManageProps {
	return {
		items: [],
		priceFor: pairFor,
		newName: '',
		newPrice: '',
		manageError: '',
		onNewName: vi.fn(),
		onNewPrice: vi.fn(),
		onAddProduct: vi.fn(() => null),
		onUpdateProduct: vi.fn(() => null),
		onRemoveProduct: vi.fn(),
		onToggleActive: vi.fn(),
		onBack: vi.fn(),
		priceMode: 'sat',
		onPriceMode: vi.fn(),
		rateCurrency: 'THB',
		ratePrice: 3000000,
		...over
	} as ManageProps;
}

async function openAdd(): Promise<void> {
	await fireEvent.click(screen.getByTestId('manage-open-add'));
	await tick();
}

function satDrink(over = {}) {
	return {
		id: 'p1',
		name: 'Americano',
		currency: 'SAT',
		amount: 2000,
		kind: 'drink',
		fiatPriced: true,
		active: true,
		presets: [],
		updatedAt: 1,
		...over
	};
}

// ─── (1) add icon box gone ───

describe('5702-R7 (1) add icon box gone — kind chips only', () => {
	it('add sheet carries no icon box at all', async () => {
		await useEn();
		render(PosManage, { props: manageProps() });
		await openAdd();
		const add = screen.getByTestId('manage-add');
		expect(add.querySelector('[data-testid="manage-photo-row"]')).toBeNull();
		expect(add.querySelector('[data-testid="manage-photo-thumb"]')).toBeNull();
		expect(add.querySelector('[data-testid="product-kind-icon"]')).toBeNull();
		// kind chips ARE the picker now.
		expect(add.querySelector('[data-testid="manage-kind"]')).toBeTruthy();
	});
});

// ─── (2) icon descriptions gone, detail icon pure ───

describe('5702-R7 (2) icon descriptions gone — detail keeps a pure icon', () => {
	it('detail thumb holds only the kind tile, zero prose', async () => {
		await useEn();
		render(PosManage, { props: manageProps({ items: [satDrink()] as never }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const detail = screen.getByTestId('manage-detail');
		expect(detail.querySelector('[data-testid="manage-detail-thumb"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-detail-thumb"]')?.textContent).toBe('');
		expect(detail.textContent).not.toContain('ไม่รับไฟล์แล้ว');
		expect(detail.textContent).not.toContain('ไอคอน');
		expect(detail.textContent).not.toContain('ตามหมวด');
		// add sheet has no icon prose either.
		await fireEvent.click(screen.getByTestId('manage-open-add'));
		await tick();
		expect(screen.getByTestId('manage-add').textContent).not.toContain('ไม่รับไฟล์แล้ว');
		expect(screen.getByTestId('manage-add').textContent).not.toContain('ไอคอน');
	});
});

// ─── (3) SAT|{setting} — fiat follows rateCurrency, no dead THB ───

describe('5702-R7 (3) secondary-fiat select gone — R8 fiat follows the setting', () => {
	it('unit switch is exactly SAT + rateCurrency; no currency select anywhere', async () => {
		await useEn();
		render(PosManage, { props: manageProps({ priceMode: 'fiat', newPrice: '65' }) });
		await openAdd();
		const modes = [screen.getByTestId('manage-mode-sat'), screen.getByTestId('manage-mode-fiat')];
		expect(modes.map((b) => b.textContent?.trim())).toEqual(['SAT', 'THB']);
		expect(screen.queryByTestId('manage-currency')).toBeNull();
		expect(screen.getByTestId('manage-add').querySelector('select')).toBeNull();
	});

	it('R8: custom setting (USD) shows SAT|USD + Price (USD) — no dead THB', async () => {
		await useEn();
		render(PosManage, { props: manageProps({ priceMode: 'fiat', newPrice: '10', rateCurrency: 'USD' }) });
		await openAdd();
		const modes = [screen.getByTestId('manage-mode-sat'), screen.getByTestId('manage-mode-fiat')];
		expect(modes.map((b) => b.textContent?.trim())).toEqual(['SAT', 'USD']);
		expect(screen.getByTestId('manage-add').textContent).toContain('Price (USD)');
		expect(screen.getByTestId('manage-add').textContent).not.toContain('THB');
	});
});

// ─── (4) fiatPriced switch gone, always pair ───

describe('5702-R7 (4) fiatPriced switch gone — pair always shows', () => {
	it('no fiatPriced UI in either sheet; saved detail forces true', async () => {
		await useEn();
		const onAddProduct = vi.fn(() => null);
		const onUpdateProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ items: [satDrink()], onAddProduct, onUpdateProduct }) });
		await openAdd();
		expect(screen.queryByTestId('manage-fiatpriced')).toBeNull();
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect((onAddProduct.mock.calls[0][0] as ManageAddDetail).fiatPriced).toBe(true);
		// detail sheet: no switch either, patch forces true.
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		expect(screen.queryByTestId('manage-detail-fiatpriced')).toBeNull();
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(onUpdateProduct.mock.calls[0][1].fiatPriced).toBe(true);
	});
});

// ─── (5) active switch gone, auto true ───

describe('5702-R7 (5) add active switch gone — active=true auto', () => {
	it('no manage-active in the add sheet; detail always carries active:true', async () => {
		await useEn();
		const onAddProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ newName: 'X', newPrice: '10', onAddProduct }) });
		await openAdd();
		expect(screen.queryByTestId('manage-active')).toBeNull();
		expect(screen.getByTestId('manage-add').textContent).not.toContain('ขายทันที');
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect((onAddProduct.mock.calls[0][0] as ManageAddDetail).active).toBe(true);
	});
});

// ─── (6) detail same shape ───

describe('5702-R7 (6) detail sheet same shape — icon+kind+price+preset+stop+delete+save', () => {
	it('detail carries every action, zero selects', async () => {
		await useEn();
		render(PosManage, { props: manageProps({ items: [satDrink()] as never }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const detail = screen.getByTestId('manage-detail');
		expect(detail.querySelector('[data-testid="manage-detail-thumb"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-detail-kind"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-detail-price"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-detail-presets"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-detail-preset-new"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-toggle"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-remove"]')).toBeTruthy();
		expect(detail.querySelector('[data-testid="manage-detail-save"]')).toBeTruthy();
		expect(detail.querySelector('select')).toBeNull();
	});
});

// ─── (7) kind 10 ───

describe('5702-R7 (7) kind 10 หมวด + solar bound', () => {
	it('closed options are the dispatch-order 10 with Burger registered', () => {
		expect([...POS_KINDS]).toEqual([
			'drink',
			'coffee',
			'food',
			'medicine',
			'snack',
			'bakery',
			'dessert',
			'fruit',
			'general',
			'other'
		]);
		expect(POS_KIND_LABEL_TH.food).toBe('อาหาร');
		expect(POS_KIND_LABEL_TH.medicine).toBe('ยา');
		expect(POS_KIND_ICON.food).toBe('Burger');
		expect(POS_KIND_ICON.medicine).toBe('Pill');
		expect(kindIconFor('food')).toBe('Burger');
		expect(kindIconFor('medicine')).toBe('Pill');
		expect(kindIconFor('')).toBe('Box');
		const here = dirname(fileURLToPath(import.meta.url));
		const iconSrc = readFileSync(resolve(here, '..', '..', '..', 'lib/components/icons/Icon.svelte'), 'utf-8');
		expect(iconSrc).toContain("from './Burger.svelte'");
		expect(iconSrc).toContain("'Burger'");
	});
});

// ─── (8) price/preset descriptions gone ───

describe('5702-R7 (8) descriptions after price + options gone in both sheets', () => {
	it('neither sheet carries truth/preset prose or ตั้งด้วย badges', async () => {
		await useEn();
		render(PosManage, { props: manageProps({ items: [satDrink()], newPrice: '2000' }) });
		await openAdd();
		const addText = screen.getByTestId('manage-add').textContent ?? '';
		for (const prose of ['ความจริง', 'ตั้งด้วย', 'แม่แบบตอนขาย', 'สกุลความจริงของแถวนี้']) {
			expect(addText).not.toContain(prose);
		}
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const detailText = screen.getByTestId('manage-detail').textContent ?? '';
		for (const prose of ['ความจริง', 'ตั้งด้วย', 'ลบทีละตัว', 'สกุลความจริงของแถวนี้']) {
			expect(detailText).not.toContain(prose);
		}
		expect(document.querySelector('.truth-label')).toBeNull();
	});
});

// ─── (9) kind chips in both sheets ───

describe('5702-R7 (9) kind dropdown → 10 chips tap-to-pick in both sheets', () => {
	it('add chips: tap food → chip-on moves, save carries food', async () => {
		await useEn();
		const onAddProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ onAddProduct }) });
		await openAdd();
		const group = screen.getByTestId('manage-kind');
		expect(group.tagName).not.toBe('SELECT');
		expect([...group.querySelectorAll('[data-kind-option]')].map((c) => c.getAttribute('data-kind-option'))).toEqual([
			'drink',
			'coffee',
			'food',
			'medicine',
			'snack',
			'bakery',
			'dessert',
			'fruit',
			'general',
			'other'
		]);
		await fireEvent.click(group.querySelector('[data-kind-option="food"]')!);
		await tick();
		expect(group.querySelector('[data-kind-option="food"]')?.className).toContain('chip-on');
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect((onAddProduct.mock.calls[0][0] as ManageAddDetail).kind).toBe('food');
	});

	it('detail chips: tap snack → thumb follows, save patch carries snack', async () => {
		await useEn();
		const onUpdateProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ items: [satDrink()], onUpdateProduct }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const group = screen.getByTestId('manage-detail-kind');
		expect([...group.querySelectorAll('[data-kind-option]')].map((c) => c.getAttribute('data-kind-option'))).toEqual([
			'drink',
			'coffee',
			'food',
			'medicine',
			'snack',
			'bakery',
			'dessert',
			'fruit',
			'general',
			'other'
		]);
		await fireEvent.click(group.querySelector('[data-kind-option="snack"]')!);
		await tick();
		expect(
			screen.getByTestId('manage-detail-thumb').querySelector('[data-testid="product-kind-icon"]')?.getAttribute('data-kind')
		).toBe('snack');
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(onUpdateProduct.mock.calls[0][1].kind).toBe('snack');
	});
});
