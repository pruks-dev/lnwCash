/**
 * TASK-5603 — scoped vitest for catalog price text (mockup 1/3 price leg)
 * (INTENT-056 BLUEPRINT-056 v2).
 * Run scoped ONLY: npx vitest run --project=product src/lib/pos-ui-price.test.ts
 * (L-P033 — never bare vitest).
 *
 * - SAT-only product → `200 SAT (≈ 63.00 THB)` (SAT first, converted leg).
 * - HEAVY native product in its own view currency → `฿45.00 (≈ 143 SAT)`
 *   (native first — rate-independent, works with a dead rate).
 * - native product viewed in a FOREIGN currency → SAT-first converted leg.
 * - dead rate + SAT-only → `200 SAT (– THB)` (never fabricated).
 */
import { describe, it, expect } from 'vitest';
import { catalogPriceText, nativePriceText, fiatRowText } from './pos-ui';

describe('nativePriceText', () => {
	it('THB 45 → ฿45.00 (deterministic th-TH, matches approved mockup)', () => {
		expect(nativePriceText(45, 'THB')).toBe('฿45.00');
	});

	it('non-positive / non-finite amount → empty (caller falls back to SAT leg)', () => {
		expect(nativePriceText(0, 'THB')).toBe('');
		expect(nativePriceText(-5, 'THB')).toBe('');
		expect(nativePriceText(NaN, 'THB')).toBe('');
	});
});

describe('catalogPriceText', () => {
	it('SAT-only product → SAT first + converted leg in parens', () => {
		const got = catalogPriceText({ priceSat: 200 }, 'THB', 3_000_000);
		expect(got).toBe(`200 SAT (${fiatRowText(200, 'THB', { price: 3_000_000 } as never)})`);
		expect(got).toContain('200 SAT (≈');
	});

	it('native THB product viewed in THB → ฿45.00 (≈ 143 SAT), rate-independent', () => {
		const got = catalogPriceText(
			{ priceSat: 143, currency: 'THB', amount: 45 },
			'THB',
			null // dead rate must not matter for the native leg
		);
		expect(got).toBe('฿45.00 (≈ 143 SAT)');
	});

	it('native THB product viewed in USD → SAT-first foreign converted leg', () => {
		const got = catalogPriceText(
			{ priceSat: 143, currency: 'THB', amount: 45 },
			'USD',
			100_000_000
		);
		expect(got.startsWith('143 SAT (')).toBe(true);
		expect(got).not.toContain('฿');
	});

	it('SAT-only + dead rate → fiat blocked suffix, SAT leg intact', () => {
		expect(catalogPriceText({ priceSat: 200 }, 'THB', null)).toBe('200 SAT (– THB)');
	});
});
