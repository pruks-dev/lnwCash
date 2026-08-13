# TASK-219 — changePin() Orchestration — Verification Summary

## Scope
Add `changePin(currentPin, newPin)` orchestration to `src/lib/wallet/state.ts`.
Re-encrypts the private key (and BIP39 mnemonic, when present) under a new PIN
without touching the underlying key material, active NUT-13 seed, or crypto
primitives.

## Exact change (single file: `src/lib/wallet/state.ts`)
- Added `export async function changePin(currentPin: string, newPin: string): Promise<void>`
  between `unlockWallet()` and `lockWallet()`.
- No changes to `src/lib/crypto/encrypt.ts` or any UI file.
- Existing TASK-215 wiring (mnemonic decrypt + `setActiveSeed`, `clearActiveSeed`)
  was left intact.

## Implementation order (matches must_do)
1. `newPin.length < 4` → `throw new Error('PIN must be at least 4 characters')`
2. `getPinHash()` missing → `WalletNotInitializedError`
3. `verifyPin(currentPin, pinHash)` false → `InvalidPinError`
4. `getEncryptedKey()` missing → `WalletNotInitializedError`
5. `decryptKey(encryptedKey, currentPin)` → `privateKey`
6. `hashPin(newPin)` → `newPinHash`
7. `encryptKey(privateKey, newPin)` → `newEncryptedKey`
8. If `encryptedMnemonic` present: `decryptKey(mnemonic, currentPin)` → re-`encryptKey(mnemonic, newPin)` → `setEncryptedMnemonic`
9. `setPinHash(newPinHash)`; `setEncryptedKey(newEncryptedKey)`
- Mnemonic is NOT re-derived; decrypted phrase is re-encrypted verbatim.
- Active seed and in-memory `unlockedPrivateKey` are untouched (same private key).

## Test results
| Command | Result |
|---|---|
| `vitest run state-change-pin.test.ts` | 6/6 passed |
| `vitest run state.test.ts state-change-pin.test.ts` | 24/24 passed |
| `vitest run state-seed-wiring.test.ts` (TASK-215 regression) | 10/10 passed |
| `vitest run seed.test.ts` (mnemonic export/import) | 13/13 passed |
| `svelte-check --tsconfig ./tsconfig.app.json` | 0 errors in state.ts (16 pre-existing errors in unrelated files) |

## svelte-check
16 errors / 2 warnings total — ALL pre-existing and in files untouched by this
task (theme.ts, QRDisplay.svelte, Receive.svelte, Send.svelte,
TransactionDetailSheet.svelte, client.test.ts, pending-tx-resolver.test.ts).
**0 errors reference `src/lib/wallet/state.ts`.**

## Acceptance criteria
- [x] changePin(newPin) → unlockWallet(newPin) succeeds; same private key
- [x] wrong current PIN → `InvalidPinError`
- [x] old PIN fails after change; new PIN unlocks
- [x] newPin < 4 chars → throws
- [x] mnemonic preserved verbatim (exportSeed before == after, 12-word)
- [x] crypto primitives untouched (`encrypt.ts` unchanged)
- [x] no UI files touched
- [x] TASK-215 seed wiring not regressed

## Notes
- `git diff src/lib/wallet/state.ts` includes TASK-215's still-uncommitted
  changes (mnemonic wiring, PIN 4+ digits, nut13 import) in addition to this
  task's `changePin` addition, because the repo has not committed TASK-215 yet.
  The `changePin` function is the only TASK-219 delta (lines 83–134 of the diff).
