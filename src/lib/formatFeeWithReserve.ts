/**
 * TASK-FIX-320: format "Fee: X sats (reserve: Y sats)" display string.
 *
 * Used by Send.svelte success screen to communicate the true fee paid
 * (`actualFee`) alongside the upfront reserve (`feeReserve`) when the
 * mint performed an NUT-08 overpaid-fee return.
 *
 * UX consistency: matches TransactionDetailSheet fee-with-reserve format
 * (TASK-314 — see `src/lib/components/TransactionDetailSheet.svelte`).
 *
 * Pure function — no i18n dependency at runtime (locale parameter selects
 * the raw translation, matching the values in src/locales/{en,th}.json
 * keys `send.success.fee_with_reserve`).
 *
 * @param actualFee - True fee paid after NUT-08 mint overpaid return (sats).
 *                    `undefined`/`null` → legacy melt (no overpaid return).
 * @param feeReserve - Fee reserve from melt quote (sats).
 *                     `undefined`/`null` → no reserve info available.
 * @param locale - UI locale code (`'en'` | `'th'`). Defaults to `'en'`.
 * @returns Formatted string when `actualFee < feeReserve` (overpaid return
 *          occurred). Returns `null` otherwise — caller suppresses display.
 *
 * @example
 *   formatFeeWithReserve(5, 10, 'en')
 *   // → "Fee: 5 sats (reserve: 10 sats)"
 *
 *   formatFeeWithReserve(10, 10, 'en')
 *   // → null  (no overpaid return — equal fees)
 *
 *   formatFeeWithReserve(undefined, 10, 'en')
 *   // → null  (legacy melt — no actualFee tracked)
 */
export function formatFeeWithReserve(
	actualFee: number | undefined | null,
	feeReserve: number | undefined | null,
	locale: string = 'en'
): string | null {
	// Legacy / missing data → no display
	if (actualFee == null || feeReserve == null) return null;

	// No overpaid return occurred → no display (regular fee shown elsewhere)
	if (actualFee >= feeReserve) return null;

	// Locale-specific template — mirrors src/locales/{en,th}.json
	// `send.success.fee_with_reserve` key. Kept as raw literals here so the
	// function stays a pure, i18n-setup-free unit (tests run without svelte-i18n
	// init). The Send.svelte template uses the i18n key directly for live UI;
	// this helper is the testable mirror.
	if (locale === 'th') {
		return `ค่าธรรมเนียม: ${actualFee} sats (สำรอง: ${feeReserve} sats)`;
	}
	return `Fee: ${actualFee} sats (reserve: ${feeReserve} sats)`;
}
