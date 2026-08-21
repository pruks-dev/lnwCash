/**
 * Fee formatting utilities for displaying network fees with reserve information
 */

export interface FeeResult {
  paidFee: number;
  actualFee: number | null;
  feeReserve: number | null;
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
 * @param result - The fee result object
 * @returns string - Formatted fee string
 */
export function formatFeeWithReserve(result: FeeResult): string {
  // Case 4: No fee
  if (result.feeReserve === 0 && result.actualFee === 0) {
    return '';
  }

  // Case 3: Legacy - only paidFee available
  if (result.actualFee === null || result.feeReserve === null) {
    return `Fee: ${result.paidFee}`;
  }

  // Normal case: Show actual fee with reserve
  return `Fee: ${result.actualFee} (reserve: ${result.feeReserve})`;
}
