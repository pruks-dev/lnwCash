# TASK-251 — BIP32 (version 00) determinism/restore test — Verification Summary

- **Verdict:** COMPLETE
- **Agent:** saber (DevOps sub-agent)
- **Scope:** TEST-ONLY (no production source touched)

## Rationale
Determinism/restore tests all used keyset version `01` (HMAC-SHA256), so the
BIP32 legacy path (`deriveSecretAndRBip32`, keyset version `00`) was never
exercised through melt / swap-receive / restore after TASK-244. Live mint uses
keyset `00c25786d85a1dcd` (version `00`).

## What was added (test files only)

| File | New version-00 coverage |
|------|--------------------------|
| `src/lib/wallet/__tests__/melt-determinism.test.ts` | `describe('NUT-13 deterministic melt change — keyset version 00 (BIP32)')` — 3 cases: real BIP32 change secret (counter 1), same-seed determinism across runs, BIP32≠HMAC sanity |
| `src/lib/wallet/__tests__/tokenStore-determinism.test.ts` | `describe('NUT-13 deterministic swap receive — keyset version 00 (BIP32)')` — 2 cases: real BIP32 swap secrets (counters 0,1), same-seed determinism |
| `src/lib/wallet/__tests__/restore-spent-filter-integration.test.ts` | `it('restore round-trip with keyset version 00 (BIP32) — derive + blind + unblind + spent filter')` — full derive→blind→restore→unblind→checkState spent-filter round-trip |

Keyset used: `00c25786d85a1dcd` (the live mint keyset, 16-hex / 8-byte short form).

## Proof that the BIP32 path is REALLY exercised (not mocked)

- `deriveSecretAndR` / `deriveSecretAndRBip32` are **NOT mocked** in any of the
  three files — only `cashu/client`, `cashu/blind`, `cashu/keyset` (+ `cashu/token`
  for swap) are mocked. The melt change / swap / restore secrets flow through the
  real `nut13.ts` derivation.
- The keyset ID is `00`-prefixed → `deriveSecretAndR` routes through
  `deriveSecretAndRBip32` (BIP32 path `m/129372'/0'/1507773658'/{counter}'/{0|1}`).
- Hardcoded BIP32 values are asserted byte-for-byte so a regression that silently
  routed through HMAC would FAIL the test:
  - counter 0 secret = `81ba74fdabb0c4337e0eda9262dce21246c0b6c1dd0fdd2745032a4e46451a7c`
  - counter 1 secret = `6f050b20feee6fbad8bea06d0ae16166187640ac6ae4818a0383dc5f09d688ba`
  - counter 1 change secret = `6f050b20feee6fbad8bea06d0ae16166187640ac6ae4818a0383dc5f09d688ba`
- An explicit sanity case asserts `deriveSecret(seed, V00, 1) !== deriveSecret(seed, V01, 1)`
  (BIP32 ≠ HMAC for the same counter).

## Test results

| Suite | Result |
|-------|--------|
| Target 3 files (melt + tokenStore + restore) | **14/14 PASS** (was 8) |
| Full suite | **1154/1154 PASS** (103 files; was 1148) — no regression |

New tests added: **6** (3 melt + 2 tokenStore + 1 restore).

## Acceptance criteria
- [x] BIP32 (version 00) determinism + restore round-trip test PASS

## Forbidden — verified compliant
- [x] No production source modified (only 3 test files)
- [x] No derivation logic (`deriveSecretAndR`) changed
- [x] No `pnpm install` / lockfile untouched

## Evidence files
- `bip32-test.diff` — git diff of the 3 test files
- `bip32-determinism-test.log` — verbose run of 3 files (version-00 cases PASS)
- `vitest-full.log` — full suite PASS (103 files / 1154 tests)
- `verification-summary.md` — this file

## Notes / deviations
- `melt-determinism.test.ts` diff also contains TASK-250's prior uncommitted
  counter 0→1 edit (the TASK-250 counter guard); the TASK-251 additions are the
  import line + the whole `keyset version 00 (BIP32)` describe block.
- The keyset `00c25786d85a1dcd` is the 8-byte short form of the live mint keyset.
  Tests run with the short form because `resolveKeysetId` is mocked to pass IDs
  through unchanged; `deriveSecretAndRBip32` only needs the `00` version prefix and
  the hex value (`keysetIdInt = 0x00c25786d85a1dcd % (2^31-1) = 1507773658`).
