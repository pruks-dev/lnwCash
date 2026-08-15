# TASK-252-fix (F1) — Verification Summary (Backend)

## Scope
Production code for TASK-252-fix (F1) is already deployed. This closure fixes the
resulting **test regression** in `melt.test.ts` and produces the missing evidence
+ RESULT.

## Production code (already deployed — NOT modified here)
`clearAllCounters()` inserted at 3 wallet-lifecycle points so a new/imported/deleted
wallet starts counter_k = 0:

| File | Line | Function | Change |
|------|------|----------|--------|
| `src/lib/wallet/storage.ts` | 233 | `clearAllWalletData()` | `clearAllCounters()` |
| `src/lib/wallet/seed.ts`     | 149 | `importSeed()`       | `clearAllCounters()` |
| `src/lib/wallet/state.ts`    | 92  | `createWallet()`     | `clearAllCounters()` |

Evidence: `counter-reset.diff`.

## Root cause of the 2 test failures (test regression)
TASK-252-fix now correctly resets counter_k to 0 on `createWallet()` /
`clearAllWalletData()`. Two tests in `melt.test.ts` re-create a wallet then call
`addProofs(...)` directly (simulating an already-minted balance) **without
advancing the counter**. The melt counter-0 guard (TASK-250, `melt.ts:437`) sees
`counter_k === 0` + proofs present → throws "restore ก่อน" → `meltFlow` returns
`success:false` → the tests expecting `success:true` fail.

This is a **test-setup problem**, not a production bug. The fix makes the test
setup mirror reality: a minted proof implies the mint already advanced counter_k.

## Fix applied (test-only)
Added `setCounterK(KEYSET_ID, 1);` after `addProofs(...)` in 2 tests:

1. `C07-02: should proceed with melt when all proofs are UNSPENT` (~line 262)
2. `should record transaction with protocol=lightning and bolt11 invoice` (~line 295)

No production source was touched. Evidence: `melt-test-fix.diff`.

## Acceptance criteria mapping

| Criterion | Status | Evidence |
|-----------|--------|----------|
| counter_k reset on clearAllWalletData | PASS | counter-reset.test.ts case 4 |
| counter_k reset on importSeed       | PASS | counter-reset.test.ts case 2 |
| counter_k reset on createWallet     | PASS | counter-reset.test.ts case 3 |
| counter_k reset on deleteWallet     | PASS | counter-reset.test.ts case 1 |
| melt.test.ts regression fixed (2 tests) | PASS | melt.test.ts 11/11 |
| full suite green                     | PASS | 107 files / 1163 tests |
| svelte-check clean                   | PASS | 0 errors, 0 warnings |

## Command outputs (verbatim)
- `npx vitest run` → `Test Files 107 passed (107)` / `Tests 1163 passed (1163)`
- `npx vitest run src/lib/wallet/__tests__/counter-reset.test.ts` → `Tests 4 passed (4)`
- `npm run check` → `svelte-check found 0 errors and 0 warnings`
