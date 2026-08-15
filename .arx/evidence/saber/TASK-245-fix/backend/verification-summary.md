# TASK-245-fix — Remediation: migration.ts Phase B commit atomicity (T246-SEC-01 CRITICAL)

- **Blocker:** T246-SEC-01 (Thorne TASK-246 audit)
- **Verdict:** COMPLETE
- **Objective:** close the fund-loss window in `migrateWallet()` Phase B commit.

## Root cause

Original Phase B order (TASK-245):

```
addProofs(new) → removeProofs(old) → setCounterK → setActiveSeed(newSeed) → setEncryptedMnemonic(new)
```

`removeProofs(old)` (burn cleanup) ran BEFORE `setEncryptedMnemonic(new)`. A crash
between those two lines left old proofs burned at the mint AND the new mnemonic
unpersisted → the new deterministic proofs could not be recovered → permanent
fund loss + re-migration hitting "already spent".

## Fix (atomicity reorder + recovery anchor + journal)

1. **Persist the NEW encrypted mnemonic + activate the NEW seed BEFORE Phase A
   swap** (the recommended Option A). The mnemonic is now durable before the mint
   ever spends an old proof — no checkpoint where proofs are burned but the seed
   is unrecoverable.
2. **Write a "pending migration" journal** (`lnwcash_migration_journal`) before
   swap, cleared after commit. It marks an interrupted migration so the UI can
   re-offer migration (resume) or recover.
3. **Roll back on swap failure**: capture `prevMnemonic`/`prevSeed` before the
   anchor write; on swap failure restore them (or clear for legacy wallets) +
   clear the journal + rethrow. Old wallet fully intact.
4. **`detectLegacyProofs()` is now journal-aware**: a pending journal keeps the
   old proofs reported as legacy (resume path after a crash-before-swap).
5. **`recoverPendingMigration()`** exported — promotes the journaled mnemonic to
   real storage (app-start recovery hook, future wiring; idempotent).

### Crash checkpoint matrix

| checkpoint                 | state after crash                          | recoverable?            |
|----------------------------|--------------------------------------------|-------------------------|
| before anchor write        | nothing changed                            | old wallet intact ✓     |
| after anchor, before swap  | new mnemonic + journal, old proofs intact  | resume via journal ✓    |
| after swap, before addProofs | mnemonic durable, old proofs burned      | NUT-13 restore from new mnemonic ✓ |
| after addProofs, before removeProofs | new proofs in DB + mnemonic durable | ✓ (no loss) |
| after removeProofs, before counterK | new proofs in DB + mnemonic durable | ✓ (no loss) |
| after commit               | journal cleared                            | clean ✓                 |

## Files changed

- `src/lib/wallet/migration.ts` — reorder + journal + rollback + recover helper.
- `src/lib/wallet/__tests__/migration.test.ts` — +3 tests (10 total).

## Test results

- `npx vitest run src/lib/wallet/__tests__/migration.test.ts` → **10/10 PASS**
  - incl. `Phase B crash path: mnemonic persists before removeProofs → proofs recoverable`
- `npx vitest run` (full suite) → **1142/1142 PASS (99 files)**
- `npx svelte-check --tsconfig ./tsconfig.app.json` → **0 errors, 0 warnings**

## Deviations / notes (honest)

- `recoverPendingMigration()` is exported but NOT wired into app start
  (`App.svelte`/`restore.ts`) — those files are out of bounds for this task
  (forbidden list: "DO NOT touch … ไฟล์อื่นนอกจาก migration.ts"). The recovery
  entry point is ready for a follow-up wiring task.
- The journal lives in `localStorage` under `lnwcash_migration_journal`; it is
  NOT cleared by `clearAllWalletData()` (storage.ts is out of bounds). It is only
  ever set during an active migration and cleared on success/rollback, so it only
  persists across a genuine crash mid-migration. Flagged for the app-start wiring
  task to also clear it on wallet delete/reset.
- Crypto primitives, NUT-13 derivation, determinism logic, and Settings.svelte
  untouched (per forbidden list).

## Evidence

- `migration.ts.diff` — reorder (mnemonic/seed persist before swap) + journal + rollback
- `migration.test.ts.diff` — crash-path + journal tests
- `phase-b-crash-test.log` — crash mid-commit → recover PASS
- `verification-summary.md` — this file
