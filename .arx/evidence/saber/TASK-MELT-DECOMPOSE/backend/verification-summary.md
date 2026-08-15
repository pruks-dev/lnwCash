# TASK-MELT-DECOMPOSE — Verification Summary

## Verdict: COMPLETE

## Root cause
`completeMelt` in `src/lib/wallet/melt.ts` submitted change as a **single output**
(`{ amount: changeAmount }`) even when `changeAmount` was not a standard Cashu
denomination. A mint signs each output with a keyset denomination key, so an
off-denomination amount (e.g. 30) is truncated down to the nearest lower
denomination (16), silently losing the remainder.

Commander live test: `proof [32,32]=64` → pay `32 + fee 2 = 34` → change `30`
came back as `16` (14 sats lost).

## Fix (src/lib/wallet/melt.ts)
1. **Decompose change** — `const changeAmounts = decomposeAmount(changeAmount)`.
   `30 → [16, 8, 4, 2]`. `decomposeAmount` is imported from `./mint` (no circular
   import — `mint.ts` never imports `melt.ts`).
2. **Derive one secret per denomination** — loop over `changeAmounts` deriving
   `deriveSecretAndR(seed, changeKeysetId, startCounter + i)` via
   `generateChangeSecretAndR(keysetId, counterIndex)` (seed still required —
   `requireChangeSeed()` throws the same migration error as before, never a
   random-secret fallback).
3. **One blinded output per denomination** — `outputs = changeAmounts.map(...)`.
4. **Advance counter by `changeAmounts.length`** (not 1) —
   `incrementCounterK(changeKeysetId, changeAmounts.length)`.
5. **Unblind each signature** — existing `response.change.map((sig, i) => outputs[i])`
   now maps 1:1 across all denominations.

## Acceptance criteria — met
| Criterion | Result |
|---|---|
| change decomposed into denominations, sum preserved | ✅ `30 → [16,8,4,2]`, sum 30 |
| `counter_k` advance = `changeAmounts.length` | ✅ 2 → 6 (advance 4) |
| melt 64 pay 34 → change 30 fully [16,8,4,2] (not 16) | ✅ verified via `meltTokens` call args + 4 change proofs |

## Test results
- `npx vitest run src/lib/wallet/__tests__/melt*` → **4 files, 22 tests passed**
- `npx vitest run src/lib/wallet/__tests__/melt-decompose.test.ts` → **3 tests passed**
  - `melt 64 → pay 34 → change 30 → [16,8,4,2] (4 outputs, sum 30)`
  - `counter_k advances by changeAmounts.length (4)`
  - `each denomination derives its own secret + unblinded`
- `npx vitest run` (full suite) → **108 files, 1166 tests passed**
- `npx svelte-check --tsconfig ./tsconfig.app.json` → **0 errors, 0 warnings**

## Forbidden rules — respected
- No change to crypto primitives / `nut13.ts` `deriveSecretAndR`.
- No break to 12/24-word backward-compat (same derivation, same keyset versions).
- No random-secret fallback (`requireChangeSeed` throws on missing seed).
- `mint.ts`, `tokenStore.ts`, `restore.ts`, `counterK.ts` untouched.
- No `pnpm install` / lockfile untouched.

## Files changed
- `src/lib/wallet/melt.ts` (fix)
- `src/lib/wallet/__tests__/melt-decompose.test.ts` (new — 3 tests)
- `src/lib/wallet/__tests__/melt-determinism.test.ts` (updated to decomposition semantics)
