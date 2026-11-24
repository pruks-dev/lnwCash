/**
 * TASK-5443 rev37 catalog_header_th_r37 — FRESH proof tests (no reuse of any prior suite).
 *
 * Scope: Catalog header "Catalog" h3 20px → h2 24px (= every other PoS page)
 * via the central Heading (level h2, align center, truncate).
 * EN/TH pin untouched — reed 5442 owns TH translation (L-T015); this task
 * asserts the i18n key stays and no hardcoded translation is introduced.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import fs from 'node:fs';
import path from 'node:path';
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

const POS_DIR = path.join(__dirname, '..');
const SRC_DIR = path.join(__dirname, '..', '..', '..');
const src = (f: string) => fs.readFileSync(path.join(POS_DIR, f), 'utf8');

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => cleanup());

const PRODUCTS: PosProduct[] = [
	{ id: 'thai-tea', name: 'Thai Tea', priceSat: 2100, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 },
	{ id: 'coffee', name: 'Coffee', priceSat: 1800, kind: 'drink', fiatPriced: true, active: true, updatedAt: 1 }
];

function catalogProps(over: Record<string, unknown> = {}) {
	return {
		products: PRODUCTS,
		priceFor: (p: PosProduct) => `${p.priceSat.toLocaleString('en-US')} SAT (≈ MOCK)`,
		fiatFor: (s: number) => `≈ ${(s * 0.03).toFixed(2)} THB`,
		cartCount: 0,
		cartTotalSat: 0,
		cartFiat: '≈ 0.00 THB',
		onSelect: vi.fn(),
		onOpenBill: vi.fn(),
		onOpenManage: vi.fn(),
		onOpenHistory: vi.fn(),
		...over
	};
}

describe('5443 rev37 — catalog header is h2 24px (= other pages), centered', () => {
	it('renders a real <h2> for the catalog title — no <h3> anywhere in the header', () => {
		const { container } = render(PosCatalog, { props: catalogProps() });
		const title = container.querySelector('[data-pos-screen="catalog"] .rowline-left h2');
		expect(title).toBeTruthy();
		expect(title!.textContent).toContain('pos.catalog.title');
		// no raw h3 left in the catalog screen header path
		expect(container.querySelector('[data-pos-screen="catalog"] .rowline-left h3')).toBeNull();
		expect(container.querySelector('[data-pos-screen="catalog"] h3')).toBeNull();
	});

	it('h2 carries the central Heading contract: heading-h2 class + data-align center + truncate', () => {
		const { container } = render(PosCatalog, { props: catalogProps() });
		const title = container.querySelector('[data-pos-screen="catalog"] .rowline-left h2')!;
		expect(title.classList.contains('heading')).toBe(true);
		expect(title.classList.contains('heading-h2')).toBe(true);
		expect(title.getAttribute('data-align')).toBe('center');
		expect(title.classList.contains('truncate')).toBe(true);
	});

	it('source uses central Heading level h2 (not h3, not a raw h-tag)', () => {
		const source = src('PosCatalog.svelte');
		expect(source).toContain('<Heading level="h2" align="center" truncate>');
		expect(source).not.toContain('<Heading level="h3"');
		expect(source).not.toMatch(/<h3[\s>]/);
		expect(source).not.toMatch(/<h2[\s>]/); // title goes through Heading, never raw
		expect(source).toContain(`import Heading from '$lib/components/ui/Heading.svelte'`);
	});

	it('h2 token = 24px: heading-h2 maps to --font-size-2xl = 1.5rem', () => {
		const heading = fs.readFileSync(
			path.join(SRC_DIR, 'lib', 'components', 'ui', 'Heading.svelte'),
			'utf8'
		);
		expect(heading).toContain('.heading-h2 { font-size: var(--font-size-2xl); }');
		const tokens = fs.readFileSync(
			path.join(SRC_DIR, 'lib', 'design', 'tokens.css'),
			'utf8'
		);
		expect(tokens).toMatch(/--font-size-2xl:\s*1\.5rem/); // 24px
		expect(tokens).toMatch(/--font-size-xl:\s*1\.25rem/); // 20px = old h3, must NOT be the catalog header size
	});
});

describe('5443 rev37 — all 7 PoS screens share the h2 header (drift 0)', () => {
	const SCREENS = [
		'PosCatalog.svelte',
		'PosManage.svelte',
		'PosBill.svelte',
		'PosCheckoutCashu.svelte',
		'PosCheckoutLn.svelte',
		'PosHistory.svelte',
		'PosSuccess.svelte'
	] as const;

	it.each(SCREENS)('%s: header is central Heading level h2 align center', (f) => {
		const source = src(f);
		expect(source).toContain('<Heading level="h2" align="center"');
		expect(source).not.toContain('<Heading level="h3"');
	});

	it('no PoS screen renders a raw h-tag for its title (all through Heading)', () => {
		for (const f of SCREENS) {
			const source = src(f);
			expect(source, f).not.toMatch(/<h[123][\s>]/);
		}
	});
});

describe('5443 rev37 — EN/TH pin (rev38 TASK-5445 merged approved values, L-T015 — source still key-only)', () => {
	it('catalog title still goes through the i18n key — no hardcoded translation', () => {
		const source = src('PosCatalog.svelte');
		expect(source).toContain(`$_('pos.catalog.title')`);
		expect(source).not.toContain('Product list');
		expect(source).not.toContain('รายการสินค้า');
	});

	it('rev38 merge (TASK-5445) — locales carry the approved title pins', () => {
		const en = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'locales', 'en.json'), 'utf8'));
		const th = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'locales', 'th.json'), 'utf8'));
		expect(en['pos.catalog.title']).toBe('Product list');
		expect(th['pos.catalog.title']).toBe('รายการสินค้า');
	});
});
