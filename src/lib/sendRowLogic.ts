/**
 * TASK-FIX-323: Send.svelte success screen — Row 2 (Fee) display logic.
 *
 * Pure-function testable mirror of the inline template conditional in
 * Send.svelte lines ~884-908. The component template uses inline `{#if}`
 * branches; this helper extracts the decision so we can unit-test it
 * without mounting the full Svelte component.
 *
 * Combines three cases into one Row 2 display:
 *   1. `paidFee <= 0`              → Row 2 hidden (no fee charged)
 *   2. `actualFee < feeReserve`    → NUT-08 overpaid return → show fee_with_reserve
 *   3. otherwise (legacy / normal) → show `Fee: X sats`
 *
 * Reuses `formatFeeWithReserve` (TASK-FIX-320) for the overpaid string.
 *
 * @param paidFee    - Fee charged to user (sats). May include reserve.
 * @param actualFee  - True fee after NUT-08 mint overpaid return (sats).
 *                     `undefined`/`null` → legacy melt (no overpaid return).
 * @param feeReserve - Fee reserve from melt quote (sats).
 *                     `undefined`/`null` → no reserve info available.
 * @param locale     - UI locale code (`'en'` | `'th'`). Defaults to `'en'`.
 *                     Passed through to `formatFeeWithReserve`.
 * @returns FeeRowDisplay discriminator:
 *   - `{ kind: 'hidden' }`                                  → suppress Row 2
 *   - `{ kind: 'normal', value: paidFee }`                  → show `Fee: X sats`
 *   - `{ kind: 'overpaid', formatted: string, actual, reserve }`
 *                                                            → show fee_with_reserve
 *
 * @example
 *   getFeeRowDisplay(0)                          // → { kind: 'hidden' }
 *   getFeeRowDisplay(100)                        // → { kind: 'normal', value: 100 }
 *   getFeeRowDisplay(100, 5, 10)                 // → { kind: 'overpaid', formatted: 'Fee: 5 sats (reserve: 10 sats)', actual: 5, reserve: 10 }
 *   getFeeRowDisplay(100, undefined, 10, 'en')  // → { kind: 'normal', value: 100 }  // legacy
 */
import { formatFeeWithReserve } from './formatFeeWithReserve';

export type FeeRowDisplay =
	| { kind: 'hidden' }
	| { kind: 'normal'; value: number }
	| {
			kind: 'overpaid';
			formatted: string;
			actual: number;
			reserve: number;
	  };

export function getFeeRowDisplay(
	paidFee: number,
	actualFee?: number | null,
	feeReserve?: number | null,
	locale: string = 'en'
): FeeRowDisplay {
	// (d) No fee charged → Row 2 hidden entirely
	if (paidFee <= 0) {
		return { kind: 'hidden' };
	}

	// (a) Overpaid (NUT-08): actualFee < feeReserve → use fee_with_reserve format
	const overpaid = formatFeeWithReserve({
		actualFee: actualFee ?? null,
		feeReserve: feeReserve ?? null,
		paidFee
	});
	if (overpaid !== null) {
		// Guard: formatFeeWithReserve returned non-null only when both are non-null
		// and actualFee < feeReserve. Narrow types here.
		const actual = actualFee as number;
		const reserve = feeReserve as number;
		return { kind: 'overpaid', formatted: overpaid, actual, reserve };
	}

	// (b, c) Normal OR legacy (actualFee null) → show paidFee
	return { kind: 'normal', value: paidFee };
}
