# TASK-206 verification summary — NUT-13 Option A (seed = complete backup)

Sub-agent: saber-backend  |  Task: TASK-206  |  INTENT-003 / BLUEPRINT-003 v1.1 / Wave 1 crypto foundation / P0

## Scope (bounded slice)
Wallet-side only. No mint changes. No `.svelte`, no locales, no `storage.ts`/`state.ts`/`seed.ts`.

## Files changed
| File | Change |
|---|---|
| `src/lib/wallet/nut13.ts` | NEW — NUT-13 HMAC-SHA256 KDF (`deriveSecretAndR`, `deriveSecret`), seed helpers, in-memory active seed |
| `src/lib/wallet/counterK.ts` | NEW — per-keyset `counter_k` tracking (localStorage `lnwcash_counter_k`) |
| `src/lib/wallet/restore.ts` | NEW — NUT-13 restore flow (`restoreBatch`, `restoreWallet`) |
| `src/lib/wallet/mint.ts` | `generateSecret()` → deterministic KDF from seed (random fallback retained), counter wiring |
| `src/lib/cashu/client.ts` | NUT-9 `POST /v1/restore` (`restoreOutputs`) + endpoint resolution + restore types |
| tests (5 new files) | nut13 / counterK / restore / mint-nut13 / restore-client |

## KDF design
- Domain separation: `"Cashu_KDF_HMAC_SHA256"` (UTF-8)
- Message: `domain || keyset_id_bytes (hex-decoded) || counter_k (8-byte BE) || type`
  - `type = 0x00` → secret (32-byte HMAC digest, hex)
  - `type = 0x01` → blinding factor `r = OS2IP(HMAC digest) % N`
- Key: 64-byte BIP39 seed (from `mnemonicToSeed`, TASK-205)
- Keyset version-gated: `01` → HMAC-SHA256; `00` → throws (legacy BIP32 not implemented); other → throws.

### Why deterministic
`secret` and `r` are pure functions of `(seed, keyset_id, counter_k)`. No randomness →
the wallet can regenerate identical `BlindedMessages` after device loss and ask the
mint to re-issue the signatures (NUT-09), restoring the full balance. This is the
"seed = complete backup" model (Commander D6 / NUT-13 Option A).

## Test results
- Full backend suites: `npx vitest run src/lib/wallet/__tests__/ src/lib/cashu/__tests__/`
  → **425 passed / 425 (27 files)** — no regressions.
- NUT-13 derivation: **28 passed** (includes official cashubtc/nuts V2 test vectors —
  secrets AND blinding factors, byte-for-byte).
- Restore round-trip: **10 passed** (real secp256k1 blinding/unblinding + mocked mint).
- New tests total: **38 passed**.

## svelte-check
`npx svelte-check --tsconfig ./tsconfig.app.json` → 16 pre-existing errors / 2 warnings.
**None in TASK-206 files** (confirmed: no error references nut13/counterK/restore/mint/client/blind).

## Mint NUT-09 verify — REAL (not mocked)
`GET https://mint.lnw.cash/v1/info` (live):
```
"9":  {"supported": true}   ← NUT-09 restore
"7":  {"supported": true}   ← NUT-07 spent check
"10": {"supported": true}
"11": {"supported": true}
version: Nutshell/0.20.1
```
→ NUT-09 restore + NUT-07 checkstate both supported by the production mint.

## Acceptance criteria
1. ✅ same seed → same proof secrets (official NUT-13 V2 vectors match)
2. ✅ restore round-trip PASS (regenerate → /v1/restore → unblind → Proof verified)
3. ✅ counter_k tracking per keyset (independent, persisted, advances on mint)
4. ✅ mint /v1/info NUT-09 `{"supported":true}` — REAL verify

## Notes / integration follow-up (not blocking)
- The 64-byte BIP39 seed must be held in memory while unlocked for deterministic
  minting. `nut13.setActiveSeed(seedFromMnemonic(mnemonic))` is provided; the app
  layer should call it at unlock (state.ts is out of scope for TASK-206). Until then,
  mint.ts falls back to random secrets (backward compatible, existing behavior).
- Legacy keyset version `00` (BIP32) throws by design (deprecated by NUT-13).

## BLOCKERs
None.
