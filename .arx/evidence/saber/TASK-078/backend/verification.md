# TASK-078 — Mint Setup Fix Bundle Verification

## F-042: Mint Manage Routing Fix — RESOLVED
- **Root Cause**: Settings.svelte line 79: `navigateTo('home')` — wrong target
- **Fix**: Import MintSettings component, add sub-view toggle (`showMintManage`), change onclick to switch to mint sub-view
- **Files**: `src/screens/Settings.svelte` (+4 changes: import, state, onclick, conditional render)
- **AC**: Settings → Manage Mint → mint list visible, no redirect to Home ✅
- **Regression**: Setup → Mint Manage still works (separate code path) ✅
- **Tests**: Settings.test.ts PASS ✅

## F-043: Setup Default Mint Pre-fill — RESOLVED
- **Root Cause**: Setup.svelte line 38: `mintUrls = $state([])` — empty on first run
- **Fix**: Import DEFAULT_MINT_CONFIG, change to `$state([DEFAULT_MINT_CONFIG.url])`
- **Files**: `src/screens/Setup.svelte` (+2 changes: import, initialization)
- **AC**: First run → 'https://mint.lnw.cash' pre-filled, removable ✅
- **Regression**: Wallet creation still requires >= 2 mints ✅
- **Tests**: Setup.test.ts PASS ✅

## F-044: Mint URL /v1/info Validation — RESOLVED
- **Root Cause**: isValidUrl() only checks format, no actual mint reachability check
- **Fix**: handleValidate() now wraps discoverMintEndpoints() with Promise.race + 5s timeout, Thai error messages for failure
- **Files**: `src/routes/settings/mint/+page.svelte` (1 function changed)
- **AC**: Valid URL → /v1/info fetched → mint info displayed ✅
- **AC**: Invalid URL → error message ✅
- **AC**: Timeout 5s → graceful error message ✅
- **AC**: Loading state during validation ✅
- **Tests**: +page.test.ts PASS (all 6 add/validate tests) ✅

## Vitest Regression
- **Result**: 703 PASS / 1 FAIL (ErrorBoundary.test.ts — pre-existing, unrelated)
- **Threshold**: ≥ 700 PASS ✅

## Evidence Files
1. F-043-setup-default.diff — Setup.svelte changes
2. setup-first-run.txt — First run behavior description
3. F-042-routing-fix.diff — Settings.svelte changes
4. settings-mint-manage-fixed.txt — Routing fix description
5. setup-mint-manage-regression.txt — Regression verification
6. F-044-info-validation.diff — mint/+page.svelte changes
7. info-validation-success.txt — Success path description
8. info-validation-fail.txt — Failure scenarios description
9. info-validation-timeout.txt — Timeout handling description
10. end-to-end-mint-flow.txt — E2E flow description
11. vitest-regression.log — Full test output (703 PASS)
12. verification.md — This file

## Status: ALL RESOLVED
