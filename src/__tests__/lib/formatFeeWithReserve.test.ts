/**
 * TASK-FIX-320: Send.svelte success screen — "Fee: X sats (reserve: Y sats)"
 * display when NUT-08 mint performed an overpaid-fee return.
 *
 * Pure-helper unit tests for `formatFeeWithReserve` — the testable mirror
 * of the i18n key `send.success.fee_with_reserve` (en + th). The live UI
 * uses svelte-i18n in Send.svelte's template; this helper lets us validate
 * the conditional logic (display vs. suppress) without spinning up the
 * full i18n + Svelte component stack.
 *
 * Scenarios:
 *   a) actualFee < feeReserve → returns formatted string with both numbers
 *   b) actualFee === feeReserve → returns null (no display — no overpaid return)
 *   c) actualFee undefined → returns null (legacy melt, no actualFee tracked)
 *   +) edge cases: null inputs, negative values, locale variants
 */
import { describe, it, expect } from 'vitest';
import { formatFeeWithReserve } from '$lib/formatFeeWithReserve';

describe('send success actual_fee display (TASK-FIX-320)', () => {
	// ─── (a) Overpaid return: actualFee < feeReserve → display ─────
	it('a) actualFee < feeReserve → returns formatted string with both numbers', () => {
		const result = formatFeeWithReserve(5, 10, 'en');
		expect(result).not.toBeNull();
		expect(result).toContain('5 sats');
		expect(result).toContain('10 sats');
		expect(result).toContain('reserve');
		// Sanity: full format match
		expect(result).toBe('Fee: 5 sats (reserve: 10 sats)');
	});

	it('a.th) th locale → returns Thai translation with same numbers', () => {
		const result = formatFeeWithReserve(5, 10, 'th');
		expect(result).not.toBeNull();
		expect(result).toContain('5 sats');
		expect(result).toContain('10 sats');
		expect(result).toContain('สำรอง');  // Thai word for "reserve"
		// Sanity: full format match (Thai template)
		expect(result).toBe('ค่าธรรมเนียม: 5 sats (สำรอง: 10 sats)');
	});

	// ─── (b) No overpaid return: actualFee === feeReserve → suppress ─────
	it('b) actualFee === feeReserve → returns null (no display)', () => {
		expect(formatFeeWithReserve(10, 10, 'en')).toBeNull();
		expect(formatFeeWithReserve(0, 0, 'en')).toBeNull();
	});

	// ─── (c) Legacy: actualFee undefined → suppress (backward-compat) ─────
	it('c) actualFee undefined → returns null (legacy melt)', () => {
		expect(formatFeeWithReserve(undefined, 10, 'en')).toBeNull();
	});

	// ─── Edge cases ──────────────────────────────────────────────────────
	it('null actualFee → returns null (defensive)', () => {
		expect(formatFeeWithReserve(null, 10, 'en')).toBeNull();
	});

	it('null feeReserve → returns null (no reserve info)', () => {
		expect(formatFeeWithReserve(5, null, 'en')).toBeNull();
	});

	it('both undefined → returns null', () => {
		expect(formatFeeWithReserve(undefined, undefined, 'en')).toBeNull();
	});

	it('actualFee > feeReserve (impossible over-reserve) → returns null', () => {
		// This shouldn't happen in practice (anomaly guard throws in melt.ts),
		// but the helper should still suppress display if called.
		expect(formatFeeWithReserve(20, 10, 'en')).toBeNull();
	});

	it('default locale is en when not specified', () => {
		const result = formatFeeWithReserve(5, 10);
		expect(result).toBe('Fee: 5 sats (reserve: 10 sats)');
	});

	it('zero actualFee + non-zero reserve (full refund) → displays', () => {
		// Full NUT-08 refund: user paid 0 fee, reserve was 10 sats.
		const result = formatFeeWithReserve(0, 10, 'en');
		expect(result).toBe('Fee: 0 sats (reserve: 10 sats)');
	});

	it('large numbers (e.g. 1000 sats) display without truncation', () => {
		const result = formatFeeWithReserve(1234, 5678, 'en');
		expect(result).toBe('Fee: 1234 sats (reserve: 5678 sats)');
	});

	it('unknown locale (not th) → falls back to en template', () => {
		const result = formatFeeWithReserve(5, 10, 'fr');
		expect(result).toBe('Fee: 5 sats (reserve: 10 sats)');
	});
});
