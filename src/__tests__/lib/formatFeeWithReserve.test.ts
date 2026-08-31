import { describe, it, expect } from 'vitest';
import { formatFeeWithReserve, shouldShowRow2, type FeeResult } from '$lib/formatFeeWithReserve';

describe('formatFeeWithReserve (TASK-FIX-320 authoritative contract)', () => {
  // TASK-FIX-320 AUTHORITATIVE CONTRACT (per MANDATE-041 F-002):
  //   formatFeeWithReserve returns a NON-NULL formatted string ONLY when
  //   actualFee < feeReserve (overpaid / NUT-08 mint return).
  //   All other cases return NULL (caller decides display).
  //
  //   format: `{fee_word}: {actualFee} sats ({reserve_word}: {feeReserve} sats)`
  //     en: 'Fee: X sats (reserve: Y sats)'
  //     th: 'ค่าธรรมเนียม: X sats (สำรอง: Y sats)'

  describe('Case 1: No overpaid (actualFee = feeReserve)', () => {
    it('shouldShowRow2 = true (Row 2 visible) and formatFeeWithReserve returns null (no overpaid row)', () => {
      const result: FeeResult = {
        paidFee: 10,
        actualFee: 10,
        feeReserve: 10,
        locale: 'en'
      };
      expect(shouldShowRow2(result)).toBe(true);
      // TASK-FIX-320: not overpaid → null (caller uses paidFee separately)
      expect(formatFeeWithReserve(result)).toBeNull();
    });
  });

  describe('Case 2: Overpaid (actualFee < feeReserve)', () => {
    it('shouldShowRow2 = false (Row 2 hidden) and formatFeeWithReserve returns formatted string with sats + locale', () => {
      const result: FeeResult = {
        paidFee: 10,
        actualFee: 6,
        feeReserve: 10,
        locale: 'en'
      };
      expect(shouldShowRow2(result)).toBe(false);
      expect(formatFeeWithReserve(result)).toBe('Fee: 6 sats (reserve: 10 sats)');
    });

    it('th locale → Thai translation with same numbers', () => {
      const result: FeeResult = {
        paidFee: 10,
        actualFee: 6,
        feeReserve: 10,
        locale: 'th'
      };
      expect(formatFeeWithReserve(result)).toBe('ค่าธรรมเนียม: 6 sats (สำรอง: 10 sats)');
    });
  });

  describe('Case 3: Legacy (actualFee = null, feeReserve = null)', () => {
    it('shouldShowRow2 = true (Row 2 visible for backward-compat) and formatFeeWithReserve returns null', () => {
      const result: FeeResult = {
        paidFee: 10,
        actualFee: null,
        feeReserve: null,
        locale: 'en'
      };
      expect(shouldShowRow2(result)).toBe(true);
      // TASK-FIX-320: legacy → null (no overpaid info available)
      // Caller (sendRowLogic / Send.svelte) renders plain 'Fee: 10' from paidFee
      expect(formatFeeWithReserve(result)).toBeNull();
    });
  });

  describe('Case 4: feeReserve = 0 (no fee)', () => {
    it('shouldShowRow2 = false (Row 2 hidden) and formatFeeWithReserve returns null', () => {
      const result: FeeResult = {
        paidFee: 0,
        actualFee: 0,
        feeReserve: 0,
        locale: 'en'
      };
      expect(shouldShowRow2(result)).toBe(false);
      // TASK-FIX-320: no fee → null (was '' in TASK-FIX-322, now null per MANDATE-041 F-002)
      expect(formatFeeWithReserve(result)).toBeNull();
    });
  });
});
