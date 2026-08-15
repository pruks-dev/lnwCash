# TASK-243 — MINT-400-LATENT guard: TransactionDetailSheet checkPayment

**Verdict:** COMPLETE
**Wave:** 1 (BLUEPRINT-003 v1.4.1) — P1 / MEDIUM
**Frontend sub-agent (Saber → Orion handoff)**

## Scope
Single target file: `src/lib/components/TransactionDetailSheet.svelte`
(second call site `checkPayment` → `completeMint(waitForPayment=false)`,
not covered by TASK-230's Receive.svelte `mintCompleting` guard).

## What changed (102 insertions / 7 deletions, single file)

### 1. Double-submit guard (`mintCompleting`)
- Added `let mintCompleting = $state(false)` mirroring TASK-230 naming.
- `checkPayment` now bails at top: `if (!tx || checking || mintCompleting) return;`
- Guard set **before** the `await completeMint(...)`, released in a nested
  `finally` (TASK-230 pattern).

### 2. Benign 400 handling (11003 "outputs already signed")
- `completeMint()` returns `{ success, error }` (it does not throw). The old
  code **ignored** the result and marked confirmed unconditionally.
- New code captures `result` and classifies `result.error`:
  - `already-minted` (11003) → treat as confirmed (no retry loop, no hard error).
  - `double-submit` (20002) → treat as confirmed.
  - `real` (incl. "outputs mismatch") → `console.warn`, **keep pending**, no auto-retry.

### 3. Benign vs real separation (robust, pre/post TASK-241)
- `mintErrorCode(error)` reads:
  1. Structured `code` field from an error **object** (TASK-241 `CashuError.code`).
  2. For genuine HTTP responses, a 5-digit code from the message
     (`"HTTP 400 (11003): outputs already signed"`).
- `classifyMintError` falls back to detail-string matching
  (`"outputs already signed"` / `"quote already issued"`).
- **Critical robustness detail:** `isHttpErrorMessage()` gates both the code
  regex and the detail-string fallback to messages that genuinely start with
  `"HTTP <status>"`. This prevents misclassifying the TASK-240 counter-reuse
  guard error, whose client-side message *mentions* `"outputs already signed"`
  and `11003` but is a **real** error (needs wallet restore), not a mint 400.

### 4. ISSUED state (already minted) — no re-submit
- Split the old `PAID || ISSUED` branch. `state === 'ISSUED'` now marks
  confirmed **directly without calling `completeMint`**, avoiding a re-submit
  of an already-issued quote and preserving the prior "confirmed" outcome.

## Tests (10 new, all in `src/__tests__/components/TransactionDetailSheet.mint400.test.ts`)
| # | Case | Assert |
|---|------|--------|
| 1 | double-click in-flight | `completeMint` called exactly once |
| 2 | re-entry during `checkMintQuote` | `completeMint` called exactly once |
| 3 | `HTTP 400: outputs already signed` (pre-241, no code) | confirmed, no retry |
| 4 | `HTTP 400 (11003): outputs already signed` (post-241) | confirmed |
| 5 | `HTTP 400 (20002): quote already issued` (double-submit) | confirmed |
| 6 | `HTTP 400: outputs mismatch` (real) | NOT confirmed |
| 7 | unknown 400 string (real) | NOT confirmed |
| 8 | TASK-240 counter-reuse error (mentions 11003, real) | NOT confirmed |
| 9 | `state === 'ISSUED'` | confirmed, `completeMint` NOT called |
| 10 | successful `completeMint` (regression) | confirmed |

## Verification results
- `npx vitest run src/__tests__/components/TransactionDetailSheet.mint400.test.ts` → **10 passed**
- `npx vitest run src/__tests__/components/` → **23 files / 219 tests passed** (incl. existing 37 TransactionDetailSheet tests)
- `npx vitest run` (full suite) → **96 files / 1123 tests passed**
- `npx svelte-check --tsconfig ./tsconfig.app.json` → **0 errors, 0 warnings**

## Forbidden-rule compliance
- ✅ Did NOT change `completeMint()` signature (`mint.ts`).
- ✅ Did NOT change determinism logic (TASK-244).
- ✅ No blanket 400 catch — benign vs real split by code + gated detail string.
- ✅ Did NOT touch `mint.ts` / `client.ts` / `restore.ts`.
- ✅ Did NOT run `pnpm install` or touch lockfiles.

## Parallel-task note (honest)
- TASK-240/241 had already landed in the **working tree** (uncommitted) when I
  started: `client.ts` (CashuError.code + `isBenign`), `mint.ts` (counter-reuse
  guard). I did not modify them; I only read them to align my handler with the
  actual landed error-message format (`HTTP 400 (11003): …`), and I added a
  regression test proving the TASK-240 counter-reuse error is NOT treated as
  benign.
- First full-suite run showed 3 pre-existing timeout flakiness in
  `lockout.test.ts` / `state-change-pin.test.ts` (scrypt-heavy, 5000ms) under
  parallel CPU contention. Re-run in isolation (16 passed) and a clean full
  re-run (1123 passed) confirm they are unrelated to TASK-243.

## Evidence
- `.arx/evidence/saber/TASK-243/frontend/TransactionDetailSheet.svelte.diff`
- `.arx/evidence/saber/TASK-243/frontend/mint400-latent-test.log`
- `.arx/evidence/saber/TASK-243/frontend/svelte-check.txt`
- `.arx/evidence/saber/TASK-243/frontend/verification-summary.md`
