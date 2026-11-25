/**
 * TASK-5438 rev35 equal_width_r35 — NEW scoped tests (all fresh, no reuse).
 * Asserts QR/camera containers are full card width (480) with square kept,
 * at every breakpoint (width:100%), on BOTH LN + Cashu screens.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const LN = 'src/components/pos/PosCheckoutLn.svelte';
const CASHU = 'src/components/pos/PosCheckoutCashu.svelte';
const QRD = 'src/lib/components/QRDisplay.svelte';

function read(p: string): string {
	return fs.readFileSync(path.resolve(p), 'utf8');
}
/** strip HTML comments so history notes mentioning "320" don't false-positive */
function styleOf(src: string): string {
	const noComments = src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
	const m = noComments.match(/<style>([\s\S]*)<\/style>/);
	return m ? m[1] : '';
}
function rule(style: string, sel: string): string {
	const m = style.match(new RegExp(`${sel}\\s*\\{[^}]*\\}`, 's'));
	return m ? m[0] : '';
}

describe('TASK-5438 rev35 equal-width (NEW)', () => {
	it('e-1: LN qr-frame = 480 (full card, no 320 bottleneck), width 100%', () => {
		const r = rule(styleOf(read(LN)), '\\.qr-frame');
		expect(r).toMatch(/max-width:\s*480px/);
		expect(r).toMatch(/width:\s*100%/);
		expect(r).not.toMatch(/320px/);
	});

	it('e-2: LN invoice card = 480 (lower card equals QR width)', () => {
		const r = rule(styleOf(read(LN)), '\\.invoice-text');
		expect(r).toMatch(/max-width:\s*480px/);
		expect(r).toMatch(/width:\s*100%/);
		expect(r).not.toMatch(/320px/);
	});

	it('e-3: LN pos-screen cap = 480 (QR == card == screen)', () => {
		const r = rule(styleOf(read(LN)), '\\.pos-screen');
		expect(r).toMatch(/max-width:\s*480px/);
	});

	it('e-4: Cashu qr-live = 480 + square 1/1 kept, no 4/3', () => {
		const style = styleOf(read(CASHU));
		const r = rule(style, '\\.qr-live');
		expect(r).toMatch(/max-width:\s*480px/);
		expect(r).toMatch(/width:\s*100%/);
		expect(r).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
		expect(r).not.toMatch(/320px/);
		expect(style).not.toMatch(/4\s*\/\s*3/);
	});

	it('e-5: Cashu qr-scanner = 480 + square 1/1 kept', () => {
		const r = rule(styleOf(read(CASHU)), '\\.qr-scanner');
		expect(r).toMatch(/max-width:\s*480px/);
		expect(r).toMatch(/width:\s*100%/);
		expect(r).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
		expect(r).not.toMatch(/320px/);
	});

	it('e-6: Cashu pos-screen cap = 480 (camera == paste Card == screen)', () => {
		const r = rule(styleOf(read(CASHU)), '\\.pos-screen');
		expect(r).toMatch(/max-width:\s*480px/);
	});

	it('e-7: QR square kept — QRDisplay image aspect 1 + width 100% (scales to 480 frame)', () => {
		const style = styleOf(read(QRD));
		const r = rule(style, '\\.qr-image');
		expect(r).toMatch(/width:\s*100%/);
		expect(r).toMatch(/aspect-ratio:\s*1/);
	});

	it('e-8: L-T015 — no hardcoded TH in either screen (EN keys + flag only)', () => {
		for (const p of [LN, CASHU]) {
			const src = read(p);
			// Thai unicode block must not appear literally in component
			expect(src).not.toMatch(/[\u0E00-\u0E7F]/);
			// EN i18n keys retained
			expect(src).toMatch(/\$_\('/);
		}
	});

	it('e-9: breakpoints — every QR/camera/card rule is width:100% (equal at all widths)', () => {
		const ln = styleOf(read(LN));
		const ca = styleOf(read(CASHU));
		for (const r of [rule(ln, '\\.qr-frame'), rule(ln, '\\.invoice-text'), rule(ca, '\\.qr-live'), rule(ca, '\\.qr-scanner')]) {
			expect(r).toMatch(/width:\s*100%/);
			expect(r).toMatch(/margin:\s*0\s*auto/);
		}
	});
});

/**
 * TASK-5604 wide frame (paired with the new code — approved mockup 3/3 R4).
 * Base 480 locks (e-1..e-6) stay green: phone base is UNCHANGED.
 * New: ≥640px → 720, ≥1024px → 960, pos-only (.pos-screen + inner
 * QR/camera/card rules move together so equal-width holds at every width).
 */
describe('TASK-5604 wide frame (NEW, paired)', () => {
	const POS_FILES = [
		'src/components/pos/PosCatalog.svelte',
		'src/components/pos/PosBill.svelte',
		'src/components/pos/PosHistory.svelte',
		'src/components/pos/PosCheckoutLn.svelte',
		'src/components/pos/PosCheckoutCashu.svelte',
		'src/components/pos/PosSuccess.svelte',
		'src/components/pos/PosManage.svelte'
	];
	/** strip HTML + CSS comments so history notes never false-positive */
	function cssOf(p: string): string {
		const src = read(p).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
		const m = src.match(/<style>([\s\S]*)<\/style>/);
		return m ? m[1] : '';
	}
	/** @media (min-width: X) block raises `sel` to max-width Y */
	function hasBp(css: string, minW: number, sel: string, maxW: number): boolean {
		const re = new RegExp(
			`@media\\s*\\(min-width:\\s*${minW}px\\)\\s*\\{[\\s\\S]*?${sel}[\\s\\S]*?max-width:\\s*${maxW}px`
		);
		return re.test(css);
	}

	it('w-1: every pos .pos-screen keeps phone base max-width 480', () => {
		for (const f of POS_FILES) {
			const r = rule(cssOf(f), '\\.pos-screen');
			expect(r, `${f} phone base`).toMatch(/max-width:\s*480px/);
			expect(r, `${f} phone base`).toMatch(/width:\s*100%/);
		}
	});

	it('w-2: every pos .pos-screen widens 720 @640px + 960 @1024px', () => {
		for (const f of POS_FILES) {
			const css = cssOf(f);
			expect(hasBp(css, 640, '\\.pos-screen', 720), `${f} 640→720`).toBe(true);
			expect(hasBp(css, 1024, '\\.pos-screen', 960), `${f} 1024→960`).toBe(true);
		}
	});

	it('w-3: LN qr-frame + invoice-text follow 720/960 (equal at every width)', () => {
		const css = cssOf(LN);
		for (const sel of ['\\.qr-frame', '\\.invoice-text']) {
			expect(hasBp(css, 640, sel, 720)).toBe(true);
			expect(hasBp(css, 1024, sel, 960)).toBe(true);
		}
	});

	it('w-4: Cashu qr-live + qr-scanner follow 720/960 (square kept by w-4 base e-4/e-5)', () => {
		const css = cssOf(CASHU);
		for (const sel of ['\\.qr-live', '\\.qr-scanner']) {
			expect(hasBp(css, 640, sel, 720)).toBe(true);
			expect(hasBp(css, 1024, sel, 960)).toBe(true);
		}
	});
});
