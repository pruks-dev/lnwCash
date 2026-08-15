# TASK-241 — Verification Summary (Saber Backend)

## Verdict: COMPLETE

## Fixes applied (`src/lib/cashu/client.ts`)

### 1. checkState NUT-07 encoding fix (HIGH — F-V27-002)
- **Before:** `hash_to_curve(hexToBytes(p.secret))` — hex-decoded the 64-char hex
  secret into 32 raw bytes, producing a DIFFERENT curve point than `blind.ts`.
- **After:** `hash_to_curve(utf8ToBytes(p.secret))` — UTF-8 encodes the secret
  string, exactly matching `blindMessage()` in `src/lib/cashu/blind.ts:135`
  (`hash_to_curve(encoder.encode(message))` where `encoder = new TextEncoder()`).
- Import changed `hexToBytes` → `utf8ToBytes` (from `@noble/hashes/utils.js`).
- Result: mint can now match the proof by Y; SPENT proofs report SPENT (not UNSPENT).

### 2. CashuError code field (LOW — F-V27-003)
- `CashuError.code` widened `number` → `number | string`.
- Added `CashuError.BENIGN_CODES = new Set([11003, 20002])` static.
- Added `get isBenign(): boolean` (normalizes string codes to number).
- `fetchFromMint` now parses `code` from the error body and includes it in the
  message as `HTTP <status> (<code>): <detail>` — e.g. `HTTP 400 (11003): outputs already signed`.
- Benign classification: `11003` (already-signed) and `20002` (quote-already-issued)
  are benign double-submits; anything else is a real error.

## CashuError API (for TASK-243 frontend)
```ts
try { ... } catch (e) {
  if (e instanceof CashuError) {
    e.status;      // number | undefined  (HTTP status)
    e.code;        // number | string | undefined  (NUT error code, e.g. 11003)
    e.isBenign;    // boolean  (true for 11003 / 20002)
    e.message;     // "HTTP 400 (11003): outputs already signed"
  }
}
```

## Test results
| Suite | Result |
|-------|--------|
| `src/lib/cashu/__tests__/` (8 files) | 134 passed |
| Full suite `vitest run` | 1119 passed / 1121 (2 unrelated flaky timeouts in `lockout.test.ts`, pass in isolation) |
| `lockout.test.ts` (isolation) | 10 passed |
| svelte-check | 0 errors, 0 warnings |

## Regression tests added
1. `client.test.ts` — "encodes Y from UTF-8 secret (not hex-decoded) and passes SPENT through"
2. `client.test.ts` — "carries NUT code 11003 in message and .code field"
3. `client.test.ts` — "classifies non-benign codes as real errors"
4. `client.test.ts` — "handles code supplied as a string"
5. `restore-spent-filter-integration.test.ts` (NEW) — real checkState + real restoreWallet,
   mocks only fetch/keyset; asserts correct Y encoding + SPENT proof filtered out.

## Forbidden zones — untouched
- crypto primitives (encrypt.ts, crypto.subtle, BIP32) — NOT touched
- nut13.ts deriveSecretAndR — NOT touched
- mint.ts (TASK-240) — NOT touched
- client.ts:257 proxy (TASK-242) — NOT touched
- TransactionDetailSheet.svelte (TASK-243) — NOT touched
- pnpm install / lockfile — NOT touched

## Deviations / notes
- Full-suite run showed 2 timeouts in `src/lib/wallet/__tests__/lockout.test.ts`
  under full-suite load (5s timeout each). That file passes 10/10 in isolation.
  Unrelated to this task (no lockout code touched).
