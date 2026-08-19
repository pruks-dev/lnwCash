# TASK-312 — Decomposition Table

`decomposeAmount(amount)` (from `src/lib/wallet/mint.ts:90`) splits an amount
into standard Cashu denominations — powers of 2: 1, 2, 4, 8, 16, 32, 64, 128,
256, 512, 1024, 2048, ... The algorithm walks from highest to lowest, emitting
each denomination that fits in the remaining total.

## Inputs → Outputs (NUT-08 MAX change)

TASK-312: when the mint advertises NUT-08, the wallet derives change =
MAX(0, spentTotal - amount - 0), then decomposes via `decomposeAmount`. One
blinded output per denomination is sent to the mint as `outputBodies`.

| spentTotal | amount | feeReserve | minFeeEstimate (NUT-08) | changeAmount | decomposes to                    | # outputs | sum |
|------------|--------|------------|-------------------------|--------------|----------------------------------|-----------|-----|
| 100        | 100    | 0          | 0                       | 0            | `[]`                              | 0         | 0   |
| 200        | 100    | 0          | 0                       | 100          | `[64, 32, 4]`                     | 3         | 100 |
| 1100       | 100    | 0          | 0                       | 1000         | `[512, 256, 128, 64, 32, 8]`      | 6         | 1000 |
| 100        | 100    | 0          | 0                       | 0            | `[]` (spentTotal = amount)        | 0         | 0   |

## Legacy path (no NUT-08)

When the mint does NOT advertise NUT-08, `minFeeEstimate = feeReserve` (reserved
upfront). The wallet derives change = MAX(0, spentTotal - amount - feeReserve).

| spentTotal | amount | feeReserve | minFeeEstimate (legacy) | changeAmount | decomposes to          | # outputs | sum |
|------------|--------|------------|-------------------------|--------------|------------------------|-----------|-----|
| 200        | 100    | 2          | 2                       | 98           | `[64, 32, 2]`          | 3         | 98  |

## Coverage matrix (6 scenarios in `melt-nut08-prederive.test.ts`)

| Scenario | Mint advertises NUT-08? | spentTotal | amount | feeReserve | Expected changeAmount | Decomposition     |
|----------|-------------------------|------------|--------|------------|-----------------------|-------------------|
| (a)      | yes                     | 100        | 100    | 0          | 0                     | `[]`              |
| (b)      | yes                     | 200        | 100    | 0          | 100                   | `[64, 32, 4]`     |
| (c)      | yes                     | 1100       | 100    | 0          | 1000                  | `[512,256,128,64,32,8]` |
| (d)      | no (legacy)             | 200        | 100    | 2          | 98                    | `[64, 32, 2]`     |
| (e)      | yes                     | 100        | 100    | 0          | 0                     | `[]`              |
| (f)      | unknown (throws)        | 200        | 100    | 2          | 98 (legacy fallback)  | `[64, 32, 2]`     |

## Why this matters

Before TASK-312, the wallet always computed
`changeAmount = spentTotal - amount - feeReserve` (single subtraction, no MAX,
no NUT-08 awareness). On a NUT-08 mint this was an over-estimate of fees —
the wallet reserved `feeReserve` sats the mint would have returned as change,
silently losing those sats (or forcing a follow-up swap).

With TASK-312, NUT-08 mints (Nutshell >= 0.17) get the full overpayment back
as change, decomposed correctly via `decomposeAmount` so no sats are truncated
(see TASK-MELT-DECOMPOSE for the [16, 8, 4, 2] fund-loss regression).
