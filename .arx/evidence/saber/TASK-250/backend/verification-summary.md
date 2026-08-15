# TASK-250 — Verification Summary (Saber / Backend)

Blueprint: BLUEPRINT-003 v1.4.2 — Wave 1 — P0 — HIGH
Scope: RC-2 (mint require seed) + RC-3 (counter-0 guard + atomicity)

## Verdict
COMPLETE — all acceptance criteria met, all evidence written.

## What changed

### RC-2 — mint require seed (no random fallback)
- `src/lib/wallet/mint.ts`
  - Removed `generateRandomSecret()` (crypto.getRandomValues fallback) and the
    dead `generateSecret()` helper.
  - `createOutputs()` now takes a **required** `seed: Uint8Array` and always
    derives via `deriveSecretAndR(seed, keysetId, startCounter + i)` — the
    `else { secret = generateRandomSecret(); r = deterministicBlindingFactor(secret); }`
    branch is gone.
  - `completeMint()`: `resolvedSeed = seed ?? getActiveSeed()` — if null → throw
    clear migration error (`migrate the wallet (TASK-245)`), mirroring
    melt.ts / tokenStore.ts. Never falls back to random.
  - Removed now-unused imports `deterministicBlindingFactor`, `deriveSecret`.

### RC-3 — counter-0 guard + atomicity
- `src/lib/wallet/counterK.ts` (+46 lines)
  - Added `withKeysetLock(keysetId, fn)` — a per-keyset promise-chain async mutex
    (FIFO, rejection-safe) that serializes the whole read→derive→submit→advance
    critical section.
- `src/lib/wallet/mint.ts`
  - Wrapped the counter-0 guard + `createOutputs` + `postMint` + `addProofs`/`incrementCounterK(finally)`
    inside `withKeysetLock(keysetId, …)`. Counter read and advance are now in one
    atomic window.
- `src/lib/wallet/melt.ts`
  - Added counter-0 guard (mirror of mint): `getCounterK(changeKeysetId) === 0`
    with existing proofs for that keyset → throw NUT-9 restore error.
  - Wrapped change derivation + `postMelt` + `incrementCounterK` in `withKeysetLock`.
  - No-change path (changeAmount ≤ 0) bypasses the lock (no counter involved).
- `src/lib/wallet/tokenStore.ts`
  - Added counter-0 guard in `receiveTokens` (mirror of mint).
  - Wrapped derive loop + `swapProofs` + `incrementCounterK` + `addProofs` in
    `withKeysetLock(fullId, …)`.

### Test updates (counter guard now requires counter>0 for melt with existing proofs)
- `melt.test.ts`: `setCounterK(KEYSET_ID, 3)` in beforeEach (proofs already minted).
- `melt-determinism.test.ts`: change counter moved 0 → 1 (the 64-sat proof consumed counter 0).

### New tests
- `mint-require-seed.test.ts` (2): no active seed → migration error + mintTokens not called;
  explicit seed still works.
- `melt-counter-guard.test.ts` (1): counter-0 + proofs → NUT-9 restore, meltTokens not called.
- `swap-counter-guard.test.ts` (1): counter-0 + proofs → NUT-9 restore, swapProofs not called.
- `mint-serialization.test.ts` (2): withKeysetLock serialization; concurrent mints → 4 distinct secrets.

## Test results

| Suite | Result |
|-------|--------|
| Full suite (`npx vitest run`) | 1147/1148 passed (103 files) |
| Wallet suite (`__tests__/`) | 348/348 passed (31 files) |
| TASK-250 new tests | 6/6 passed |
| svelte-check | 0 errors, 0 warnings |
| grep random (production path) | 0 (1 doc-comment only) |

Note: the single full-suite failure is `lockout.test.ts › recordSuccess resets
the counter` — a 5000ms **timeout under parallel load**, a known pre-existing
flake (also noted in TASK-244-RESULT). It passes 10/10 in isolation and is
unrelated to this task (no files touched).

## grep evidence
- `generateRandomSecret`: 0 in production path (mint.ts/melt.ts/tokenStore.ts and whole `src/lib` non-test).
- `crypto.getRandomValues`: 0 actual calls; 1 mention is a JSDoc comment in melt.ts:76 (pre-existing, TASK-244).
- `deterministicBlindingFactor` / `deriveSecret` in mint.ts: 0.

## Files
- production: `counterK.ts`, `mint.ts`, `melt.ts`, `tokenStore.ts`
- tests (updated): `melt.test.ts`, `melt-determinism.test.ts`
- tests (new): `mint-require-seed.test.ts`, `melt-counter-guard.test.ts`, `swap-counter-guard.test.ts`, `mint-serialization.test.ts`

## Deviations
- `counterK.ts` modified (adds `withKeysetLock`) — it is the shared counter module
  imported by all three target files; the per-keyset lock is a counter-atomicity
  concern and could not live in any single target file without a circular import.
  No crypto/NUT-13 derivation touched.
