=== TASK-048 MINT STORE — Client-side Storage for Mint Info ===
Source file: src/lib/wallet/store.ts (171 lines)

This file implements localStorage-backed persistence for MintConfig objects.

Storage design:
  - localStorage key: "lnwcash_mint_configs"
  - Structure: { mints: Record<string, MintConfig>, _updated: number }
  - In-memory cache: _store variable (lazy-loaded from localStorage)
  - Write-through: every setMintConfig() calls saveStore() immediately

Key exports:
  getMintConfig(mintUrl)       — Get config for a mint (returns seed for default)
  setMintConfig(config)        — Persist/upsert a config
  removeMintConfig(mintUrl)    — Delete a config
  getAllMintConfigs()           — Get all configs (always includes default seed)
  isMintConfigStale(config)     — Check if TTL expired
  clearMintConfigs()            — Wipe all configs
  getDefaultMintUrl()           — Convenience: return DEFAULT_MINT_CONFIG.url
  getOrCreateMintConfig(url)    — Get existing or create placeholder

Persistence guarantees:
  - On setMintConfig(): data written to localStorage immediately
  - On getMintConfig(): loads from localStorage if in-memory cache is null
  - Page reload: localStorage persists → in-memory cache rebuilt on first access
  - Corrupt data: caught in try/catch → resets to empty store
  - Storage full: console.warn → no crash

Seed behavior:
  - getMintConfig(DEFAULT_MINT_CONFIG.url) returns DEFAULT_MINT_CONFIG when
    no stored config exists (never returns undefined for default mint)
  - getAllMintConfigs() always includes default mint unless explicitly removed

All 15 tests in Section C pass, covering get/set/remove/persist/stale/clear/all.
