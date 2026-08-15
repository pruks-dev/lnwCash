# TASK-245 — Re-seed → swap migration (F-V26-003) — Verification Summary

**Sub-agent:** saber-backend (PRIMARY — migration engine + Settings UI entry)
**Verdict:** COMPLETE
**Date:** 2026-08-14

## Scope delivered

1. **Migration engine** — `src/lib/wallet/migration.ts` (new, 275 lines)
2. **Unit tests** — `src/lib/wallet/__tests__/migration.test.ts` (new, 213 lines, 7 tests)
3. **UI entry** — `src/screens/Settings.svelte` (+220 lines: entry + confirm→PIN→progress→success/error modal)
4. **i18n** — `src/locales/en.json` + `src/locales/th.json` (+12 keys each, parity th=en)

## Engine design (orchestration + counter_k init + atomicity)

`migrateWallet(pin)` — public API:
1. Verify PIN via `verifyPin` (final cryptographic gate; `InvalidPinError` / `WalletNotInitializedError`).
2. Generate new mnemonic (`generateMnemonic()`) → seed (`mnemonicToSeed`).
3. Group unspent proofs by `(mint_url, keyset_id)`.
4. **Phase A (swap — network only):** per group, `swapGroupForNewSeed` derives deterministic outputs 1:1
   with inputs (same amounts, so every NUT-03 batch is amount-balanced) from the **new** seed via
   `deriveSecretAndR(seed, fullId, counter)` starting at counter 0, blinds them, and calls
   `swapProofs`. No local persistence in this phase — any failure aborts before **any** write.
5. **Phase B (commit — only after ALL swaps succeed):**
   - `addProofs(newProofs)` per group → persist new value first,
   - `removeProofs(old local_ids)` → clear burned proofs,
   - `setCounterK(keysetId, swapCount)` → **counter_k init = swap count (NOT 0)**,
   - `setActiveSeed(newSeed)` + `encryptKey(newMnemonic, pin)` → `setEncryptedMnemonic`.

**Atomicity guarantee:** swap failure throws before any mutation — old proofs, old seed, and old
mnemonic all remain intact (no fund loss). Verified by test.

**NUT-29 batching:** `NUT29_MAX_BATCH_SIZE = 1000`; groups are sliced into ≤1000-proof batches,
each request amount-balanced.

**`detectLegacyProofs()`:** read-only UI gate.
- No proofs → empty.
- Active seed present → per-proof determinism check (secret ∈ `deriveSecret(seed, keyset, 0..counter_k)`).
- No seed + no stored mnemonic → all proofs legacy (pre-v1.4.1).
- No seed + stored mnemonic (locked v1.4.1 wallet) → empty (deterministic by construction).

## USER-CONFIRMED (MANDATE-029)

No auto-migration: `migrateWallet` is only reachable through the Settings UI entry, which requires
(1) an explicit "Continue" confirmation dialog and (2) PIN re-entry before the swap runs.

## Test results

- `migration.test.ts`: **7/7 PASS**
  - round-trip (old → new deterministic proofs bound to new seed)
  - counter_k init = swap count (NOT 0)
  - NUT-29 batching (1001 proofs → 2 requests, each ≤1000)
  - atomic (swap fail → old proofs/seed/mnemonic untouched)
  - wrong-PIN rejected before any swap
  - detectLegacyProofs positive + negative
- Full suite: **1139/1139 PASS** (99 files) — was 1132 before this task (+7).
- `svelte-check`: **0 errors, 0 warnings**.
- i18n parity: **0 EN-only / 0 TH-only** keys.

## Deviations / notes for Minister

1. **Private key NOT rotated.** The task spec lists `setActiveSeed` + `setEncryptedMnemonic` +
   `setCounterK` only. The stored encrypted *private key* (`lnwcash_encrypted_key`) is intentionally
   left unchanged. In this codebase the private key is vestigial (used only as a lock-check via
   `getPrivateKey()`; NUT-13 proof derivation uses the 64-byte seed, not the private key), so funds
   remain fully recoverable from the new mnemonic. Flagging for review in case the invariant
   `privateKey == mnemonicToPrivateKey(mnemonic)` is expected to hold (future task candidate).
2. **Batch test uses 1001 proofs** (not 2500) — fake-indexeddb `addProofs`/`removeProofs` are
   sequential awaits; 2500 proofs exceeded the 30s test budget. 1001 still proves >1000 batching
   (2 requests: 1000 + 1).
3. `locales-i18n.diff` is an extra evidence file (beyond the 7 required) capturing the th/en key adds.

## Evidence files

| File | Content |
|------|---------|
| migration-engine.diff | re-seed + swap orchestration + counter_k init + atomicity |
| Settings.svelte.diff | "Migrate wallet" UI (confirm → PIN → progress → success/error) |
| locales-i18n.diff | settings.migrate.* keys (th + en) |
| migration-roundtrip-test.log | old proofs → new deterministic proofs PASS |
| counterk-init-test.log | counter_k = swap count PASS |
| batch-1000-test.log | NUT-29 batch handling PASS |
| atomic-swap-fail-test.log | swap fail → old proofs untouched PASS |
| svelte-check.txt | 0 errors, 0 warnings |
