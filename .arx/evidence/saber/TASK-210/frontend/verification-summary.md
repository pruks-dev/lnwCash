# TASK-210 — Auto-lock (idle timeout) — Frontend Verification Summary

## Sub-agent
saber-frontend — Wave 2 frontend / P1

## Scope (bounded slice)
- ✅ `src/lib/wallet/autolock.ts` (new) — AutoLockTimer
- ✅ `src/screens/Settings.svelte` — Security section (timeout dropdown)
- ✅ `src/lib/wallet/storage.ts` — NEW functions only (migration key `lnwcash_autolock_timeout`)
- ✅ tests: `autolock.test.ts` + `Settings.autolock.test.ts`

## Acceptance criteria — evidence

### 1. Idle timeout triggers lock (default 5 min) ✅
- `getAutolockTimeoutMinutes()` returns `5` when the key is unset (default).
- Test `locks after default 5 min idle` → after `vi.advanceTimersByTime(5 * MINUTE)` the wallet locks.
- Lock action = `clearSessionPin()` (session PIN dropped) + `lockWallet()` (in-memory key cleared, state → LOCKED) + `navigateTo('home')` + `showToast('Wallet auto-locked due to inactivity', 'info')`.
- Verified: `isUnlocked()` → `false`, `getSessionPin()` → `null`, `navigateTo` called with `'home'`, `showToast` called with the toast message.

### 2. Configurable dropdown (1/5/15/30/60/Never) functional ✅
- `AUTOLOCK_OPTIONS = [1, 5, 15, 30, 60, 0]` (0 = Never).
- Settings Security section renders a `<select>` (aria-label "Auto-lock timeout") with options `1 min / 5 min / 15 min / 30 min / 60 min / Never`.
- Selecting a value persists via `setAutolockTimeout(minutes)` → `lnwcash_autolock_timeout`.
- `Settings.autolock.test.ts` verifies option list, `setAutolockTimeout` calls, and the "Never" warning text (`keeps your wallet unlocked`) appears only when `0` is selected.
- `respects a custom 1-minute timeout` proves a non-default timeout locks after 1 min.

### 3. In-flight guard: NO lock during mint/melt ✅
- `beginTransactionGuard()` / `endTransactionGuard()` reference-count in-flight transactions.
- While count > 0, the timeout is DEFERRED (re-checked every 1000 ms) — never locks mid-tx.
- Test `does NOT lock while a transaction is in flight` → 10 min idle with guard active = still unlocked, `navigateTo` NOT called.
- Test `locks shortly after the transaction finishes` → after `endTransactionGuard()`, lock fires within the grace interval.
- `withTransactionGuard(fn)` wraps an async fn with try/finally (safe on throw).

> NOTE: `mint.ts` / `melt.ts` call-sites are OUTSIDE this sub-agent's bounded slice (forbidden files). The guard API is exposed + unit-tested; wiring the guard into the mint/melt call sites is a follow-up for the sub-agent owning those files.

### 4. svelte-check 0 errors (my files) ✅
- Full `svelte-check --tsconfig ./tsconfig.app.json` reports errors ONLY in other files (other sub-agents' in-progress work: `lockout.test.ts`, `pending-tx-resolver.test.ts`, `client.test.ts`, `Send/Receive/History/TransactionDetailSheet/QRDisplay/theme.ts`).
- `grep` confirms ZERO errors/warnings in `autolock.ts`, `Settings.svelte`, `wallet/storage.ts`.

## Idle detection events
- `mousemove`, `keydown`, `touchstart` (window) + `visibilitychange` (reset when document becomes visible).

## Test results
- `npx vitest run` (related): **56 passed / 0 failed** (autolock + Settings.autolock + existing Settings + state regression).
- New autolock suite: **23 tests**, all passing (fake timers).

## Integration note (deferred — outside slice)
- `startAutoLock()` must be invoked on wallet unlock at app level (`App.svelte` / `Setup.svelte`), and `withTransactionGuard()`/`beginTransactionGuard()` should wrap the mint/melt flows. These files are not in this sub-agent's allowed list.
- `Settings.svelte` calls `startAutoLock()` on mount so visiting Settings arms the timer.

## Evidence files
- `autolock-timer.ts` — full new module
- `autolock-timer.test.ts` — timer test suite
- `Settings.autolock.test.ts` — dropdown test suite
- `Settings.svelte.diff` — Security section diff
- `storage.ts.diff` — new storage functions diff
- `svelte-check.txt` — full svelte-check output
- `autolock-tests.log` — verbose vitest output
- `screenshot-autolock.png` — NOT captured (requires dev-server + Playwright; skipped to avoid interfering with parallel agents)
