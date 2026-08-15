# TASK-252 Verification Summary — restore.ts gap-tolerance fix

**Task:** BLUEPRINT-003 v1.4.3, Wave 1, P0, HIGH
**Owner:** Saber Backend Sub-Agent
**Verdict:** COMPLETE

## Root cause (pinned by RC-1 / TASK-249)

1. **F-V29-003** — `restoreBatch()` mapped signatures to prepared outputs by
   array index (`prepared[i]`), assuming the mint echoes a 1:1 list. Nutshell
   `/v1/restore` returns a **FILTERED** list (only outputs it actually signed),
   so `signatures[0]` can correspond to `prepared[1]` when `prepared[0]` was
   never signed → wrong blinding factor → garbage proof.

2. **F-V29-004** — `restoreWallet()` advanced `lastNonEmptyCounter = counter +
   proofs.length` (signature count). With a gap (counter 0 unsigned, 1/2 signed)
   this undercounts to 2 instead of 3, so a later restore re-derives/re-mints
   the wrong counters.

## Fix

- **Align by `B_`:** build `Map<B_, { entry, offset }>` from the prepared batch;
  for each signature prefer `response.outputs[i].B_` as the lookup key, falling
  back to request-order index only when `outputs` is absent (compat mints).
  Unblind with the **matched** entry's blinding factor (not `prepared[i]`).
- **Counter = highest signed + 1:** track `highestSignedCounter =
  startCounter + max(matched offset)` in `restoreBatch` (survives gaps,
  computed before spent filtering); `restoreWallet` sets
  `lastNonEmptyCounter = highestSignedCounter + 1`.

## Verification results

| Check | Result |
|-------|--------|
| restore test files (5 files) | PASS (12/12) |
| gap alignment (B_ not index) | PASS (2/2) |
| counter = highest+1 (gap) | PASS (2/2) |
| BIP32 version 00 gap round-trip | PASS (1/1) |
| Full suite | PASS (106 files, 1159/1159) |
| svelte-check | PASS (0 errors, 0 warnings) |

## Files changed

- `src/lib/wallet/restore.ts` (production fix)
- `src/lib/wallet/__tests__/restore-gap-alignment.test.ts` (new)
- `src/lib/wallet/__tests__/restore-counter-highest.test.ts` (new)
- `src/lib/wallet/__tests__/restore-bip32-gap.test.ts` (new)

## Forbidden checks

- No crypto primitives changed (encrypt.ts, crypto.subtle, BIP39 derivation).
- No change to `nut13.ts` `deriveSecretAndR`.
- No change to `mint.ts` / `melt.ts` / `tokenStore.ts` (TASK-250 files).
- No random-secret fallback introduced.
- 12-word wallet backward-compat preserved (existing restore tests still green).
- No `pnpm install` / lockfile changes.
