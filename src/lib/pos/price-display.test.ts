/**
 * TASK-5601 — scoped vitest for src/lib/pos/price-display.ts (HEAVY per-currency display)
 * Run scoped ONLY: npx vitest run src/lib/pos/price-display.test.ts (L-P033 — never bare vitest)
 *
 * Cross-check: converted-leg expectations are computed with the EXISTING
 * fiat stack (formatFiat) — price-display.ts must agree exactly,
 * proving it invents no rate of its own.
 */
import { describe, it, expect } from 'vitest';
import { formatProductPrice, productNativeText } from './price-display';
import { formatFiat } from '../fiat/currency';

const PRICE_THB = 1_700_000; // TEST INPUT, not a real rate

const NATIVE_THB = { priceSat: 5882, currency: 'THB' as const, amount: 100 };
const SAT_ONLY = { priceSat: 500, currency: null, amount: null };

describe('productNativeText', () => {
	it('formats the stored amount, no rate needed', () => {
		expect(productNativeText(NATIVE_THB)).toBe('100.00 THB');
		expect(productNativeText({ currency: 'JPY', amount: 150 })).toBe('150 JPY');
	});

	it('SAT-only product → null', () => {
		expect(productNativeText(SAT_ONLY)).toBeNull();
	});
});

describe('formatProductPrice (catalog/bill/checkout/history/summary contract)', () => {
	it('native match → stored amount even when the rate is gone', () => {
		expect(formatProductPrice(NATIVE_THB, null, 'THB')).toBe('100.00 THB');
		expect(formatProductPrice(NATIVE_THB, undefined, 'THB')).toBe('100.00 THB');
	});

	it('foreign currency → formatFiat of priceSat (matches fiat stack exactly)', () => {
		expect(formatProductPrice(NATIVE_THB, PRICE_THB, 'USD')).toBe(
			formatFiat(5882, PRICE_THB, 'USD')
		);
		expect(formatProductPrice(SAT_ONLY, PRICE_THB, 'THB')).toBe(
			formatFiat(500, PRICE_THB, 'THB')
		);
	});

	it('dead rate + no native → "– CUR" (never fabricated)', () => {
		expect(formatProductPrice(SAT_ONLY, null, 'THB')).toBe('– THB');
		expect(formatProductPrice(NATIVE_THB, null, 'USD')).toBe('– USD');
	});
});
