/**
 * TASK-5702-R10 rev23 — popup 2 ข้อ (INTENT-057 BLUEPRINT v3, Commander ORDER):
 * (1) ไม่มี presets -> popup โน้ตล้วน ไม่โชว์ chips (rev22 skip superseded)
 * (2) ป้ายโน้ตตัดวงเล็บ: โน้ต/Note เพียวๆ (placeholder + aria คงเดิม — key เดิม)
 * คงเดิม rev22(2): ป้ายกลางตัวเลือก/Options + ถอด fallback หวาน (MODIFIERS ทิ้งแล้ว)
 * Run scoped ONLY (L-P033 — never bare vitest).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PosModifierPopup from '../PosModifierPopup.svelte';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const popupSrc = readFileSync(resolve(here, '..', 'PosModifierPopup.svelte'), 'utf-8');
const appSrc = readFileSync(resolve(here, '..', 'PosApp.svelte'), 'utf-8');

function popupProps(over: Record<string, unknown> = {}) {
	return {
		productName: 'Latte',
		priceSat: 200,
		priceText: '200 SAT',
		onAdd: vi.fn(),
		onCancel: vi.fn(),
		...over
	};
}

describe('R10 rev23 (1) — ไม่มี presets = popup โน้ตล้วน ไม่ข้าม', () => {
	it('empty presets -> 0 chips, ไม่มีหัวข้อตัวเลือก, มีช่องโน้ต', () => {
		render(PosModifierPopup, { props: popupProps({ presets: [] }) });
		expect(screen.queryAllByTestId('modifier-chip')).toHaveLength(0);
		expect(screen.queryByTestId('modifier-chips')).toBeNull();
		expect(screen.queryByText('pos.popup.options')).toBeNull();
		expect(screen.getByTestId('modifier-popup')).toBeTruthy();
		expect(screen.getByTestId('line-note-input')).toBeTruthy();
		// ป้ายโน้ตใช้ key เดิม (mock คืน key)
		expect(screen.queryByText('pos.popup.note_label')).toBeTruthy();
	});

	it('missing presets (undefined) -> โน้ตล้วนเหมือนกัน', () => {
		render(PosModifierPopup, { props: popupProps() });
		expect(screen.queryAllByTestId('modifier-chip')).toHaveLength(0);
		expect(screen.queryByTestId('modifier-chips')).toBeNull();
		expect(screen.getByTestId('line-note-input')).toBeTruthy();
	});

	it('bare Add โน้ตล้วน -> { modifier "", note ที่พิมพ์ }', async () => {
		const p = popupProps({ presets: [] });
		render(PosModifierPopup, { props: p });
		await fireEvent.input(screen.getByTestId('line-note-input'), { target: { value: 'ไม่ใส่น้ำแข็ง' } });
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(p.onAdd).toHaveBeenCalledTimes(1);
		expect(p.onAdd).toHaveBeenCalledWith({ modifier: '', modifierLabel: '', note: 'ไม่ใส่น้ำแข็ง' });
	});

	it('มี presets -> chips + โน้ตครบ (ไม่ถดถอย)', async () => {
		const p = popupProps({ presets: ['หวานน้อย', 'ไม่หวาน'] });
		render(PosModifierPopup, { props: p });
		expect(screen.getAllByTestId('modifier-chip')).toHaveLength(2);
		expect(screen.getByText('pos.popup.options')).toBeTruthy();
		expect(screen.getByTestId('line-note-input')).toBeTruthy();
		await fireEvent.click(screen.getAllByTestId('modifier-chip')[1]);
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(p.onAdd).toHaveBeenCalledWith({ modifier: 'ไม่หวาน', modifierLabel: 'ไม่หวาน', note: '' });
	});

	it('PosApp wiring rev23 — ทุก tap เปิด popup (รื้อ skip + guard rev22)', () => {
		expect(appSrc).toContain('{#if popupFor}');
		expect(appSrc).not.toContain('{#if popupFor && (popupFor.presets ?? []).length > 0}');
		expect(appSrc).toContain('popupFor = p;');
		expect(appSrc).not.toContain('if ((p.presets ?? []).length === 0)');
		expect(appSrc).toContain('presets={popupFor.presets}');
	});
});

describe('R10 rev23 (2) — ป้ายโน้ตไม่มีวงเล็บ', () => {
	it('locales: note_label เพียวๆ ทั้ง 2 ภาษา', () => {
		const en = enDict as Record<string, string>;
		const th = thDict as Record<string, string>;
		expect(en['pos.popup.note_label']).toBe('Note');
		expect(th['pos.popup.note_label']).toBe('โน้ต');
		expect(en['pos.popup.note_label']).not.toContain('(');
		expect(th['pos.popup.note_label']).not.toContain('(');
	});

	it('placeholder + aria คงเดิม (key เดิม ไม่รอ reed ใหม่)', () => {
		const en = enDict as Record<string, string>;
		const th = thDict as Record<string, string>;
		expect(en['pos.popup.note_aria']).toBe('Per-item note');
		expect(en['pos.popup.note_placeholder']).toBe('e.g. no ice');
		expect(th['pos.popup.note_aria']).toBe('โน้ตแยกแถว');
		expect(th['pos.popup.note_placeholder']).toBe('เช่น ไม่ใส่น้ำแข็ง');
	});

	it('popup ใช้ key เดิมทั้ง 3 จุด (label/aria/placeholder)', () => {
		render(PosModifierPopup, { props: popupProps({ presets: [] }) });
		const input = screen.getByTestId('line-note-input') as HTMLInputElement;
		expect(input.getAttribute('aria-label')).toBe('pos.popup.note_aria');
		expect(input.getAttribute('placeholder')).toBe('pos.popup.note_placeholder');
		expect(screen.queryByText('pos.popup.note_label')).toBeTruthy();
	});
});

describe('R10 คงเดิม rev22(2) — ป้ายกลาง + ไม่มี fallback หวาน', () => {
	it('heading กลาง Options + ไม่มี MODIFIERS/sweetness fallback', () => {
		const code = popupSrc
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*$/gm, '');
		expect(code).toContain('pos.popup.options');
		expect(code).not.toContain('MODIFIERS');
		expect(code).not.toContain('pos.popup.mod_regular');
		expect(code).not.toContain('pos.popup.sweetness');
	});
});
