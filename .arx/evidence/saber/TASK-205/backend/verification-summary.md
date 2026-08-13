# TASK-205 — Backend Verification Summary

**Sub-agent:** saber (backend) — under Saber War Minister
**Intent:** INTENT-003 / BLUEPRINT-003 v1.1 — Wave 1 crypto foundation (P0)

## Objective
Migrate seed phrase from 24-word direct-map to 12-word BIP39 standard derivation
(PBKDF2-HMAC-SHA512 → 512-bit seed → 32-byte private key), with dual-support 12/24
so existing 24-word wallets still unlock.

## Changes (files + functions)

| File | Change |
|------|--------|
| `src/lib/wallet/keys.ts` | Rewrote. Added BIP39 primitives (`generateMnemonic`, `mnemonicToSeed`, `mnemonicToPrivateKey`, `entropyToMnemonic`, `mnemonicToEntropy`). `generateKeyPair()` now derives key from mnemonic (returns `mnemonic` field). `seedToPrivateKey()` auto-detects 12 vs 24 words. `privateKeyToSeed()` kept as legacy 24-word direct-map. Corrected false claim comment (line 11). |
| `src/lib/wallet/wordlist.ts` | **Fixed corruption**: original list had 2045 words (missing `involve`, `iron`, `library`, `license`, `lift`; contained non-standard `africa`/`after`). Now exports `WORDLIST` (canonical 2048 BIP39) + `LEGACY_WORDLIST` (original 2045 preserved verbatim + 3 tail pad) for backward compat. |
| `src/lib/wallet/seed.ts` | `exportSeed` prefers stored encrypted mnemonic (12-word), falls back to legacy 24-word re-derivation. `importSeed` auto-detects 12/24, persists mnemonic for 12-word. |
| `src/lib/wallet/storage.ts` | Added `get/set/clearEncryptedMnemonic` + storage key `lnwcash_encrypted_mnemonic`. |
| `src/lib/wallet/state.ts` | `createWallet` now encrypts + persists the BIP39 mnemonic alongside the key. |
| `src/lib/wallet/index.ts` | Barrel: exported mnemonic storage functions. |
| tests (`keys.test.ts`, `seed.test.ts`) | Rewrote: BIP39 vectors, 12-word round-trip, 24-word backward-compat, dual validation. |

## Design decisions
- **BIP39 is one-way** (mnemonic → key via PBKDF2). A private key cannot be reverse-derived
  into a mnemonic, so new wallets persist the mnemonic (encrypted) for export.
- **Dual path routing** in `seedToPrivateKey`: 12 words → BIP39 PBKDF2; 24 words → legacy
  direct-map. Paths are disjoint by word count.
- **Backward compat**: `LEGACY_WORDLIST` preserves the original 2045-word mapping verbatim so
  existing 24-word phrases decode identically. (Padded to 2048 so legacy encode never emits `undefined`.)
- **No forced migration**: legacy wallets keep only the encrypted key; export re-derives their
  24-word phrase on demand.

## Test results
- **Crypto suite (keys + seed + state): 3 files / 54 tests — ALL PASS** (vitest-crypto.log)
- **BIP39 known vectors: 3/3 PASS** (bip39-test-vectors.txt)
- **24-word backward compat: PASS** (backward-compat-test.log)
- **svelte-check: 0 errors in changed files.** Repo has 16 pre-existing errors in 8 files
  (cashu client.test.ts, QRDisplay.svelte, TransactionDetailSheet.svelte, theme.ts,
  pending-tx-resolver.test.ts, History/Receive/Send screens) — all OUT of scope, none touched.
- **Full suite: 928 passed / 4 failed** — the 4 failures are pre-existing UI tests
  (ErrorBoundary.test.ts, Home.test.ts), verified unrelated by `git stash` (they fail with
  my changes reverted too).

## BIP39 test vectors used (empty passphrase, 128-bit entropy)
1. `abandon ×11 about` → `5eb00bbd…9e38e4` (canonical)
2. `legal winner thank year wave sausage worth useful legal winner thank yellow` → `878386ef…ddfb096`
3. `letter advice cage absurd amount doctor acoustic avoid letter advice cage above` → `77d6be97…aceb36`

## Evidence files
- `keys.ts.diff`, `seed.ts.diff`, `state.ts.diff`, `storage.ts.diff`, `wordlist.ts.diff`, `index.ts.diff`
- `git-diff-stat.txt`
- `bip39-test-vectors.txt`
- `backward-compat-test.log`
- `vitest-crypto.log`
- `comment-fix.txt`
- `verification-summary.md` (this file)

## Blockers
None.
