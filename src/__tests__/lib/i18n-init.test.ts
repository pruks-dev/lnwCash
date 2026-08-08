/**
 * TASK-028: F-016 — Cross-locale Integration Tests
 *
 * Tests setupI18n() across 4 navigator.language scenarios
 * to prevent F-011 recurrence (svelte-i18n crash when locale mismatches
 * between init() and waitLocale()).
 *
 * F-011 root cause: waitLocale('th') hardcoded but navigator.language='en-US'
 * → init loads 'en' but wait waits for 'th' → 'en' not ready on mount → $_() throw
 *
 * F-014 fix (TASK-027): waitLocale(locale) uses same variable as init()
 * F-016: integration tests across 4 cross-locale scenarios
 *
 * Approach:
 * - Mock getLocaleFromNavigator (per-test controlled return value)
 * - Use vi.importActual for real init/register/waitLocale/dictionary
 * - Verify setupI18n() resolves without throwing (no crash)
 * - Verify $_() returns a valid non-key string (translation loaded)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ──────────────────────────────────────────────
// Hoisted mock for getLocaleFromNavigator
// ──────────────────────────────────────────────
const { mockNavLanguage } = vi.hoisted(() => {
	const fn = vi.fn<() => string | null>();
	return { mockNavLanguage: fn };
});

vi.mock('svelte-i18n', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte-i18n')>();
	return {
		...actual,
		getLocaleFromNavigator: () => mockNavLanguage(),
	};
});

// ──────────────────────────────────────────────
// Helper: import setupI18n dynamically
// ──────────────────────────────────────────────
async function loadSetupI18n() {
	const mod = await import('../../lib/i18n');
	return mod.setupI18n;
}

// ──────────────────────────────────────────────
// Helper: get translate function from $_ store
// ──────────────────────────────────────────────
async function getTranslator(): Promise<(key: string) => string> {
	const { _: $_ } = await import('svelte-i18n');
	const fn = get($_ as Parameters<typeof get>[0]) as unknown;
	return fn as (key: string) => string;
}

// Known translations for validation
const TH_APP_NAME = 'LNWCASH Wallet';
const EN_APP_NAME = 'LNWCASH Wallet'; // same for both locales
const TH_TAGLINE = 'Lightning Network Wallet — เร็ว ง่าย ปลอดภัย';
const EN_TAGLINE = 'Lightning Network Wallet — Fast, Easy, Secure';

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
describe('F-016: Cross-locale Integration Tests (i18n-init)', () => {
	beforeEach(() => {
		mockNavLanguage.mockReset();
		vi.resetModules();
	});

	// ───────────────────────────────────────────
	// SCENARIO 1: navigator.language = 'th-TH'
	// NOTE: 'th-TH' does not match registered 'th' exactly;
	// fallbackLocale='en' resolves to EN translations.
	// ───────────────────────────────────────────
	it('SCENARIO 1: navigator.language="th-TH" → setupI18n() resolves, $_() returns EN translation (fallback)', async () => {
		mockNavLanguage.mockReturnValue('th-TH');

		const setupI18n = await loadSetupI18n();
		await expect(setupI18n()).resolves.toBeUndefined();

		const t = await getTranslator();
		expect(typeof t).toBe('function');
		expect(t('app.name')).toBe(EN_APP_NAME);
		expect(t('app.tagline')).toBe(EN_TAGLINE);
		// Verify it's NOT returning the raw key
		expect(t('app.name')).not.toBe('app.name');
	});

	// ───────────────────────────────────────────
	// SCENARIO 2: navigator.language = 'en-US'
	// ───────────────────────────────────────────
	it('SCENARIO 2: navigator.language="en-US" → setupI18n() resolves, $_() returns EN translation', async () => {
		mockNavLanguage.mockReturnValue('en-US');

		const setupI18n = await loadSetupI18n();
		await expect(setupI18n()).resolves.toBeUndefined();

		const t = await getTranslator();
		expect(typeof t).toBe('function');
		expect(t('app.name')).toBe(EN_APP_NAME);
		expect(t('app.tagline')).toBe(EN_TAGLINE);
		expect(t('app.name')).not.toBe('app.name');
	});

	// ───────────────────────────────────────────
	// SCENARIO 3: navigator.language = 'ja-JP' (unsupported)
	// → fallbackLocale='en', expect EN translations
	// ───────────────────────────────────────────
	it('SCENARIO 3: navigator.language="ja-JP" (unsupported) → fallback to "en", no throw', async () => {
		mockNavLanguage.mockReturnValue('ja-JP');

		const setupI18n = await loadSetupI18n();
		await expect(setupI18n()).resolves.toBeUndefined();

		const t = await getTranslator();
		expect(typeof t).toBe('function');
		// Should fallback to 'en' translations
		expect(t('app.name')).toBe(EN_APP_NAME);
		expect(t('app.tagline')).toBe(EN_TAGLINE);
		expect(t('app.name')).not.toBe('app.name');
	});

	// ───────────────────────────────────────────
	// SCENARIO 4: navigator.language = null (undefined)
	// → getLocaleFromNavigator() ?? 'en' → fallback to 'en'
	// ───────────────────────────────────────────
	it('SCENARIO 4: navigator.language=null → fallback to "en", no throw', async () => {
		mockNavLanguage.mockReturnValue(null);

		const setupI18n = await loadSetupI18n();
		await expect(setupI18n()).resolves.toBeUndefined();

		const t = await getTranslator();
		expect(typeof t).toBe('function');
		expect(t('app.name')).toBe(EN_APP_NAME);
		expect(t('app.tagline')).toBe(EN_TAGLINE);
		expect(t('app.name')).not.toBe('app.name');
	});

	// ───────────────────────────────────────────
	// BRONZE: F-011 recurrence prevention
	// ───────────────────────────────────────────
	it('BRONZE: F-011 recurrence — all 4 cross-locale scenarios resolve without crash', async () => {
		const scenarios: Array<{ lang: string | null; expectedTagline: string }> = [
			{ lang: 'th-TH', expectedTagline: EN_TAGLINE },   // → fallback en (th-TH not exact match for 'th')
			{ lang: 'en-US', expectedTagline: EN_TAGLINE },
			{ lang: 'ja-JP', expectedTagline: EN_TAGLINE },   // → fallback en
			{ lang: null, expectedTagline: EN_TAGLINE },       // → fallback en
		];

		for (const { lang, expectedTagline } of scenarios) {
			vi.resetModules();
			mockNavLanguage.mockReset();
			mockNavLanguage.mockReturnValue(lang);

			const setupI18n = await loadSetupI18n();
			await expect(setupI18n()).resolves.toBeUndefined();

			const t = await getTranslator();
			expect(t('app.name'), `Failed for lang=${lang}`).toBe(TH_APP_NAME);
			expect(t('app.tagline'), `Failed for lang=${lang}`).toBe(expectedTagline);
		}
	});
});
