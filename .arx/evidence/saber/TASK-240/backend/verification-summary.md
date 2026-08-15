# TASK-240 — mint.ts counter reuse fix (F-V27-001) — Verification Summary

## Verdict
COMPLETE

## Acceptance Criteria Mapping

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | `incrementCounterK` อยู่ใน `finally` (หรือ advance ก่อน addProofs) → counter advance เสมอ | ✅ DONE | `mint.ts` Step 6 rewrapped in `try { addProofs } finally { incrementCounterK }` (lines ~328-338). Counter advances whether or not `addProofs` throws. |
| 2 | counter-0 detection บังคับ NUT-9 restore | ✅ DONE | New guard in `completeMint()` (after `resolvedSeed` resolution, before `createOutputs`): if `resolvedSeed && getCounterK(keysetId) === 0 && getAllProofs().some(p => p.keyset_id === keysetId)` → throws error directing NUT-9 restore. |
| 3 | no reuse (tests GREEN) | ✅ DONE | 3 new regression tests + existing 94 mint/counter/restore tests all pass. |

## What changed

### 1. `src/lib/wallet/mint.ts` (only production file touched)
- **Import**: added `getAllProofs` to the existing `./proofsDb` import.
- **Counter-0 guard (path 2 — localStorage loss)**: before `createOutputs`, when deterministic seed is active and `counter_k === 0`, read `getAllProofs()` and, if any stored proof has `keyset_id === keysetId`, throw an error instructing NUT-9 restore. This prevents re-minting with counter 0 when the counter was lost but old proofs survived.
- **`finally` advance (root cause fix)**: moved `incrementCounterK(keysetId, amounts.length)` into a `finally` block around `addProofs`, so the counter always advances once the mint returns signed outputs — even if `addProofs` (IndexedDB) throws. This closes the 11003 "outputs already signed" reuse path.

### 2. `src/lib/wallet/__tests__/mint-counter-reuse.test.ts` (new test file)
Three regression tests:
1. `advances counter_k even when addProofs throws (no reuse)` — `addProofs` rejects → `completeMint` returns `success:false` but `getCounterK(KEYSET_ID) === 2`.
2. `forces NUT-9 restore when counter_k=0 but proofs exist` — seed old proof into IndexedDB with counter 0 → `success:false`, error matches `/NUT-9|restore/i`, `mintTokens` NOT called, counter stays 0.
3. `normal mint advances counter_k by amounts.length` — amount 3 → `[1,2]` → 2 outputs → counter advances by 2.

## Test results

- New regression tests: **3/3 passed** (`mint-counter-reuse.test.ts`)
- Mint/counter/restore related suite (6 files): **97/97 passed**
  - `mint.test.ts`, `mint-nut13.test.ts`, `mint-counter-reuse.test.ts`, `mint-discovery.test.ts`, `counterK.test.ts`, `restore.test.ts`
- Full wallet suite: **322/325 passed**; 3 failures are pre-existing 5s-timeout flakiness in `lockout.test.ts` + `state-change-pin.test.ts` (slow PBKDF2 in jsdom under full-suite CPU contention). Re-run in isolation with `--testTimeout=30000` → **16/16 passed**. Unrelated to this task.

## svelte-check
- **0 errors, 0 warnings**

## Boundaries respected
- ✅ Did NOT change `nut13.ts`, `restore.ts`, `client.ts`, `TransactionDetailSheet.svelte`, crypto primitives, or lockfile.
- ✅ Did NOT run `pnpm install`.
- ✅ Counter advances only when `resolvedSeed` is set (deterministic mode), preserving legacy random-secret behavior.
