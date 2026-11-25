/**
 * TASK-5710 — scoped vitest for src/lib/pos/price-display.ts (v3 truth display)
 * Run scoped ONLY: npx vitest run src/lib/pos/price-display.test.ts (L-P033 — never bare vitest)
 *
 * Cross-check: converted-leg expectations are computed with the EXISTING
 * fiat stack (formatFiat / fiatToSats) — price-display.ts must agree
 * exactly, proving it invents no rate of its own.
 */
import { describe, it, expect } from 'vitest';
import { formatProductPrice, productNativeText } from './price-display';
import { formatFiat } from '../fiat/currency';
import { fiatToSats } from '../fiat/convert';

const PRICE_THB = 1_700_000; // TEST INPUT, not a real rate

const NATIVE_THB = { currency: 'THB' as const, amount: 100 };
const SAT_TRUTH = { currency: 'SAT' as const, amount: 500 };

describe('productNativeText', () => {
	it('formats the stored truth, no rate needed', () => {
		expect(productNativeText(NATIVE_THB)).toBe('100.00 THB');
		expect(productNativeText({ currency: 'JPY', amount: 150 })).toBe('150 JPY');
		expect(productNativeText(SAT_TRUTH)).toBe('500 SAT');
	});

	it('SAT truth renders even when the rate is gone', () => {
		expect(productNativeText(SAT_TRUTH)).toBe('500 SAT');
	});

	it('invalid truth → null', () => {
		expect(productNativeText({ currency: 'SAT', amount: 0 })).toBeNull();
		expect(productNativeText({ currency: 'THB', amount: -1 })).toBeNull();
	});
});

describe('formatProductPrice (catalog/bill/checkout/history/summary contract)', () => {
	it('fiat truth in its own currency → stored amount even when the rate is gone', () => {
		expect(formatProductPrice(NATIVE_THB, null, 'THB')).toBe('100.00 THB');
		expect(formatProductPrice(NATIVE_THB, undefined, 'THB')).toBe('100.00 THB');
	});

	it('SAT truth in fiat view → formatFiat of the amount (matches fiat stack exactly)', () => {
		expect(formatProductPrice(SAT_TRUTH, PRICE_THB, 'THB')).toBe(
			formatFiat(500, PRICE_THB, 'THB')
		);
	});

	it('fiat truth in a foreign currency → live resolve, matches the fiat stack exactly', () => {
		const r = fiatToSats('100', 'THB', PRICE_THB);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(formatProductPrice(NATIVE_THB, PRICE_THB, 'USD')).toBe(
			formatFiat(r.sats, PRICE_THB, 'USD')
		);
	});

	it('dead rate where conversion is needed → "– CUR" (never fabricated)', () => {
		expect(formatProductPrice(SAT_TRUTH, null, 'THB')).toBe('– THB');
		expect(formatProductPrice(NATIVE_THB, null, 'USD')).toBe('– USD');
	});
});
