# TASK-220 — Change PIN UI + PIN Keypad Shuffle Toggle — Verification Summary

**Sub-agent:** Saber Frontend
**Task:** ARX TASK-220
**Verdict:** COMPLETE
**Date:** 2026-08-13

## Scope
1. Settings → Security: "เปลี่ยน PIN" (Change PIN) flow (verify current → set new ×2 → `changePin()` → toast), plus "forgot PIN" → seed recovery.
2. PIN keypad shuffle toggle "สลับตำแหน่งปุ่ม PIN" (default OFF), wired through `Keypad.svelte` `shuffle` prop.

## Files changed (11)
| File | Change |
|---|---|
| `src/lib/types.ts` | `WalletSettings` + `pin_shuffle: boolean` |
| `src/lib/storage/local.ts` | `DEFAULT_SETTINGS.pin_shuffle = false` + merge/validate in `getSettings()` |
| `src/lib/components/Keypad.svelte` | `shuffle?: boolean` prop → Fisher-Yates via `crypto.getRandomValues` (CSPRNG), `$effect` reshuffles on flip |
| `src/screens/Setup.svelte` | pass `shuffle={pinShuffle}` to both `<Keypad>` usages; read `#/setup?recover=1` → seed recovery |
| `src/screens/Settings.svelte` | Change PIN ListItem + modal; shuffle toggle; forgot-PIN link |
| `src/App.svelte` | render `<Setup>` on `setup` route (enables forgot-PIN recovery while unlocked) |
| `src/locales/en.json` | +9 keys (`settings.change_pin.*`, `settings.pin_shuffle.*`) |
| `src/locales/th.json` | +9 keys (en/th parity) |
| `src/lib/components/__tests__/keypad.test.ts` | updated: shuffle prop tests (default-off fixed order, CSPRNG, permuted order) |
| `src/__tests__/screens/Settings.change-pin.test.ts` | NEW: 6 tests |
| `src/__tests__/screens/Settings.shuffle-toggle.test.ts` | NEW: 5 tests |

## Change PIN flow (Settings → Security)
- "Change PIN" `ListItem` opens a `Modal` with 3 password inputs: current / new / confirm.
- Submit validates: new PIN ≥ 4 chars, new == confirm (mismatch → error, no backend call).
- Then `changePin(currentPin, newPin)` (TASK-219 backend, unchanged).
  - `InvalidPinError` → "Current PIN is incorrect" error, modal stays open.
  - Success → `showToast(success)` + modal closes.
- "Forgot PIN?" link → `navigateTo('setup')` + `#/setup?recover=1` → Setup recover (seed entry) flow.
- No PIN stored in plaintext; only in-memory component state, cleared on close.

## Shuffle toggle
- Security section checkbox bound to `settings.pin_shuffle` (default OFF).
- Toggling persists via `setSettings({ pin_shuffle })`.
- `Setup.svelte` reads the persisted flag and passes `shuffle` to PIN keypads (create/recover/unlock).

## Keypad `shuffle` prop
- `shuffle=false`/undefined → fixed 1-9 + 0 layout (no CSPRNG call).
- `shuffle=true` → Fisher-Yates shuffle using `crypto.getRandomValues` (Uint32Array).
- `$effect` reshuffles when the prop flips.

## Test results
- Change PIN: `6 passed` (`Settings.change-pin.test.ts`)
- Shuffle toggle: `5 passed` (`Settings.shuffle-toggle.test.ts`)
- Keypad shuffle prop: `10 passed` (`keypad.test.ts`)
- **21/21 new+updated tests PASS.**

Full suite: 1094 passed / 5 failed — all 5 failures are pre-existing in files NOT touched by TASK-220
(ErrorBoundary, Home, and the Setup autocomplete trailing-space assertion).

## svelte-check
`14 errors + 2 warnings` — identical to the pre-existing baseline. **0 new errors** in
Settings.svelte / Keypad.svelte / types.ts / local.ts.

## Acceptance criteria checklist
- [x] Change PIN ListItem opens modal (current → new ×2 → confirm).
- [x] `changePin(current, new)` called with correct args (backend unchanged).
- [x] Wrong current PIN (`InvalidPinError`) shows error, no success toast.
- [x] Success toast on successful change; modal closes.
- [x] "forgot PIN" → Setup seed recovery (`#/setup?recover=1`).
- [x] Shuffle toggle default OFF, persists via `setSettings`.
- [x] `Keypad.svelte` `shuffle` prop (Fisher-Yates, CSPRNG), default fixed.
- [x] `types.ts` + `local.ts` `pin_shuffle` (default false, merge).
- [x] `shuffle` wired to all `<Keypad>` usages in Setup.svelte.
- [x] i18n keys en+th parity (parity test passes).
- [x] No plaintext PIN storage.
- [x] `state.ts` / `encrypt.ts` untouched.

## Evidence
- `Settings.svelte.diff`, `Keypad.svelte.diff`
- `change-pin-ui-test.log`, `shuffle-toggle-test.log`
- `svelte-check.txt`
- `screenshot-change-pin.note.txt` (headless — no screenshot possible)
