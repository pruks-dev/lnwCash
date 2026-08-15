# TASK-244 — NUT-13 determinism end-to-end: melt change + swap receive (F-V27-005)

## Verdict: COMPLETE

## What was changed

### 1. `src/lib/wallet/melt.ts` — deterministic melt change
- **Replaced** `generateChangeSecret()` (was `crypto.getRandomValues(new Uint8Array(32))`) with
  `generateChangeSecretAndR(keysetId)` which:
  1. `getActiveSeed()` → if `null` **throws a clear migration error** (points to TASK-245),
     **no random fallback**.
  2. `deriveSecretAndR(seed, keysetId, getCounterK(keysetId))` → deterministic `{secret, r}` (NUT-13).
  3. `blindMessage(secret, r)` — blinds with the derived `r` (not `deterministicBlindingFactor(secret)`).
- **Counter advance**: after `postMelt` returns successfully (mint signed the change output),
  `incrementCounterK(inputs[0].id, 1)` runs **before** local `markSpent`/`addProofs`, so a local
  persistence failure can never cause counter reuse ("outputs already signed").
- Kept `getPrivateKey()` at top of `completeMelt` → `WalletLockedError` fallback unchanged.

### 2. `src/lib/wallet/tokenStore.ts` — deterministic swap receive
- **Added** `getPrivateKey()` guard at top of `receiveTokens` (throws `WalletLockedError` when locked).
- **Added** seed check: `getActiveSeed()` → `null` **throws clear migration error**, no random fallback.
- **Replaced** the `crypto.getRandomValues(new Uint8Array(32))` loop with:
  - `startCounter = getCounterK(fullId)` (full resolved keyset ID)
  - per output `i`: `deriveSecretAndR(seed, fullId, startCounter + i)` → `{secret, r}`
  - `blindMessage(secret, r)`
- **Counter advance**: after `swapProofs` returns (mint signed the receive outputs),
  `incrementCounterK(fullId, decoded.proofs.length)` runs before `addProofs`.

### 3. `src/lib/wallet/__tests__/melt.test.ts`
- Updated test keyset ID from non-NUT-13 literal `keyset-abc123` → valid `01`-versioned
  64-hex keyset ID (required because melt change now derives via `deriveSecretAndR`).

### 4. New tests
- `src/lib/wallet/__tests__/melt-determinism.test.ts` (4 tests)
- `src/lib/wallet/__tests__/tokenStore-determinism.test.ts` (3 tests)

## Test results
- Full suite: **1132/1132 passed** (98 files) — `npx vitest run`
- Wallet suite: 332 tests — 330 passed; 2 `lockout.test.ts` **timeouts** (5000ms) are a
  pre-existing flake under parallel CPU load (PBKDF2-heavy). `lockout.test.ts` passes 10/10 in
  isolation, and the full suite run was GREEN. Not caused by this change.

## Grep random result
- `grep -rn 'getRandomValues' src/lib/wallet/melt.ts src/lib/wallet/tokenStore.ts` → **1 match,
  and it is inside a JSDoc comment** (melt.ts:76 documentation). **Zero matches in production
  code path.** tokenStore.ts: zero matches.

## svelte-check
- `npx svelte-check --tsconfig ./tsconfig.app.json` → **0 errors, 0 warnings**.

## Forbidden constraints honored
- No changes to crypto primitives (encrypt.ts / crypto.subtle / BIP39 seed derivation).
- No changes to `nut13.ts deriveSecretAndR` (Thorne-verified) — only imported it.
- No random-secret fallback anywhere in the touched paths.
- No `pnpm install` / lockfile changes.
- Did not touch `mint.ts`, `client.ts`, `restore.ts`.

## Deviation / note for Minister (honest)
- `src/lib/wallet/transfer.ts:95` (P2P **send** swap-change path, used by `Send.svelte` /
  `F006-Transfer.svelte`) **still** uses `crypto.getRandomValues` for send-change secrets.
  This is OUT OF SCOPE for TASK-244 ("melt change + swap **receive**"), so I did not touch it.
  It is a separate remaining random-secret-in-production path that likely needs its own task
  for full "no random secret in production flow" coverage.
