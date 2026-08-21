import { describe, it, expect } from 'vitest';
import { formatFeeWithReserve, shouldShowRow2, type FeeResult } from '$lib/formatFeeWithReserve';

describe('formatFeeWithReserve', () => {
  describe('Case 1: No overpaid (actualFee = feeReserve)', () => {
    it('should show Row 2 "Network fee: X sats"', () => {
      const result: FeeResult = {
        paidFee: 10,
        actualFee: 10,
        feeReserve: 10
      };
      expect(shouldShowRow2(result)).toBe(true);
      expect(formatFeeWithReserve(result)).toBe('Fee: 10 (reserve: 10)');
    });
  });

  describe('Case 2: Overpaid (actualFee < feeReserve)', () => {
    it('should hide Row 2, Row 3 shows "Network fee: Fee: X (reserve: Y)"', () => {
      const result: FeeResult = {
        paidFee: 10,
        actualFee: 6,
        feeReserve: 10
      };
      expect(shouldShowRow2(result)).toBe(false);
      expect(formatFeeWithReserve(result)).toBe('Fee: 6 (reserve: 10)');
    });
  });

  describe('Case 3: Legacy (actualFee = null, backward-compat)', () => {
    it('should show Row 2 (backward-compatible behavior)', () => {
      const result: FeeResult = {
        paidFee: 10,
        actualFee: null,
        feeReserve: null
      };
      expect(shouldShowRow2(result)).toBe(true);
      expect(formatFeeWithReserve(result)).toBe('Fee: 10');
    });
  });

  describe('Case 4: feeReserve = 0 (no fee)', () => {
    it('should hide Row 2 and Row 3 (no fee to display)', () => {
      const result: FeeResult = {
        paidFee: 0,
        actualFee: 0,
        feeReserve: 0
      };
      expect(shouldShowRow2(result)).toBe(false);
      expect(formatFeeWithReserve(result)).toBe('');
    });
  });
});
