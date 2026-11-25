/**
 * TASK-5702-R14 — ย้ายสวิตช์สกุลติดราคา + หัวข้อตั้งราคาด้วยสกุล
 * (INTENT-057 BLUEPRINT v3 rev27, Commander ORDER verbatim
 * "ย้ายติดราคา + เติมหัวข้อตั้งราคาด้วยสกุล").
 *
 * Pins:
 *  1. detail_order: detail sheet DOM order = ไอคอน → คู่ราคา → ชื่อ →
 *     สวิตช์สกุล(+หัวข้อ) → ราคา → ตัวเลือก → ประเภท → ปุ่ม
 *     (เหมือนฟอร์มเพิ่ม — name ขึ้นก่อน switch).
 *  2. truth_heading: detail sheet มีหัวข้อ truth_heading คำเดียว ไม่มีวงเล็บ
 *     ใช้ key เดิม pos.manage.truth_heading (TH 'ตั้งราคาด้วยสกุล' /
 *     EN 'Priced in') — ไม่ invent key ใหม่.
 *  3. switch_kept: R12 (7) kept — SAT|{setting} 2 ปุ่มยังสลับ dCurrency ได้
 *     และล้างราคาให้กรอกใหม่ (tap fiat → price input ว่าง).
 *  4. add_parity: add sheet ลำดับเดิม ชื่อ → หัวข้อ → สวิตช์ → ราคา →
 *     ตัวเลือก → ประเภท → ปุ่ม (detail เทียบเท่า).
 *
 * Run scoped ONLY (L-P033 — never bare vitest):
 *   npx vitest run --project=product src/components/pos/__tests__/t5702-switch-r14.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';
import PosManage from '../PosManage.svelte';

register('en', () => Promise.resolve(enDict));
register('th', () => Promise.resolve(thDict));

async function useLocale(code: 'en' | 'th'): Promise<void> {
	init({ fallbackLocale: 'en', initialLocale: 'en' });
	locale.set(code);
	await waitLocale();
	await tick();
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

type ManageProps = ComponentProps<typeof PosManage>;

function pairFor(p: { currency: string; amount: number }): string {
	if (p.currency === 'SAT') return `${p.amount.toLocaleString('en-US')} SAT (≈ … THB)`;
	return `฿${p.amount} (≈ … SAT)`;
}

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

function satPie(over = {}) {
	return {
		id: 'p1',
		name: 'Pie',
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

/** Collect the section markers of a sheet in DOM order. */
function sheetOrder(root: HTMLElement, prefix: string): string[] {
	const seq: string[] = [];
	const seen = new Set<string>();
	const push = (k: string) => {
		if (!seen.has(k)) {
			seen.add(k);
			seq.push(k);
		}
	};
	root.querySelectorAll('*').forEach((el) => {
		const t = el.getAttribute('data-testid') ?? '';
		if (t === `${prefix}photo`) push('icon');
		else if (el.classList.contains('sheet-price-pair')) push('pair');
		else if (t === `${prefix}name`) push('name');
		else if (t === `${prefix}truth-heading`) push('truth-heading');
		else if (t === `${prefix}unit-switch`) push('switch');
		else if (t === `${prefix}price`) push('price');
		else if (t === `${prefix}preset-heading`) push('preset');
		else if (t === `${prefix}kind-heading`) push('kind');
		else if (t === 'manage-toggle' || t === 'manage-save') push('buttons');
	});
	return seq;
}

async function openDetail() {
	render(PosManage, { props: manageProps({ items: [satPie()] }) });
	await fireEvent.click(screen.getByTestId('manage-row'));
	await tick();
	return screen.getByTestId('manage-detail');
}

// ─── (1) detail order ───

describe('5702-R14 (1) detail sheet order — สวิตช์ติดราคา', () => {
	it('icon → pair → name → switch → price → preset → kind → buttons', async () => {
		await useLocale('th');
		const detail = await openDetail();
		expect(sheetOrder(detail, 'manage-detail-')).toEqual([
			'icon',
			'pair',
			'name',
			'truth-heading',
			'switch',
			'price',
			'preset',
			'kind',
			'buttons'
		]);
	});

	it('name มาก่อน switch (ย้ายลงติดราคา — ไม่ใช่ switch ก่อน name)', async () => {
		await useLocale('th');
		const detail = await openDetail();
		const html = detail.innerHTML;
		expect(html.indexOf('manage-detail-name')).toBeLessThan(
			html.indexOf('manage-detail-unit-switch')
		);
		expect(html.indexOf('manage-detail-unit-switch')).toBeLessThan(
			html.indexOf('manage-detail-price')
		);
	});
});

// ─── (2) truth heading ───

describe('5702-R14 (2) หัวข้อตั้งราคาด้วยสกุล — key เดิม ไม่ invent', () => {
	it("TH renders 'ตั้งราคาด้วยสกุล' คำเดียว ไม่มีวงเล็บ", async () => {
		await useLocale('th');
		const detail = await openDetail();
		const h = detail.querySelector('[data-testid="manage-detail-truth-heading"]');
		expect(h?.textContent?.trim()).toBe('ตั้งราคาด้วยสกุล');
		expect(h?.textContent).not.toContain('(');
		expect(h?.textContent).not.toContain(')');
		expect(h?.classList.contains('sheet-heading')).toBe(true);
	});

	it('EN renders the same truth_heading key value (Priced in)', async () => {
		await useLocale('en');
		const detail = await openDetail();
		expect(
			detail
				.querySelector('[data-testid="manage-detail-truth-heading"]')
				?.textContent?.trim()
		).toBe((enDict as Record<string, string>)['pos.manage.truth_heading']);
		expect((thDict as Record<string, string>)['pos.manage.truth_heading']).toBe(
			'ตั้งราคาด้วยสกุล'
		);
	});
});

// ─── (3) switch kept ───

describe('5702-R14 (3) R12 (7) kept — สวิตช์ยังสลับสกุล+ล้างราคา', () => {
	it('unit switch = 2 buttons; tap fiat flips + clears price for re-entry', async () => {
		await useLocale('en');
		const detail = await openDetail();
		const sw = screen.getByTestId('manage-detail-unit-switch');
		expect(sw.querySelectorAll('button').length).toBe(2);
		const price = screen.getByTestId('manage-detail-price') as HTMLInputElement;
		expect(price.value).toBe('2000');
		await fireEvent.click(screen.getByTestId('manage-detail-mode-fiat'));
		await tick();
		expect(price.value).toBe('');
		expect(screen.getByTestId('manage-detail-mode-fiat').getAttribute('aria-pressed')).toBe(
			'true'
		);
	});
});

// ─── (4) add parity ───

describe('5702-R14 (4) add sheet parity — ชื่อ → หัวข้อ → สวิตช์ → ราคา', () => {
	it('add order matches the same pattern detail now follows', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps({ items: [satPie()] }) });
		await fireEvent.click(screen.getByTestId('manage-open-add'));
		await tick();
		const add = screen.getByTestId('manage-add');
		expect(sheetOrder(add, 'manage-')).toEqual([
			'name',
			'truth-heading',
			'switch',
			'price',
			'preset',
			'kind',
			'buttons'
		]);
	});
});
