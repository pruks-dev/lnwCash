/**
 * TASK-5702-R11 rev24 — ปุ่ม popup ใช้ priceText คู่ ไม่มี · (INTENT-057
 * BLUEPRINT v3, Commander ORDER "verbatim สั่งเลย"):
 * ปุ่มเพิ่มลงคำสั่งซื้อ = key เดิม pos.popup.add_to_bill + เว้นวรรคเดียว +
 * priceText คู่ตรงๆ (เช่น ฿65 (≈ … SAT)) — ตัด · ทิ้ง, ไม่มีขา SAT ล้วนแยก.
 * Run scoped ONLY (L-P033 — never bare vitest).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
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

describe('R11 rev24 — ปุ่มใช้ priceText คู่ ไม่มี ·', () => {
	it('THB-first pair: label + ONE space + priceText ตรงๆ', () => {
		render(PosModifierPopup, {
			props: popupProps({ priceText: '฿65 (≈ 143 SAT)' })
		});
		const btn = screen.getByTestId('popup-add');
		expect(btn.textContent).toBe('pos.popup.add_to_bill ฿65 (≈ 143 SAT)');
	});

	it('SAT-first pair: label + ONE space + priceText ตรงๆ', () => {
		render(PosModifierPopup, {
			props: popupProps({ priceText: '2,000 SAT (≈ 63.00 THB)' })
		});
		const btn = screen.getByTestId('popup-add');
		expect(btn.textContent).toBe('pos.popup.add_to_bill 2,000 SAT (≈ 63.00 THB)');
	});

	it('ปุ่มไม่มี · (THB-first + SAT-first)', () => {
		render(PosModifierPopup, { props: popupProps({ priceText: '฿65 (≈ 143 SAT)' }) });
		expect(screen.getByTestId('popup-add').textContent).not.toContain('·');
		cleanup();
		render(PosModifierPopup, {
			props: popupProps({ priceText: '2,000 SAT (≈ 63.00 THB)' })
		});
		expect(screen.getByTestId('popup-add').textContent).not.toContain('·');
	});

	it('dead-rate fiat (priceSat null) ก็โชว์ priceText คู่ — ไม่มีขา SAT ล้วนแยก', () => {
		render(
			PosModifierPopup,
			{ props: popupProps({ priceSat: null, priceText: '฿65 (≈ … SAT)' }) }
		);
		const btn = screen.getByTestId('popup-add');
		expect(btn.textContent).toBe('pos.popup.add_to_bill ฿65 (≈ … SAT)');
		expect(btn.textContent).not.toContain('– SAT');
	});
});

describe('R11 rev24 — source: key เดิม + priceText, ไม่ invent key', () => {
	it('ปุ่มใช้ key เดิม pos.popup.add_to_bill + priceText — ไม่มี · ไม่มี priceSat', () => {
		const code = popupSrc
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*$/gm, '');
		const btnLine = code.split('\n').find((l) => l.includes('popup-add') === false && l.includes('add_to_bill'));
		expect(btnLine).toBeTruthy();
		expect(btnLine).toContain('{priceText}');
		expect(btnLine).not.toContain('·');
		expect(btnLine).not.toContain('priceSat');
	});

	it('ไฟล์ทั้งไฟล์ (รวม comment) ไม่มี · เหลือ', () => {
		expect(popupSrc).not.toContain('·');
	});

	it('locales: key เดิมค่าคงเดิม — ไม่ invent key ใหม่', () => {
		const en = enDict as Record<string, string>;
		const th = thDict as Record<string, string>;
		expect(en['pos.popup.add_to_bill']).toBe('Add to bill');
		expect(th['pos.popup.add_to_bill']).toBe('เพิ่มลงคำสั่งซื้อ');
	});
});
