# TASK-215 — NUT-13 Seed Wiring (Wallet Lifecycle) — Verification Summary

**Sub-agent:** saber (Backend)
**Scope:** F-027-001 part 1 — wire NUT-13 determinism at wallet lifecycle level.

---

## 1. What changed

### `src/lib/wallet/state.ts` (core change)
1. Added import: `setActiveSeed, clearActiveSeed, seedFromMnemonic` from `./nut13`.
2. `unlockWallet()`: after decrypting the private key, decrypts the stored BIP39
   mnemonic (if present) and calls `setActiveSeed(seedFromMnemonic(mnemonic))`.
   Wrapped in `try/catch` for graceful fallback (corrupt/undecryptable mnemonic →
   skip, leave active seed unset).
3. `lockWallet()`: added `clearActiveSeed();` alongside `unlockedPrivateKey = null`.
4. `deleteWallet()`: added `clearActiveSeed();` alongside `unlockedPrivateKey = null`.

No crypto derivation (BIP39 / PBKDF2 / NUT-13 KDF) was changed.

### `src/lib/wallet/__tests__/state-seed-wiring.test.ts` (NEW — 10 tests)
Covers unlock/lock/delete lifecycle, legacy 24-word compat, and missing/corrupt
mnemonic fallback.

### `src/lib/wallet/__tests__/mint.test.ts` (test-fixture update — necessary)
`KEYSET_ID` was `'keyset-abc123'` — a fake ID that is **not** a valid NUT-13 v2
keyset (version byte `01`). Before this task the active seed was always null, so
the mint path always used the random-secret fallback and never hit NUT-13
derivation. Now that `unlockWallet()` sets the active seed, `completeMint`/
`mintFlow` correctly derive deterministic secrets and `deriveSecretAndR` rejects
the non-v2 keyset. Updated the fixture to the official NUT-13 v2 keyset ID
(`015ba18a8adc…ccf76a`, already used by `mint-nut13.test.ts`). This is a fixture
correction, not a behavior change to production code — real mints use v2 keysets.

> NOTE: the `git diff src/lib/wallet/state.ts` evidence shows the diff vs `HEAD`,
> which includes **prior-task uncommitted** changes (mnemonic import, PIN
> length 4 vs 6, `setEncryptedMnemonic` in `createWallet`). TASK-215-specific
> lines in that diff are: the `./nut13` import, the unlock-mnemonic block, and
> the two `clearActiveSeed()` calls.

---

## 2. Test results

| Suite | Result |
|---|---|
| `state.test.ts` + `state-seed-wiring.test.ts` | **28/28 PASS** |
| `state-seed-wiring.test.ts` (lifecycle: unlock/lock/delete) | **10/10 PASS** |
| `-t "legacy 24-word"` | **2/2 PASS** (8 skipped by filter) |
| `-t "mnemonic missing/corrupt"` | **4/4 PASS** (6 skipped by filter) |
| `mint.test.ts` (after fixture fix) | **18/18 PASS** |
| Full `src/lib/wallet` suite | **310/310 PASS** (final clean run) |

### Flaky pre-existing failures (verified NOT caused by TASK-215)
The full suite is intermittently flaky under load. Some runs show:
- `lockout.test.ts` — 1–2 tests fail with **`Test timed out in 5000ms`** (PBKDF2
  600k-iteration counter encryption is slow under full-suite load). Confirmed
  failing with TASK-215 changes **reverted** → pre-existing.
- `autolock.test.ts` — timer/navigation tests that can fail only when the full
  suite runs (pass 28/28 in isolation).

On the final clean run, all 310 tests passed. Neither flaky test involves
`unlockWallet`/`lockWallet`/`deleteWallet` seed behavior.

---

## 3. Acceptance criteria checklist

| # | Criterion | Status |
|---|---|---|
| 1 | `unlockWallet` imports `setActiveSeed`, `clearActiveSeed`, `seedFromMnemonic` from `./nut13` | ✅ |
| 2 | `unlockWallet` decrypts mnemonic + calls `setActiveSeed(seedFromMnemonic(...))` after key decrypt | ✅ |
| 3 | `lockWallet` calls `clearActiveSeed()` | ✅ |
| 4 | `deleteWallet` calls `clearActiveSeed()` | ✅ |
| 5 | Legacy 24-word (no mnemonic) unlock works, no crash, active seed may be null | ✅ |
| 6 | Missing/corrupt mnemonic → graceful fallback, unlock succeeds, no throw | ✅ |
| 7 | Crypto derivation (BIP39/PBKDF2/NUT-13 KDF) unchanged | ✅ |
| 8 | No UI files touched | ✅ |

---

## 4. Evidence files (this dir)
- `state.ts.diff` — `git diff src/lib/wallet/state.ts`
- `seed-wiring-test.log` — seed-wiring lifecycle test run (10/10)
- `legacy-24word-test.log` — 24-word legacy unlock test run (2/2)
- `mnemonic-missing-fallback.log` — missing/corrupt mnemonic fallback (4/4)
- `wallet-suite.log` — full `src/lib/wallet` suite run (shows pre-existing timeouts)
