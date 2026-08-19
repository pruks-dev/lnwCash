/**
 * TASK-315 (OPTIONAL): Fee return indicator — '+X sats return' badge.
 * TASK-FIX-321: Settings toggle removed. Badge is now ALWAYS shown when
 * fee_return > 0 (no setting check).
 *
 * Verifies `computeFeeReturn()` produces the expected fee_return value for all
 * display-relevant cases. The badge itself is gated by:
 *   - `tx.type === 'melt'`
 *   - `tx.actual_fee != null` (legacy melt txs get NO badge — backwards compat)
 *   - `tx.actual_fee < tx.fee` (otherwise there is no overpaid refund)
 *
 * 4 scenarios — covers the logic matrix for the helper:
 *   (a) fee_return > 0        — melt with partial NUT-08 refund → badge shows
 *   (b) fee_return === 0      — melt with no refund (actual_fee == fee)    → no badge
 *   (c) Legacy tx             — melt without actual_fee field (pre-TASK-314) → no badge
 *   (d) Non-melt tx           — mint/send/transfer never have a fee_return → no badge
 *
 * The UI gate (setting ON/OFF) is purely a Svelte `{#if}` and is covered by
 * the i18n parity + manual smoke check; the helper is the only piece with
 * non-trivial logic, so the unit tests focus there.
 */
import { describe, it, expect } from 'vitest';
import { computeFeeReturn } from '../../wallet/feeReturn';

describe('TASK-315: fee return indicator (computeFeeReturn)', () => {
	it('a) melt with NUT-08 partial refund → fee_return = feeReserve - actual_fee', () => {
		// feeReserve = 10 (Lightning routing fee reserved)
		// actual_fee = 5 (mint returned 5 sats as overpaid refund)
		// → fee_return = 10 - 5 = 5 → badge "+5 sats return" / "คืน 5 sats"
		const tx = { type: 'melt', fee: 10, actual_fee: 5 };
		expect(computeFeeReturn(tx)).toBe(5);
	});

	it('b) melt with no NUT-08 refund (actual_fee === fee) → fee_return = 0', () => {
		// Mint did NOT return any sats — actual_fee equals the reserved fee.
		// Legacy behaviour, no NUT-08 overpaid refund happened.
		const tx = { type: 'melt', fee: 10, actual_fee: 10 };
		expect(computeFeeReturn(tx)).toBe(0);

		// Edge case: actual_fee > fee is impossible in practice (anomaly guard
		// in melt.ts would have thrown) — but the helper must still return 0
		// rather than a negative refund, so we never display a misleading
		// "+X sats return" badge.
		const impossible = { type: 'melt', fee: 10, actual_fee: 12 };
		expect(computeFeeReturn(impossible)).toBe(0);
	});

	it('c) legacy melt tx (no actual_fee field, pre-TASK-314) → fee_return = 0', () => {
		// Pre-TASK-314 transactions only have `fee`. Without `actual_fee` we
		// cannot determine whether the mint returned anything → NO badge.
		// This preserves the legacy display (no breaking change).
		const tx = { type: 'melt', fee: 10 };
		expect(computeFeeReturn(tx)).toBe(0);

		// Explicit null also counts as legacy / unknown.
		const txNull = { type: 'melt', fee: 10, actual_fee: null };
		expect(computeFeeReturn(txNull)).toBe(0);

		// Undefined also counts as legacy.
		const txUndef = { type: 'melt', fee: 10, actual_fee: undefined };
		expect(computeFeeReturn(txUndef)).toBe(0);
	});

	it('d) non-melt transactions → fee_return = 0 (no badge, ever)', () => {
		// Mint, transfer, cashu_send, cashu_receive — none of these involve the
		// LN melt flow that can produce a NUT-08 overpaid refund. The badge
		// MUST NOT appear for them regardless of any fee fields.
		const mintTx = { type: 'mint', fee: 5, actual_fee: 0 };
		expect(computeFeeReturn(mintTx)).toBe(0);

		const transferTx = { type: 'transfer', fee: 0, actual_fee: 0 };
		expect(computeFeeReturn(transferTx)).toBe(0);

		const sendTx = { type: 'cashu_send', fee: 2, actual_fee: 1 };
		expect(computeFeeReturn(sendTx)).toBe(0);

		const recvTx = { type: 'cashu_receive', fee: 2, actual_fee: 1 };
		expect(computeFeeReturn(recvTx)).toBe(0);

		// No type at all → 0 (defensive).
		const noType = { fee: 10, actual_fee: 5 };
		expect(computeFeeReturn(noType)).toBe(0);

		// Null tx (defensive guard).
		expect(computeFeeReturn(null as unknown as { type: string })).toBe(0);
	});
});
