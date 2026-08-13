# TASK-217 — Verification Summary (Saber frontend)

## Objective
1. Route production Receive flow through `mint.ts completeMint()` (deterministic
   NUT-13 path via `getActiveSeed()`) instead of inline `crypto.getRandomValues`.
2. Fix recovery: `restoreFunds()` iterates `getAllMintConfigs()` for multi-mint.

## Files changed

| File | Change |
|------|--------|
| `src/screens/Receive.svelte` | `completeMintAfterPayment()` delegates output creation/submit/unblind/store to `completeMint()`; removed inline random blinded-output block; wrapped mint in `withTransactionGuard()`; added null-guards on `pendingTxId` (also fixed 2 pre-existing svelte-check errors). (30 ins / 44 del) |
| `src/screens/Setup.svelte` | `restoreFunds()` iterates `getAllMintConfigs()` (per-mint fetchAndCacheKeysets + restoreWallet + accumulate total); added `restoreProgress` state + UI display. |
| `src/__tests__/screens/Setup.test.ts` | Added `getAllMintConfigs` to store mock; added `restoreWallet`/`fetchAndCacheKeysets` imports; added multi-mint restore test. |
| `src/__tests__/screens/Receive.deterministic-mint.test.ts` | NEW — 4 tests (completeMint args, withTransactionGuard wrap, tx-confirm + notify, static no-getRandomValues assertion). |

## How deterministic routing is wired
`Receive.svelte → completeMintAfterPayment()`:
- still calls `getPrivateKey()` first → `WalletLockedError` propagates to the
  existing unlock-prompt retry flow (unchanged).
- still fetches keysets + picks active `keysetId`.
- calls `withTransactionGuard(() => completeMint(mintUrl, quoteId, amount, keysetId, true))`.
  `completeMint()` derives NUT-13 secrets from `getActiveSeed()` and advances
  `counterK` (deterministic, recoverable) — inline `crypto.getRandomValues` gone.
- if `completeMint` returns `{success:false, error}` with a locked-wallet message,
  it is re-thrown as `WalletLockedError` so the unlock prompt still fires.

## How multi-mint restore is wired
`Setup.svelte → restoreFunds(seedBytes)`:
- `getAllMintConfigs()` → for each mint: `fetchAndCacheKeysets(url)` →
  `restoreWallet(url, seedBytes, ks.id, {})` per active keyset → accumulate
  `restoredProofs`. Per-mint progress string `{i}/{n}: {name|url}` shown in UI.

## Test results
- `Receive.deterministic-mint.test.ts` — **4/4 PASS**
- `Setup.test.ts` multi-mint test — **PASS** (`restoreWallet` called for both mints)
- `Receive.test.ts` (existing) — **18/18 PASS** (no regression)
- `Setup.test.ts` full — **13/14** (1 PRE-EXISTING failure, see below)

### Pre-existing failure (NOT caused by TASK-217)
`Setup.test.ts › recover import shows BIP39 autocomplete suggestions`:
`expect(input.value).toBe('accident ')` → received `'accident'`. This test + the
`completeSeedWord` implementation were added by prior uncommitted TASK-208 work;
the trailing-space expectation mismatches the current per-word-box design. My
Setup.svelte changes (import / restoreProgress / restoreFunds / UI) are orthogonal
to this path. Confirmed pre-existing by TASK-216 RESULT ("Setup.test.ts # BIP39
autocomplete (pre-existing)").

## svelte-check
- **14 errors / 2 warnings** — **0 in TASK-217 files** (Receive.svelte, Setup.svelte,
  my new test file).
- Baseline before TASK-217 was 16 errors. My change *removed* the 2 pre-existing
  `pendingTxId` null errors in Receive.svelte (added null guards), and added 0 new.
- Remaining 14 are in unrelated files (Send.svelte, TransactionDetailSheet.svelte,
  theme.ts, QRDisplay.svelte, History.svelte, client.test.ts, pending-tx-resolver.test.ts).

## Acceptance criteria checklist
- [x] Receive flow routes through `completeMint()` deterministic path (inline `crypto.getRandomValues` removed — static test asserts absence).
- [x] `withTransactionGuard()` wraps the mint call (F-027-004 mint half).
- [x] `WalletLockedError` unlock-prompt retry preserved (`getPrivateKey()` + result.error re-throw).
- [x] `restoreFunds()` iterates `getAllMintConfigs()` (per-mint restore + accumulate).
- [x] Per-mint progress UI (`restoreProgress` `{i}/{n}: {name|url}`).
- [x] Unit tests added + passing (deterministic receive, multi-mint restore).
- [x] svelte-check: 0 errors in TASK-217 files.
- [x] `completeMint()` signature/crypto unchanged; state.ts untouched.

## Evidence dir
`/home/debian/arx-projects/lnw-cash/.arx/evidence/saber/TASK-217/frontend/`
- `Receive.svelte.diff` — full git diff (my changes only; file was clean before)
- `Setup.svelte.diff` — focused 4-hunk diff (file was already dirty w/ TASK-208)
- `deterministic-receive-test.log` — 4/4 PASS
- `multi-mint-restore-test.log` — multi-mint test PASS
- `Setup.test.full.log` — full Setup.test.ts run (13/14, 1 pre-existing)
- `svelte-check.txt` — 14 errors / 2 warnings, 0 in TASK-217 files
- `verification-summary.md` — this file
