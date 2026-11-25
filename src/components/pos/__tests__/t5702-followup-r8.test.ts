/**
 * TASK-5702-R8 — follow-up (INTENT-057 BLUEPRINT v3 rev20, Commander ORDER
 * verbatim (1)(2)(3) + reed TASK-5707 keys — wiring lane).
 *
 * Pins:
 *  1. headings_back: short headings are back — add sheet carries
 *     ตั้งราคาด้วยสกุล/Priced in + ตัวเลือก/Options + ประเภท/Category;
 *     detail sheet carries ตัวเลือก/Options + ประเภท/Category.
 *     None carries parens.
 *  2. currency_follows_setting: fiat side = rateCurrency (addFiat dropped)
 *     — unit buttons read SAT|{setting}; price labels read Price ({ccy}) /
 *     ราคา ({ccy}); USD setting shows zero THB.
 *  3. hardcode_gone: every R7 literal renders through $_() — EN locale
 *     shows Remove X / Type a new option name… / New option name / + Add /
 *     10 kind labels (Drinks…Other) / Please enter a product name /
 *     Please enter a price;
 *     back button uses common.back; kind chips carry no TH text in EN.
 *     Static: PosManage source holds no addFiat and no TH literals.
 *
 * Run scoped ONLY (L-P033 — never bare vitest):
 *   npx vitest run --project=product src/components/pos/__tests__/t5702-followup-r8.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';
import PosManage from '../PosManage.svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

register('en', () => Promise.resolve(enDict));
register('th', () => Promise.resolve(thDict));

async function useLocale(l: 'en' | 'th'): Promise<void> {
	init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set(l);
	await waitLocale(l);
	await tick();
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

type ManageProps = ComponentProps<typeof PosManage>;

function manageProps(over: Partial<ManageProps> = {}): ManageProps {
	return {
		items: [],
		priceFor: (p: { currency: string; amount: number }) =>
			p.currency === 'SAT' ? `${p.amount} SAT` : `${p.amount} ${p.currency}`,
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

// ─── (1) headings back, no parens ───

describe('5702-R8 (1) short headings back in both sheets', () => {
	it('EN: add carries Priced in + Options + Category; detail carries Priced in + Options + Category (R14)', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ items: [satDrink()] as never }) });
		await openAdd();
		const add = screen.getByTestId('manage-add');
		expect(screen.getByTestId('manage-truth-heading').textContent).toBe('Priced in');
		expect(screen.getByTestId('manage-preset-heading').textContent).toBe('Options');
		expect(screen.getByTestId('manage-kind-heading').textContent).toBe('Category');
		for (const t of ['manage-truth-heading', 'manage-preset-heading', 'manage-kind-heading']) {
			expect(screen.getByTestId(t).textContent).not.toContain('(');
			expect(screen.getByTestId(t).textContent).not.toContain(')');
		}
		expect(add.textContent).not.toContain('ตั้งราคาด้วยสกุล');
		// Detail sheet: R14 supersedes (rev27 ORDER "ย้ายติดราคา + เติมหัวข้อ"):
		// detail now carries Priced in too (same truth_heading key, no parens).
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		expect(screen.getByTestId('manage-detail-truth-heading').textContent).toBe('Priced in');
		expect(screen.getByTestId('manage-detail-truth-heading').textContent).not.toContain('(');
		expect(screen.getByTestId('manage-detail-preset-heading').textContent).toBe('Options');
		expect(screen.getByTestId('manage-detail-kind-heading').textContent).toBe('Category');
	});

	it('TH: add carries ตั้งราคาด้วยสกุล + ตัวเลือก + ประเภท (no parens)', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps() });
		await openAdd();
		expect(screen.getByTestId('manage-truth-heading').textContent).toBe('ตั้งราคาด้วยสกุล');
		expect(screen.getByTestId('manage-preset-heading').textContent).toBe('ตัวเลือก');
		expect(screen.getByTestId('manage-kind-heading').textContent).toBe('ประเภท');
		for (const t of ['manage-truth-heading', 'manage-preset-heading', 'manage-kind-heading']) {
			expect(screen.getByTestId(t).textContent).not.toContain('(');
			expect(screen.getByTestId(t).textContent).not.toContain(')');
		}
		await useLocale('en');
	});
});

// ─── (2) currency follows the setting ───

describe('5702-R8 (2) fiat follows rateCurrency — no dead THB', () => {
	it('USD setting: buttons SAT|USD + Price (USD), zero THB', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ priceMode: 'fiat', newPrice: '10', rateCurrency: 'USD' }) });
		await openAdd();
		expect(screen.getByTestId('manage-mode-fiat').textContent?.trim()).toBe('USD');
		expect(screen.getByTestId('manage-mode-sat').textContent?.trim()).toBe('SAT');
		expect(screen.getByTestId('manage-add').textContent).toContain('Price (USD)');
		expect(screen.getByTestId('manage-add').textContent).not.toContain('THB');
	});

	it('TH detail row: price label follows the row currency via the same key', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ items: [{ ...satDrink(), currency: 'THB', amount: 65 }] as never }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		expect(screen.getByTestId('manage-detail').textContent).toContain('Price (THB)');
	});
});

// ─── (3) hardcode gone — everything through $_() ───

describe('5702-R8 (3) R7 hardcode all wired to reed 5707 keys', () => {
	it('EN add sheet: preset + kind UI fully localized, back uses common.back', async () => {
		await useLocale('en');
		render(
			PosManage,
			{ props: manageProps({ items: [{ ...satDrink(), presets: ['Less ice'] }] as never }) }
		);
		expect(screen.getByTestId('manage-back').getAttribute('aria-label')).toBe('Back');
		await openAdd();
		const add = screen.getByTestId('manage-add');
		expect(add.textContent).not.toContain('ลบ ');
		expect(add.textContent).not.toContain('+ เพิ่ม');
		expect(add.textContent).not.toContain('พิมพ์ชื่อ');
		expect(add.textContent).not.toContain('ชื่อตัวเลือกใหม่');
		expect(add.textContent).not.toContain('หมวด');
		expect(add.textContent).not.toContain('เครื่องดื่ม');
		expect(screen.getByTestId('manage-preset-add').textContent).toBe('+ Add');
		expect(
			(screen.getByTestId('manage-preset-new') as HTMLInputElement).placeholder
		).toBe('Type a new option name…');
		expect(screen.getByTestId('manage-preset-new').getAttribute('aria-label')).toBe('New option name');
		expect(screen.getByTestId('manage-kind').getAttribute('aria-label')).toBe('Category');
	});

	it('EN detail sheet: remove/placeholder/kind/error all localized', async () => {
		await useLocale('en');
		render(
			PosManage,
			{ props: manageProps({ items: [{ ...satDrink(), presets: ['Less ice'] }] as never }) }
		);
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const remove = screen.getByTestId('manage-detail-presets').querySelector('[data-preset-remove]')!;
		expect(remove.getAttribute('aria-label')).toBe('Remove Less ice');
		expect(screen.getByTestId('manage-detail-preset-add').textContent).toBe('+ Add');
		expect(
			(screen.getByTestId('manage-detail-preset-new') as HTMLInputElement).placeholder
		).toBe('Type a new option name…');
		expect(screen.getByTestId('manage-detail-kind').getAttribute('aria-label')).toBe('Category');
		// R12 (5): ทางการ errors — reed 5709 keys, no {ccy} placeholder.
		await fireEvent.input(screen.getByTestId('manage-detail-name'), { target: { value: '' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(screen.getByTestId('manage-detail-error').textContent).toBe('Please enter a product name');
		await fireEvent.input(screen.getByTestId('manage-detail-name'), { target: { value: 'Long Black' } });
		await fireEvent.input(screen.getByTestId('manage-detail-price'), { target: { value: '0' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(screen.getByTestId('manage-detail-error').textContent).toBe('Please enter a price');
	});

	it('TH detail error: error_price renders กรุณาระบุราคา', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps({ items: [satDrink()] as never }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		await fireEvent.input(screen.getByTestId('manage-detail-name'), { target: { value: '' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(screen.getByTestId('manage-detail-error').textContent).toBe('กรุณาระบุชื่อสินค้า');
		await fireEvent.input(screen.getByTestId('manage-detail-name'), { target: { value: 'Long Black' } });
		await fireEvent.input(screen.getByTestId('manage-detail-price'), { target: { value: '0' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(screen.getByTestId('manage-detail-error').textContent).toBe('กรุณาระบุราคา');
		await useLocale('en');
	});

	it('static: no addFiat prop, no TH literals left in PosManage source', async () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const src = readFileSync(resolve(here, '..', 'PosManage.svelte'), 'utf-8');
		// addFiat is dropped as code (comments may document the removal).
		expect(src).not.toContain('addFiat?:');
		expect(src).not.toContain('{addFiat}');
		expect(src).not.toContain(': addFiat');
		expect(src).not.toContain('addFiat =');
		expect(src).not.toContain('สกุลความจริง');
		expect(src).not.toContain('ลบ {preset}');
		expect(src).not.toContain('พิมพ์ชื่อตัวเลือกใหม่');
		expect(src).not.toContain('ชื่อตัวเลือกใหม่');
		expect(src).not.toContain('aria-label="หมวด"');
		expect(src).not.toContain('aria-label="สกุลความจริง"');
		expect(src).not.toContain('+ เพิ่ม');
		expect(src).not.toContain('Price ({addFiat})');
		expect(src).not.toContain('ราคา ({detail.currency})');
		expect(src).not.toContain('POS_KIND_LABEL_TH');
	});
});
