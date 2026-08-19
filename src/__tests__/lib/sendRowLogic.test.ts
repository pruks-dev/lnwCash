/**
 * TASK-FIX-323: Send.svelte success screen — Row 2 (Fee) display logic tests.
 *
 * Validates the combined Row 2 conditional extracted into
 * `getFeeRowDisplay` (src/lib/sendRowLogic.ts). Mirrors the inline
 * template conditional in Send.svelte lines ~884-908.
 *
 * Scenarios (per TASK-FIX-323 spec):
 *   (a) overpaid (actualFee < feeReserve) → kind: 'overpaid', formatted present
 *   (b) normal (actualFee >= feeReserve)  → kind: 'normal', value = paidFee
 *   (c) legacy (actualFee null)            → kind: 'normal' (fallback to fee only)
 *   (d) paidFee = 0                        → kind: 'hidden' (Row 2 suppressed)
 *   (e) top number (template-level)        → Send.svelte uses paidInvoiceAmount
 *                                            (verified by Send.svelte source grep)
 *
 * Plus regression for fee_with_reserve string format and locale variants.
 */
import { describe, it, expect } from 'vitest';
import { getFeeRowDisplay } from '$lib/sendRowLogic';

describe('TASK-FIX-323 — Send success Row 2 (Fee) display logic', () => {
	// ─── (a) Overpaid return: actualFee < feeReserve → show fee_with_reserve ──
	it('(a) actualFee < feeReserve → kind: "overpaid" with formatted string', () => {
		const r = getFeeRowDisplay(100, 5, 10);
		expect(r.kind).toBe('overpaid');
		if (r.kind === 'overpaid') {
			expect(r.actual).toBe(5);
			expect(r.reserve).toBe(10);
			expect(r.formatted).toBe('Fee: 5 sats (reserve: 10 sats)');
		}
	});

	it('(a.th) th locale → Thai fee_with_reserve format', () => {
		const r = getFeeRowDisplay(100, 5, 10, 'th');
		expect(r.kind).toBe('overpaid');
		if (r.kind === 'overpaid') {
			expect(r.formatted).toBe('ค่าธรรมเนียม: 5 sats (สำรอง: 10 sats)');
		}
	});

	it('(a) zero actualFee (full refund) → still overpaid, formatted present', () => {
		const r = getFeeRowDisplay(100, 0, 10);
		expect(r.kind).toBe('overpaid');
		if (r.kind === 'overpaid') {
			expect(r.formatted).toBe('Fee: 0 sats (reserve: 10 sats)');
		}
	});

	// ─── (b) Normal: actualFee >= feeReserve → show fee: X sats ────────────────
	it('(b) actualFee === feeReserve → kind: "normal", value = paidFee', () => {
		const r = getFeeRowDisplay(100, 100, 100);
		expect(r.kind).toBe('normal');
		if (r.kind === 'normal') {
			expect(r.value).toBe(100);
		}
	});

	it('(b) actualFee > feeReserve (impossible over-reserve) → kind: "normal"', () => {
		// Should never happen in practice (melt.ts anomaly guard throws),
		// but the helper suppresses display and falls back to fee only.
		const r = getFeeRowDisplay(100, 200, 100);
		expect(r.kind).toBe('normal');
		if (r.kind === 'normal') {
			expect(r.value).toBe(100);
		}
	});

	// ─── (c) Legacy: actualFee undefined → fallback to fee only ───────────────
	it('(c) actualFee undefined → kind: "normal" (legacy melt, fallback)', () => {
		const r = getFeeRowDisplay(100, undefined, 10);
		expect(r.kind).toBe('normal');
		if (r.kind === 'normal') {
			expect(r.value).toBe(100);
		}
	});

	it('(c) actualFee null → kind: "normal" (defensive)', () => {
		const r = getFeeRowDisplay(100, null, 10);
		expect(r.kind).toBe('normal');
		if (r.kind === 'normal') {
			expect(r.value).toBe(100);
		}
	});

	it('(c) feeReserve null → kind: "normal" (no reserve info)', () => {
		const r = getFeeRowDisplay(100, 5, null);
		expect(r.kind).toBe('normal');
		if (r.kind === 'normal') {
			expect(r.value).toBe(100);
		}
	});

	it('(c) both undefined → kind: "normal", value = paidFee', () => {
		const r = getFeeRowDisplay(100, undefined, undefined);
		expect(r.kind).toBe('normal');
		if (r.kind === 'normal') {
			expect(r.value).toBe(100);
		}
	});

	// ─── (d) paidFee = 0 → Row 2 hidden ───────────────────────────────────────
	it('(d) paidFee = 0 → kind: "hidden"', () => {
		const r = getFeeRowDisplay(0);
		expect(r.kind).toBe('hidden');
	});

	it('(d) paidFee negative (impossible) → kind: "hidden" (defensive)', () => {
		// Shouldn't happen, but the guard catches it.
		const r = getFeeRowDisplay(-1, 5, 10);
		expect(r.kind).toBe('hidden');
	});

	it('(d) paidFee = 0 with overpaid data → still hidden (paidFee takes precedence)', () => {
		// No fee charged = Row 2 hidden, regardless of overpaid data.
		const r = getFeeRowDisplay(0, 5, 10);
		expect(r.kind).toBe('hidden');
	});

	// ─── (e) Top number uses paidInvoiceAmount (template-level) ────────────────
	// This scenario is verified at the source level: Send.svelte line 869 +
	// line 873 should reference `paidInvoiceAmount`, not `displaySpentAmount`.
	// The component-level render would require setting up the success state
	// with mocked wallet, melt, animation — heavy. Instead we assert that
	// the Send.svelte source uses the correct variable for the top number.
	it('(e) Send.svelte top number uses paidInvoiceAmount (no fee) — source check', async () => {
		// Read the relevant slice of Send.svelte and assert both
		// line-869 (spent-value) and line-873 (amount_sent) use paidInvoiceAmount.
		const { readFile } = await import('node:fs/promises');
		const src = await readFile('src/screens/Send.svelte', 'utf8');
		// Find the success-screen block and assert both spots use paidInvoiceAmount
		const block = src.match(/class="success-section"[\s\S]*?class="success-rows"/);
		expect(block).not.toBeNull();
		if (block) {
			expect(block[0]).toContain('formatSat(paidInvoiceAmount)');
			// Defensive: top number must NOT use displaySpentAmount (= amount+fee)
			// (displaySpentAmount is still used for the animation counter, which is fine)
			const topNumber = block[0].match(/class="spent-value">\{formatSat\(([^)]+)\)\}/);
			expect(topNumber).not.toBeNull();
			expect(topNumber?.[1]).toBe('paidInvoiceAmount');
		}
	});

	// ─── Regression: locale pass-through ───────────────────────────────────────
	it('default locale is en when not specified', () => {
		const r = getFeeRowDisplay(100, 5, 10);
		expect(r.kind).toBe('overpaid');
		if (r.kind === 'overpaid') {
			expect(r.formatted).toBe('Fee: 5 sats (reserve: 10 sats)');
		}
	});
});
