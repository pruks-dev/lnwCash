# TASK-242 — MINT-PROXY-REMOVE: Verification Summary

**Task:** Remove Vite `/api/mint` proxy special-case (6 src points + vite.config.ts) → direct fetch absolute mint URL, plus transient-5xx retry.

**Verdict:** COMPLETE

## Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/lib/cashu/client.ts` | `fetchFromMint` — removed `/api/mint` special-case; now always `const url = `${normalizeMintUrl(mintUrl)}${path}``. Added transient-5xx (502/503/504) retry: 1 initial + 2 retries with exponential backoff (250ms → 500ms). |
| 2 | `src/lib/cashu/keyset.ts` | Removed `/api/mint/v1/keys` special-case → direct `${mintUrl.replace(/\/+$/,'')}/v1/keys`. |
| 3 | `src/lib/wallet/mint-validation.ts` | Removed `/api/mint/v1/info` special-case → direct `${normalizedUrl}/v1/info`. |
| 4 | `src/screens/Receive.svelte:187` | mint quote → direct `${mintUrl...}/v1/mint/quote/bolt11`. |
| 5 | `src/screens/Receive.svelte:214` | mint quote state → direct `${mintUrl...}/v1/mint/quote/bolt11/{id}`. |
| 6 | `src/screens/Send.svelte:187` | melt quote → direct `${mintUrl...}/v1/melt/quote/bolt11`. |
| 7 | `vite.config.ts` | Removed `server.proxy['/api/mint']` block; kept `https` key/cert. |
| 8 | `src/lib/cashu/__tests__/client.test.ts` | Added retry tests (TASK-242 retries 502 → succeeds; does not retry 404). Updated 502 non-JSON test to `mockResolvedValue`. |

## Acceptance criteria

- ✅ **0 `/api/mint` references** in `src/` + `vite.config.ts` (`grep` exit 1 = no matches).
- ✅ **Direct fetch passes CORS** — mint/keyset/info/melt all return `access-control-allow-origin: *` (see `direct-fetch-test.log`).
- ✅ **Swap not 502** — transient 5xx now retried with backoff (belt-and-suspenders; primary fix is removal of the intermittent dev proxy).

## Verification results

- `grep -rn '/api/mint' src/ vite.config.ts` → **0 matches** (exit 1).
- `npx vitest run` → **96 files / 1125 tests passed**.
- `npx svelte-check --tsconfig ./tsconfig.app.json` → **0 errors, 0 warnings**.
- CORS curl (`Origin: https://localhost:5173`):
  - `GET /v1/info` → `HTTP/2 200` + `access-control-allow-origin: *`
  - `GET /v1/keys` → `HTTP/2 200` + `access-control-allow-origin: *`
  - `POST /v1/melt/quote/bolt11` → `HTTP/2 400` (invalid invoice) + `access-control-allow-origin: *`
  - `POST /v1/mint/quote/bolt11` → `HTTP/2 200` + `access-control-allow-origin: *`

## Forbidden items — compliance check

- ✅ Did NOT change mint URL scheme (absolute `https://mint.lnw.cash` retained; `normalizeMintUrl` untouched).
- ✅ Did NOT break CORS (mint already sends `allow-origin: *`).
- ✅ Did NOT touch `checkState` (client.ts ~445) or `CashuError` code-field parsing (the `if (!response.ok)` block kept verbatim, only wrapped in retry loop).
- ✅ Did NOT touch determinism/counter_k (`melt.ts`/`tokenStore.ts`/`mint.ts`).
- ✅ No `pnpm install` / lockfile untouched.

## Evidence files

- `proxy-removal.diff` — full `git diff` for the 6 changed files.
- `direct-fetch-test.log` — curl CORS verification.
- `grep-no-api-mint.txt` — grep result (empty = PASS).
- `test-output.log` — full `vitest run` output.
- `verification-summary.md` — this file.
