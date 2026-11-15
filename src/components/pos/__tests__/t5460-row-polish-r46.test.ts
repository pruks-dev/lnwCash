/**
 * TASK-5460 rev46 row_polish_r46 — FRESH suite (written new for rev46, no reuse).
 *
 * Pins (Order/Bill rows ONLY — catalog untouched):
 *  1. เลิก•: sub = "N SAT (fiat)" — parens ONLY, NO "·"/"•" bullet anywhere
 *     in the rendered row or the PosBill source around the fiat-left span.
 *  2. ขวากระชับ: right total col LOCKED flex 0 0 80px (min/max 80px) + right
 *     + tabular-nums (static CSS pins); 96px is gone.
 *  3. กลางชิดขวา: .list-item gap 4px (no 16px / space-md); stepper interior
 *     gap 4px; row order still name | stepper-middle | total-rightmost-last
 *     so the stepper hugs the total as ONE aligned block every row.
 *  4. no regression: inc/dec carry product id; totals + right fiat (≈) render.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { register, init, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import PosBill from '../PosBill.svelte';
import type { CartLine } from '$lib/pos/cart';

register('en', () => Promise.resolve(enDict));

beforeAll(async () => {
	init({ fallbackLocale: 'en', initialLocale: 'en' });
	await waitLocale();
});

afterEach(() => {
	cleanup();
});

// Mixed digit widths: 1-digit line total vs 6-digit line total.
const lines: CartLine[] = [
	{ productId: 'tea', name: 'Thai Tea', unitPriceSat: 9, qty: 1, lineTotalSat: 9 },
	{ productId: 'cake', name: 'Cake', unitPriceSat: 35000, qty: 3, lineTotalSat: 105000 }
];

const leftFor = (sats: number) => {
	const v = ((sats * 3_000_000) / 100_000_000).toFixed(2);
	return `${v} THB`;
};
const rightFor = (sats: number) => `≈ ${leftFor(sats)}`;

function billProps(over: Record<string, unknown> = {}) {
	return {
		lines,
		totalSat: 105009,
		fiatText: rightFor(105009),
		fiatLeftFor: leftFor,
		fiatRightFor: rightFor,
		onInc: vi.fn(),
		onDec: vi.fn(),
		onChargeLn: vi.fn(),
		onChargeCashu: vi.fn(),
		onBack: vi.fn(),
		...over
	};
}

function srcOf(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return readFileSync(resolve(here, '../PosBill.svelte'), 'utf8');
}

// ─── 1. เลิก• — parens only ───

describe('5460-1 no bullet (parens only)', () => {
	it('every row subtitle reads "N SAT (fiat)" with parens', () => {
		render(PosBill, { props: billProps() });
		const rows = screen.getAllByTestId('bill-line');
		expect(rows.length).toBe(2);
		for (const row of rows) {
			const text = row.textContent ?? '';
			expect(text).toMatch(/\d SAT \(.+\)/);
		}
	});

	it('rendered rows contain NO · / • bullet', () => {
		const { container } = render(PosBill, { props: billProps() });
		const html = container.innerHTML;
		expect(html).not.toContain('·');
		expect(html).not.toContain('•');
	});

	it('left fiat span wraps in parens, keeps plain fiat (NO ≈ on the left)', () => {
		render(PosBill, { props: billProps() });
		const lefts = screen.getAllByTestId('bill-line-fiat-left');
		expect(lefts.length).toBe(2);
		expect(lefts[0].textContent).toBe(`(${leftFor(9)})`);
		expect(lefts[1].textContent).toBe(`(${leftFor(35000)})`);
		expect(lefts[0].textContent).not.toContain('≈');
	});

	it('source: fiat-left span has NO · bullet literal', () => {
		const src = srcOf();
		const idx = src.indexOf('bill-line-fiat-left');
		expect(idx).toBeGreaterThan(-1);
		const window = src.slice(Math.max(0, idx - 200), idx + 200);
		expect(window).not.toContain('·');
		expect(window).not.toContain('&middot;');
	});
});

// ─── 2. ขวากระชับ — 80px right col ───

describe('5460-2 slim right total col (80px)', () => {
	it('total col: fixed 80px + right + tabular (static CSS pins)', () => {
		const css = srcOf();
		const tIdx = css.indexOf('.line-total-col {');
		expect(tIdx).toBeGreaterThan(-1);
		const block = css.slice(tIdx, tIdx + 400);
		expect(block).toContain('flex: 0 0 80px');
		expect(block).toContain('min-width: 80px');
		expect(block).toContain('max-width: 80px');
		expect(block).toContain('text-align: right');
		expect(block).toContain('tabular-nums');
	});

	it('96px is gone from the total col (no wide-right regression)', () => {
		const css = srcOf();
		const tIdx = css.indexOf('.line-total-col {');
		const block = css.slice(tIdx, tIdx + 400);
		expect(block).not.toContain('96px');
	});

	it('both digit widths render their totals right-aligned in the slim col', () => {
		render(PosBill, { props: billProps() });
		const totals = screen.getAllByTestId('bill-line-total');
		expect(totals).toHaveLength(2);
		expect(totals[0].textContent).toBe('9');
		expect(totals[1].textContent).toBe('105,000');
		const cols = screen.getAllByTestId('bill-line-total-col');
		expect(cols).toHaveLength(2);
		for (const c of cols) {
			expect(c.textContent).toContain('≈');
		}
	});
});

// ─── 3. กลางชิดขวา — 4px tight block ───

describe('5460-3 tight middle block (gap 4px)', () => {
	it('.list-item gap is 4px (no 16px / space-md between stepper and total)', () => {
		const css = srcOf();
		const lIdx = css.indexOf('.list-item {');
		expect(lIdx).toBeGreaterThan(-1);
		const block = css.slice(lIdx, lIdx + 400);
		expect(block).toMatch(/gap:\s*4px/);
		expect(block).not.toMatch(/gap:\s*var\(--space-md\)/);
		expect(block).not.toMatch(/gap:\s*16px/);
	});

	it('stepper interior gap stays 4px (one visual block with the total)', () => {
		const css = srcOf();
		const sIdx = css.indexOf('.stepper {');
		expect(sIdx).toBeGreaterThan(-1);
		const block = css.slice(sIdx, sIdx + 400);
		expect(block).toContain('gap: 4px');
	});

	it('row order holds: name | stepper-middle | total-rightmost-LAST every row', () => {
		const { container } = render(PosBill, { props: billProps() });
		const rows = container.querySelectorAll('[data-testid="bill-line"]');
		expect(rows.length).toBe(2);
		for (const row of rows) {
			const kids = Array.from(row.children);
			expect(kids.length).toBe(3);
			expect(kids[1].getAttribute('data-testid')).toBe('bill-stepper');
			expect(kids[2].getAttribute('data-testid')).toBe('bill-line-total-col');
			expect(row.lastElementChild?.getAttribute('data-testid')).toBe(
				'bill-line-total-col'
			);
		}
	});

	it('stepper locked 120px + qty 24px tabular (alignment pins intact)', () => {
		const css = srcOf();
		const sIdx = css.indexOf('.stepper {');
		const sBlock = css.slice(sIdx, sIdx + 400);
		expect(sBlock).toContain('flex: 0 0 120px');
		const qIdx = css.indexOf('.stepper-qty');
		expect(qIdx).toBeGreaterThan(-1);
		const qBlock = css.slice(qIdx, qIdx + 300);
		expect(qBlock).toContain('24px');
		expect(qBlock).toContain('tabular-nums');
	});
});

// ─── 4. no regression ───

describe('5460-4 callbacks + totals intact', () => {
	it('inc/dec carry the product id', async () => {
		const props = billProps();
		render(PosBill, { props });
		const incs = screen.getAllByTestId('bill-inc');
		const decs = screen.getAllByTestId('bill-dec');
		await fireEvent.click(incs[1]);
		expect(props.onInc as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('cake');
		await fireEvent.click(decs[0]);
		expect(props.onDec as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('tea');
	});

	it('bill total + live fiat still render', () => {
		render(PosBill, { props: billProps() });
		expect(screen.getByTestId('bill-total-amount').textContent).toBe('105,009');
		expect(screen.getByTestId('bill-total-fiat').textContent).toBe(
			rightFor(105009)
		);
	});

	it('qty badges show per-line qty', () => {
		render(PosBill, { props: billProps() });
		const qtys = screen.getAllByTestId('bill-qty');
		expect(qtys[0].textContent).toBe('1');
		expect(qtys[1].textContent).toBe('3');
	});
});
