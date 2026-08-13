# TASK-221 — Test-Debt Cleanup (F-027-003 TEST-DEBT-001) — Verification Summary

## Result

| Gate | Before | After |
|------|--------|-------|
| `npx svelte-check --tsconfig ./tsconfig.app.json` | 14 errors + 2 warnings (7 files) | **0 errors, 0 warnings** |
| `npx vitest run` | 5 failures (ErrorBoundary 1, Home 3, Setup 1) | **92 files / 1099 tests passed — 0 failures** |

All fixes are **type-only / test-only** — no runtime behavior changed, no crypto/state
logic touched. Files named in the "Forbidden" list (state.ts, autolock.ts, lockout.ts,
mint.ts, nut13.ts, restore.ts, seed.ts, keys.ts) were NOT modified.

---

## Type errors + warnings (svelte-check) — per file

1. **`src/lib/design/theme.ts:45`** — `derived<ThemeMode, ResolvedTheme>` passed the
   *value* type as the first generic, but Svelte 5's `derived<S extends Stores, T>`
   requires the *store* type there (`Stores = Readable<any>`), so `ThemeMode` (a string
   union) failed the constraint. Fix: `derived<typeof themeMode, ResolvedTheme>`.

2. **`src/lib/components/QRDisplay.svelte:94`** — `typeof navigator !== 'undefined' && (navigator.share)`
   is a truthiness check on a function-typed member (`Navigator.share` is a required
   method in lib.dom), flagged as "always true". Fix: feature-detect with
   `'share' in navigator`.

3. **`src/screens/Send.svelte` (5 errors: 640, 644, 648, 698, 705)** — the union already
   includes `'sending'`, but the template's `{#if lightningState === 'sending'}` narrows
   it *out* of the `{:else}` branch, so the `disabled={lightningState === 'sending'}`
   guards inside that branch are dead comparisons (always false). Fix: removed the stale
   `'sending'` comparisons; kept the reachable `'fee-calculating'` guard on the textarea.

4. **`src/lib/components/TransactionDetailSheet.svelte` (5 errors: 410, 427, 451, 476, 492)** —
   `tx` is a mutable `$props()` binding (reassigned in `checkPayment`), so TypeScript
   loses the `{#if open && tx}` narrowing inside the `onclick` arrow closures. Fix:
   added `{@const t = tx}` after the guard and referenced `t` in the 5 closures.

5. **`src/screens/History.svelte` (2 warnings: 558, 642)** — two dead
   `[data-theme='dark']` scoped selectors (`.tx-type-icon.tx-receive`,
   `.tx-status-badge.status-confirmed`). Fix: removed both dead rules.

6. **`src/lib/cashu/__tests__/client.test.ts:310`** — asserted `response.preimage`, but
   `PostMeltResponse` declares `payment_preimage?` (matching the real mint API). Fix:
   updated the mock object + assertion to `payment_preimage` (test matches reality).

7. **`src/lib/wallet/__tests__/pending-tx-resolver.test.ts:35`** — wrong module path
   `../../../types` resolved to `src/types` (does not exist); the type lives at
   `src/lib/types.ts`. Fix: import from `../../types`.

## Stale tests — per file

8. **`src/__tests__/components/ErrorBoundary.test.ts`** — ErrorBoundary no longer imports
   `svelte-i18n` `_`; it uses hardcoded Thai fallback. The retry-button assertion
   `common.retry` was stale. Fix: assert `ลองใหม่` (the actual rendered text).

9. **`src/__tests__/screens/Home.test.ts` (3 tests)** — Home no longer renders an inline
   transaction list (moved to the History screen in MOD-012). Three tests still asserted
   `home.no_transactions` empty state, `.tx-item` list, and `.tx-status-dot` dots. Fix:
   - "shows empty state" → "renders History button as entry point" (`.history-btn`).
   - "renders transaction list" → asserts **no** inline `.tx-item` (count 0).
   - "renders status dots" → asserts **no** inline `.tx-status-dot` (count 0).

10. **`src/__tests__/screens/Setup.test.ts`** — BIP39 autocomplete now inserts the word
    without a trailing space (TASK-208 seed-box refactor). Fix:
    `expect(input.value).toBe('accident ')` → `expect(input.value).toBe('accident')`.

---

## Note on pre-existing uncommitted changes

The working tree already contained uncommitted changes from earlier tasks. The two
affected files also touched by TASK-221:

- **`src/screens/Send.svelte`** — pre-existing TASK-218 change (`withTransactionGuard`
  import + melt wrap). My TASK-221 edits are only the 5 `disabled` guard removals.
- **`src/__tests__/screens/Setup.test.ts`** — pre-existing TASK-208 autocomplete test
  block additions. My TASK-221 edit is only the trailing-space assertion (1 line).

The `*.diff` evidence files therefore contain the full uncommitted diff for those files;
the TASK-221-specific hunks are the ones described above.

## Acceptance criteria

- [x] `svelte-check` → 0 errors, 0 warnings
- [x] `vitest run` → 100% pass (1099/1099, 0 failures)
- [x] No `// @ts-ignore`, no `any` used to suppress
- [x] Type-only + test-only fixes — no runtime behavior change
- [x] Crypto derivation + state/autolock/lockout/mint/nut13/restore/seed/keys untouched
