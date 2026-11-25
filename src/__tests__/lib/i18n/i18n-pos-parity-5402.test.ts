/**
 * TASK-5402 — i18n pos.* parity (INTENT-054, SELL-UI).
 *
 * Guards:
 *   - Every pos.* / nav.pos / settings.pos.* key exists in BOTH en.json
 *     and th.json (TH carries the EN text verbatim pending the translator —
 *     L-T015 forbids inventing TH, so EN+flag holds parity).
 *   - Global en−th diff stays EXACTLY the 6 known TH-FIAT-6KEYS-052 keys
 *     (allowlist untouched).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const en = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/locales/en.json'), 'utf-8')) as Record<
	string,
	string
>;
const th = JSON.parse(readFileSync(resolve(REPO_ROOT, 'src/locales/th.json'), 'utf-8')) as Record<
	string,
	string
>;

const KNOWN_EN_ONLY_KEYS = [
	'screen.receive.error_fiat_dust',
	'screen.receive.error_fiat_unavailable',
	'screen.receive.fiat_stale',
	'screen.send.error_fiat_dust',
	'screen.send.error_fiat_unavailable',
	'screen.send.fiat_stale'
].sort();

describe('TASK-5402 i18n: pos.* parity', () => {
	it('exposes every pos/nav.pos/settings.pos key in both locales', () => {
		const posKeys = Object.keys(en).filter(
			(k) => k === 'nav.pos' || k.startsWith('pos.') || k.startsWith('settings.pos.')
		);
		expect(posKeys.length).toBeGreaterThan(20);
		for (const key of posKeys) {
			expect(th[key], `th missing ${key}`).toBeTruthy();
			expect(en[key], `en missing ${key}`).toBeTruthy();
		}
	});

	it('keeps the global en−th diff at exactly TH-FIAT-6KEYS-052', () => {
		const enKeys = new Set(Object.keys(en));
		const thKeys = new Set(Object.keys(th));
		const missingInTh = [...enKeys].filter((k) => !thKeys.has(k)).sort();
		const missingInEn = [...thKeys].filter((k) => !enKeys.has(k)).sort();
		expect(missingInEn).toEqual([]);
		expect(missingInTh).toEqual(KNOWN_EN_ONLY_KEYS);
		expect(Object.keys(en).length).toBe(Object.keys(th).length + KNOWN_EN_ONLY_KEYS.length);
	});
});
