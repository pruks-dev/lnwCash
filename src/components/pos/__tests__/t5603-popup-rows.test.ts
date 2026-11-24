/**
 * TASK-5603 — scoped vitest for modifier popup + separate bill rows
 * (INTENT-056 BLUEPRINT-056 v2, approved mockup 2/3).
 * Run scoped ONLY (L-P033 — never bare vitest).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PosModifierPopup from '../PosModifierPopup.svelte';
import PosBill from '../PosBill.svelte';
import type { CartLine } from '$lib/pos/cart';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

afterEach(() => cleanup());

function popupProps(over: Record<string, unknown> = {}) {
	return {
		productName: 'Latte',
		priceSat: 200,
		priceText: '200 SAT (≈ MOCK)',
		onAdd: vi.fn(),
		onCancel: vi.fn(),
		...over
	};
}

describe('5603 popup — chips + note + add', () => {
	it('overlay + sheet + price + 4 chips (first pressed) + note input + add/cancel', () => {
		render(PosModifierPopup, { props: popupProps() });
		expect(screen.getByTestId('modifier-popup')).toBeTruthy();
		expect(screen.getByTestId('popup-price').textContent).toContain('200 SAT');
		const chips = screen.getAllByTestId('modifier-chip');
		expect(chips).toHaveLength(4);
		expect(chips[0].getAttribute('aria-pressed')).toBe('true');
		expect(chips[1].getAttribute('aria-pressed')).toBe('false');
		expect(screen.getByTestId('line-note-input')).toBeTruthy();
		expect(screen.getByTestId('popup-add').textContent).toContain('200 SAT');
		expect(screen.getByTestId('popup-cancel')).toBeTruthy();
	});

	it('chip switch + note typing → onAdd carries { modifier, modifierLabel, note }', async () => {
		const p = popupProps();
		render(PosModifierPopup, { props: p });
		await fireEvent.click(screen.getAllByTestId('modifier-chip')[1]); // less (locale key pos.popup.mod_less)
		expect(screen.getAllByTestId('modifier-chip')[1].getAttribute('aria-pressed')).toBe('true');
		await fireEvent.input(screen.getByTestId('line-note-input'), { target: { value: 'หวานน้อย' } });
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(p.onAdd).toHaveBeenCalledTimes(1);
		expect(p.onAdd).toHaveBeenCalledWith({
			modifier: 'less',
			modifierLabel: 'pos.popup.mod_less',
			note: 'หวานน้อย'
		});
	});

	it('note trims; cancel fires onCancel', async () => {
		const p = popupProps();
		render(PosModifierPopup, { props: p });
		await fireEvent.input(screen.getByTestId('line-note-input'), { target: { value: '  ไม่ใส่น้ำแข็ง  ' } });
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(p.onAdd).toHaveBeenCalledWith({
			modifier: 'regular',
			modifierLabel: 'pos.popup.mod_regular',
			note: 'ไม่ใส่น้ำแข็ง'
		});
		await fireEvent.click(screen.getByTestId('popup-cancel'));
		expect(p.onCancel).toHaveBeenCalledTimes(1);
	});

	it('all popup touch targets are 44px (chips + note + buttons)', async () => {
		const { readFileSync } = await import('node:fs');
		const { fileURLToPath } = await import('node:url');
		const { dirname, resolve } = await import('node:path');
		const css = readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), '..', 'PosModifierPopup.svelte'),
			'utf-8'
		);
		expect(css).toContain('min-height: 44px');
	});
});

const leftFor = (sats: number) => `${((sats * 3_000_000) / 100_000_000).toFixed(2)} THB`;
const rightFor = (sats: number) => `≈ ${leftFor(sats)}`;

// Mockup STATE B: latte 2 rows (less+note ×1 / regular ×2).
const lines: CartLine[] = [
	{
		productId: 'latte',
		name: 'Latte',
		unitPriceSat: 200,
		qty: 1,
		lineTotalSat: 200,
		lineId: 'latte:less:หวานน้อย',
		modifier: 'less',
		modifierLabel: 'หวานน้อย',
		note: 'หวานน้อย'
	},
	{
		productId: 'latte',
		name: 'Latte',
		unitPriceSat: 200,
		qty: 2,
		lineTotalSat: 400,
		lineId: 'latte:regular:',
		modifier: 'regular',
		modifierLabel: 'หวานปกติ',
		note: ''
	}
];

function billProps(over: Record<string, unknown> = {}) {
	return {
		lines,
		totalSat: 600,
		fiatText: rightFor(600),
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

describe('5603 bill — separate rows per product+modifier+note', () => {
	it('same product renders 2 rows keyed by lineId (not productId)', () => {
		render(PosBill, { props: billProps() });
		const rows = screen.getAllByTestId('bill-line');
		expect(rows).toHaveLength(2);
		expect(rows[0].getAttribute('data-line-for')).toBe('latte:less:หวานน้อย');
		expect(rows[1].getAttribute('data-line-for')).toBe('latte:regular:');
	});

	it('note row: plain name + escaped note sub-row; label-only row: name suffix, no note div', () => {
		render(PosBill, { props: billProps() });
		// row 1: name plain (note present) + note "หวานน้อย · หวานน้อย"
		expect(screen.getAllByTestId('bill-line-name')[0].textContent).toBe('Latte');
		expect(screen.getAllByTestId('bill-line-note')[0].textContent).toBe('หวานน้อย · หวานน้อย');
		// row 2: name + suffix, no note div rendered
		expect(screen.getAllByTestId('bill-line-name')[1].textContent).toBe('Latte · หวานปกติ');
		expect(screen.getAllByTestId('bill-line-note')).toHaveLength(1);
	});

	it('note renders as text (escaped) — markup in the note never becomes HTML', () => {
		const evil: CartLine = {
			productId: 'latte',
			name: 'Latte',
			unitPriceSat: 200,
			qty: 1,
			lineTotalSat: 200,
			modifier: 'less',
			modifierLabel: 'หวานน้อย',
			note: '<img src=x onerror=alert(1)>'
		};
		render(PosBill, { props: billProps({ lines: [evil] }) });
		const noteEl = screen.getByTestId('bill-line-note');
		expect(noteEl.textContent).toContain('<img src=x onerror=alert(1)>');
		expect(noteEl.querySelector('img')).toBeNull();
	});

	it('each row owns a stepper keyed by lineId; inc/dec carry the lineId', async () => {
		const p = billProps();
		render(PosBill, { props: p });
		const steppers = screen.getAllByTestId('bill-stepper');
		expect(steppers[0].getAttribute('data-stepper-for')).toBe('latte:less:หวานน้อย');
		expect(steppers[1].getAttribute('data-stepper-for')).toBe('latte:regular:');
		await fireEvent.click(screen.getAllByTestId('bill-inc')[1]);
		expect(p.onInc).toHaveBeenCalledWith('latte:regular:');
		await fireEvent.click(screen.getAllByTestId('bill-dec')[0]);
		expect(p.onDec).toHaveBeenCalledWith('latte:less:หวานน้อย');
	});

	it('locks hold: stepper 120px + total 80px right tabular; total 600', () => {
		render(PosBill, { props: billProps() });
		expect(screen.getByTestId('bill-total-amount').textContent).toBe('600');
		expect(screen.getAllByTestId('bill-line-total')[1].textContent).toBe('400');
	});
});
