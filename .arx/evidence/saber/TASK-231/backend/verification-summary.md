# TASK-231 Verification Summary — mint 400 "outputs already signed" (11003)

## Verdict
**REPRODUCED** — captured the exact 400 body `{"detail":"outputs already signed","code":11003}` from `https://mint.lnw.cash`.

## Acceptance criteria mapping

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | จับ 400 detail จริงได้ (code 11003) หรือระบุชัดถ้าจับไม่ได้ | ✅ PASS | `repro-run.log` PART A3: `{"detail":"outputs already signed","code":11003}` |
| 2 | counter_k trace ครบทุกขั้นตอน | ✅ PASS | `counter-k-trace.txt`: start 0 → mint 1 → melt 1 → clear 0 → restore 1 → mint-again 2 |
| 3 | root cause report อ้าง file reality (line + response body จริง) | ✅ PASS | `root-cause-report.md` cites mint.ts:315-317, restore.ts:176/183, client.ts:425, blind.ts:135, melt.ts:416 + verbatim bodies |

## Key numbers
- 400 body captured (verbatim): `{"detail":"outputs already signed","code":11003}`
- counter_k trace: `0 → 1 → 1 → 0 → 1 → 2`
- Restore reconstructs counter_k correctly (1), so the described mint→melt→restore→mint flow does **not** reproduce 11003.

## Root cause (one line)
`outputs already signed` (11003) = NUT-13 **counter reuse** (same seed + same `counter_k` → same `B_` under a new quote), caused by `counter_k` loss/desync — **not** the restore formula (which is correct).

## Secondary findings (bonus, out of scope)
1. `checkState` always returns `UNSPENT` — `client.ts:425` uses `hexToBytes(secret)` instead of UTF-8 (breaks NUT-07 + restore spent-filtering).
2. `client.ts:287-299` drops the `code` field (app shows `HTTP 400: outputs already signed`, no `11003`).
3. Melt change secret is random (`melt.ts:416`, F-V26-002) → change unrecoverable on restore.

## Production-code mutation
None — repro only imports/reads production modules; nothing under `src/` was modified.
