/**
 * TASK-5702 rev1 manage_truth_b_r5702 — FRESH suite (INTENT-057 BLUEPRINT v3).
 *
 * Supersedes t5466-bottom-sheet-r49 (deleted — its v2 pins contradict B+v3:
 * per-row toggle/remove buttons, fiatFor(sats), LIGHT priceSat save).
 * Supersession map: header/back/+/solar/44px + sheet chrome + money-0touch
 * are RE-pinned here against the new file; v2-money pins are retired.
 *
 * Pins (list-B + truth-currency):
 *  1. header_btn: back + central title + solar AddCircle + (44px, pinned aria).
 *  2. rows_b: rows carry name + pair price + truth badge + state, and carry
 *     NO buttons (manage-toggle/manage-remove absent from the list) and NO
 *     overflow-menu anywhere in the file.
 *  3. tap_detail: tapping a row opens the detail bottom sheet with name /
 *     price-in-row-currency / pure pair preview (no badge) / pure kind icon
 *     / preset x+add / kind chips / toggle + remove (old testids, same
 *     data-attrs) + save; save calls onUpdateProduct, invalid price shows
 *     a sheet error. (R7: kind select → chips, fiatPriced select + ตั้งด้วย
 *     badge + descriptions GONE.)
 *  4. add_truth: add sheet SAT / fiat(THE SETTING — R8, was THB fixed)
 *     switch + price input per currency + pure pair preview + preset
 *     x/add + kind chips + Save; onAddProduct detail is always
 *     {kind, fiatPriced:true, active:true}; R12 (1): success closes the
 *     sheet at once (was: stays open). (R7: icon box + secondary-fiat
 *     select + fiatPriced/active switches + descriptions GONE.)
 *  5. static: bottomsheet x2, wide 720/960 + wallet-480 untouched shape,
 *     truth-badge blue pair, no invented icon, no wallet/cashu/localStorage.
 *  6. e2e: PosApp manage view — SAT add, THB add (truth badge + pair text),
 *     tap-to-detail toggle-off + remove + rename-save through the v3 domain.
 *
 * R7 (TASK-5702-R7, BLUEPRINT v3 rev19): kind chips replace both kind
 * selects; food joins the closed options; preview badges + description
 * paragraphs + secondary-fiat/fiatPriced/active UI deleted.
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
import PosManage, {
	type ManageAddDetail,
	type ManageUpdatePatch
} from '../PosManage.svelte';
import PosApp from '../PosApp.svelte';
import type { PosProduct } from '$lib/pos/catalog';

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

const PRICE = 3_000_000;
const CUR = 'THB' as const;

function satItem(over: Partial<PosProduct> = {}): PosProduct {
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

function thbItem(over: Partial<PosProduct> = {}): PosProduct {
	return {
		id: 'p2',
		name: 'Latte',
		currency: 'THB',
		amount: 65,
		kind: 'drink',
		fiatPriced: true,
		active: true,
		presets: ['หวานปกติ'],
		updatedAt: 1,
		...over
	};
}

// Pair-price mock in the R6 mockup format: SAT = "2,000 SAT (≈ … THB)",
// THB = "฿65 (≈ … SAT)" — placeholder legs, never a real rate.
function pairFor(p: Pick<PosProduct, 'currency' | 'amount'>): string {
	if (p.currency === 'SAT') return `${p.amount.toLocaleString('en-US')} SAT (≈ … THB)`;
	return `฿${p.amount} (≈ … SAT)`;
}

type ManageProps = ComponentProps<typeof PosManage>;

function manageProps(over: Partial<ManageProps> = {}): ManageProps {
	const base: ManageProps = {
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
		rateCurrency: CUR,
		ratePrice: PRICE
	};
	return { ...base, ...over };
}

function srcOf(rel: string): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return readFileSync(resolve(here, rel), 'utf8');
}

async function openAdd(): Promise<void> {
	await fireEvent.click(screen.getByTestId('manage-open-add'));
	await tick();
}

async function openDetailFor(id: string): Promise<void> {
	const row = screen.getByTestId('manage-row', { selector: `[data-product-id="${id}"]` });
	await fireEvent.click(row);
	await tick();
}

// ─── 1. header (back + title + solar +) ───

describe('5702-1 header (back + title + solar + button)', () => {
	it('header keeps back + title and a + button with pinned EN aria', () => {
		render(PosManage, { props: manageProps() });
		expect(screen.getByTestId('manage-back')).toBeTruthy();
		expect(screen.getByTestId('manage-open-add').getAttribute('aria-label')).toBe('Add product');
	});

	it('TH locale: + aria is the pinned translation (no new keys)', async () => {
		await useLocale('th');
		render(PosManage, { props: manageProps() });
		expect(screen.getByTestId('manage-open-add').getAttribute('aria-label')).toBe('เพิ่มสินค้า');
	});

	it('+ renders AddCircle solar svg at 24px, back renders ArrowLeft 24', () => {
		render(PosManage, { props: manageProps() });
		const plus = screen.getByTestId('manage-open-add').querySelector('svg');
		expect(plus?.getAttribute('width')).toBe('24');
		expect(plus?.querySelector('circle')?.getAttribute('r')).toBe('10');
		const back = screen.getByTestId('manage-back').querySelector('svg');
		expect(back?.getAttribute('width')).toBe('24');
	});

	it('static CSS: icon buttons are 44px touch targets, theme tokens only', () => {
		const css = srcOf('../PosManage.svelte');
		expect(css).toContain('.icon-btn');
		expect(css).toContain('width: 44px');
		expect(css).toContain('height: 44px');
		const block = css.slice(css.indexOf('.icon-btn'), css.indexOf('.icon-btn') + 500);
		expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}/);
	});
});

// ─── 2. list-B: rows without buttons ───

describe('5702-2 list-B rows (no buttons, truth badge, pair price)', () => {
	it('rows render name + pair price + truth badge + state, with NO row buttons', () => {
		render(PosManage, { props: manageProps({ items: [satItem(), thbItem()] }) });
		const rows = screen.getAllByTestId('manage-row');
		expect(rows).toHaveLength(2);
		expect(screen.getByText('Americano')).toBeTruthy();
		expect(screen.getByText('2,000 SAT (≈ … THB)')).toBeTruthy();
		expect(screen.getByText('฿65 (≈ … SAT)')).toBeTruthy();
		// Truth badges: one per row, blue pair, currency code text.
		const truths = screen.getAllByTestId('manage-truth');
		expect(truths.map((t) => t.textContent)).toEqual(['SAT', 'THB']);
		// NO per-row buttons, NO overflow menu — B only.
		expect(screen.queryByTestId('manage-toggle')).toBeNull();
		expect(screen.queryByTestId('manage-remove')).toBeNull();
		expect(document.querySelector('[data-testid="manage-overflow"]')).toBeNull();
	});

	it('off-sale row is dimmed but still tappable into the sheet', async () => {
		render(PosManage, { props: manageProps({ items: [thbItem({ id: 'm1', name: 'Mocha', active: false })] }) });
		const row = screen.getByTestId('manage-row');
		expect(row.className).toContain('off-sale');
		expect(screen.getByTestId('manage-state').textContent).toBe('Off sale');
		await fireEvent.click(row);
		await tick();
		expect(screen.getByTestId('manage-detail')).toBeTruthy();
		expect(screen.getByTestId('manage-detail').getAttribute('data-detail-for')).toBe('m1');
	});

	it('static: no overflow-menu string anywhere in the component', () => {
		const src = srcOf('../PosManage.svelte');
		expect(src.toLowerCase()).not.toContain('overflowmenu');
		expect(src).not.toContain('data-testid="manage-overflow"');
		expect(src).not.toContain('OverflowMenu');
	});
});

// ─── 3. tap-to-detail sheet ───

describe('5702-3 detail sheet (edit + toggle + remove + save)', () => {
	it('tap opens the sheet with name / row-currency price / pure pair preview (no badge)', async () => {
		render(PosManage, { props: manageProps({ items: [thbItem()] }) });
		await openDetailFor('p2');
		expect(screen.getByTestId('manage-detail')).toBeTruthy();
		expect((screen.getByTestId('manage-detail-name') as HTMLInputElement).value).toBe('Latte');
		expect((screen.getByTestId('manage-detail-price') as HTMLInputElement).value).toBe('65');
		// R7: pair only — the ตั้งด้วย badge is gone from the detail sheet.
		expect(screen.getByTestId('manage-detail').textContent).toContain('฿65 (≈ … SAT)');
		expect(screen.getByTestId('manage-detail').textContent).not.toContain('ตั้งด้วย');
	});

	it('old testids manage-toggle/manage-remove live in the sheet with data attrs', async () => {
		const onToggleActive = vi.fn();
		const onRemoveProduct = vi.fn();
		render(PosManage, { props: manageProps({ items: [satItem()], onToggleActive, onRemoveProduct }) });
		await openDetailFor('p1');
		const toggle = screen.getByTestId('manage-toggle');
		const remove = screen.getByTestId('manage-remove');
		expect(toggle.getAttribute('data-toggle-for')).toBe('p1');
		expect(remove.getAttribute('data-remove-for')).toBe('p1');
		await fireEvent.click(toggle);
		expect(onToggleActive).toHaveBeenCalledWith('p1');
		await fireEvent.click(remove);
		expect(onRemoveProduct).toHaveBeenCalledWith('p1');
	});

	it('rename + save calls onUpdateProduct with the patch and closes', async () => {
		const onUpdateProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ items: [satItem()], onUpdateProduct }) });
		await openDetailFor('p1');
		await fireEvent.input(screen.getByTestId('manage-detail-name'), { target: { value: 'Long Black' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		const patch = onUpdateProduct.mock.calls[0][1] as ManageUpdatePatch;
		expect(onUpdateProduct).toHaveBeenCalledTimes(1);
		expect(onUpdateProduct.mock.calls[0][0]).toBe('p1');
		expect(patch.name).toBe('Long Black');
		expect(patch.amount).toBe(2000);
		expect(screen.queryByTestId('manage-detail')).toBeNull();
	});

	it('invalid price shows a sheet error and does NOT call back', async () => {
		const onUpdateProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ items: [satItem()], onUpdateProduct }) });
		await openDetailFor('p1');
		await fireEvent.input(screen.getByTestId('manage-detail-price'), { target: { value: '0' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(onUpdateProduct).not.toHaveBeenCalled();
		expect(screen.getByTestId('manage-detail-error')).toBeTruthy();
		expect(screen.getByTestId('manage-detail')).toBeTruthy();
	});

	it('presets: x removes one chip, input+add appends, save carries the list', async () => {
		const onUpdateProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ items: [thbItem()], onUpdateProduct }) });
		await openDetailFor('p2');
		expect(screen.getByTestId('manage-detail-presets').textContent).toContain('หวานปกติ');
		await fireEvent.click(screen.getByTestId('manage-detail-presets').querySelector('[data-preset-remove]')!);
		await tick();
		expect(screen.getByTestId('manage-detail-presets').textContent).not.toContain('หวานปกติ');
		await fireEvent.input(screen.getByTestId('manage-detail-preset-new'), { target: { value: 'ไม่หวาน' } });
		await fireEvent.click(screen.getByTestId('manage-detail-preset-add'));
		await tick();
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(onUpdateProduct).toHaveBeenCalledTimes(1);
		expect((onUpdateProduct.mock.calls[0][1] as ManageUpdatePatch).presets).toEqual(['ไม่หวาน']);
	});
});

// ─── 4. add sheet truth-currency ───

describe('5702-4 add sheet (truth select + price per currency + presets + kind/active)', () => {
	it('add Card is absent until + is tapped (bottomsheet dialog)', async () => {
		render(PosManage, { props: manageProps() });
		expect(screen.queryByTestId('manage-add')).toBeNull();
		await openAdd();
		expect(screen.getByTestId('manage-add')).toBeTruthy();
		expect(document.querySelector('.modal-backdrop-bottomsheet')).toBeTruthy();
	});

	it('SAT mode: number price input + pure SAT pair preview (no badge)', async () => {
		render(PosManage, { props: manageProps({ newPrice: '2000' }) });
		await openAdd();
		expect(screen.getByTestId('manage-mode-sat').getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByTestId('manage-price').getAttribute('type')).toBe('number');
		expect(screen.getByTestId('manage-preview').textContent).toContain('2,000 SAT (≈ … THB)');
		expect(screen.getByTestId('manage-preview').textContent).not.toContain('ตั้งด้วย');
	});

	it('fiat mode: decimal price + THB pair preview, NO secondary currency select', async () => {
		render(
			PosManage,
			{ props: manageProps({ priceMode: 'fiat', newPrice: '65' }) }
		);
		await openAdd();
		expect(screen.getByTestId('manage-price').getAttribute('inputmode')).toBe('decimal');
		// R7 simplify (3): fiat is THB fixed — the secondary select is gone.
		expect(screen.queryByTestId('manage-currency')).toBeNull();
		expect(screen.getByTestId('manage-add').querySelector('select')).toBeNull();
		expect(screen.getByTestId('manage-preview').textContent).toContain('฿65 (≈ … SAT)');
		expect(screen.getByTestId('manage-preview').textContent).not.toContain('ตั้งด้วย');
	});

	it('presets x/add + kind chips flow into onAddProduct with auto {fiatPriced:true, active:true}; success closes the sheet (R12)', async () => {
		const onAddProduct = vi.fn(() => null);
		render(PosManage, { props: manageProps({ onAddProduct }) });
		await openAdd();
		await fireEvent.input(screen.getByTestId('manage-preset-new'), { target: { value: 'หวานน้อย' } });
		await fireEvent.click(screen.getByTestId('manage-preset-add'));
		await tick();
		expect(screen.getByTestId('manage-presets').textContent).toContain('หวานน้อย');
		// R7 (5): no active switch anywhere — every add sells immediately.
		expect(screen.queryByTestId('manage-active')).toBeNull();
		expect(screen.queryByTestId('manage-fiatpriced')).toBeNull();
		await fireEvent.click(screen.getByTestId('manage-kind').querySelector('[data-kind-option="drink"]')!);
		await tick();
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		expect(onAddProduct).toHaveBeenCalledTimes(1);
		const detail = onAddProduct.mock.calls[0][0] as ManageAddDetail;
		expect(detail).toMatchObject({ kind: 'drink', fiatPriced: true, active: true, presets: ['หวานน้อย'] });
		// R12 (1): saved → the sheet closes at once (was: stays open).
		expect(screen.queryByTestId('manage-add')).toBeNull();
		// Reopen: sheet-locals were reset for the next item.
		await openAdd();
		expect(screen.getByTestId('manage-presets').textContent).not.toContain('หวานน้อย');
		expect(
			screen.getByTestId('manage-kind').querySelector('[data-kind-option="other"]')?.getAttribute('aria-pressed')
		).toBe('true');
	});

	it('callback error surfaces via manageError prop and keeps the sheet open', async () => {
		const onAddProduct = vi.fn(() => 'boom');
		const { rerender } = render(PosManage, { props: manageProps({ onAddProduct }) });
		await openAdd();
		await fireEvent.click(screen.getByTestId('manage-save'));
		await rerender({ ...manageProps({ onAddProduct }), manageError: 'boom' });
		await tick();
		expect(screen.getByTestId('manage-error').textContent).toBe('boom');
		expect(screen.getByTestId('manage-add')).toBeTruthy();
	});
});

// ─── 5. static guards ───

describe('5702-5 static guards (chrome + money-0touch + icons)', () => {
	it('wide frame intact: 480 → 720 (≥640px) → 960 (≥1024px), pos-only', () => {
		const src = srcOf('../PosManage.svelte');
		expect(src).toContain('max-width: 480px');
		expect(src).toContain('max-width: 720px');
		expect(src).toContain('max-width: 960px');
		expect(src).toContain('100dvh');
		expect(src).toContain('data-pos-screen="manage"');
	});

	it('truth-badge blue pair (no yellow), bottomsheet x2, chevron is solar reuse', () => {
		const src = srcOf('../PosManage.svelte');
		expect(src).toContain('truth-badge');
		expect(src).toContain('rgba(34, 211, 238, 0.14)');
		expect(src).not.toContain('facc15');
		expect(src.match(/variant="bottomsheet"/g)).toHaveLength(2);
		expect(src).toContain('name="ArrowRight"');
		expect(src).toContain('name="AddCircle"');
		expect(src).not.toContain('<path d="M4');
	});

	it('money 0-touch: validation-only domain import, no wallet/cashu/storage writes', () => {
		const src = srcOf('../PosManage.svelte');
		expect(src).toContain('resolveTruthPair');
		expect(src).toContain("from '$lib/pos/catalog'");
		expect(src).toContain("from '$lib/fiat/rates'");
		expect(src).not.toContain('tokenStore');
		expect(src).not.toContain('cashu/token');
		expect(src).not.toContain('wallet/mint');
		expect(src).not.toContain('receiveTokens');
		expect(src).not.toContain('window.localStorage');
		expect(src).not.toContain('localStorage.setItem');
		expect(src).not.toContain('localStorage.getItem');
	});
});

// ─── 6. PosApp end-to-end (manage view, v3 domain) ───

describe('5702-6 PosApp e2e (SAT add + THB add + detail toggle/remove/rename)', () => {
	function renderManage() {
		window.localStorage.clear();
		return render(PosApp, {
			props: {
				initialView: 'manage',
				getRate: async () => ({ price: PRICE, currency: CUR })
			}
		});
	}

	it('SAT add stores truth and renders the pair row with SAT badge', async () => {
		renderManage();
		await tick();
		await openAdd();
		await fireEvent.input(screen.getByTestId('manage-name'), { target: { value: 'Mocha' } });
		await fireEvent.input(screen.getByTestId('manage-price'), { target: { value: '1500' } });
		await tick();
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		const rows = screen.getAllByTestId('manage-row');
		const last = rows[rows.length - 1];
		expect(last.textContent).toContain('Mocha');
		expect(last.textContent).toContain('1,500 SAT');
		const badge = last.querySelector('[data-testid="manage-truth"]');
		expect(badge?.textContent).toBe('SAT');
	});

	it('THB add stores fiat truth (badge THB + native-first pair text)', async () => {
		renderManage();
		await tick();
		await openAdd();
		await fireEvent.input(screen.getByTestId('manage-name'), { target: { value: 'Latte' } });
		await fireEvent.click(screen.getByTestId('manage-mode-fiat'));
		await tick();
		await fireEvent.input(screen.getByTestId('manage-price'), { target: { value: '65' } });
		await tick();
		expect(screen.getByTestId('manage-preview').textContent).toContain('฿65');
		await fireEvent.click(screen.getByTestId('manage-save'));
		await tick();
		await tick();
		const rows = screen.getAllByTestId('manage-row');
		const last = rows[rows.length - 1];
		expect(last.textContent).toContain('Latte');
		expect(last.textContent).toContain('฿65.00');
		expect(last.querySelector('[data-testid="manage-truth"]')?.textContent).toBe('THB');
	});

	it('detail: toggle off + rename-save + remove through the sheet', async () => {
		renderManage();
		await tick();
		const before = screen.getAllByTestId('manage-row').length;
		// Tap the first (seed) row — Thai Tea 2,100 SAT.
		await fireEvent.click(screen.getAllByTestId('manage-row')[0]);
		await tick();
		expect(screen.getByTestId('manage-detail')).toBeTruthy();
		// Toggle off-sale from inside the sheet.
		await fireEvent.click(screen.getByTestId('manage-toggle'));
		await tick();
		expect(screen.getAllByTestId('manage-state')[0].textContent).toBe('Off sale');
		// Rename + save closes the sheet.
		await fireEvent.input(screen.getByTestId('manage-detail-name'), { target: { value: 'ชาไทย' } });
		await fireEvent.click(screen.getByTestId('manage-detail-save'));
		await tick();
		expect(screen.queryByTestId('manage-detail')).toBeNull();
		expect(screen.getAllByTestId('manage-row')[0].textContent).toContain('ชาไทย');
		// Reopen and remove.
		await fireEvent.click(screen.getAllByTestId('manage-row')[0]);
		await tick();
		await fireEvent.click(screen.getByTestId('manage-remove'));
		await tick();
		await tick();
		expect(screen.getAllByTestId('manage-row')).toHaveLength(before - 1);
	});
});
