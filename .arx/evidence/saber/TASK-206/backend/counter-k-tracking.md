# counter_k tracking (NUT-13) — design & behavior

## Storage
- Key: `lnwcash_counter_k` (localStorage)
- Shape: JSON map `{ [keysetId: string]: number }`
- Module: `src/lib/wallet/counterK.ts` (new file — `storage.ts` is out of scope for TASK-206)

## API
| Function | Behavior |
|---|---|
| `getCounterK(keysetId)` | current counter, defaults `0` for unseen keysets; clamps/floors invalid values |
| `setCounterK(keysetId, value)` | set explicit value (clamped ≥ 0) |
| `incrementCounterK(keysetId, by = 1)` | add `by`, persist, return new value |
| `resetCounterK(keysetId)` | delete entry |
| `getAllCounters()` | full snapshot |
| `clearAllCounters()` | wipe (wallet reset) |

## Semantics (per NUT-13)
- `counter_k := 0` when a keyset is first seen.
- After a successful deterministic mint of `N` outputs → `counter_k += N`.
- Output `i` of that mint uses `counter = counter_k + i` in the KDF message.

## Integration points
1. `mint.ts` `createOutputs()`: reads `getCounterK(keysetId)` as the start counter when a
   seed is present; each output uses `startCounter + i`.
2. `mint.ts` `completeMint()`: after proofs are stored, `incrementCounterK(keysetId, amounts.length)`.
3. `restore.ts` `restoreWallet()`: replays counters in batches, then
   `setCounterK(keysetId, lastNonEmptyCounter)`.

## Why per-keyset
NUT-13 requires a separate counter for each keyset (`k`) because the derivation
message binds `keyset_id`, so counters are independent per keyset. Using a global
counter would produce collisions (same secret) across keysets and break restore.

## Test proof
`src/lib/wallet/__tests__/counterK.test.ts` — 11 cases (defaults, independent
per-keyset, clamp/floor, reset, persistence, malformed-JSON resilience).
`src/lib/wallet/__tests__/mint-nut13.test.ts` — counter advances 0→2→4 across
successive deterministic mints.
