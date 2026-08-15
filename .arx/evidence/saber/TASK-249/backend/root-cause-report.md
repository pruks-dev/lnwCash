# TASK-249 Root Cause Report — NUT-9 restore of melt-change (A2) / swap (A4) outputs

**Verdict:** REPRODUCED — the A2/A4 fund-loss root cause is **NOT** NUT-9 refusing
to return signatures; it is a **counter_k lifecycle bug** (stale counter across
`deleteWallet()`/`importSeed()`) that creates a **gap** in signed counters, which
breaks `restore.ts` index-alignment + counter-reconstruction.

**Code state at repro time (git):** HEAD `4112c8b` (v1.4.1). The working tree
additionally carries TASK-250's in-flight changes (mint.ts / melt.ts / tokenStore.ts /
counterK.ts — `withKeysetLock` + require-seed + counter-0 guards). The root cause
below lives in `restore.ts`, `counterK.ts`, `storage.ts`, `seed.ts` — none of which
are modified by TASK-250, so the finding holds for **both** v1.4.1 and the TASK-250
working tree (details §6).

---

## 1. Decisive answer 1 — Does NUT-9 /v1/restore return melt-change / swap signatures? YES.

Captured verbatim against `https://mint.lnw.cash` (Nutshell/0.20.1), keyset `00c25786d85a1dcd`.

### A2 — melt change signature IS returned
`POST /v1/restore` request `outputs = [mint B_ (c0), change B_ (c1), unsigned B_]`:

```json
{"outputs":[
  {"amount":0,"id":"00c25786d85a1dcd","B_":"03da5cc5d1b1ee3d...","C_":null},
  {"amount":0,"id":"00c25786d85a1dcd","B_":"0243ccec620c97f5...","C_":null}
 ],
 "signatures":[
  {"id":"00c25786d85a1dcd","amount":64,"C_":"03380d12ca5d18af...","dleq":{...}},
  {"id":"00c25786d85a1dcd","amount":32,"C_":"021a449e4ac4b07a...","dleq":{...}}
 ]}
```

- The **64-sat mint proof** (counter 0) and the **32-sat melt-change** (counter 1)
  are **both** returned.
- The third (unsigned) `B_` is **omitted** — Nutshell returns a *filtered* list.

### A4 — swap (receive) signature IS returned
Request `outputs = [mint B_ (c0), swap B_ (c1), unsigned B_]`:

```json
{"outputs":[
  {"amount":0,"id":"00c25786d85a1dcd","B_":"0316aec73143a56a...","C_":null},
  {"amount":0,"id":"00c25786d85a1dcd","B_":"02ec5d73e26a02a3...","C_":null}
 ],
 "signatures":[
  {"id":"00c25786d85a1dcd","amount":16,"C_":"02e7c0b99c4b4b88...","dleq":{...}},
  {"id":"00c25786d85a1dcd","amount":16,"C_":"020a2f57cc94fe2d...","dleq":{...}}
 ]}
```

Both the spent 16-sat mint proof (counter 0) and the 16-sat swap-receive proof
(counter 1) are returned. **NUT-9 restores melt-change and swap signatures.** The
mint stores every signed output (mint/melt-change/swap) in the same `promises`
table and matches restore by `B_` only (verified in Nutshell `ledger.py:restore`
and `crud.get_blind_signature`).

> Note on response shape: Nutshell 0.20.1 returns `outputs` + `signatures` as a
> **filtered, mutually-aligned** pair (only previously-signed `B_`), NOT a 1:1 echo
> of the request. This is the property the wallet's `restoreBatch` gets wrong (§3).

---

## 2. Decisive answer 2 — Does counter_k reconstruct correctly after advance? ONLY when contiguous.

| flow | counters signed | restore counter_k | correct? |
|---|---|---|---|
| A2 mint(64)@0 → melt-change(32)@1 | 0,1 (contiguous) | 2 | ✅ |
| A4 mint(16)@0 → swap-receive(16)@1 | 0,1 (contiguous) | 2 | ✅ |
| P3 seed D mint@1 → swap@2 (counter 0 **never signed**) | **1,2 (gap)** | **2** | ❌ expected 3 |

With contiguous counters, `restoreWallet` reconstructs `counter_k` correctly and
the change/swap proofs are recovered. With a **gap**, it undercounts and corrupts
recovery (§4).

---

## 3. The restoreBatch alignment bug (restore.ts:102-103)

```ts
// restore.ts restoreBatch()
const response = await restoreOutputs(mintUrl, requestOutputs);  // requestOutputs = prepared[0..batchSize-1]
const proofs: TokenProof[] = response.signatures.map((sig, i) => {
    const output = prepared[i];            // ← assumes signatures[i] ↔ prepared[i]
    ...
});
```

Nutshell returns `signatures` aligned to `response.outputs` (the **signed subset**),
not to the request. When signed counters are contiguous from `counter`, the subset
happens to align with `prepared[0..n-1]` and the code works. When there is a gap,
`signatures[i]` corresponds to a *later* `prepared` entry, so:

- the signature is unblinded with the **wrong blinding factor**, and
- the proof is assigned the **wrong secret**.

The result (reproduced in PART 3) is a *garbage* proof whose `secret` belongs to a
counter that was **never signed**, and the real swap-receive proof is lost.

## 4. The counter-reconstruction bug (restore.ts:176,183)

```ts
lastNonEmptyCounter = counter + proofs.length;   // line 176
...
setCounterK(keysetId, lastNonEmptyCounter);      // line 183
```

`proofs.length` = number of signatures returned in the batch. For contiguous
counters starting at `counter`, that equals the next free counter. For a gap
(counters `1,2` signed, `0` missing), `counter=0` and `proofs.length=2` → `2`,
but the next free counter is `3`. The counter is **undercounted**, so the next
mint/swap re-derives an unsigned counter (harmless on its own) and — worse — a
future restore keeps losing the trailing proofs.

## 5. Root cause (confirmed): counter_k is keyed by keyset and never reset on wallet delete/import

Trace (PART 3, live): seed C mints → counter_k=1 → `deleteWallet()` → counter_k **still 1** →
`importSeed(D)` → counter_k **still 1** → seed D mints at counter 1 (counter 0 never
signed → gap) → swap at counter 2 → restore → swap proof **lost**, counter undercounted.

- `counterK.ts:15` — `STORAGE_KEY = 'lnwcash_counter_k'`, a map `{ [keysetId]: number }`.
  It is per-**keyset**, not per-(seed,keyset). A new seed sharing the same mint/keyset
  inherits the old counter.
- `storage.ts:226-240` — `clearAllWalletData()` (called by `deleteWallet()`) clears the
  encrypted key, mnemonic, PIN hash, wallet state, metadata, and the proofs DB — but
  **not** `lnwcash_counter_k`.
- `seed.ts:99-147` — `importSeed()` writes the new key/mnemonic/metadata but **never**
  clears `counter_k`.
- `Setup.svelte:383` — `importSeed(seed, pin, ...)` is the production entry point for
  both create and recover; `activateSeedAndRestore()` runs NUT-9 restore only in
  "recover" mode (`Setup.svelte:594-596`), so a fresh "create" never resets the counter.

**Trigger:** user deletes a wallet and creates/imports a new one on the same device
(stale counter), then later recovers from seed → NUT-9 restore hits the gap → funds lost.

## 6. Relationship to the parallel TASK-250

TASK-250 (in flight) wraps mint/melt/swap counter sections in `withKeysetLock`
(counterK.ts) and adds counter-**0**-reuse guards (mint.ts / melt.ts / tokenStore.ts).
Those changes do **not** fix this bug:

- They guard only `counter_k === 0`, not a **stale non-zero** counter.
- They do **not** reset `counter_k` on `deleteWallet()`/`importSeed()`.
- They do **not** touch `restore.ts` (alignment + `lastNonEmptyCounter` formula).

## 7. Confirmed vs unconfirmed

**Confirmed (live, verbatim):**
- NUT-9 returns melt-change signatures (A2 body) and swap signatures (A4 body).
- Clean A2/A4 restore recovers the change/swap proofs and reconstructs counter_k correctly.
- `deleteWallet()`/`importSeed()` leave `counter_k` stale (PART 3 trace).
- A gap in signed counters → restoreBatch misalignment (garbage proofs) + counter
  undercount (PART 3: counter 2 vs expected 3, swap proof lost).

**Not confirmed (needs more evidence):**
- The *specific* production incident that produced the A2/A4 reports. The gap
  scenario is the only reproducible path I found that loses change/swap proofs; I
  did not instrument the live app to capture which exact user action caused the
  field reports.

## Evidence files
- `repro-a2-a4.mjs` — bundled, runnable (`node repro-a2-a4.mjs`), imports production modules read-only.
- `repro-entry.ts` — the readable source of the repro.
- `repro-run.log` — full run, incl. verbatim NUT-9 response bodies (A2, A4, gap).
- `counter-k-trace.txt` — counter_k at every step (mint/melt/swap/restore/delete/import).
- `verification-summary.md` — acceptance-criteria mapping.
- `git-hash.txt` — git commit the repro was built against.
