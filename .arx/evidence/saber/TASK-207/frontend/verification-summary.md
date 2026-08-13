# TASK-207 — Frontend Verification Summary

**Sub-agent:** saber-frontend — under Saber War Minister
**Intent:** INTENT-003 / BLUEPRINT-003 v1.1 — Wave 2 frontend (P0)
**Scope:** Multi-step setup wizard (D3 create/recover + D1 tagline + D1.1 language toggle + D2 PWA nudge)

## Objective
Rewrite `Setup.svelte` into a 4+ step wizard — Welcome → [Create | Recover] → Seed →
Verify → PIN → Done — with a progress stepper, TH/EN language toggle, the new privacy
tagline, and a non-blocking PWA manual-install nudge. **Preserve TASK-209's 4-digit PIN
keypad + lockout verbatim.**

## Wizard flow

| Step | Create mode | Recover mode |
|------|-------------|--------------|
| `welcome` | tagline + create/recover choice + TH/EN toggle | same |
| `seed` | show generated 12-word phrase + copy | enter 12-word phrase |
| `verify` | tap words in correct order | *(skipped)* |
| `pin` | set 4-digit PIN (keypad + lockout) | set 4-digit PIN |
| `done` | PWA nudge + start button | PWA nudge + start button |

- Create = 5 steps; Recover = 4 steps (both satisfy "4+ steps").
- Existing wallet (`getWalletStatus().state !== 'UNINITIALIZED'`) → skips straight to PIN
  unlock (single screen, no stepper), exactly the TASK-209 unlock flow.

## Files changed

| File | Change |
|------|--------|
| `src/screens/Setup.svelte` | Rewritten as wizard (970 lines). PIN step (register + unlock) preserved verbatim from TASK-209: `PIN_LENGTH = 4`, randomized `Keypad`, `PinDots`, lockout rate-limit (`getLockoutStatus/recordFailure/recordSuccess/resetLockout`), encrypted counter, input-mode fallback, mismatch reset + shake. |
| `src/lib/components/ProgressStepper.svelte` | **New** — presentational stepper: step dots + labels + progress bar + back/forward buttons. |
| `src/locales/en.json` | +27 keys: tagline, welcome/seed/verify/done labels, stepper labels, PWA nudge, `common.next`. No keys removed. |
| `src/locales/th.json` | +27 keys (same set, Thai). No keys removed. |
| `src/__tests__/screens/Setup.test.ts` | Rewritten for wizard (11 tests). |
| `src/lib/components/__tests__/progress-stepper.test.ts` | **New** (7 tests). |

## Wallet creation path (TASK-205 API only)
Both create and recover finalize via `importSeed(seed, pin, 'LNWCASH Wallet')` from
`src/lib/wallet/seed.ts` (TASK-205). Create generates a fresh phrase with
`generateMnemonic()` (TASK-205 `keys.ts`); recover validates the entered phrase with
`seedToPrivateKey()` before the PIN step. After import: `resetLockout()` → `setActiveMintUrl`
(F-067 default mint) → `unlockWallet()` → Done.

**No crypto-layer file was modified** (`state.ts`, `seed.ts`, `keys.ts`, `mint.ts`,
`client.ts`, `cashu/*`, `storage.ts`, `lockout.ts`, `autolock.ts`, `Keypad.svelte`,
`PinDots.svelte` all untouched).

## TASK-209 PIN preservation — verified intact
- `PIN_LENGTH = 4` (Setup.svelte) — unchanged from TASK-209.
- Keypad + PinDots + `{#key attemptKey}` reshuffle-on-remount — preserved.
- Lockout: `getLockoutStatus()` load on mount, countdown tick, `recordFailure` on
  `InvalidPinError`, `recordSuccess` + `resetLockout` on success — preserved.
- Input-mode fallback (`pinEntryMode` keypad/input toggle) — preserved.
- `handlePinDigit` / `handlePinBackspace` logic — preserved (condition `step === 'unlock'`
  replaced with `mode === 'unlock'`; identical branch bodies).

## Test results
- **Wizard suite: 5 files / 41 tests — ALL PASS** (`wizard-tests.log`)
  - Setup.test.ts: 11 pass (welcome/tagline/toggle, create→seed→verify→pin→done, recover,
    invalid seed rejection, existing-wallet unlock, sessionStorage resume, onWalletReady).
  - progress-stepper.test.ts: 7 pass.
  - keypad.test.ts (6) + pindots.test.ts + lockout.test.ts (TASK-209, untouched) pass.
- **Full suite: 1030 passed / 4 failed** — the 4 failures are pre-existing UI tests
  (`ErrorBoundary.test.ts`, `Home.test.ts` ×3), unrelated to Setup/wizard (verified: no
  Setup/locale dependency; same files documented as failing in TASK-205 run).
- **svelte-check: 0 errors in changed files.** Repo has 16 pre-existing errors in 8
  out-of-scope files (cashu client.test.ts, QRDisplay, TransactionDetailSheet, theme.ts,
  pending-tx-resolver.test.ts, History/Receive/Send screens) — none touched.

## Acceptance criteria
1. ✅ wizard 4+ steps navigation PASS (back/forward + progress — ProgressStepper tests)
2. ✅ create/recover choice + language toggle (TH/EN) functional
3. ✅ tagline ใหม่: th `ใช้บิตคอยน์อย่างอิสระ ด้วยความเป็นส่วนตัว` / en `Free Your Bitcoin with Privacy`
   — grep clean: no `ไม่มีคนกลาง` / `ควบคุมเอง`
4. ✅ PWA nudge renders (non-blocking) at Done step — iOS/Android/Desktop instructions;
   floating `PwaInstallPrompt.svelte` untouched
5. ✅ svelte-check 0 errors in changed files

## sessionStorage resume + exit warning
- `sessionStorage['lnwcash_setup_wizard']` persists `{mode, step, seed}` on step change;
  restored on mount; cleared on Done / welcome.
- `beforeunload` guard active while setup in-progress (not welcome/done/unlock).

## Notes / known discrepancy (not a blocker for TASK-207)
- Existing locale keys `screen.register.pin_placeholder` (`"Set 6-digit PIN"`) and
  `screen.register.error_too_short` (`"at least 6 digits"`) are still worded "6-digit".
  TASK-209 explicitly deferred the 6→4 locale fix to another task ("ตามคำสั่ง"); my
  instruction was to add keys, not remove/edit existing ones. The wizard PIN step reuses
  these keys, so a follow-up task should update those two values to "4-digit" (Truth Priority).
- Screenshot not produced (no headless browser in this environment); DOM structure verified
  via @testing-library/svelte.

## Evidence files
- `Setup.svelte.diff`, `ProgressStepper.svelte` (new), `locales.diff`
- `git-diff-stat.txt`, `svelte-check.txt`, `wizard-tests.log`, `verification-summary.md`

## Blockers
None.
