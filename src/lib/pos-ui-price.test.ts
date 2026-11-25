/**
 * TASK-5710 — scoped vitest for catalog price text (v3 truth price leg)
 * Run scoped ONLY: npx vitest run src/lib/pos-ui-price.test.ts (L-P033 — never bare vitest)
 *
 * - SAT truth → `200 SAT (≈ 63.00 THB)` (SAT first, converted leg).
 * - Fiat truth viewed in its own currency → `฿45.00 (≈ 143 SAT)`
 *   (SAT leg resolves LIVE via fiatToSats — dead rate → `฿45.00 (– SAT)`).
 * - Fiat truth viewed in a FOREIGN currency → SAT-first live leg.
 * - SAT truth + dead rate → `200 SAT (– THB)` (never fabricated).
 */
import { describe, it, expect } from 'vitest';
import { catalogPriceText, nativePriceText, fiatRowText } from './pos-ui';
import { fiatToSats } from './fiat/convert';

describe('nativePriceText', () => {
	it('THB 45 → ฿45.00 (deterministic th-TH, matches approved mockup)', () => {
		expect(nativePriceText(45, 'THB')).toBe('฿45.00');
	});

	it('SAT 200 → 2,000 SAT (no rate involved)', () => {
		expect(nativePriceText(2000, 'SAT')).toBe('2,000 SAT');
	});

	it('non-positive / non-finite amount → empty (caller falls back to the SAT leg)', () => {
		expect(nativePriceText(0, 'THB')).toBe('');
		expect(nativePriceText(-5, 'THB')).toBe('');
		expect(nativePriceText(NaN, 'THB')).toBe('');
	});
});

describe('catalogPriceText', () => {
	it('SAT truth → SAT first + converted leg in parens', () => {
		const got = catalogPriceText({ currency: 'SAT', amount: 200 }, 'THB', 3_000_000);
		expect(got).toBe(`200 SAT (${fiatRowText(200, 'THB', { price: 3_000_000 } as never)})`);
		expect(got).toContain('200 SAT (≈');
	});

	it('fiat truth viewed in its own currency → native + live SAT leg', () => {
		const r = fiatToSats('45', 'THB', 3_000_000);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const got = catalogPriceText({ currency: 'THB', amount: 45 }, 'THB', 3_000_000);
		expect(got).toBe(`฿45.00 (≈ ${r.sats.toLocaleString('en-US')} SAT)`);
	});

	it('fiat truth + dead rate → native leg + blocked SAT leg (never fabricated)', () => {
		expect(catalogPriceText({ currency: 'THB', amount: 45 }, 'THB', null)).toBe(
			'฿45.00 (– SAT)'
		);
	});

	it('fiat truth viewed in USD → SAT-first live converted leg', () => {
		const r = fiatToSats('45', 'THB', 100_000_000);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const got = catalogPriceText({ currency: 'THB', amount: 45 }, 'USD', 100_000_000);
		expect(got).toBe(
			`${r.sats.toLocaleString('en-US')} SAT (${fiatRowText(r.sats, 'USD', { price: 100_000_000 } as never)})`
		);
		expect(got).not.toContain('฿');
	});

	it('SAT truth + dead rate → fiat blocked suffix, SAT leg intact', () => {
		expect(catalogPriceText({ currency: 'SAT', amount: 200 }, 'THB', null)).toBe(
			'200 SAT (– THB)'
		);
	});
});
