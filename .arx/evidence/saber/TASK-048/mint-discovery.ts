=== TASK-048 MINT DISCOVERY — Endpoint Discovery Flow Implementation ===
Source file: src/lib/wallet/discovery.ts (226 lines)

This file implements the full NUT-06 + NUT-19 endpoint discovery flow.

Key exports:
  - DiscoveryError class        — typed error with mintUrl + cause
  - mintInfoToConfig()          — convert raw MintInfo → MintConfig
  - discoverMintEndpoints()     — main discovery flow (async)
  - isMintReachable()           — lightweight availability check

Discovery Flow (discoverMintEndpoints):
  1. Check store for cached config → if TTL valid, return cached (wasRefreshed=false)
  2. GET /v1/info from mint via getMintInfo() (TASK-047 client)
  3. Validate response (null/object check)
  4. Parse MintInfo → MintConfig via mintInfoToConfig()
  5. Extract NUT-19: cached_endpoints + ttl
  6. Resolve all 5 endpoint paths via resolveEndpointPath() (TASK-047)
  7. Persist config via setMintConfig()
  8. Return DiscoveryResult {success, config, resolvedPaths, wasRefreshed, error?}

NUT-19 Parsing (parseNut19):
  - Reads nuts['19'] from MintInfo
  - Extracts cached_endpoints + ttl
  - Returns empty/tll=0 when NUT-19 is missing → graceful fallback

Path Resolution (resolveAllPaths):
  - Reconstructs minimal MintInfo from MintConfig
  - Injects NUT-19 cached_endpoints when available
  - Injects NUT-04/05 methods from supported_nuts
  - Calls resolveEndpointPath() for all 5 operations:
    mint_operation, mint_quote, melt_operation, melt_quote, swap

Error handling:
  - fetch failure → fallback to cached config or placeholder
  - null/invalid response → fallback with error message
  - NUT-19 missing → standard NUT paths used (no error)
  - resolvedPaths always populated (never undefined)

All 18 tests in Section B pass, including success, cache/TTL, error, and reachability.
