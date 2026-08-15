# TASK-F2-CHANGE-DERIVED — Verification Summary

**Sub-agent:** saber (Backend)
**Verdict:** COMPLETE
**Target:** `src/lib/wallet/transfer.ts` (+ test)

## Problem (F2 bug — Thorne TASK-254)

`transfer.ts` internal NUT-03 swap (exact-send + change) created **random** secrets
for BOTH the SEND and the CHANGE outputs via `crypto.getRandomValues`. Change proofs
stay in the wallet, so a random change secret is **unrecoverable on restore**
(silent fund loss). NUT-13 determinism exists for recoverability:

- **SEND** (proofs handed to recipient) → random is CORRECT.
- **CHANGE** (kept in wallet) → MUST be derived from the seed.

## Change (transfer.ts)

1. Import `deriveSecretAndR, getActiveSeed` (`./nut13`) and `getCounterK, incrementCounterK` (`./counterK`).
2. Require active seed **before** the swap `try` block → `getActiveSeed() === null` throws a
   clear migration error (no random fallback for change). The throw propagates (it is NOT
   swallowed by the swap-failure `catch`).
3. Split blind creation:
   - **SEND (`needAmounts`):** keeps `crypto.getRandomValues` → `blindMessage(secret)`.
   - **CHANGE (`excessAmounts`):** `deriveSecretAndR(seed, keysetId, getCounterK(keysetId) + i)` → `blindMessage(secret, r)`.
4. After `swapProofs` success → `incrementCounterK(keysetId, excessAmounts.length)`.

## Acceptance Criteria

| Criterion | Result |
|---|---|
| change derived (deterministic) + send still random | PASS |
| counter advance = excessAmounts.length | PASS |
| change recoverable from seed | PASS |

## Test Results

| Check | Result |
|---|---|
| `transfer*` targeted (transfer.test.ts + transfer-change-derived.test.ts) | **2 files / 14 tests PASS** |
| Full suite | **107 files PASS / 2 flaky (pre-existing), 1168/1170 PASS** |
| svelte-check | **0 errors, 0 warnings (exit 0)** |

### New tests (`src/lib/wallet/__tests__/transfer-change-derived.test.ts`, 4 tests)
- change secrets == `deriveSecret(seed, KEYSET_ID, 0..2)` + counter == 3
- same seed → same change secrets across runs (recoverable)
- send portion random (differs across runs; NOT derivable from seed)
- legacy wallet (no active seed) → migration error, counter untouched

### Full-suite 2 failures (NOT caused by this task — verified pre-existing timing flakiness)
- `lockout.test.ts > recordSuccess resets the counter` (~5s timeout)
- `state-change-pin.test.ts > preserves the 12-word mnemonic verbatim across a PIN change` (~5s timeout)

Both **pass in isolation** (16/16 when run together). They are unrelated to `transfer.ts`
(no import dependency) and hit the 5s per-test timeout under full-suite CPU contention.
