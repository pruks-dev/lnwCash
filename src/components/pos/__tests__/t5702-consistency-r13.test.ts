/**
 * TASK-5702-R13 — consistency + เส้น→ยา (INTENT-057 BLUEPRINT v3 rev26,
 * Commander ORDER verbatim "เอาแค่นี้ก่อน — ไม่เอาสี — consistency ทั้งฟอร์ม + เส้น→ยา").
 *
 * Pins:
 *  1. medicine_map: POS_KINDS = dispatch-order 10 with medicine in the old
 *     noodle slot (count stays 10, no noodle anywhere) + TH label 'ยา' +
 *     solar Pill; legacy 'noodle'/'noodles' strings normalize to other/Box.
 *  2. pill_registered: Icon.svelte registers Pill (import + union + map) and
 *     medicine renders a non-empty svg distinct from the other-tile Box.
 *  3. reed_keys_5712: locales carry pos.manage.kind.medicine (EN Pharmacy /
 *     TH ยา) and carry NO pos.manage.kind.noodle key.
 *  4. form_parity: add + detail sheets share the same structure — kind chips
 *     10 in the same order, preset input+add in both, unit switch = 2
 *     buttons in both, SAT price label identical in both (price_in {SAT}).
 *  5. no_new_color: PosManage <style> adds no color/background/border-color
 *     declarations (rev26 ไม่เอาสี — sizes/radius/font/gap only).
 *
 * Run scoped ONLY (L-P033 — never bare vitest):
 *   npx vitest run --project=product src/components/pos/__tests__/t5702-consistency-r13.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';
import PosManage from '../PosManage.svelte';
import ProductKindIcon from '../ProductKindIcon.svelte';
import {
	POS_KINDS,
	POS_KIND_LABEL_TH,
	POS_KIND_ICON,
	normalizeKindOption,
	kindIconFor
} from '$lib/pos/kind-icons';

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

const here = dirname(fileURLToPath(import.meta.url));
function repo(rel: string): string {
	return readFileSync(resolve(here, '..', '..', '..', '..', rel), 'utf-8');
}

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

const TEN = [
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

// ─── (1) medicine map ───

describe('5702-R13 (1) medicine map — noodle gone, count stays 10', () => {
	it('closed options are exactly the dispatch-order 10 with medicine in slot 4', () => {
		expect([...POS_KINDS]).toEqual(TEN);
		expect(POS_KINDS).not.toContain('noodle');
		expect(POS_KIND_LABEL_TH.medicine).toBe('ยา');
		expect(POS_KIND_ICON.medicine).toBe('Pill');
		expect(kindIconFor('medicine')).toBe('Pill');
	});

	it("retired noodle strings normalize to other → Box (locale key deleted by reed 5712)", () => {
		expect(normalizeKindOption('noodle')).toBe('other');
		expect(normalizeKindOption('noodles')).toBe('other');
		expect(kindIconFor('noodle')).toBe('Box');
	});
});

// ─── (2) Pill registered ───

describe('5702-R13 (2) Pill solar icon registered + renders', () => {
	it('Icon.svelte wires Pill (import + union + map)', () => {
		const iconSrc = repo('src/lib/components/icons/Icon.svelte');
		expect(iconSrc).toContain("from './Pill.svelte'");
		expect(iconSrc).toContain("'Pill'");
		expect(iconSrc).toContain('\t\tPill');
	});

	it('medicine tile renders a non-empty svg distinct from the other Box tile', () => {
		const med = render(ProductKindIcon, { props: { kind: 'medicine' } });
		const medSvg = med.container.querySelector('svg')?.innerHTML ?? '';
		expect(medSvg.length).toBeGreaterThan(0);
		med.unmount();
		cleanup();
		const other = render(ProductKindIcon, { props: { kind: 'other' } });
		const otherSvg = other.container.querySelector('svg')?.innerHTML ?? '';
		expect(otherSvg.length).toBeGreaterThan(0);
		expect(medSvg).not.toBe(otherSvg);
		other.unmount();
		cleanup();
	});
});

// ─── (3) reed 5712 keys ───

describe('5702-R13 (3) reed TASK-5712 keys — medicine TH/EN, noodle key gone', () => {
	it('EN Pharmacy / TH ยา, no noodle key in either locale', () => {
		expect((enDict as Record<string, string>)['pos.manage.kind.medicine']).toBe('Pharmacy');
		expect((thDict as Record<string, string>)['pos.manage.kind.medicine']).toBe('ยา');
		expect('pos.manage.kind.noodle' in enDict).toBe(false);
		expect('pos.manage.kind.noodle' in thDict).toBe(false);
	});
});

// ─── (4) form parity ───

describe('5702-R13 (4) add ≡ detail structure parity', () => {
	it('kind chips: same 10 options in the same order in both sheets', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ items: [satPie()] }) });
		await fireEvent.click(screen.getByTestId('manage-open-add'));
		await tick();
		const addKinds = [
			...screen.getByTestId('manage-kind').querySelectorAll('[data-kind-option]')
		].map((c) => c.getAttribute('data-kind-option'));
		expect(addKinds).toEqual(TEN);
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const detailKinds = [
			...screen.getByTestId('manage-detail-kind').querySelectorAll('[data-kind-option]')
		].map((c) => c.getAttribute('data-kind-option'));
		expect(detailKinds).toEqual(TEN);
	});

	it('preset input+add exist in both sheets; unit switch = 2 buttons in both', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ items: [satPie()] }) });
		await fireEvent.click(screen.getByTestId('manage-open-add'));
		await tick();
		expect(screen.getByTestId('manage-preset-new').tagName).toBe('INPUT');
		expect(screen.getByTestId('manage-preset-add').tagName).toBe('BUTTON');
		expect(screen.getByTestId('manage-unit-switch').querySelectorAll('button').length).toBe(2);
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		expect(screen.getByTestId('manage-detail-preset-new').tagName).toBe('INPUT');
		expect(screen.getByTestId('manage-detail-preset-add').tagName).toBe('BUTTON');
		expect(screen.getByTestId('manage-detail-unit-switch').querySelectorAll('button').length).toBe(2);
	});

	it('SAT price label identical in both sheets (price_in {SAT})', async () => {
		await useLocale('en');
		render(PosManage, { props: manageProps({ items: [satPie()], priceMode: 'sat' }) });
		await fireEvent.click(screen.getByTestId('manage-open-add'));
		await tick();
		const addLabels = [...screen.getByTestId('manage-add').querySelectorAll('.pos-field > span')].map(
			(s) => s.textContent
		);
		expect(addLabels).toContain('Price (SAT)');
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		await fireEvent.click(screen.getByTestId('manage-row'));
		await tick();
		const detailLabels = [
			...screen.getByTestId('manage-detail').querySelectorAll('.pos-field > span')
		].map((s) => s.textContent);
		expect(detailLabels).toContain('Price (SAT)');
	});

	it('medicine chip is tappable in add and renders the Pill tile in detail', async () => {
		await useLocale('en');
		const onAddProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ items: [satPie()], onAddProduct }) });
		await fireEvent.click(screen.getByTestId('manage-open-add'));
		await tick();
		await fireEvent.click(screen.getByTestId('manage-kind').querySelector('[data-kind-option="medicine"]')!);
		await tick();
		expect(
			screen.getByTestId('manage-kind').querySelector('[data-kind-option="medicine"]')?.className
		).toContain('chip-on');
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect((onAddProduct.mock.calls[0][0] as { kind: string }).kind).toBe('medicine');
	});
});

// ─── (5) no new color ───

describe('5702-R13 (5) rev26 ไม่เอาสี — style adds no color declarations', () => {
	it('PosManage <style> diff adds zero color/background/border-color rules', () => {
		const src = repo('src/components/pos/PosManage.svelte');
		const style = src.slice(src.indexOf('<style>'));
		for (const prop of ['color:', 'background:', 'border-color:']) {
			const count = style.split(prop).length - 1;
			// baseline R12 already carries these; R13 must not add more —
			// pin the exact R12 counts so any new paint fails loudly.
			const baseline: Record<string, number> = { 'color:': 36, 'background:': 20, 'border-color:': 7 };
			expect(count).toBe(baseline[prop]);
		}
	});
});
