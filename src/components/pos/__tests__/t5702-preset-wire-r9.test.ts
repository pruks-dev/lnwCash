/**
 * TASK-5702-R9 — scoped vitest for Commander ORDER option 3 ข้อ
 * (INTENT-057 BLUEPRINT v3 rev21, verbatim โอเค สั่งแก้เลย):
 * (1) แถวเพิ่มตรง mockup R6 — input radius 8px/padding 10px + ปุ่ม
 *     radius 12px/font 14px ทั้ง 2 ฟอร์ม (.preset-add shared)
 * (2) × วงกลมจริง — flex กลาง 2 แกน + ล็อก 26px + shrink 0 ทั้ง 2 ฟอร์ม
 * (3) popup ต่อสาย presets รายตัว — seller presets ชนะ, ว่างตกชุดกลาง
 *     (global MODIFIERS), แก้ตัวไหนขายตัวนั้น (PosApp presets wiring)
 * Run scoped ONLY (L-P033 — never bare vitest).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PosModifierPopup from '../PosModifierPopup.svelte';

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
const manageCss = readFileSync(resolve(here, '..', 'PosManage.svelte'), 'utf-8');
const popupSrc = readFileSync(resolve(here, '..', 'PosModifierPopup.svelte'), 'utf-8');
const appSrc = readFileSync(resolve(here, '..', 'PosApp.svelte'), 'utf-8');

// TASK-5702-R15 (F-CI-02 env guard): mockup R6 อยู่นอก repo (ARX evidence) —
// มีบน local dev แต่ไม่มีบน CI runner → ไม่มีไฟล์ให้ข้าม (skip) แทน ENOENT.
// Path แบบ relative ล้วน (ห้าม hardcode absolute ใหม่). local มีไฟล์ → รันจริง
// ไม่ skip ผิด. หมายเหตุ: ไม่อ่าน env/process.stdout — ใน vitest forks worker
// ของ repo นี้ env ที่ส่งมาตอน invoke ไม่ทะลุถึง worker และ process.stdout
// เป็น undefined (probe R15) จึงใช้ existsSync อย่างเดียว
const mockupDir = resolve(
	here,
	'..',
	'..',
	'..',
	'..',
	'..',
	'..',
	'ARX',
	'.arx',
	'evidence',
	'saber-frontend',
	'TASK-5700-R6'
);
const mockupFiles = ['mockup-manage-list-B.html', 'mockup-manage-add.html'].map((f) =>
	resolve(mockupDir, f)
);
const hasMockups = mockupFiles.every((f) => existsSync(f));

function ruleBody(css: string, selector: string): string {
	const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
	const m = css.match(re);
	if (!m) throw new Error(`rule not found: ${selector}`);
	return m[1];
}

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

describe('R9 option (1) — แถวเพิ่มตรง mockup R6 (ทั้ง 2 ฟอร์ม shared class)', () => {
	it('input radius 8px + padding 0 10px (mockup .preset-add input verbatim)', () => {
		const body = ruleBody(manageCss, '.preset-add input');
		expect(body).toContain('border-radius: 8px');
		expect(body).toContain('padding: 0 10px');
	});

	it('ปุ่ม radius 12px + font 14px (mockup .preset-add-btn verbatim)', () => {
		const body = ruleBody(manageCss, '.preset-add-btn');
		expect(body).toContain('border-radius: 12px');
		expect(body).toContain('font-size: 14px');
	});

	it.skipIf(!hasMockups)(
		'ค่าตรง mockup R6 ทั้ง 2 ไฟล์ (L-P036 สัญญา — skip บน runner ที่ไม่มี mockup)',
		() => {
			const mockups = mockupFiles.map((f) => readFileSync(f, 'utf-8'));
			for (const mock of mockups) {
				expect(mock).toContain('border-radius:8px');
				expect(mock).toContain('padding:0 10px');
				expect(mock).toContain('border-radius:12px');
				expect(mock).toContain('font-size:14px');
			}
		}
	);
});

describe('R9 option (2) — × วงกลมจริง (ทั้ง 2 ฟอร์ม shared .chip-x)', () => {
	it('flex กลาง 2 แกน + ล็อก 26px + shrink 0', () => {
		const body = ruleBody(manageCss, '.chip-x');
		expect(body).toContain('display: flex');
		expect(body).toContain('align-items: center');
		expect(body).toContain('justify-content: center');
		expect(body).toContain('flex-shrink: 0');
		expect(body).toContain('width: 26px');
		expect(body).toContain('height: 26px');
		expect(body).toContain('min-width: 26px');
		expect(body).toContain('min-height: 26px');
	});
});

describe('R9 option (3) — popup ต่อสาย presets รายตัว', () => {
	it('presets รายตัวชนะ — chips = seller strings, ตัวแรก pressed', () => {
		render(PosModifierPopup, { props: popupProps({ presets: ['หวานน้อย', 'ไม่หวาน', '+ช็อต'] }) });
		const chips = screen.getAllByTestId('modifier-chip');
		expect(chips).toHaveLength(3);
		expect(chips.map((c) => c.textContent?.trim())).toEqual(['หวานน้อย', 'ไม่หวาน', '+ช็อต']);
		expect(chips[0].getAttribute('aria-pressed')).toBe('true');
		expect(chips[0].getAttribute('data-modifier')).toBe('หวานน้อย');
	});

	it('แก้ตัวไหนขายตัวนั้น — เลือก preset + note → onAdd { modifier, modifierLabel, note }', async () => {
		const p = popupProps({ presets: ['หวานน้อย', 'ไม่หวาน'] });
		render(PosModifierPopup, { props: p });
		await fireEvent.click(screen.getAllByTestId('modifier-chip')[1]);
		expect(screen.getAllByTestId('modifier-chip')[1].getAttribute('aria-pressed')).toBe('true');
		await fireEvent.input(screen.getByTestId('line-note-input'), { target: { value: 'ไม่ใส่น้ำแข็ง' } });
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(p.onAdd).toHaveBeenCalledTimes(1);
		expect(p.onAdd).toHaveBeenCalledWith({
			modifier: 'ไม่หวาน',
			modifierLabel: 'ไม่หวาน',
			note: 'ไม่ใส่น้ำแข็ง'
		});
	});

	it('R10 rev23: ไม่มี presets → โน้ตล้วน (0 chips + โน้ตอยู่, fallback หวานกลางถอดทิ้ง)', async () => {
		// rev23 supersedes rev22 skip: empty presets renders the note-only
		// popup (no chips section, note input stays, bare Add works).
		const p = popupProps({ presets: [] });
		render(PosModifierPopup, { props: p });
		expect(screen.queryAllByTestId('modifier-chip')).toHaveLength(0);
		expect(screen.queryByTestId('modifier-chips')).toBeNull();
		expect(screen.queryByText('pos.popup.options')).toBeNull();
		expect(screen.getByTestId('line-note-input')).toBeTruthy();
		await fireEvent.input(screen.getByTestId('line-note-input'), { target: { value: 'x' } });
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(p.onAdd).toHaveBeenCalledWith({ modifier: '', modifierLabel: '', note: 'x' });
		cleanup();
		render(PosModifierPopup, { props: popupProps() });
		expect(screen.queryAllByTestId('modifier-chip')).toHaveLength(0);
		expect(screen.getByTestId('line-note-input')).toBeTruthy();
	});

	it('PosApp wiring — popup รับ presets รายตัวจากแถวที่แตะ (แก้ตัวไหนขายตัวนั้น)', () => {
		expect(appSrc).toContain('presets={popupFor.presets}');
	});

	it('bounded scope — popup ไม่แตะ bill/checkout/cart (แค่ offer list)', () => {
		// import-level guard (comment อ้างชื่อได้ — เช็คโค้ดจริงหลัง strip comment)
		const code = popupSrc
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*$/gm, '');
		expect(code).not.toMatch(/from\s+['"]\.\/PosBill/);
		expect(code).not.toMatch(/from\s+['"]\$lib\/pos\/cart/);
		expect(code).not.toContain('checkout');
		expect(code).not.toContain('addToCart');
		expect(code).not.toContain('PosBill');
		expect(popupSrc).toContain('presets?: string[]');
	});
});
