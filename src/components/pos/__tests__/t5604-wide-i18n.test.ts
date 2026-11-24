/**
 * TASK-5604 — wide-frame isolation + i18n parity (INTENT-056 BLUEPRINT-056 v2,
 * approved mockup 3/3 R4). Run scoped ONLY (L-P033 — never bare vitest).
 *
 * - u-1: wallet 480 untouched — no 720px/960px anywhere outside pos scope.
 *         Legacy src/screens/Pos*.svelte are DEAD code (App renders PosApp;
 *         their pre-existing TASK-5412 720px is out of scope, not scanned).
 * - p-1: TH=EN key parity — the ONLY dict diffs are 6 pre-existing fiat_* gaps
 *         (baseline-proven, non-pos, untouched by 5604).
 * - p-2: 11 new keys (10 popup + 1 catalog aria) exist in BOTH locales;
 *         EN copy locked; TH values pinned to reed TASK-5604-TH fill
 *         (updated from reed-pending placeholder by TASK-5604-PIN).
 * - p-3/p-4: no hardcoded TH copy in the popup (raw file) / catalog markup
 *         (comments stripped — e-8 methodology; doc comments may cite ฿).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';

function read(p: string): string {
	return fs.readFileSync(path.resolve(p), 'utf8');
}
function stripComments(src: string): string {
	return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const NEW_KEYS = [
	'pos.catalog.tap_to_customize',
	'pos.popup.mod_regular',
	'pos.popup.mod_less',
	'pos.popup.mod_none',
	'pos.popup.mod_shot',
	'pos.popup.options_for',
	'pos.popup.sweetness',
	'pos.popup.note_label',
	'pos.popup.note_aria',
	'pos.popup.note_placeholder',
	'pos.popup.add_to_bill'
] as const;

/** EN copy owned by 5604 (agent may write EN — L-T015 allows; TH is reed-only). */
const EN_COPY: Record<string, string> = {
	'pos.catalog.tap_to_customize': '{name} — tap to pick options and note',
	'pos.popup.mod_regular': 'Regular',
	'pos.popup.mod_less': 'Less sweet',
	'pos.popup.mod_none': 'No sugar',
	'pos.popup.mod_shot': '+ Shot',
	'pos.popup.options_for': 'Options for {name}',
	'pos.popup.sweetness': 'Sweetness',
	'pos.popup.note_label': 'Note (per row — not per bill)',
	'pos.popup.note_aria': 'Per-item note',
	'pos.popup.note_placeholder': 'e.g. no ice',
	'pos.popup.add_to_bill': 'Add to bill'
};

/**
 * TH copy filled by reed TASK-5604-TH (INTENT-056) — saber-frontend PIN only.
 * Test pins these values; locales/th.json itself is reed-owned (do NOT edit there).
 */
const TH_COPY: Record<string, string> = {
	'pos.catalog.tap_to_customize': '{name} — แตะเพื่อเลือกตัวเลือกและโน้ต',
	'pos.popup.mod_regular': 'หวานปกติ',
	'pos.popup.mod_less': 'หวานน้อย',
	'pos.popup.mod_none': 'ไม่หวาน',
	'pos.popup.mod_shot': '+ ช็อต',
	'pos.popup.options_for': 'ตัวเลือกสำหรับ {name}',
	'pos.popup.sweetness': 'ความหวาน',
	'pos.popup.note_label': 'โน้ต (แยกแถว — ไม่ใช่ทั้งคำสั่งซื้อ)',
	'pos.popup.note_aria': 'โน้ตแยกแถว',
	'pos.popup.note_placeholder': 'เช่น ไม่ใส่น้ำแข็ง',
	'pos.popup.add_to_bill': 'เพิ่มลงคำสั่งซื้อ'
};

/** Pre-existing (baseline-proven) non-pos gaps — NOT 5604 scope, must not grow. */
const KNOWN_PREEXISTING_MISSING_IN_TH = [
	'screen.receive.error_fiat_dust',
	'screen.receive.error_fiat_unavailable',
	'screen.receive.fiat_stale',
	'screen.send.error_fiat_dust',
	'screen.send.error_fiat_unavailable',
	'screen.send.fiat_stale'
];

describe('TASK-5604 wallet untouched (u-1)', () => {
	it('no 720px/960px outside pos scope; wallet files keep max-width 480', () => {
		const screensDir = path.resolve('src/screens');
		const walletScreens = fs
			.readdirSync(screensDir)
			.filter((f) => f.endsWith('.svelte') && !f.startsWith('Pos'))
			.map((f) => path.join(screensDir, f));
		const appShell = [path.resolve('src/App.svelte')];
		const nonPosComponents: string[] = [];
		for (const dir of ['src/components', 'src/lib/components']) {
			const root = path.resolve(dir);
			if (!fs.existsSync(root)) continue;
			for (const f of fs.readdirSync(root)) {
				const full = path.join(root, f);
				if (f.endsWith('.svelte')) nonPosComponents.push(full);
				else if (fs.statSync(full).isDirectory() && f !== 'pos' && f !== '__tests__') {
					for (const g of fs.readdirSync(full)) {
						if (g.endsWith('.svelte')) nonPosComponents.push(path.join(full, g));
					}
				}
			}
		}
		const files = [...walletScreens, ...appShell, ...nonPosComponents];
		expect(files.length).toBeGreaterThan(5); // sanity: scan is non-empty
		const joined = files.map((f) => `--- ${f}\n${read(f)}`).join('\n');
		expect(joined).not.toMatch(/720px/);
		expect(joined).not.toMatch(/960px/);
		expect(joined).toMatch(/max-width:\s*480px/); // sanity: wallet 480 present
	});
});

describe('TASK-5604 i18n parity (p-1..p-4)', () => {
	it('p-1: TH=EN key parity except 6 known pre-existing fiat gaps', () => {
		const en = enDict as Record<string, string>;
		const th = thDict as Record<string, string>;
		const missingInTh = Object.keys(en).filter((k) => !(k in th)).sort();
		const missingInEn = Object.keys(th).filter((k) => !(k in en)).sort();
		expect(missingInEn).toEqual([]);
		expect(missingInTh).toEqual([...KNOWN_PREEXISTING_MISSING_IN_TH].sort());
		// pos.* subset is fully equal (the 5604 scope + all prior pos keys)
		const posEn = Object.keys(en).filter((k) => k.startsWith('pos.')).sort();
		const posTh = Object.keys(th).filter((k) => k.startsWith('pos.')).sort();
		expect(posTh).toEqual(posEn);
	});

	it('p-2: 11 new keys in BOTH locales; EN locked; TH = reed fill (TASK-5604-TH)', () => {
		const en = enDict as Record<string, string>;
		const th = thDict as Record<string, string>;
		for (const k of NEW_KEYS) {
			expect(en[k], `${k} EN present`).toBe(EN_COPY[k]);
			expect(th[k], `${k} TH key present`).toBeDefined();
			// PIN: TH values filled by reed TASK-5604-TH — must match exactly.
			expect(th[k], `${k} TH pinned`).toBe(TH_COPY[k]);
			// Guard: no silent revert to EN placeholder.
			expect(th[k], `${k} TH != EN placeholder`).not.toBe(en[k]);
		}
	});

	it('p-3: no hardcoded TH copy in PosModifierPopup (raw file — comments included)', () => {
		const src = read('src/components/pos/PosModifierPopup.svelte');
		expect(src).not.toMatch(/[\u0E00-\u0E7F]/);
		expect(src).toMatch(/pos\.popup\.mod_regular/);
		expect(src).toMatch(/\$_\('/);
	});

	it('p-4: no hardcoded TH copy in PosCatalog markup (comments stripped)', () => {
		const src = stripComments(read('src/components/pos/PosCatalog.svelte'));
		expect(src).not.toMatch(/[\u0E00-\u0E7F]/);
		expect(src).toMatch(/pos\.catalog\.tap_to_customize/);
	});
});
