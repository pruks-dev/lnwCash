# TASK-208 — Verification Summary (saber-frontend)

Dedicated recovery phrase backup flow (D3 + D4) integrated into the existing
TASK-207 wizard without rewriting the screen. TASK-207 (wizard flow/steps/
back-forward/progress) and TASK-209 (4-digit PIN keypad + lockout) preserved.

## What changed

### New components (src/lib/components/)
- **SeedGrid.svelte** — 12-word grid, 3 columns × 4 rows, monospace
  (`--font-family-mono` + fallback). Each cell: 1-based index + word.
  Props: `words`, `columns` (default 3).
- **SeedVerifyQuiz.svelte** — random 3-word quiz. Picks 3 distinct positions
  (CSPRNG) from the phrase; user types each requested word. Auto-checks when
  all 3 filled → `onComplete(true|false)`; fail → error + retry (re-randomize).
  Props: `words`, `onComplete`, `onRetry`, localized labels.

### New tests
- `src/lib/components/__tests__/seed-grid.test.ts` (4 tests)
- `src/lib/components/__tests__/seed-verify-quiz.test.ts` (5 tests)

### Setup.svelte (integrated, 207+209 preserved)
- **Create seed step**: SeedGrid (12 words) + no-screenshot banner +
  paper-only prohibitions list + `checkbox 'ฉันจดลงกระดาษแล้ว'`
  (`seedAckChecked`) → `canContinue` derived gates Next until checked (D3).
- **Verify step**: replaced tap-all-12 with SeedVerifyQuiz (random 3-word, D4).
  `onComplete(true)` → PIN step. (Wizard step `verify` itself preserved.)
- **Recover seed step**: BIP39 autocomplete import — `WORDLIST` (2048 words),
  `currentFragment` = last token, `seedSuggestions` = `startsWith` match
  (max 8), click completes word + trailing space. Input is controlled
  (`value={seedInput}`).
- **Restore trigger (NUT-9)**: `activateSeedAndRestore()` on finalize sets
  `setActiveSeed(seedFromMnemonic(seed))`; recover mode fires
  `restoreFunds()` → `fetchAndCacheKeysets(getActiveMintUrl())` →
  `restoreWallet(mintUrl, seedBytes, keysetId)` per active keyset
  (POST /v1/restore via TASK-206). Status shown on Done step (recover only).
- **onDestroy**: clears `seed`/`seedInput`/`seedError` from component state.
  `clearWizard()` (sessionStorage resume) already runs on finalize.

### Locales (additive — no existing keys removed)
- en.json / th.json: `recovery.warning.*`, `recovery.quiz.*`,
  `recovery.import.placeholder`, `recovery.restore.*` (see
  paper-only-prohibitions.txt).

## Acceptance criteria — all PASS
1. ✅ 12-word grid (3×4) renders — NOT 24 (`seed-grid.test.ts` asserts 12 cells)
2. ✅ paper-only prohibitions + checkbox rendered (Setup.test.ts asserts
   `.seed-ack input` + `recovery.warning.*` texts)
3. ✅ verify quiz (random 3-word) PASS (`seed-verify-quiz.test.ts` +
   full create flow through quiz)
4. ✅ import round-trip PASS (autocomplete BIP39 — Setup.test.ts
   'recover import shows BIP39 autocomplete suggestions')
5. ✅ restore trigger → NUT-9 (`restoreFunds()` calls `restoreWallet` from
   TASK-206; `$lib/wallet/restore` + `$lib/cashu/keyset` mocked in tests)
6. ✅ svelte-check 0 errors in changed files (16 pre-existing errors elsewhere,
   unchanged)

## Preserved (verified by unchanged tests passing)
- ✅ TASK-207 wizard: welcome→seed→verify→pin→done (create) /
  welcome→seed→pin→done (recover), back/forward, progress, sessionStorage
  resume, PWA nudge.
- ✅ TASK-209 PIN: PIN_LENGTH=4, randomized Keypad, PinDots, lockout,
  input-mode fallback — Setup.test.ts unlock/keypad/lockout tests pass.

## Test results
- Targeted (Setup + SeedGrid + SeedVerifyQuiz): **22/22 PASS**
- Full suite: **1041 passed / 4 failed** (pre-existing, unrelated:
  ErrorBoundary.test.ts ×1, Home.test.ts ×3 — same as TASK-207 baseline)
- svelte-check: **0 errors** in Setup.svelte / SeedGrid / SeedVerifyQuiz /
  locales. 16 errors elsewhere are pre-existing (theme.ts, QRDisplay,
  Receive, Send, TransactionDetailSheet, client.test.ts,
  pending-tx-resolver.test.ts).

## Notes / non-blockers
- `canContinue` compares `step` with `(step as WizardStep)` casts — matches the
  existing `(mode as SetupMode)` pattern already used in this file for
  svelte-check narrowing.
- `recovery.restore.done` uses svelte-i18n interpolation `{values:{count}}`.
- Screenshot proof (screenshot-recovery.png) not captured — no headless
  browser/display available in this environment. DOM structure is covered by
  component + screen tests instead.
