# WCAG 2.1 AA — Accessibility Audit (TASK-211 / Wave 3 cross-cutting)

Scope: Wave 2 components + screens (Setup, SeedGrid, SeedVerifyQuiz, Keypad,
PinDots, ProgressStepper, Settings). Attribute-level fixes only — no logic/flow
changes, no crypto/wizard changes.

## 1. Contrast (1.4.3 / 1.4.11) — FIXED in-scope

| Surface | Before | After | Ratio | AA |
|---|---|---|---|---|
| ProgressStepper active step dot (text on bg) | `#fff` on `--color-primary` (#00bcd4) | `--color-primary-contrast` on `--color-primary-dark` (#00838f) | **4.53:1** | PASS |
| ProgressStepper "next" button | `#fff` on `--color-primary` | `--color-primary-contrast` on `--color-primary-dark` | **4.53:1** | PASS |
| PinDots filled dot (non-text, 1.4.11) | `--color-primary` (#00bcd4) vs white | `--color-primary-dark` (#00838f) vs white | **4.53:1** | PASS (≥3:1) |
| SeedVerifyQuiz retry button | `#fff` on `--color-primary` | `--color-primary-contrast` on `--color-primary-dark` | **4.53:1** | PASS |
| Setup `.lang-btn.active` | `#fff` on `--color-primary` | `--color-primary-contrast` on `--color-primary-dark` | **4.53:1** | PASS |
| Settings `.option-btn.active` | `--color-primary-contrast` on `--color-primary` | `--color-primary-contrast` on `--color-primary-dark` | **4.53:1** light / **6.85:1** dark | PASS |

Verified already-compliant (unchanged):
- Keypad digits `#212121` on `#ffffff` = 15.9:1 (PASS); backspace `#616161` on `#f5f5f5` = 5.7:1 (PASS).
- SeedGrid index/labels `#616161` on `#f5f5f5` = 5.7:1 (PASS).
- Error text `#d32f2f` on surface = 4.98:1 (PASS); done dot `#2e7d32` on `#fff` = 5.12:1 (PASS).

Dark theme: `--color-primary-contrast` (#121212) on `--color-primary-dark`
(#00acc1) = 6.85:1 — fixes are theme-aware (no hardcoded `#fff`).

> ⚠️ Note (out of scope): the global `--color-primary` (#00bcd4) with white text
> still fails AA in `Button.svelte` primary variant + other non-Wave-2 surfaces.
> Recommended as a separate design-token task; not touched here (bounded slice).

## 2. Keyboard navigation (2.1.1) — PASS (verified, no changes needed)

- Keypad digits/backspace, ProgressStepper back/next, SeedVerifyQuiz retry,
  language/theme toggles, autolock `<select>`: all native `<button>/<select>/<input>`.
- Interactive `Card` (Setup welcome create/recover) already implements
  `role="button"` + `tabindex="0"` + Enter/Space key handler (Card.svelte) — keyboard operable.
- Seed import autocomplete suggestions are `<button>`s inside `<ul>` — keyboard reachable.

## 3. ARIA semantics — ADDED

| Component | Attribute added / already present |
|---|---|
| Keypad | `role="group"` + `aria-label="PIN keypad"` (ADDED); per-digit `aria-label` (existing) |
| PinDots | `role="progressbar"` + `aria-valuemin/max/now` (existing); descriptive `aria-label="PIN entry N of M digits"` (IMPROVED) |
| ProgressStepper | `role="navigation"`, `aria-current="step"` (existing) |
| SeedGrid | `role="list"` / `role="listitem"` + `aria-label` (existing) |
| SeedVerifyQuiz | `aria-invalid` (existing); `aria-describedby` → error `<p id="verify-quiz-error">` (ADDED); error `role="alert"` (existing) |
| Setup | `role="main"`, `role="group"` language toggle, `role="alert"` error/lockout banners, `role="status"` restore (existing); `aria-pressed` on language buttons (ADDED) |
| Settings | `role="main"`, back button `aria-label` (existing); `role="group"` + `aria-label` + `aria-pressed` on language/theme option rows (ADDED) |

## 4. Focus visibility (2.4.7) — PASS (verified)

- All Wave 2 interactive elements already provide `:focus-visible` outlines:
  - Keypad `.key-btn:focus-visible` → 2px solid `--color-primary` (existing)
  - Card interactive `:focus-visible` → 2px outline (existing)
  - Settings `.option-btn:focus-visible`, `.autolock-select:focus-visible` (existing)
  - SeedVerifyQuiz input `:focus` → border + box-shadow ring (existing)

## 5. Focus trap — N/A (verified)

- No modal/dialog in Wave 2 components. The only transient overlay is the seed
  import autocomplete suggestion list (a button list, keyboard reachable, not a
  focus trap). No `role="dialog"` / `aria-modal` surfaces → trap not applicable.

## 6. Reduced motion (2.3.3) — ADDED

- Global `animations.css` already zeroes `animation-duration`/`transition-duration`
  under `prefers-reduced-motion: reduce` (loaded in main.ts).
- Added component-scoped `@media (prefers-reduced-motion: reduce)`:
  - Keypad — disable press scale + transitions
  - PinDots — disable `pin-shake` animation
  - ProgressStepper — disable bar-fill width transition + dot/btn transitions
  - SeedVerifyQuiz — disable input/retry transitions

## Result: WCAG 2.1 AA checklist — PASS (for Wave 2 components in scope)

Contrast ✓ · Keyboard ✓ · ARIA ✓ · Focus ✓ · Focus-trap N/A ✓ · Reduced-motion ✓
