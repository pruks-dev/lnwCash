# Verification Summary — TASK-211 (Saber Frontend)

## Scope (bounded slice — no crypto/wizard/flow changes)
- `src/locales/en.json`, `src/locales/th.json`
- Wave 2 components/screens a11y attributes only:
  `Keypad.svelte`, `PinDots.svelte`, `ProgressStepper.svelte`, `SeedGrid.svelte`,
  `SeedVerifyQuiz.svelte`, `Setup.svelte`, `Settings.svelte`
- New test: `src/__tests__/lib/i18n-parity.test.ts`

## Results

### 1. th=en key parity
- Before: en=346, th=326 → **gap 20**
- After:  en=349, th=349 → **gap 0** ✅

### 2. 20 missing keys (added to th.json)
screen.receive.success_amount_label, success_dleq_label, success_mint_label,
success_proofs_label, success_sats_unit, success_time_label, success_title
(7) + screen.send.success_amount_label, success_fee_label, success_mint_label,
success_preimage_label, success_proofs_label, success_sats_unit,
success_time_label, success_title, success_token_copy, success_token_label,
success_token_qr_caption, success_token_truncated, success_total_label (13)

### 3. 6-digit → 4-digit (4 spots fixed — Minister listed 3, found 1 more)
- en.json `screen.register.pin_placeholder` ✅
- en.json `screen.register.error_too_short` ✅ (extra — Minister list missed this)
- th.json `screen.register.pin_placeholder` ✅
- th.json `screen.register.error_too_short` ✅

### 4. Missing error keys added (both locales)
- `error.invalid_pin` / `error.wallet_locked` / `error.seed_import` ✅
  (referenced by `src/lib/wallet/errors.ts` but previously absent from locales)

### 5. WCAG 2.1 AA — PASS (see a11y-audit.md)
Contrast (primary-dark fix), keyboard (native controls), ARIA (role/aria-label/
aria-pressed/aria-describedby), focus (:focus-visible), reduced-motion (scoped
media queries), focus-trap N/A (no modal).

### 6. Tests
- i18n-parity.test.ts + i18n-init.test.ts: **10 passed**
- components/* (6 files): **63 passed**
- Setup/Settings screens (3 files): **28 passed**
- Full suite: 1046/1050 passed.
  - 4 failures PRE-EXISTING + out-of-scope: `Home.test.ts` (3) and
    `ErrorBoundary.test.ts` (1 — "Unable to find text 'common.retry'" due to
    uninitialized i18n in that test). Not touched by this task.

### 7. svelte-check
- My Wave 2 files: **0 errors / 0 warnings** ✅
- Whole project: 16 errors + 2 warnings in 8 OTHER files (pre-existing:
  TransactionDetailSheet.svelte, QRDisplay.svelte, History/Receive/Send.svelte,
  theme.ts, client.test.ts, pending-tx-resolver.test.ts) — all outside scope.

## Forbidden checks
- No `ไม่มีคนกลาง` copy introduced ✅
- `recovery.warning.*` (7 keys) intact in both locales ✅
- No git commit/push/reset/checkout/stash performed ✅
