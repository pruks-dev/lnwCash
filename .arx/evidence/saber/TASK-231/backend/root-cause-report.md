# TASK-231 Root Cause Report — mint 400 "outputs already signed" (code 11003)

**Verdict:** REPRODUCED — captured the exact `{"detail":"outputs already signed","code":11003}` body against `https://mint.lnw.cash` (Nutshell/0.20.1, keyset `00c25786d85a1dcd`).

**Bottom line:** the 400 is triggered by **NUT-13 counter reuse** (same seed + same `counter_k` → same blinded message `B_`, submitted under a *new* quote). The restore-counter hypothesis in the task (`restore.ts` `counter + proofs.length`) is **REFUTED** — restore reconstructs `counter_k` correctly. The real desync sources are counter_k loss/desync, not the restore formula.

---

## 1. Captured 400 body (full, verbatim)

Reproduced by minting at `counter_k = 0` (seed A), then minting at `counter_k = 0` **again under a new quote**:

```json
{"detail":"outputs already signed","code":11003}
```

Full HTTP exchange in `repro-run.log` (PART A):

| step | request | HTTP | body |
|---|---|---|---|
| A1 | quote A + `B_` (first sign) | 200 | `{"signatures":[{...}]}` |
| A2 | quote A + `B_` again (double-submit control) | 200 | idempotent, same signature |
| A3 | quote B (NEW) + same `B_` | **400** | `{"detail":"outputs already signed","code":11003}` |

This isolates the exact trigger:
- **same quote + same output → 200 idempotent** (Nutshell returns the cached signature).
- **same quote + different output → 400 `{"detail":"quote already issued","code":20002}`** (separate error — see §5).
- **new quote + already-signed output → 400 `{"detail":"outputs already signed","code":11003}`** ← the RC-4 error.

---

## 2. What "outputs already signed" actually means

Nutshell's `/v1/mint/bolt11` rejects any request whose `outputs` contain a blinded message (`B_`) it has **already signed under a previous quote**. The wallet derives `B_` deterministically from the seed (NUT-13), so:

```
same seed + same keyset + same counter_k  =>  same secret  =>  same B_
```

Reusing `counter_k` therefore re-submits an already-signed `B_` → 11003.

Derivation chain (all read-only, unmodified):
- `src/lib/wallet/nut13.ts:153-179` `deriveSecretAndRBip32()` — keyset `00` → `m/129372'/0'/{keyset_id}'/{counter_k}'/0`.
- `src/lib/wallet/mint.ts:93` `const startCounter = seed ? getCounterK(keysetId) : 0;`
- `src/lib/wallet/mint.ts:98` `deriveSecretAndR(seed, keysetId, startCounter + i)`.
- `src/lib/cashu/blind.ts:129-148` `blindMessage(secret, r)` → `B_`.

---

## 3. Root cause (confirmed): counter_k desync → reuse

The wallet's `counter_k` is persisted in `localStorage` (`lnwcash_counter_k`, per keyset) by `src/lib/wallet/counterK.ts`. It advances only on a successful mint:

- `src/lib/wallet/mint.ts:315-317`:
  ```ts
  await addProofs(proofs, mintUrl, keysetId);
  if (resolvedSeed) {
      incrementCounterK(keysetId, amounts.length);
  }
  ```

Two desync paths cause counter reuse → 11003:

1. **counter_k lost without restore.** If `localStorage` is cleared (app-data wipe / private browsing / browser cache clear) and the user **does not** run NUT-9 restore, `counter_k` resets to 0 while the mint still holds the old signatures. Next mint reuses counter 0 → 11003.
2. **counter_k not advanced after a signed mint.** If the process is killed (or `addProofs` throws) between `postMint` succeeding at the mint and `incrementCounterK` executing, the mint has signed the output but the wallet did not advance → next mint reuses the same counter → 11003. (Note: `incrementCounterK` is *after* `addProofs`, not in a `finally`, so an IndexedDB failure in `addProofs` skips the increment.)

### The restore-counter hypothesis is REFUTED

`src/lib/wallet/restore.ts:176,183`:
```ts
lastNonEmptyCounter = counter + proofs.length;   // line 176
...
setCounterK(keysetId, lastNonEmptyCounter);      // line 183
```

This counts the number of signatures returned per batch and assumes they are contiguous from `counter`. I verified empirically (PART B + `spent-restore-test`) that **Nutshell's NUT-9 `/v1/restore` returns the signature of a proof even after it was SPENT**. So after `mint 64 @counter0 → melt (spend counter0) → clear → restore`, restore returns 1 signature → `lastNonEmptyCounter = 0 + 1 = 1` → `counter_k = 1` **correctly**. The subsequent mint uses counter 1 and succeeds (PART B step B5, no 400).

The formula would only undercount if the mint had signed **non-contiguous** counters (a gap), which the current mint/melt code cannot produce (mint always advances contiguously by `amounts.length`; melt does not touch `counter_k`).

---

## 4. Secondary bugs found during repro (out of TASK-231 scope but real)

1. **`checkState` computes the wrong `Y` — double-spend detection is broken.**
   `src/lib/cashu/client.ts:425`:
   ```ts
   const Ys = proofs.map(p => hash_to_curve(hexToBytes(p.secret)).toHex(true));
   ```
   The wallet's proof `secret` is a 64-char **hex string**, and `blind.ts` derives `Y = hash_to_curve(UTF8(secret))` (`src/lib/cashu/blind.ts:135`). But `checkState` does `hash_to_curve(hexToBytes(secret))` — it hex-decodes the secret to 32 raw bytes instead of UTF-8-encoding the 64-char string. These are different points, so the mint never finds the proof and always returns `UNSPENT` (verified in PART C: a SPENT proof reports `"state":"UNSPENT"`). This defeats NUT-07 spend-detection and restore's spent-filtering (`restore.ts:167-173`), letting spent proofs be recovered as "unspent".

2. **`client.ts` drops the `code` field on errors.**
   `src/lib/cashu/client.ts:287-299`: on non-OK it parses only `detail` (and `error`), never `code`, then throws `CashuError(message, status)` (no `code`). So the app surfaces `"HTTP 400: outputs already signed"` with **no** `11003`. (Verified: `client.ts mintTokens` on the reused output throws `{status:400, code:undefined}` while the raw body has `code:11003`.)

3. **Melt change secret is RANDOM → unrecoverable on restore (F-V26-002).**
   `src/lib/wallet/melt.ts:416` `const changeSecret = generateChangeSecret();` (random 32 bytes). The change output is signed by the mint but is not derivable from the seed, so NUT-9 restore cannot recover it → change funds are lost on restore. (In PART B, the melt's 32-sat change is not recovered; only the spent 64-sat proof's signature is returned.)

---

## 5. Clarification on the v1.3.1 "mint poll race guard"

Commit `e2a91ff` fixed a double-submit race in `src/screens/Receive.svelte` (`startQuotePolling`, added `mintCompleting` guard). That race re-submits the **same quote**; per the semantics above:
- same quote + same output → 200 idempotent (no error), or
- same quote + different output (if `counter_k` advanced between the two calls) → **`{"detail":"quote already issued","code":20002}`**.

So the race produces **20002 ("quote already issued")**, *not* **11003 ("outputs already signed")**. The 11003 observed in RC-4 is a distinct failure (counter reuse under a *new* quote), consistent with counter_k loss/desync rather than the poll race.

---

## 6. What is confirmed vs unconfirmed

**Confirmed (empirical, against the live mint):**
- 400 `{"detail":"outputs already signed","code":11003}` reproduced (§1).
- Trigger = counter reuse: new quote + already-signed `B_` (§2).
- Restore reconstructs `counter_k` correctly; the described mint→melt→restore→mint flow does **not** reproduce 11003 (§3).
- `checkState` always returns `UNSPENT` (encoding bug) (§4.1).
- `client.ts` drops `code` (§4.2).

**Not confirmed (requires additional evidence):**
- The *specific* production trigger (which of the two desync paths — counter_k loss vs. skipped `incrementCounterK`) caused the original RC-4 incident. Both are plausible and both produce 11003, but I did not instrument the live app to capture which one fired.
- Whether the restore formula `counter + proofs.length` can undercount in any real (non-gap) scenario — I could not construct one; it appears correct for all normal operation.

---

## Evidence files
- `repro-entry.ts` — source of the repro (imports production modules read-only).
- `repro-mint-400.mjs` — bundled, directly runnable (`node repro-mint-400.mjs`).
- `repro-run.log` — full run output incl. verbatim 400 body.
- `counter-k-trace.txt` — counter_k values at each step.
- `verification-summary.md` — acceptance-criteria mapping.
