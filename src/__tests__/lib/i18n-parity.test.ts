/**
 * TASK-211: i18n key parity (th = en) + missing error keys + 4-digit PIN copy.
 *
 * Guards:
 *   - th.json and en.json expose the exact same key set (0 missing both ways).
 *   - Wallet error keys (error.invalid_pin / error.wallet_locked /
 *     error.seed_import) referenced by src/lib/wallet/errors.ts exist in both.
 *   - recovery.warning.* + recovery.quiz.* keys are present in both locales.
 *   - No 6-digit PIN leftovers (TASK-209 moved to 4-digit).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'node:url';

// TASK-803: vitest v4 worker processes run with process.cwd() === '/' (probe-
// proven: INIT_CWD/PWD unset inside the worker), so resolve(process.cwd(), …)
// produced '/src/locales/en.json' → ENOENT. Derive the repo root from this
// test file's own location instead: src/__tests__/lib/i18n-parity.test.ts
// → dirname up 3 levels = repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const en = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/locales/en.json'), 'utf-8')) as Record<
	string,
	string
>;
const th = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/locales/th.json'), 'utf-8')) as Record<
	string,
	string
>;

const REQUIRED_ERROR_KEYS = ['error.invalid_pin', 'error.wallet_locked', 'error.seed_import'];
const RECOVERY_WARNING_KEYS = [
	'recovery.warning.title',
	'recovery.warning.no_screenshot',
	'recovery.warning.paper_only',
	'recovery.warning.never_share',
	'recovery.warning.anyone_access',
	'recovery.warning.lose_access',
	'recovery.warning.checkbox_label'
];

describe('TASK-211: i18n key parity (th = en)', () => {
	it('th and en expose the same key set (0 missing each way)', () => {
		const enKeys = new Set(Object.keys(en));
		const thKeys = new Set(Object.keys(th));

		const missingInTh = [...enKeys].filter((k) => !thKeys.has(k)).sort();
		const missingInEn = [...thKeys].filter((k) => !enKeys.has(k)).sort();

		expect(missingInTh, `keys missing from th: ${missingInTh.join(', ')}`).toEqual([]);
		expect(missingInEn, `keys missing from en: ${missingInEn.join(', ')}`).toEqual([]);
		expect(Object.keys(en).length).toBe(Object.keys(th).length);
	});

	it('includes wallet error keys (error.invalid_pin / wallet_locked / seed_import) in both locales', () => {
		for (const key of REQUIRED_ERROR_KEYS) {
			expect(en[key], `en missing ${key}`).toBeTruthy();
			expect(th[key], `th missing ${key}`).toBeTruthy();
		}
	});

	it('keeps recovery.warning.* keys in both locales', () => {
		for (const key of RECOVERY_WARNING_KEYS) {
			expect(en[key], `en missing ${key}`).toBeTruthy();
			expect(th[key], `th missing ${key}`).toBeTruthy();
		}
	});

	it('uses 4-digit PIN copy (no 6-digit leftovers)', () => {
		for (const locale of [en, th]) {
			expect(locale['screen.register.pin_placeholder']).not.toMatch(/6[- ]?(digit|หลัก)/i);
			expect(locale['screen.register.error_too_short']).not.toMatch(/at least 6|6 หลัก/i);
		}
	});

	it('screen.send/receive success_* keys are translated (no raw key fallback)', () => {
		const successKeys = [
			'screen.receive.success_title',
			'screen.receive.success_amount_label',
			'screen.receive.success_dleq_label',
			'screen.send.success_title',
			'screen.send.success_fee_label',
			'screen.send.success_token_copy'
		];
		for (const key of successKeys) {
			expect(th[key], `th missing ${key}`).toBeTruthy();
			expect(th[key]).not.toBe(key);
		}
	});
});
