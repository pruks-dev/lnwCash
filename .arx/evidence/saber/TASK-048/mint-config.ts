=== TASK-048 MINT CONFIG — Default Mint Configuration Constants ===
Source file: src/lib/wallet/config.ts (100 lines)

This file defines:
- MintConfig interface — shape for mint configuration objects
- DEFAULT_MINT_CONFIG — seed values for https://mint.lnw.cash
- createPlaceholderConfig() — create minimal config from URL
- normalizeSupportedNuts() — normalize NUT keys to zero-padded sorted array

MintConfig shape:
  url: string              — Full mint URL (no trailing slash)
  name: string             — Human-readable display name
  pubkey: string           — Mint public key (33-byte compressed SEC, 66 hex chars)
  version: string          — NUT version string (e.g. "Nutshell/0.20.1")
  supported_nuts: string[]  — Zero-padded NUT numbers ["04","05",...]
  cached_endpoints: CachedEndpoint[]  — NUT-19 cached endpoints
  ttl: number              — NUT-19 TTL in seconds (0 = no NUT-19)
  last_info_fetch: number  — Unix ms timestamp of last /v1/info fetch

DEFAULT_MINT_CONFIG values:
  url:              "https://mint.lnw.cash"
  name:             "LnwCash mint"
  pubkey:           "03d0e4cda0f937bde65b9d160b58febe04bd229243ea45e390ce80252504e1176e"
  version:          "Nutshell/0.20.1"
  supported_nuts:   [04,05,07,08,09,10,11,12,14,17,19,20,29]  (13 NUTs)
  cached_endpoints: [{POST /v1/mint/bolt11}, {POST /v1/melt/bolt11}, {POST /v1/swap}]
  ttl:              604800 (7 days)
  last_info_fetch:  0

Verified against live GET /v1/info from mint.lnw.cash → all fields confirmed correct.
