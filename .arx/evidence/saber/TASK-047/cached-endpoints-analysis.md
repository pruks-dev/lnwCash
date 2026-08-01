# TASK-047 — Cached Endpoints Analysis

## How Paths Are Resolved Per Mint

### Overview
The endpoint resolution mechanism introduced in TASK-047 works as a lookup chain:

```
mintInfo (from GET /v1/info)
    │
    ├─ nuts["19"].cached_endpoints  →  Operation endpoints (mint/bolt11, melt/bolt11, swap)
    │
    ├─ nuts["4"].methods[0].method  →  Mint quote URL segment
    │
    ├─ nuts["5"].methods[0].method  →  Melt quote URL segment
    │
    └─ (none)                       →  STANDARD_PATHS fallback
```

### Resolution by Endpoint Type

#### 1. Discovery Endpoints (never resolved — always standard)
| Endpoint          | Path            | Reason                                    |
|-------------------|-----------------|-------------------------------------------|
| GET /v1/info      | /v1/info        | Discovery endpoint — roots the resolution |
| GET /v1/keysets   | /v1/keysets      | NUT-02 standard                           |
| GET /v1/keys/{id} | /v1/keys/{id}   | NUT-02 standard                           |

#### 2. Operation Endpoints (from NUT-19 cached_endpoints)
Uses `resolveOperationPath()` → matches by:
- HTTP method (POST)
- Path keyword: `["/mint"]` for mint, `["/melt", "/burn"]` for melt, `["/swap"]` for swap
- Excludes paths containing `/quote/`

If no match found → falls back to STANDARD_PATHS.

#### 3. Quote Endpoints (constructed from NUT-04/05 methods)
Uses `resolveQuotePath()` → 3-step resolution:
1. Check if cached_endpoints contains a quote path (rare, defensive)
2. Extract method name from nuts["4"].methods (mint) or nuts["5"].methods (melt)
3. Construct: `/v1/{action}/quote/{method}`
4. Fallback to STANDARD_PATHS if no method declared

### Mint Config Test Results

| Mint Config                    | mint_operation      | mint_quote               | melt_operation       | melt_quote               | swap          |
|-------------------------------|---------------------|--------------------------|----------------------|--------------------------|---------------|
| **undefined (fallback)**      | /v1/mint/bolt11     | /v1/mint/quote/bolt11    | /v1/melt/bolt11      | /v1/melt/quote/bolt11    | /v1/swap      |
| **Standard (no NUT-19)**      | /v1/mint/bolt11     | /v1/mint/quote/bolt11    | /v1/melt/bolt11      | /v1/melt/quote/bolt11    | /v1/swap      |
| **mint.lnw.cash (NUT-19)**    | /v1/mint/bolt11 *   | /v1/mint/quote/bolt11 †  | /v1/melt/bolt11 *    | /v1/melt/quote/bolt11 †  | /v1/swap *    |
| **Custom (non-standard)**     | /api/v2/mint *      | /v1/mint/quote/lightning † | /api/v2/burn *    | /v1/melt/quote/lightning † | /api/v2/swap * |
| **Empty cached_endpoints**    | /v1/mint/bolt11     | /v1/mint/quote/bolt11    | /v1/melt/bolt11      | /v1/melt/quote/bolt11    | /v1/swap      |

\* = resolved from NUT-19 cached_endpoints  
† = constructed from NUT-04/05 method declaration

### mint.lnw.cash Specific Analysis

Actual mint info (captured 2026-08-01):
```json
{
  "nuts": {
    "4": {"methods":[{"method":"bolt11","unit":"sat"}],"disabled":false},
    "5": {"methods":[{"method":"bolt11","unit":"sat"}],"disabled":false},
    "19": {
      "cached_endpoints": [
        {"method":"POST","path":"/v1/mint/bolt11"},
        {"method":"POST","path":"/v1/melt/bolt11"},
        {"method":"POST","path":"/v1/swap"}
      ],
      "ttl": 604800
    }
  }
}
```

This mint happens to follow standard NUT paths, so the resolution yields the same paths as the fallback. The mechanism correctly handles this case via:
- Operation endpoints: found in cached_endpoints → `/v1/mint/bolt11`, `/v1/melt/bolt11`
- Quote endpoints: constructed from NUT-04/05 method `bolt11` → `/v1/mint/quote/bolt11`, `/v1/melt/quote/bolt11`

### Custom Mint Example (non-standard)

For a mint with:
- `/api/v2/mint` in cached_endpoints (mint operation)
- `/api/v2/burn` in cached_endpoints (melt operation)
- NUT-04 method: `lightning` (not bolt11)

Resolution:
- `mint_operation` → `/api/v2/mint` (matched by `/mint` in path)
- `mint_quote` → `/v1/mint/quote/lightning` (constructed from method)
- `melt_operation` → `/api/v2/burn` (matched by `/burn` in path)
- `melt_quote` → `/v1/melt/quote/lightning` (constructed from method)

### Two-Phase Architecture (F-022)

Quote and Operation endpoints are always resolved independently:
- Quote endpoints: constructed from NUT-04/05 payment method
- Operation endpoints: resolved from NUT-19 cached_endpoints

This ensures the client correctly handles mints (like mint.lnw.cash) that separate the bolt11 flow into distinct Quote and Operation phases with potentially different URL patterns.
