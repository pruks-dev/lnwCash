# TASK-216 — UnlockPrompt lockout wiring + 4-digit maxlength

## Objective
Close F-027-002 (lockout bypass on the re-auth surface) and F-027-008
(6-digit remnant). `UnlockPrompt.svelte` previously called `unlockWallet()`
directly with no `getLockoutStatus()`/`recordFailure()` — brute-forcing the
4-digit PIN on unlock was NOT rate-limited. Also the PIN input allowed 6 digits.

## Changes
1. `src/components/UnlockPrompt.svelte`
   - Import `getLockoutStatus`, `recordFailure`, `recordSuccess` (+ `LockoutStatus`
     type) from `$lib/wallet/lockout`.
   - Lock state derived from `lockUntil` + a 1s ticking clock (`nowTick`):
     `remainingMs`, `locked`, `countdownLabel` (mm:ss).
   - On open (`$effect`): `refreshLockout()` → `getLockoutStatus()`.
   - On submit: re-check `getLockoutStatus()` FIRST — if `locked`, block and
     return (never reaches `unlockWallet`).
   - On `InvalidPinError` → `recordFailure()` → if now locked, render countdown
     (no wrong-PIN error); else keep the wrong-PIN error.
   - On success → `recordSuccess()` (resets counter) BEFORE `onunlock()`.
   - `maxlength={6}` → `maxlength={4}` (F-027-008).
   - Locked state disables the PIN input + confirm button and renders
     `<p class="unlock-locked" role="alert" aria-live="polite">` with the
     `unlock.locked_soft` / `unlock.locked_hard` message (interpolates `{time}`).
2. `src/locales/en.json` + `src/locales/th.json`
   - Added `unlock.locked_soft` + `unlock.locked_hard` to BOTH (parity kept:
     en 351 == th 351, identical key sets).
   - EN soft: "Too many attempts — try again in {time}"
   - EN hard: "Too many attempts — wallet locked. Try again in {time}"
   - TH soft: "พยายามผิดหลายครั้งเกินไป — ลองอีกครั้งใน {time}"
   - TH hard: "พยายามผิดหลายครั้งเกินไป — กระเป๋าถูกล็อก ลองอีกครั้งใน {time}"
3. `src/components/__tests__/unlock-prompt.test.ts` (new, 6 tests)

## Security notes (no violations)
- No PIN or attempt counter stored in plaintext — counter stays in the existing
  AES-GCM encrypted storage (`$lib/wallet/lockout.ts`, untouched).
- `unlockWallet()` logic NOT modified (state.ts owned by TASK-215 — untouched).
- Fail-open preserved: lockout errors caught and allow the submit path to re-check.

## Tests (vitest — jsdom)
File: `src/components/__tests__/unlock-prompt.test.ts` — 6 passed / 0 failed.
1. 4-digit maxlength attribute (F-027-008)
2. blocks submit (no `unlockWallet`) when lockout active at submit time
3. 5 failures → soft lock + re-auth blocked (submit-time re-check)
4. hard-tier renders `unlock.locked_hard`
5. wrong PIN below threshold → records failure, stays unlocked, shows error
6. success → `recordSuccess()` (counter reset) before `onunlock()`

## svelte-check
0 errors / 0 warnings in the changed file (`UnlockPrompt.svelte`).
Repo total: 16 errors + 2 warnings in 8 OTHER pre-existing files (matches the
known baseline). Locale JSON files + test file also clean.

## DOM-test limitation (honest)
Lockout UI is proven via jsdom DOM assertions (lock message rendered, input/button
disabled, `unlockWallet` not called). No pixel screenshot of the locked state —
the countdown is implemented as a derived mm:ss label; see
`screenshot-unlock-locked.txt` for the reason and the rendered example strings.

## Acceptance criteria checklist
- [x] getLockoutStatus/recordFailure/recordSuccess imported & wired
- [x] locked → block submit + countdown (mm:ss), no unlockWallet call
- [x] InvalidPinError → recordFailure → lock status shown
- [x] success → recordSuccess BEFORE onunlock()
- [x] maxlength 6 → 4
- [x] i18n unlock.locked_soft + unlock.locked_hard added to en + th (parity)
- [x] unlockWallet() logic untouched (state.ts) / no plaintext PIN or counter
- [x] tests green + svelte-check 0 new errors in changed file
