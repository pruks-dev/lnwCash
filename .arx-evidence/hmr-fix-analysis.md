# TASK-056 — HMR Fix Analysis

## Root Cause: Symbol(hmr anchor) Crash in Svelte 5 Dev Mode

### What is Symbol(hmr anchor)?
Svelte 5 assigns a unique `Symbol(hmr anchor)` to each snippet instance at compile time.
During HMR (hot module replacement), the runtime compares snapshot anchors to reconcile
the old component tree with the new compiled output. If a snippet anchor is recreated
(e.g., inside a `$derived` block) on every state change, HMR cannot match old→new → crash.

### Component-by-Component Analysis

---

### 1. TopAppBar.svelte (line 58)

**Symptom:** `Symbol(hmr anchor)` crash when navigating between screens (showBack toggles)

**Root Cause:**
```svelte
leading={showBack ? backBtn : undefined}
```
- Snippet `backBtn` and `undefined` are two DIFFERENT "anchors" for the `leading` prop
- When `showBack` toggles: anchor A (snippet) → anchor B (undefined) → anchor A (snippet)
- HMR snapshot diff sees anchor collision → crash

**Fix:** {#if} wrap — two separate Nav instances, each with stable props
- showBack=true: `<Nav leading={backBtn} />` — stable snippet anchor
- showBack=false: `<Nav />` — no leading prop at all (undefined, no anchor registered)
- HMR handles mount/unmount of entire component, not prop-level snippet swap

---

### 2. BottomNav.svelte (lines 51-59)

**Symptom:** `Symbol(hmr anchor)` crash on language change or active tab switch

**Root Cause:**
```typescript
let navItems = $derived(navScreens.map(item => {
    const Icon = iconForKey(item.key);
    return {
        icon: () => Icon    // ← NEW snippet wrapper created on EVERY $derived run
    };
}));
```
- `$derived` fires on every `$_()` (language) or `active` change
- Each `() => Icon` is a fresh function = fresh snippet anchor
- 5 nav items × N recomputations = 5N new snippet anchors
- HMR diff: old 5 anchors vs new 5 anchors with different identities → crash

**Fix:** Stable snippet references via `{#snippet}` blocks
```svelte
{#snippet walletIcon()}<Wallet size={24} />{/snippet}
{#snippet historyIcon()}<History size={24} />{/snippet}

let navItems = $derived([
    { icon: walletIcon, ... },   // ← stable reference, never recreated
    { icon: historyIcon, ... }    // ← stable reference, never recreated
]);
```
- `{#snippet}` blocks are compiled as stable, hoistable references
- `$derived` only recomputes label/active — snippet references remain constant
- HMR anchor for each snippet never changes → no diff collision

**Bonus:** 5 tabs → 2 tabs (Wallet, History) simplifies the nav bar and makes room
for the center-docked FAB QR Scan button.

---

### 3. Nav.svelte (lines 43-46, 72)

**Symptom:** Potential crash if `leading` is a stale snippet after HMR

**Analysis:**
- `{#if leading}` guard (line 43): Correctly blocks rendering when `leading` is `undefined`
- After TopAppBar fix: `leading` is never conditionally toggled on the same Nav instance
  - Either Nav receives a valid snippet (showBack=true branch)
  - Or Nav receives nothing → `leading` defaults to `undefined` → guard blocks
- `{@render item.icon()}` (line 72): Always receives valid snippet refs from BottomNav

**Verdict:** No changes needed. Guards are sufficient for current component topology.

---

### 4. Fab.svelte (new)

**Purpose:** Center-docked QR Scan FAB button

**Design decisions:**
- `position: fixed` at bottom center with `z-index` above nav bar (`--z-sticky + 10`)
- Inline SVG QR icon (Iconly system icons coming in TASK-061)
- `scale(0)→scale(1)` + `opacity: 0→1` CSS animation on mount
- Respects `prefers-reduced-motion: reduce`
- `onclick` prop: optional callback — no-op when not wired (App.svelte wiring TBD)
- 44px touch target minimum (WCAG 2.5.5)
- Uses design tokens for all values (colors, shadows, transitions, radius)

---

## Summary

| Component       | Issue                          | Fix                                   | HMR Safe? |
|-----------------|--------------------------------|---------------------------------------|-----------|
| TopAppBar       | Conditional snippet prop       | `{#if}` wrap → 2 Nav instances        | ✓         |
| BottomNav       | `$derived` snippet creation    | `{#snippet}` blocks + stable refs     | ✓         |
| Nav             | Guard verification only        | No changes (guards already correct)    | ✓         |
| Fab             | New component                  | Created from scratch                  | N/A       |
