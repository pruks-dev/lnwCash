/**
 * TASK-316: i18n NUT-08 namespace + parity check.
 *
 * Verifies:
 *   (a) all 5 nut08.* keys present in en.json (truthy, non-empty)
 *   (b) all 5 nut08.* keys present in th.json (truthy, non-empty)
 *   (c) en.json keys === th.json keys (428 = 428, full parity)
 *   (d) t('nut08.fee_return', { values: { amount: 5 } }) returns formatted string
 *
 * Parity baseline: TASK-315 added 5 keys → 422/422. TASK-316 adds 5 nut08.* keys
 * → 427/427. TASK-FIX-320 adds 1 key (`send.success.fee_with_reserve`) per file
 * → 428/428. If a future TASK accidentally drops a key in one locale, this test
 * will fail at scenario (c).
 *
 * Note: the existing i18n-parity.test.ts covers the GLOBAL key-set parity
 * across th.json vs en.json; this test focuses on the NUT-08 namespace
 * specifically (added in TASK-316) plus a runtime format-check for
 * fee_return (the {amount} interpolation placeholder).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { get } from 'svelte/store';

// Mock svelte-i18n to control the locale + provide a working formatter.
// This mirrors the pattern in src/lib/components/__tests__/fee-return-indicator.test.ts
// — instead of waiting for the real `setupI18n()` (which requires navigator etc.),
// we expose a deterministic in-memory formatter keyed off the loaded JSON files.
vi.mock('svelte-i18n', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte-i18n')>();
	const en = JSON.parse(
		readFileSync(resolve(process.cwd(), 'src/locales/en.json'), 'utf-8')
	) as Record<string, string>;
	const th = JSON.parse(
		readFileSync(resolve(process.cwd(), 'src/locales/th.json'), 'utf-8')
	) as Record<string, string>;

	const current = { locale: 'en' as 'en' | 'th', dict: en };
	const dict = {
		subscribe(fn: (v: Record<string, string>) => void) {
			fn(current.dict);
			return () => {};
		}
	};
	const locale = {
		subscribe(fn: (v: string) => void) {
			fn(current.locale);
			return () => {};
		},
		set(v: 'en' | 'th') {
			current.locale = v;
			current.dict = v === 'th' ? th : en;
		}
	};

	// MessageFormatter: replaces {name} placeholders from `values`.
	const formatter = (
		key: string,
		options?: { values?: Record<string, unknown> }
	): string => {
		let template = current.dict[key] ?? key;
		if (options?.values) {
			for (const [k, v] of Object.entries(options.values)) {
				template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
			}
		}
		return template;
	};

	const tStore = {
		subscribe(fn: (v: typeof formatter) => void) {
			fn(formatter);
			return () => {};
		}
	};

	return {
		...actual,
		_: tStore,
		t: tStore,
		locale,
		dictionary: dict,
		init() {},
		register() {},
		getLocaleFromNavigator: () => 'en',
		waitLocale: async () => {}
	};
});

// Load the actual JSON files for scenario (a)-(c). Done at module top so the
// count assertions are deterministic and don't depend on the mock above.
const en = JSON.parse(readFileSync(resolve(process.cwd(), 'src/locales/en.json'), 'utf-8')) as Record<
	string,
	string
>;
const th = JSON.parse(readFileSync(resolve(process.cwd(), 'src/locales/th.json'), 'utf-8')) as Record<
	string,
	string
>;

const REQUIRED_NUT08_KEYS = [
	'nut08.not_supported',
	'nut08.fee_return',
	'nut08.checking_capability',
	'nut08.error.decompose',
	'nut08.error.derive'
] as const;

const TOTAL_KEYS = 428; // 422 (TASK-315) + 5 (TASK-316) + 1 (TASK-FIX-320 send.success.fee_with_reserve)

describe('TASK-316: i18n NUT-08 namespace + parity', () => {
	beforeAll(() => {
		// Sanity: the mock above must have loaded both locale JSONs as full
		// objects — if any are empty, downstream assertions are meaningless.
		expect(Object.keys(en).length).toBeGreaterThan(0);
		expect(Object.keys(th).length).toBeGreaterThan(0);
	});

	it('a) all 5 nut08.* keys present in en.json (truthy, non-empty)', () => {
		for (const key of REQUIRED_NUT08_KEYS) {
			expect(typeof en[key], `en.${key} must be a string`).toBe('string');
			expect(en[key], `en.${key} must be truthy`).toBeTruthy();
			expect(en[key].length, `en.${key} must be non-empty`).toBeGreaterThan(0);
			// No raw-key fallback: value must not equal the key itself.
			expect(en[key], `en.${key} must not equal the key name`).not.toBe(key);
		}
	});

	it('b) all 5 nut08.* keys present in th.json (truthy, non-empty, natural Thai)', () => {
		for (const key of REQUIRED_NUT08_KEYS) {
			expect(typeof th[key], `th.${key} must be a string`).toBe('string');
			expect(th[key], `th.${key} must be truthy`).toBeTruthy();
			expect(th[key].length, `th.${key} must be non-empty`).toBeGreaterThan(0);
			// No raw-key fallback.
			expect(th[key], `th.${key} must not equal the key name`).not.toBe(key);
		}
		// Sanity check on Thai naturalness: at least one Thai value must
		// contain a Thai character (U+0E00–U+0E7F). Catches accidental English.
		const thaiValues = REQUIRED_NUT08_KEYS.map((k) => th[k]);
		const hasThaiChars = thaiValues.some((v) => /[\u0E00-\u0E7F]/.test(v));
		expect(hasThaiChars, 'th.json nut08.* values must contain Thai characters').toBe(true);
	});

	it('c) parity: en.json keys === th.json keys (428 = 428, full parity)', () => {
		const enKeys = Object.keys(en).sort();
		const thKeys = Object.keys(th).sort();

		expect(enKeys.length, 'en.json total key count').toBe(TOTAL_KEYS);
		expect(thKeys.length, 'th.json total key count').toBe(TOTAL_KEYS);
		expect(enKeys.length, 'en/th must have same key count').toBe(thKeys.length);

		// Per-key parity: every key at every index must match.
		for (let i = 0; i < enKeys.length; i++) {
			expect(enKeys[i], `key[${i}] mismatch`).toBe(thKeys[i]);
		}

		// Set-based parity (catches accidental dup / reorder that index-compare misses).
		const missingInTh = enKeys.filter((k) => !thKeys.includes(k));
		const missingInEn = thKeys.filter((k) => !enKeys.includes(k));
		expect(missingInTh, `keys missing from th: ${missingInTh.join(', ')}`).toEqual([]);
		expect(missingInEn, `keys missing from en: ${missingInEn.join(', ')}`).toEqual([]);
	});

	it('d) t("nut08.fee_return", { values: { amount: 5 } }) returns formatted string', async () => {
		// Import after the mock is registered so we get the mocked `t`.
		const svelteI18n = await import('svelte-i18n');
		const formatter = get(svelteI18n.t) as (
			key: string,
			options?: { values?: Record<string, unknown> }
		) => string;

		// EN locale (default in mock) — template "+{amount} sats returned".
		const enMsg = formatter('nut08.fee_return', { values: { amount: 5 } });
		expect(enMsg).toBe('+5 sats returned');
		expect(enMsg).toMatch(/5 sats/);

		// TH locale — template "คืน {amount} sats".
		svelteI18n.locale.set('th');
		const thMsg = formatter('nut08.fee_return', { values: { amount: 5 } });
		expect(thMsg).toBe('คืน 5 sats');
		expect(thMsg).toMatch(/5 sats/);
		expect(thMsg).toMatch(/[\u0E00-\u0E7F]/); // contains Thai chars

		// Reset locale for subsequent tests.
		svelteI18n.locale.set('en');
	});
});
