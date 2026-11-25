/**
 * TASK-5607 — Commander eye rev13 fix-forward (INTENT-056 BLUEPRINT-056 v2).
 * Run scoped ONLY (L-P033 — never bare vitest).
 *
 * - a-1: popup slide-up/down 200ms — fly (y) + fade transitions, duration
 *         200ms; prefers-reduced-motion guard (JS matchMedia + CSS media query).
 * - a-2: popup logic untouched — chips/note/identity/add/cancel markers intact.
 * - w-1: parent .pos-app 480 → ≥640px 720 → ≥1024px 960, matching the 5604
 *         children (Catalog/Bill/History/Manage).
 * - w-2: App.svelte wrapper does NOT squeeze — no max-width / 720px / 960px
 *         outside pos scope (wallet 480 untouched).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
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

function read(p: string): string {
	return fs.readFileSync(path.resolve(p), 'utf8');
}

/** .pos-app / .pos-screen base max-width (outside any @media block). */
function baseMaxWidth(css: string, sel: string): string | null {
	const style = css.split('<style>')[1]?.split('</style>')[0] ?? '';
	const beforeMedia = style.split('@media')[0];
	const m = beforeMedia.match(new RegExp(`${sel}\\s*\\{[\\s\\S]*?max-width:\\s*(\\d+)px`));
	return m ? m[1] : null;
}

/** max-width of `sel` inside `@media (min-width: X)` block. */
function mediaMaxWidth(css: string, minW: number, sel: string): string | null {
	const style = css.split('<style>')[1]?.split('</style>')[0] ?? '';
	const re = new RegExp(
		`@media\\s*\\(min-width:\\s*${minW}px\\)\\s*\\{[\\s\\S]*?${sel}[\\s\\S]*?max-width:\\s*(\\d+)px`
	);
	const m = style.match(re);
	return m ? m[1] : null;
}

describe('TASK-5607 popup animation (a-1/a-2)', () => {
	it('a-1: slide-up 200ms — sheet keyframes + overlay fade, both 200ms', () => {
		const src = read('src/components/pos/PosModifierPopup.svelte');
		expect(src).toMatch(/@keyframes\s+popup-slide-up/);
		expect(src).toMatch(/@keyframes\s+popup-fade-in/);
		expect(src).toMatch(/translateY\(48px\)/);
		expect(src).toMatch(/\.sheet\s*\{[^}]*animation:\s*popup-slide-up\s+200ms/);
		expect(src).toMatch(/\.overlay\s*\{[^}]*animation:\s*popup-fade-in\s+200ms/);
		// no WAAPI/svelte-transition (jsdom has no element.animate; close path
		// stays an instant unmount — close logic untouched per task)
		expect(src).not.toMatch(/svelte\/transition/);
		expect(src).not.toMatch(/transition:(fly|fade|slide)/);
	});

	it('a-1: prefers-reduced-motion respected (pure-CSS media query kills motion)', () => {
		const src = read('src/components/pos/PosModifierPopup.svelte');
		expect(src).toMatch(/prefers-reduced-motion/);
		expect(src).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
	});

	it('a-2: popup logic untouched — chips/note/identity/add/cancel intact (R10 presets-only)', async () => {
		const onAdd = vi.fn();
		const onCancel = vi.fn();
		render(PosModifierPopup, {
			props: {
				productName: 'Latte',
				priceSat: 200,
				priceText: '200 SAT',
				presets: ['Regular', 'Less sweet'],
				onAdd,
				onCancel
			}
		});
		expect(screen.getByTestId('modifier-popup')).toBeTruthy();
		expect(screen.getAllByTestId('modifier-chip')).toHaveLength(2);
		expect(screen.getByTestId('line-note-input')).toBeTruthy();
		await fireEvent.click(screen.getAllByTestId('modifier-chip')[1]);
		await fireEvent.input(screen.getByTestId('line-note-input'), { target: { value: 'less ice' } });
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(onAdd).toHaveBeenCalledWith({
			modifier: 'Less sweet',
			modifierLabel: 'Less sweet',
			note: 'less ice'
		});
		await fireEvent.click(screen.getByTestId('popup-cancel'));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});

describe('TASK-5607 parent width unlock (w-1/w-2)', () => {
	it('w-1: .pos-app 480 → 720@640 → 960@1024, matching 5604 children', () => {
		const app = read('src/components/pos/PosApp.svelte');
		expect(baseMaxWidth(app, '\\.pos-app')).toBe('480');
		expect(mediaMaxWidth(app, 640, '\\.pos-app')).toBe('720');
		expect(mediaMaxWidth(app, 1024, '\\.pos-app')).toBe('960');
		for (const f of ['PosCatalog.svelte', 'PosBill.svelte', 'PosHistory.svelte', 'PosManage.svelte']) {
			const css = read(`src/components/pos/${f}`);
			const sel = '\\.pos-screen';
			expect(baseMaxWidth(css, sel), `${f} base`).toBe('480');
			expect(mediaMaxWidth(css, 640, sel), `${f} @640`).toBe('720');
			expect(mediaMaxWidth(css, 1024, sel), `${f} @1024`).toBe('960');
		}
	});

	it('w-2: App.svelte wrapper does not squeeze — no width cap, wallet 480 intact', () => {
		const shell = read('src/App.svelte');
		expect(shell).not.toMatch(/720px/);
		expect(shell).not.toMatch(/960px/);
		// .main-content: flex:1, no max-width — PoS child frame owns the width
		const style = shell.split('<style>')[1]?.split('</style>')[0] ?? '';
		const mainBlock = style.match(/\.main-content\s*\{[\s\S]*?\}/)?.[0] ?? '';
		expect(mainBlock).not.toMatch(/max-width/);
	});
});
