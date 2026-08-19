# TASK-313 state-machine test (e) — counter assertions

Test scenario: 3 sequential melts with varying signed counts.
Initial counter_k = 100.

## Setup

```
KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a'
MNEMONIC  = 'half depart obvious quality work element tank gorilla view sugar picture humble'
NUT-08 mint: changeAmount = max(0, spentTotal - amount - 0)
```

## Test (e) sequence

| Melt | Inputs | spentTotal | amount | changeAmount | decompose (derived) | Mint signs | Counter after |
|------|--------|------------|--------|--------------|---------------------|------------|---------------|
| 1    | 200    | 200        | 100    | 100          | [64,32,4] (3 outs)  | [64,32] (2) | **102** |
| 2    | 200+200| 400        | 100    | 300          | [256,32,8,4] (4)    | [256,32,8,4] (4) | **106** |
| 3    | 150    | 150        | 100    | 50           | [32,16,2] (3 outs)  | [32,16] (2) | **108** |

## Invariant check

```
initial       = 100
melt 1 signed = 2  → 102  ✓ (counterAfterMelt1 === 102)
melt 2 signed = 4  → 106  ✓ (counterAfterMelt2 === 106)
melt 3 signed = 2  → 108  ✓ (final counter === 108)
```

- **Signed sum**: 2 + 4 + 2 = **8**
- **Derived sum**: 3 + 4 + 3 = **10**
- **Final counter - initial = 8** (signed, NOT 10 derived)
- If buggy code were used (advance by derived): final counter = 110 → counter_k would have desync'd by 2 → next melt would skip counters and reuse B_'s already signed by mint → 11003 loop / money loss.

## vitest output (test e)

```
 ✓ src/lib/wallet/__tests__/melt-counter-per-signed.test.ts > TASK-313: counter_k per-signed advance (CRITICAL — money-loss bug) > e) state machine — 3 sequential melts with varying signed counts 560ms
```

PASS.

## Test run summary

```
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    4.59s
```
