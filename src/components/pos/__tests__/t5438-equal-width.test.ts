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
