/**
 * TASK-5702-R7 — simplify 9 (INTENT-057 BLUEPRINT v3 rev19, Commander ORDER).
 * Supersedes the R6 select-based kind UI pins (preview boxes + kind select
 * + secondary-fiat select + fiatPriced/active switches + ตั้งด้วย badges
 * + truth descriptions — all GONE).
 *
 * Pins:
 *  1. kind_map: closed options 10 หมวด (R13 — was 4: drink/food/snack/other;
 *     now + coffee/medicine/bakery/dessert/fruit/general, dispatch order) +
 *     TH labels + solar icons (drink=CupHot / coffee=Mug / food=Burger /
 *     medicine=Pill genuine / snack=Donut / bakery=Cake /
 *     dessert=IceCream / fruit=Apple / general=Bag / other=Box);
 *     '' + unknown → other/Box. (R8: rendered chip labels follow the
 *     locale via reed TASK-5707/5709 keys — map consts stay TH-pinned.)
 *  2. picker_zero: no ProductImagePicker/ProductPhoto import or usage, no
 *     file input, no icon-box/description in the add sheet, no select
 *     element anywhere, no secondary-fiat / fiatPriced / active UI, no
 *     truth-description paragraphs (R7 simplify 1/2/3/4/5/8).
 *  3. kind_ui: kind is 10 CHIPS (R12 — was 4, not a select) in both sheets — tap selects,
 *     chip-on + aria-pressed follow; detail thumb icon follows the chips
 *     live; rows render kind-icon tiles.
 *  4. clear_close: image-store clear/close path works — save 2 → clear →
 *     count 0 → reset (close) → deleteDatabase resolves (no blocked conn).
 *  5. headers_blob: public/_headers still carries blob: (kept per order).
 *
 * Retired by R6 (deleted, picker/limit/resize pins no longer apply):
 *  t5702-box-tap-r3, t5702-perf-limit-r4, t5702-browser-resize-r5.
 * Retired by R7 (simplified away — see R7 suite t5702-simplify-r7):
 *  R6 kind select + preview boxes, secondary-fiat select, fiatPriced /
 *  active switches, ตั้งด้วย badges, truth description paragraphs.
 *
 * Run scoped ONLY (L-P033 — never bare vitest):
 *   npx vitest run --project=product src/components/pos/__tests__/t5702-kind-icon-r6.test.ts
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { ComponentProps } from 'svelte';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';
import ProductKindIcon from '../ProductKindIcon.svelte';
import PosManage from '../PosManage.svelte';
import {
	POS_KINDS,
	POS_KIND_LABEL_TH,
	POS_KIND_ICON,
	normalizeKindOption,
	kindIconFor
} from '$lib/pos/kind-icons';
import {
	clearProductImages,
	resetImageDB,
	deleteImageDatabase,
	saveProductImage,
	countProductImages
} from '$lib/pos/image-store';

register('en', () => Promise.resolve(enDict));
register('th', () => Promise.resolve(thDict));
init({ fallbackLocale: 'en', initialLocale: 'en' });

const here = dirname(fileURLToPath(import.meta.url));
function src(name: string): string {
	return readFileSync(resolve(here, '..', name), 'utf-8');
}
function repo(rel: string): string {
	return readFileSync(resolve(here, '..', '..', '..', '..', rel), 'utf-8');
}

afterEach(() => cleanup());

beforeEach(async () => {
	resetImageDB();
	await deleteImageDatabase();
	resetImageDB();
});

afterEach(async () => {
	await deleteImageDatabase();
	resetImageDB();
});

// ─── 1. kind map ───

describe('5702-R6 kind map (closed options + solar icons)', () => {
	it('closed options are exactly the dispatch-order 10', () => {
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
	});

	it('TH labels exist for every option', () => {
		expect(POS_KIND_LABEL_TH).toEqual({
			drink: 'เครื่องดื่ม',
			coffee: 'กาแฟ',
			food: 'อาหาร',
			medicine: 'ยา',
			snack: 'ขนม',
			bakery: 'เบเกอรี่',
			dessert: 'ของหวาน',
			fruit: 'ผลไม้',
			general: 'ของใช้ทั่วไป',
			other: 'อื่น ๆ'
		});
	});

	it('solar icons: 10 genuine incl. medicine→Pill (all registered)', () => {
		expect(POS_KIND_ICON).toEqual({
			drink: 'CupHot',
			coffee: 'Mug',
			food: 'Burger',
			medicine: 'Pill',
			snack: 'Donut',
			bakery: 'Cake',
			dessert: 'IceCream',
			fruit: 'Apple',
			general: 'Bag',
			other: 'Box'
		});
		const iconSrc = repo('src/lib/components/icons/Icon.svelte');
		for (const name of new Set(Object.values(POS_KIND_ICON))) {
			expect(iconSrc).toContain(`'${name}'`);
		}
		expect(iconSrc).toContain("from './CupHot.svelte'");
		expect(iconSrc).toContain("from './Burger.svelte'");
		expect(iconSrc).toContain("from './Donut.svelte'");
		expect(iconSrc).toContain("from './Mug.svelte'");
		expect(iconSrc).toContain("from './Cake.svelte'");
		expect(iconSrc).toContain("from './IceCream.svelte'");
		expect(iconSrc).toContain("from './Apple.svelte'");
		expect(iconSrc).toContain("from './Bag.svelte'");
		expect(iconSrc).toContain("from './Pill.svelte'");
	});

	it("'' + unknown legacy kinds normalize to other → Box (retired noodle rows fall back to other)", () => {
		expect(normalizeKindOption('')).toBe('other');
		expect(normalizeKindOption('noodles')).toBe('other');
		expect(normalizeKindOption('noodle')).toBe('other');
		expect(normalizeKindOption('ramen')).toBe('other');
		expect(normalizeKindOption('drink')).toBe('drink');
		expect(normalizeKindOption('coffee')).toBe('coffee');
		expect(normalizeKindOption('medicine')).toBe('medicine');
		expect(normalizeKindOption('food')).toBe('food');
		expect(normalizeKindOption('bakery')).toBe('bakery');
		expect(normalizeKindOption('dessert')).toBe('dessert');
		expect(normalizeKindOption('fruit')).toBe('fruit');
		expect(normalizeKindOption('general')).toBe('general');
		expect(normalizeKindOption('snack')).toBe('snack');
		expect(kindIconFor('')).toBe('Box');
		expect(kindIconFor('noodles')).toBe('Box');
		expect(kindIconFor('noodle')).toBe('Box');
		expect(kindIconFor('medicine')).toBe('Pill');
		expect(kindIconFor('drink')).toBe('CupHot');
		expect(kindIconFor('coffee')).toBe('Mug');
		expect(kindIconFor('food')).toBe('Burger');
		expect(kindIconFor('bakery')).toBe('Cake');
		expect(kindIconFor('dessert')).toBe('IceCream');
		expect(kindIconFor('fruit')).toBe('Apple');
		expect(kindIconFor('general')).toBe('Bag');
		expect(kindIconFor('snack')).toBe('Donut');
	});

	it('ProductKindIcon renders a tile per kind; drink ≠ snack ≠ empty markup', () => {
		const a = render(ProductKindIcon, { props: { kind: 'drink' } });
		const drinkHtml = a.container.innerHTML;
		a.unmount();
		cleanup();
		const b = render(ProductKindIcon, { props: { kind: 'snack' } });
		const snackHtml = b.container.innerHTML;
		b.unmount();
		cleanup();
		render(ProductKindIcon, { props: { kind: '' } });
		const tile = screen.getByTestId('product-kind-icon');
		expect(tile.getAttribute('data-kind')).toBe('');
		expect(tile.querySelector('svg')).toBeTruthy();
		expect(document.querySelector('img')).toBeNull();
		// distinct solar paths per kind (not one shared svg)
		expect(drinkHtml).not.toBe(snackHtml);
	});
});

// ─── 2. picker zero ───

describe('5702-R7 picker zero (no imports/usages/files/selects/switches)', () => {
	it('PosManage has no picker/photo imports, usages, file inputs, or photo-error channel', () => {
		const s = src('PosManage.svelte');
		expect(s).not.toContain("from './ProductImagePicker");
		expect(s).not.toContain("from './ProductPhoto");
		expect(s).not.toContain('<ProductImagePicker');
		expect(s).not.toContain('<ProductPhoto');
		expect(s).not.toContain('img-box');
		expect(s).not.toContain('type="file"');
		expect(s).not.toContain('manage-photo-error');
		expect(s).not.toContain('{imageUrls}');
		expect(s).not.toContain('imageUrls[');
		expect(s).not.toContain('photoTick={');
		expect(s).not.toContain('photoTick +');
		expect(s).toContain('ProductKindIcon');
		expect(s).toContain('kind-icons');
	});

	it('R7 simplify: no add icon box, no select element, no secondary/fiatPriced/active UI, no truth descriptions', () => {
		const s = src('PosManage.svelte');
		// (1) add icon box gone.
		expect(s).not.toContain('manage-photo-row');
		expect(s).not.toContain('photo-thumb');
		// (2) icon descriptions gone (both sheets keep icons, zero prose).
		expect(s).not.toContain('ไม่รับไฟล์แล้ว');
		expect(s).not.toContain('photo-meta');
		expect(s).not.toContain('d-photo-meta');
		// (3)(4)(5)(9) no select element anywhere in either sheet.
		expect(s).not.toContain('<select');
		expect(s).not.toContain('manage-currency');
		expect(s).not.toContain('manage-fiatpriced');
		expect(s).not.toContain('manage-detail-fiatpriced');
		expect(s).not.toContain('manage-active');
		// (8) truth/preset description paragraphs gone.
		expect(s).not.toContain('truth-label');
		expect(s).not.toContain('ตั้งด้วย');
		expect(s).not.toContain('ความจริง —');
	});

	it('PosCatalog has no photo component; PosApp keeps only the clear/close path', () => {
		const c = src('PosCatalog.svelte');
		expect(c).not.toContain('ProductPhoto');
		expect(c).not.toContain('ProductImagePicker');
		expect(c).toContain('ProductKindIcon');
		const app = src('PosApp.svelte');
		expect(app).not.toContain('getProductImage');
		expect(app).not.toContain('deleteProductImage');
		expect(app).not.toContain('savePickedFile');
		expect(app).not.toContain('imageUrls');
		expect(app).toContain('clearProductImages');
		expect(app).toContain('resetImageDB');
	});
});

// ─── 3. kind UI ───

type ManageProps = ComponentProps<typeof PosManage>;
function manageProps(over: Partial<ManageProps> = {}): ManageProps {
	return {
		items: [],
		priceFor: () => '1 SAT',
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
		rateCurrency: 'THB' as never,
		ratePrice: 0,
		...over
	} as ManageProps;
}

describe('5702-R7 kind UI (10 chips tap-to-pick, no files, no selects)', () => {
	it('add sheet: kind is 10 chips with locale labels; tap selects (chip-on + aria-pressed)', async () => {
		locale.set('en');
		await waitLocale();
		await tick();
		render(PosManage, { props: manageProps() });
		await fireEvent.click(screen.getByTestId('manage-open-add'));
		await tick();
		const group = screen.getByTestId('manage-kind');
		expect(group.tagName).not.toBe('SELECT');
		expect(group.querySelector('select')).toBeNull();
		const chips = [...group.querySelectorAll('[data-kind-option]')];
		expect(chips.map((c) => c.getAttribute('data-kind-option'))).toEqual([
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
		// R8: chips follow the locale (EN here — reed TASK-5707/5709 keys).
		for (const label of ['Drinks', 'Coffee', 'Food', 'Pharmacy', 'Snacks', 'Bakery', 'Desserts', 'Fruit', 'General', 'Other']) {
			expect(group.textContent).toContain(label);
		}
		// default other is on.
		expect(group.querySelector('[data-kind-option="other"]')?.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(group.querySelector('[data-kind-option="food"]')!);
		await tick();
		expect(group.querySelector('[data-kind-option="food"]')?.getAttribute('aria-pressed')).toBe('true');
		expect(group.querySelector('[data-kind-option="other"]')?.getAttribute('aria-pressed')).toBe(
			'false'
		);
		expect(screen.getByTestId('manage-add').querySelector('input[type="file"]')).toBeNull();
		expect(screen.getByTestId('manage-add').querySelector('select')).toBeNull();
		// TH locale: same 4 chips, TH labels.
		locale.set('th');
		await waitLocale('th');
		await tick();
		for (const label of ['เครื่องดื่ม', 'กาแฟ', 'อาหาร', 'ยา', 'ขนม', 'เบเกอรี่', 'ของหวาน', 'ผลไม้', 'ของใช้ทั่วไป', 'อื่น ๆ']) {
			expect(group.textContent).toContain(label);
		}
		locale.set('en');
		await waitLocale();
		await tick();
	});

	it('rows render kind-icon tiles (legacy empty kind → Box tile, still tappable)', async () => {
		locale.set('en');
		await waitLocale();
		await tick();
		render(
			PosManage,
			{
				props: manageProps({
					items: [
						{ id: 'p1', name: 'Latte', currency: 'SAT', amount: 200, kind: 'drink', fiatPriced: false, active: true, presets: [], updatedAt: 1 },
						{ id: 'p2', name: 'Old', currency: 'SAT', amount: 100, kind: '', fiatPriced: false, active: true, presets: [], updatedAt: 1 }
					] as never
				})
			}
		);
		await tick();
		const tiles = screen.getAllByTestId('product-kind-icon');
		expect(tiles.map((t) => t.getAttribute('data-kind'))).toEqual(['drink', '']);
		expect(document.querySelector('input[type="file"]')).toBeNull();
		await fireEvent.click(screen.getAllByTestId('manage-row')[1]);
		await tick();
		// legacy '' opens the detail sheet normalized to the other chip.
		const detailKind = screen.getByTestId('manage-detail-kind');
		expect(
			detailKind.querySelector('[data-kind-option="other"]')?.getAttribute('aria-pressed')
		).toBe('true');
		expect((screen.getByTestId('manage-detail-thumb').querySelector('[data-testid="product-kind-icon"]')).getAttribute('data-kind')).toBe('other');
		// tapping the food chip swaps the detail thumb icon live.
		await fireEvent.click(detailKind.querySelector('[data-kind-option="food"]')!);
		await tick();
		expect((screen.getByTestId('manage-detail-thumb').querySelector('[data-testid="product-kind-icon"]')).getAttribute('data-kind')).toBe('food');
	});
});

// ─── 4. clear + close ───

describe('5702-R6 clearDB + close conn (pos-images bucket reset)', () => {
	it('save 2 → clear → count 0 → reset(close) → deleteDatabase resolves unblocked', async () => {
		const b1 = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
		const b2 = new Blob([new Uint8Array([4, 5, 6])], { type: 'image/jpeg' });
		expect((await saveProductImage('p1', b1)).ok).toBe(true);
		expect((await saveProductImage('p2', b2)).ok).toBe(true);
		expect(await countProductImages()).toBe(2);
		await clearProductImages();
		expect(await countProductImages()).toBe(0);
		resetImageDB(); // closes the lingering handle (the deleteDatabase blocker)
		await expect(deleteImageDatabase()).resolves.toBeUndefined();
		expect(await countProductImages()).toBe(0);
	});
});

// ─── 5. headers blob kept ───

describe('5702-R6 headers blob kept', () => {
	it('public/_headers still allows blob: (kind tiles + future media unaffected)', () => {
		expect(repo('public/_headers')).toContain('blob:');
	});
});
