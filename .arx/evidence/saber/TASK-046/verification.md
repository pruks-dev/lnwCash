# Verification — TASK-046 Self-Review + Test Coverage Analysis

## Scope
- Fix: `src/lib/cashu/blind.ts` — the only file modified
- Wallet mint/melt files (`src/lib/wallet/mint.ts`, `src/lib/wallet/melt.ts`): unchanged, but they
  import from `blind.ts`, so they benefit from the fix automatically

## Changes Summary

| Function | Change | Lines |
|----------|--------|-------|
| `hash_to_curve` | NEW — try-and-increment hash-to-curve | +42 |
| `blindMessage` | UPDATED — uses hash_to_curve + multiplicative | ~10 lines changed |
| `verifySignature` | NEW — helper for integration testing | +15 |
| `verifyBlindSignature` | NEW — helper (limited utility w/o mint key) | +20 |

## Test Coverage

### hash_to_curve tests (5 test cases)
| Test ID | Description | Status |
|---------|-------------|--------|
| C00-05-T1 | Returns valid curve point for "hello" | ✅ PASS |
| C00-05-T2 | Deterministic: same input → same point | ✅ PASS |
| C00-05-T3 | Different messages → different points | ✅ PASS |
| C00-05-T4 | Handles empty message | ✅ PASS |
| C00-05-T5 | Point on curve (re-parsable) | ✅ PASS |

### BDHKE tests (5 test cases)
| Test ID | Description | Status |
|---------|-------------|--------|
| C00-06-T1 | Round-trip: blind → sign → unblind → verify | ✅ PASS |
| C00-06-T2 | Fails verification with wrong private key | ✅ PASS |
| C00-06-T3 | Different secret → different signature, cross-verify fails | ✅ PASS |
| C00-06-T4 | Unblinding with wrong factor fails | ✅ PASS |
| C00-06-T5 | Multiplicative property: (Y * r) * r^{-1} = Y | ✅ PASS |

### Integration tests (5 test cases)
| Test ID | Description | Status |
|---------|-------------|--------|
| INTEG-01 | Single output mint 64 sats | ✅ PASS |
| INTEG-02 | Full cycle: decompose 1337 sats into 6 outputs | ✅ PASS |
| INTEG-03 | Tamper detection: modified blind sig fails | ✅ PASS |
| INTEG-04 | Spend verification: C == k * hash_to_curve(secret) | ✅ PASS |
| INTEG-05 | Different mints → different signatures | ✅ PASS |

### Existing blind tests (14 test cases)
| Group | Status |
|-------|--------|
| deterministicBlindingFactor (4 tests) | ✅ ALL PASS |
| blindMessage (5 tests) | ✅ ALL PASS |
| unblindSignature (4 tests) | ✅ ALL PASS |
| blind + unblind roundtrip (1 test) | ✅ ALL PASS |

## Full Test Suite Result

| Metric | Value |
|--------|-------|
| Total test files | 40 |
| Passed test files | 38 |
| Failed test files | 2 (pre-existing, unrelated) |
| Total tests | 383 |
| Passed tests | 378 |
| Failed tests | 5 (all pre-existing) |
| Our tests (blind.ts + integration) | 29 tests, 29 PASS |

### Pre-existing failures (NOT caused by our changes)
1. `ErrorBoundary.test.ts` — i18n text mismatch (`'common.retry'` vs `'ลองใหม่'`)
2. `endpoint-resolution.test.ts` — TASK-047 endpoint path resolution, 4 tests fail

## Self-Review

### Correctness
- ✅ hash_to_curve matches Python Cashu reference implementation (try-and-increment)
- ✅ BDHKE blinding is multiplicative: `B_ = Y * r` where Y is a curve point
- ✅ Unblinding is correct: `C = C_ * r^{-1}`
- ✅ No new dependencies added (uses existing `@noble/hashes/utils` for `bytesToHex`)

### Edge Cases
- ✅ Empty message handled
- ✅ Very large blinding factors handled
- ✅ hash_to_curve loop terminates (50% probability per attempt, usually 1-3 iterations)
- ✅ Mod-n clamping for scalar values

### Limitations
- `verifyBlindSignature()` cannot fully verify without mint private key (secp256k1 has no pairings)
- The integration test uses a simulated mint with a known private key
- Actual mint interoperability depends on the mint using the same hash_to_curve algorithm
  (the try-and-increment method with `0x02` prefix matches the standard Cashu Python reference)
