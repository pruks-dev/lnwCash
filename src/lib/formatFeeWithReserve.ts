/**
 * Fee formatting utilities for displaying network fees with reserve information
 */

export interface FeeResult {
  paidFee: number;
  actualFee: number | null;
  feeReserve: number | null;
  locale: string;
}

/**
 * Determines if Row 2 (legacy Network fee row) should be shown
 * Row 2 should be hidden when Row 3 (fee+reserve) is showing (overpaid case)
 * 
 * @param result - The fee result object
 * @returns boolean - true if Row 2 should be shown, false if hidden
 */
export function shouldShowRow2(result: FeeResult): boolean {
  // Always show Row 2 if paidFee is 0 or negative
  if (result.paidFee <= 0) {
    return false;
  }

  // Case 4: feeReserve = 0, hide Row 2
  if (result.feeReserve === 0) {
    return false;
  }

  // Case 3: Legacy - actualFee is null, show Row 2 (backward-compat)
  if (result.actualFee === null || result.feeReserve === null) {
    return true;
  }

  // Case 1: No overpaid (actualFee >= feeReserve), show Row 2
  // Case 2: Overpaid (actualFee < feeReserve), hide Row 2 (Row 3 shows instead)
  const isOverpaid = result.actualFee < result.feeReserve;
  return !isOverpaid;
}

/**
 * Formats fee with reserve information for Row 3 display
 *
 * TASK-FIX-320 authoritative contract (per MANDATE-041 F-002):
 * - Returns `null` (not empty string) when row should not be shown
 *   (Case 4: no fee, OR Case 1: not overpaid)
 * - Returns formatted string with 'sats' word + locale-based labels
 *   only when actualFee < feeReserve (overpaid / NUT-08)
 *
 * @param result - The fee result object (paidFee, actualFee, feeReserve, locale)
 * @returns string | null - Formatted fee_with_reserve string, or null when not overpaid
 */
export function formatFeeWithReserve(result: FeeResult): string | null {
  // Case 4: No fee → null (NOT empty string) — caller decides display
  if (result.feeReserve === 0 && result.actualFee === 0) {
    return null;
  }

  // Case 3: Legacy - only paidFee available, no overpaid info → null
  // (caller should use `Fee: X` separately if needed)
  if (result.actualFee === null || result.feeReserve === null) {
    return null;
  }

  // Case 1: Not overpaid (actualFee >= feeReserve) → null
  // Only overpaid (actualFee < feeReserve) shows fee_with_reserve row.
  if (result.actualFee >= result.feeReserve) {
    return null;
  }

  // Overpaid case: locale-based word map + 'sats' suffix
  const words =
    result.locale === 'th'
      ? { fee: 'ค่าธรรมเนียม', reserve: 'สำรอง' }
      : { fee: 'Fee', reserve: 'reserve' };

  return `${words.fee}: ${result.actualFee} sats (${words.reserve}: ${result.feeReserve} sats)`;
}
