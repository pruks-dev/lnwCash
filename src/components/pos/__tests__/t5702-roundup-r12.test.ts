/**
 * TASK-5702-R12 — roundup 8 (INTENT-057 BLUEPRINT v3 rev25, Commander ORDER
 * verbatim สั่งเลย — คุยทีละเรื่องครบ: ชีทปิด/หัวข้อ/สกุล/i18n/error/anim/เปลี่ยนสกุล/kind10).
 *
 * Pins (new R12 behavior only — headings R8 + kind-4→10 updates live in
 * their own suites):
 *  1. add_close: add-sheet save success closes the sheet at once
 *     (like the detail sheet); callback error keeps it open.
 *  2-3. (kept, pinned in t5702-followup-r8 — headings + SAT|{setting}).
 *  4. locale_sweep: PosManage rendered sheets carry no Thai literals in
 *     EN (static: source holds no Thai outside comments).
 *  5. error_formal: empty name / bad price → 5709 keys
 *     (Please enter a product name / Please enter a price, TH กรุณาระบุ…)
 *     at both PosManage-detail and PosApp-add levels.
 *  6. exit_anim: X/backdrop close plays the slide-down (leaving class
 *     while mounted, unmounted after ~200ms); parent-driven close
 *     (save success) unmounts at once.
 *  7. detail_currency: detail sheet carries SAT|{setting} + retype;
 *     save patch carries {currency, amount} (domain accepts — no BLOCKER);
 *     PosApp e2e: SAT row → THB retype → badge flips, pair native.
 *  8. kind10: 10 chips in both sheets (EN+TH labels via 5709 keys);
 *     10 genuine solar icons render distinct svgs, medicine = Pill
 *     (REPORTED fallback — see kind10-proof.txt).
 *
 * Run scoped ONLY (L-P033 — never bare vitest):
 *   npx vitest run --project=product src/components/pos/__tests__/t5702-roundup-r12.test.ts
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';
import PosManage, { type ManageUpdatePatch } from '../PosManage.svelte';
import PosApp from '../PosApp.svelte';
import ProductKindIcon from '../ProductKindIcon.svelte';
import { kindIconFor } from '$lib/pos/kind-icons';

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

const TEN_KINDS = [
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
];

const EN_LABELS = [
	'Drinks',
	'Coffee',
	'Food',
	'Pharmacy',
	'Snacks',
	'Bakery',
	'Desserts',
	'Fruit',
	'General',
	'Other'
];

const TH_LABELS = [
	'เครื่องดื่ม',
	'กาแฟ',
	'อาหาร',
	'ยา',
	'ขนม',
	'เบเกอรี่',
	'ของหวาน',
	'ผลไม้',
	'ของใช้ทั่วไป',
	'อื่น ๆ'
];

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

// ─── (1) add sheet closes on save ───

describe('5702-R12 (1) add sheet saves then closes at once', () => {
	it('success closes the sheet; error keeps it open', async () => {
		await useLocale('en');
		const onAddProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ onAddProduct }) });
		await openAdd();
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect(onAddProduct).toHaveBeenCalledTimes(1);
		expect(screen.queryByTestId('manage-add')).toBeNull();

		// error path: sheet stays for fix + retry.
		cleanup();
		const failing = vi.fn(() => 'boom');
		const { rerender } = render(PosManage, { props: manageProps({ onAddProduct: failing }) });
		await openAdd();
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		await rerender({ ...manageProps({ onAddProduct: failing }), manageError: 'boom' });
		await tick();
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		expect(screen.getByTestId('manage-error').textContent).toBe('boom');
	});
});

// ─── (4) locale sweep ───

describe('5702-R12 (4) sheet literals all through $_()', () => {
	it('EN sheets carry zero Thai text', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ items: [satDrink({ presets: ['Less ice'] })] as never }) });
		await openAdd();
		expect(screen.getByTestId('manage-add').textContent).not.toMatch(/[\u0E00-\u0E7F]/);
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		expect(screen.getByTestId('manage-detail').textContent).not.toMatch(/[\u0E00-\u0E7F]/);
	});

	it('TH detail sheet carries the ทางการ errors + 10 kind labels', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps({ items: [satDrink()] as never }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		for (const label of TH_LABELS) {
			expect(screen.getByTestId('manage-detail-kind').textContent).toContain(label);
		}
		await fireEvent.input(screen.getByTestId('manage-detail-name'), { target: { value: '' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(screen.getByTestId('manage-detail-error').textContent).toBe('กรุณาระบุชื่อสินค้า');
	});

	it('static: PosManage source holds no Thai outside comments', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const src = readFileSync(resolve(here, '..', 'PosManage.svelte'), 'utf-8');
		const code = src
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '');
		expect(code).not.toMatch(/[\u0E00-\u0E7F]/);
	});
});

// ─── (5) ทางการ errors ───

describe('5702-R12 (5) errors use the 5709 keys, no {ccy}', () => {
	it('PosApp add: empty name / bad fiat price → ทางการ keys', async () => {
		await useLocale('en');
		window.localStorage.clear();
		render(PosApp, {
			props: { initialView: 'manage', getRate: async () => ({ price: 3000000, currency: 'THB' }) }
		});
		await tick();
		await openAdd();
		// empty name → error_name.
		await fireEvent.input(screen.getByTestId('manage-price'), { target: { value: '1500' } });
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect(screen.getByTestId('manage-error').textContent).toBe('Please enter a product name');
		// bad fiat decimals → error_price (ทางการ, not the domain English).
		await fireEvent.input(screen.getByTestId('manage-name'), { target: { value: 'Latte' } });
		await fireEvent.click(screen.getByTestId('manage-mode-fiat'));
		await tick();
		await fireEvent.input(screen.getByTestId('manage-price'), { target: { value: '10.123' } });
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect(screen.getByTestId('manage-error').textContent).toBe('Please enter a price');
		expect(screen.getByTestId('manage-add')).toBeTruthy();
	});

	it('TH PosApp add: ทางการ pair', async () => {
		await useLocale('th');
		window.localStorage.clear();
		render(PosApp, {
			props: { initialView: 'manage', getRate: async () => ({ price: 3000000, currency: 'THB' }) }
		});
		await tick();
		await openAdd();
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect(screen.getByTestId('manage-error').textContent).toBe('กรุณาระบุชื่อสินค้า');
	});
});

// ─── (6) exit anim ───

describe('5702-R12 (6) sheets slide down on close', () => {
	it('X starts the leaving anim; the sheet unmounts after ~200ms', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps() });
		await openAdd();
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
		await tick();
		// still mounted, playing the slide-down.
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		expect(document.querySelector('.modal-leaving')).toBeTruthy();
		await waitFor(() => expect(screen.queryByTestId('manage-add')).toBeNull(), { timeout: 3000 });
	});

	it('static: Modal owns the exit (sheet-out + dialog-out + leaving gate)', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const src = readFileSync(
			resolve(here, '..', '..', '..', 'lib/components/ui/Modal.svelte'),
			'utf-8'
		);
		expect(src).toContain('sheet-out');
		expect(src).toContain('modal-out');
		expect(src).toContain('modal-leaving');
		expect(src).toContain('requestClose');
	});

	it('parent-driven close (save success) unmounts at once — no fake delay', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ items: [satDrink()] as never }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		expect(screen.getByTestId('manage-detail')).toBeTruthy();
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(screen.queryByTestId('manage-detail')).toBeNull();
		expect(document.querySelector('.modal-leaving')).toBeNull();
	});
});

// ─── (7) detail currency switch ───

describe('5702-R12 (7) detail sheet switches currency + retypes price', () => {
	it('SAT row: switch shows SAT|{setting}; flip clears price; save patch carries the pair', async () => {
		await useLocale('en');
		const onUpdateProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ items: [satDrink()], onUpdateProduct }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		// switch reads SAT|{setting}.
		expect(screen.getByTestId('manage-detail-mode-sat').textContent?.trim()).toBe('SAT');
		expect(screen.getByTestId('manage-detail-mode-fiat').textContent?.trim()).toBe('THB');
		expect(screen.getByTestId('manage-detail-mode-sat').getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByTestId('manage-detail').textContent).toContain('Price (SAT)');
		// flip to fiat: price cleared for re-entry, label follows.
		await fireEvent.click(screen.getByTestId('manage-detail-mode-fiat'));
		await tick();
		expect((screen.getByTestId('manage-detail-price') as HTMLInputElement).value).toBe('');
		expect(screen.getByTestId('manage-detail').textContent).toContain('Price (THB)');
		expect(screen.getByTestId('manage-detail-price').getAttribute('type')).toBe('text');
		await fireEvent.input(screen.getByTestId('manage-detail-price'), { target: { value: '65' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(onUpdateProduct).toHaveBeenCalledTimes(1);
		const patch = onUpdateProduct.mock.calls[0][1] as ManageUpdatePatch;
		expect(patch.currency).toBe('THB');
		expect(patch.amount).toBe(65);
		expect(screen.queryByTestId('manage-detail')).toBeNull();
	});

	it('THB row starts on the fiat side; save without touch keeps the pair', async () => {
		await useLocale('en');
		const onUpdateProduct = vi.fn(() => null);
		render(
			PosManage,
			{ props: manageProps({ items: [{ ...satDrink(), currency: 'THB', amount: 65 }] as never, onUpdateProduct }) }
		);
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		expect(screen.getByTestId('manage-detail-mode-fiat').getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		const patch = onUpdateProduct.mock.calls[0][1] as ManageUpdatePatch;
		expect(patch.currency).toBe('THB');
		expect(patch.amount).toBe(65);
	});

	it('PosApp e2e: SAT seed row → switch THB → badge + pair flip to fiat truth', async () => {
		await useLocale('en');
		window.localStorage.clear();
		render(PosApp, {
			props: { initialView: 'manage', getRate: async () => ({ price: 3000000, currency: 'THB' }) }
		});
		await tick();
		await tick();
		const rows = screen.getAllByTestId('manage-row');
		expect(rows.length).toBeGreaterThan(0);
		await fireEvent.click(rows[0]);
		await tick();
		await fireEvent.click(screen.getByTestId('manage-detail-mode-fiat'));
		await tick();
		await fireEvent.input(screen.getByTestId('manage-detail-price'), { target: { value: '65' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		await tick();
		expect(screen.queryByTestId('manage-detail')).toBeNull();
		const first = screen.getAllByTestId('manage-row')[0];
		expect(first.querySelector('[data-testid="manage-truth"]')?.textContent).toBe('THB');
		expect(first.textContent).toContain('฿65.00');
	});
});

// ─── (8) kind 10 ───

describe('5702-R12 (8) kind 10 closed options + genuine solar icons', () => {
	it('add sheet: 10 chips in dispatch order with EN labels', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps() });
		await openAdd();
		const group = screen.getByTestId('manage-kind');
		expect([...group.querySelectorAll('[data-kind-option]')].map((c) => c.getAttribute('data-kind-option'))).toEqual(
			TEN_KINDS
		);
		for (const label of EN_LABELS) {
			expect(group.textContent).toContain(label);
		}
	});

	it('detail sheet: 10 chips with TH labels', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps({ items: [satDrink()] as never }) });
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const group = screen.getByTestId('manage-detail-kind');
		expect([...group.querySelectorAll('[data-kind-option]')].map((c) => c.getAttribute('data-kind-option'))).toEqual(
			TEN_KINDS
		);
		for (const label of TH_LABELS) {
			expect(group.textContent).toContain(label);
		}
	});

	it('10 genuine solar svgs render distinct incl. medicine→Pill', () => {
		const seen = new Map<string, string>();
		for (const kind of TEN_KINDS) {
			const { container, unmount } = render(ProductKindIcon, { props: { kind } });
			const svg = container.querySelector('svg')?.innerHTML ?? '';
			expect(svg.length).toBeGreaterThan(0);
			seen.set(kind, svg);
			unmount();
			cleanup();
		}
		const distinct = new Set(seen.values());
		// 10 distinct svgs: every option incl. medicine owns a genuine solar icon.
		expect(distinct.size).toBe(10);
		expect(kindIconFor('medicine')).toBe('Pill');
		expect(kindIconFor('coffee')).toBe('Mug');
		expect(kindIconFor('bakery')).toBe('Cake');
		expect(kindIconFor('dessert')).toBe('IceCream');
		expect(kindIconFor('fruit')).toBe('Apple');
		expect(kindIconFor('general')).toBe('Bag');
	});
});
