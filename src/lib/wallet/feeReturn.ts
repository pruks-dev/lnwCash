/**
 * TASK-315: compute fee_return for a transaction.
 *
 * Returns the amount the mint returned to the user as an overpaid-fee refund
 * (NUT-08). When the mint signs change outputs that exceed the legacy
 * changeAmount (TASK-312's MAX pre-derivation), the overpaid portion is the
 * fee the mint is refunding:
 *
 *   fee_return = feeReserve - actual_fee
 *
 * Where:
 *   - `fee` (a.k.a. feeReserve) is the LN routing fee reserved up-front.
 *   - `actual_fee` (TASK-314) is the true fee paid after the mint's refund.
 *
 * The relationship is:
 *   - melt without NUT-08 overpaid return: actual_fee = feeReserve → fee_return = 0
 *   - melt with partial refund:               actual_fee < feeReserve → fee_return > 0
 *   - melt with full refund:                  actual_fee = 0          → fee_return = feeReserve
 *
 * Returns 0 for:
 *   - non-melt transactions (mint, send, transfer, cashu_*)
 *   - legacy melt transactions (no actual_fee field — pre-TASK-314 DB rows)
 *   - melt transactions where actual_fee >= fee (no overpaid return happened)
 *
 * @param tx  Transaction-like with optional fee + actual_fee
 * @returns   fee_return in sats (>= 0)
 */
export function computeFeeReturn(tx: {
	type?: string;
	fee?: number;
	actual_fee?: number | null;
}): number {
	if (tx?.type !== 'melt') return 0;
	if (tx.actual_fee == null) return 0; // legacy pre-TASK-314 — no return recorded
	const feeReserve = tx.fee ?? 0;
	const actualFee = tx.actual_fee;
	if (actualFee >= feeReserve) return 0; // no return (or impossible over-reserve)
	return feeReserve - actualFee;
}
