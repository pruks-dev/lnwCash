# TASK-209 — Frontend Verification Summary (saber-frontend)

## Scope
D5: PIN 4 หลัก (แทน 6) + sharded entry (random keypad) + OWASP lockout rate-limit
+ encrypted attempt counter + mismatch reset/shake + pin_entry_mode fallback

## Acceptance Criteria — Status

| # | Criteria | Status |
|---|----------|--------|
| 1 | PIN 4-digit (NOT 6-digit) | ✅ PASS |
| 2 | lockout: 5 fail = 5 min, 10 fail = 1 hr | ✅ PASS (unit-tested) |
| 3 | attempt counter AES-GCM encrypted (NOT plaintext) | ✅ PASS (unit-tested) |
| 4 | no WebAuthn/biometric code | ✅ PASS (grep clean) |
| 5 | svelte-check 0 errors (files I touched) | ✅ PASS |

## Files Changed
- NEW `src/lib/components/Keypad.svelte` — 4-digit PIN keypad, Fisher–Yates shuffle via
  `crypto.getRandomValues` (CSPRNG), digits + backspace only.
- NEW `src/lib/components/PinDots.svelte` — 4 dots, shake animation, aria progressbar.
- NEW `src/lib/wallet/lockout.ts` — AES-GCM encrypted attempt counter + rate-limit.
- EDIT `src/lib/wallet/state.ts` — `pin.length < 6` → `< 4` (line 63).
- EDIT `src/lib/wallet/seed.ts` — `newPin.length < 6` → `< 4` (line 104).
- EDIT `src/screens/Setup.svelte` — 6→4 at 5 spots (187, 205, 319, 411, 481),
  integrated Keypad + PinDots + lockout + `pin_entry_mode` fallback flag.

## Lockout Proof (from lockout.test.ts)
- `nextLockoutAfterFailure(prev, NOW)` after 5 failures → `lockUntil === NOW + 5*60*1000`
- after 10 failures → `lockUntil === NOW + 60*60*1000`
- counter persisted as `EncryptedKey` `{salt, iv, iterations, data}`; raw localStorage
  blob contains NO `"count"` / `"lockUntil"` / plaintext count; `data` matches base64url.

## Encrypted Counter — Honest Limitation
Client-side-only app: no server/keystore to hold the passphrase. A per-install random
device secret (crypto.getRandomValues, 32 bytes) is the PBKDF2 passphrase; the counter
payload is AES-GCM ciphertext at rest. This satisfies "encrypted, not plaintext" and gives
per-device key diversity, but is not a defense against an attacker who can already
read/write localStorage (same trust boundary as the encrypted private key).

## Test Results
- Targeted: 6 files / 61 tests — ALL PASS (lockout + keypad + pindots + state + seed + Setup)
- Full suite: 1019 passed / 4 failed — the 4 failures are pre-existing in
  `ErrorBoundary.test.ts` + `Home.test.ts` (unrelated to PIN/lockout; same files already
  failing in the parallel TASK-205 run).

## svelte-check
0 errors in files I touched. 16 pre-existing errors remain in 8 out-of-scope files
(client.test.ts, QRDisplay.svelte, TransactionDetailSheet.svelte, theme.ts,
pending-tx-resolver.test.ts, History.svelte, Receive.svelte, Send.svelte).

## Out of Scope (not modified, per constraints)
- i18n locales (still say "6-digit") — deferred to another task
- Numpad.svelte (used for amount input in Receive/Send) — left intact
- F001-Register.svelte / F002-CreateWallet.svelte (legacy screens, still 6-digit)
