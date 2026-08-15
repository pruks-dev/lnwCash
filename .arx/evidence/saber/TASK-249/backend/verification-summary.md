# TASK-249 Verification Summary — NUT-9 restore of melt-change (A2) / swap (A4)

**Sub-agent:** saber-backend | **Task:** TASK-249 (BLUEPRINT-003 v1.4.2, Wave 1, P0, HIGH)
**Verdict:** REPRODUCED (root cause pinned — counter_k lifecycle gap, not NUT-9)

## Acceptance criteria mapping

| # | criterion | result |
|---|---|---|
| 1 | Repro จับ A2 (melt-change) recover ได้/ไม่ได้ | ✅ ได้ — change 32 sat @ counter 1 recovered; counter reconstruct 2/2 |
| 2 | Repro จับ A4 (swap) recover ได้/ไม่ได้ | ✅ ได้ (clean) + ✅ จับ fail (gap: swap proof LOST, counter 2≠3) |
| 3 | NUT-9 /v1/restore response body verbatim | ✅ 3 bodies captured (A2, A4, gap) in `repro-run.log` |
| 4 | counter_k trace ครบทุกขั้นตอน | ✅ mint/melt/swap/restore/delete/import — `counter-k-trace.txt` |
| 5 | trace: mint/melt/tokenStore/restore ใช้ counter key เดียว | ✅ ทุก path ใช้ `00c25786d85a1dcd` (full keyset id) |
| 6 | root cause report อ้าง file reality (line + body) | ✅ `root-cause-report.md` §1-5 |

## Forbidden constraints honored

- ✅ No production code modified (only `.arx/evidence/saber/TASK-249/` written). `git status` shows production changes come from the parallel TASK-250, not this task.
- ✅ Root cause only concluded with real NUT-9 response bodies + counter trace.
- ✅ mint.lnw.cash (FakeWallet) only — no mainnet.
- ✅ No `pnpm install` / lockfile touched.

## Key results (live)

1. **NUT-9 returns melt-change AND swap signatures** — verbatim bodies show both the spent mint proof and the change/swap proof signatures are returned (Nutshell stores every signed output; restore matches by `B_`).
2. **Clean A2/A4 restore works** — with TASK-244's deterministic change/swap in place, restore recovers them and reconstructs counter_k correctly (2/2 in both).
3. **Root cause = counter_k gap**: `counter_k` is keyed by keyset and never cleared by `deleteWallet()` (`storage.ts:226-240`) or `importSeed()` (`seed.ts:99-147`). A stale counter makes a new seed mint at a non-zero counter → counters 0..stale-1 never signed → `restore.ts:102-103` index-misaligns (garbage proofs) and `restore.ts:176` undercounts the counter → change/swap proofs lost.

## What TASK-250 (parallel) does NOT fix
- Only guards `counter_k === 0`, not a stale non-zero counter.
- Does not reset `counter_k` on wallet delete/import.
- Does not touch `restore.ts`.

## Evidence files
- `repro-a2-a4.mjs` (bundled, runnable), `repro-entry.ts` (source)
- `repro-run.log` (full run + 3 verbatim NUT-9 bodies)
- `counter-k-trace.txt`
- `root-cause-report.md`
- `git-hash.txt`
