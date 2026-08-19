# TASK-314: actual_fee Formula Examples

## Formula (verbatim from blueprint)
```
actual_fee = feeReserve - (change.length > 0 ? sum(change.amounts) - legacyChangeAmount : 0)
```

where `legacyChangeAmount = max(0, spentTotal - amount - feeReserve)`.

This formula is mathematically equivalent to conservation:
```
actual_fee = spentTotal - amount - sum(change) (for the non-empty case)
actual_fee = feeReserve                       (for the empty case)
```

## Why LEGACY changeAmount (not NUT-08 MAX)
The TASK-312 NUT-08 MAX `changeAmount = max(0, spentTotal - amount - 0)` is used for
output decomposition (wallet derives for the maximum possible refund). But plugging
that into the formula gives:

- Full refund (mint signs all): `actual_fee = feeReserve - (MAX - MAX) = feeReserve`
- This LIES to the user (says they paid the full reserve when they paid zero).

Using LEGACY `changeAmount = max(0, spentTotal - amount - feeReserve)`:
- Full refund (mint signs all): `actual_fee = feeReserve - (MAX - LEGACY) = feeReserve - feeReserve = 0` ✓
- No refund (mint signs nothing): `actual_fee = feeReserve - 0 = feeReserve` ✓
- Partial refund: `actual_fee = feeReserve - (sum - LEGACY)` — proportional ✓

## Verification Table (from test scenarios)

| Scenario | spentTotal | amount | feeReserve | derived changeAmount (NUT-08 MAX) | legacyChangeAmount | Mint signs (sum) | actual_fee expected | actual_fee result | Test status |
|----------|-----------|--------|------------|-----------------------------------|--------------------|--------------------|--------------------|--------------------|-------------|
| (a) Legacy, no change | 110 | 100 | 10 | 0 (legacy mode) | 0 | [] (0) | 10 | 10 | PASS |
| (b) NUT-08 full refund | 115 | 100 | 10 | 15 (decompose → [8,4,2,1]) | 5 | [8,4,2,1] (15) | 0 | 0 | PASS |
| (c) NUT-08 partial refund | 115 | 100 | 10 | 15 | 5 | [8,4,2] (14) | 1 | 1 | PASS |
| (d) Anomaly: sum < legacy | 115 | 100 | 10 | 15 | 5 | [1] (1) | throw | throw "Mint anomaly" | PASS |
| (e) NUT-08 end-to-end | 115 | 100 | 10 | 15 | 5 | [8,4,2,1] (15) | 0 | 0 | PASS |

## Per-scenario formula walkthrough

### (a) Legacy, no change
- spentTotal = 110, amount = 100, feeReserve = 10
- NUT-08 MAX = 0 (legacy mode), legacyChangeAmount = max(0, 110 - 100 - 10) = 0
- response.change.length = 0 → take else branch
- `actual_fee = feeReserve = 10` ✓

### (b) NUT-08 full refund
- spentTotal = 115, amount = 100, feeReserve = 10
- NUT-08 MAX = 15 (decompose → [8, 4, 2, 1]), legacyChangeAmount = max(0, 115 - 100 - 10) = 5
- Mint signs [8, 4, 2, 1] → sum = 15
- `actual_fee = 10 - (15 - 5) = 10 - 10 = 0` ✓ (full refund)
- Conservation check: 115 - 100 - 15 = 0 ✓

### (c) NUT-08 partial refund
- spentTotal = 115, amount = 100, feeReserve = 10
- NUT-08 MAX = 15, legacyChangeAmount = 5
- Mint signs [8, 4, 2] → sum = 14 (skipped 1-sat output, kept as fee)
- `actual_fee = 10 - (14 - 5) = 10 - 9 = 1` ✓
- Conservation check: 115 - 100 - 14 = 1 ✓

### (d) Mint anomaly
- spentTotal = 115, amount = 100, feeReserve = 10
- NUT-08 MAX = 15, legacyChangeAmount = 5
- Mint signs [1] → sum = 1
- `1 < 5` → ANOMALY → throw "Mint anomaly: signed change sum (1) < expected changeAmount (5)"
- Why anomaly: actual_fee would be 10 - (1 - 5) = 10 + 4 = 14, exceeding feeReserve → impossible

### (e) NUT-08 end-to-end
- Same as (b), with additional DB invariants verified:
  - tx.actual_fee = 0 ✓
  - tx.fee = 10 (legacy reserve) ✓
  - tx.status = 'confirmed', tx.type = 'melt', tx.protocol = 'lightning' ✓
  - tx.preimage = 'preimage-abc' ✓
  - actual_fee !== fee → UI shows "(Fee reserve: 10)" in parens ✓

## Conservation Cross-Check
The TASK-314 formula simplifies to pure conservation `actual_fee = spentTotal - amount - sum(change)`:
- For non-empty change:
  - actual_fee = feeReserve - (sum - legacy)
  - = feeReserve - sum + legacy
  - = feeReserve - sum + (spentTotal - amount - feeReserve)
  - = spentTotal - amount - sum ✓

For empty change:
- actual_fee = feeReserve (no conservation needed; mint kept entire reserve)

## Edge: feeReserve === 0
When feeReserve = 0:
- legacyChangeAmount = max(0, spentTotal - amount - 0) = MAX
- Anomaly guard fires when sum < legacyChangeAmount (= MAX) — but this is LEGITIMATE
  (mint has no fee cap; signing fewer is keeping sats as fee, not overcharging)
- Implementation: skip anomaly guard when feeReserve === 0
- Formula still gives correct value: `actual_fee = 0 - (sum - MAX) = MAX - sum` ✓

## Why this Matters
On legacy mints (no NUT-08), the user always pays `feeReserve` — `actual_fee === fee`.
On NUT-08 mints, the mint may return the overpaid fee as change, reducing the actual
cost. Without `actual_fee`, the UI shows the user `feeReserve` (the pre-melt estimate)
and lies to them about how much they paid. With `actual_fee`, the UI shows the TRUE
cost and optionally displays `(Fee reserve: X)` in parens for transparency.
