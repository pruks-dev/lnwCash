# CHANGELOG

All notable changes to LNWCASH Wallet are documented here.

Versioning follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

---

## [Unreleased]

### Template for future releases

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Security
- Security-related changes

### Deprecated
- Soon-to-be-removed features

### Removed
- Removed features
```

---

## [0.1.0] — 2026-07-29

### Initial MVP Release

First public release of LNWCASH Wallet — a client-side Lightning Network wallet powered by the Cashu ecash protocol.

### Included Features

- **PIN-based wallet creation and unlock**
  - 4-digit PIN setup
  - PBKDF2 (600k iterations) → AES-GCM private key encryption
  - Plaintext private key never stored — exists only in memory when unlocked
  - Wallet lifecycle: UNINITIALIZED → LOCKED → UNLOCKED

- **Multi-mint support**
  - Add, remove, and manage multiple Cashu mint URLs
  - Default mint ships as `DEFAULT_MINT_CONFIG` (`https://mint.lnw.cash`) — user can add their own mints
  - Balance aggregated across all mints, with per-mint breakdown
  - Proofs tracked per-mint in IndexedDB

- **Receive (Lightning → ecash Mint)**
  - Enter Lightning invoice or scan QR code
  - Mint flow: quote request → invoice payment → blinded outputs → blind signatures → unblind → store proofs
  - Denomination decomposition (powers of 2) for optimal proof sizes

- **Pay (ecash Melt → Lightning)**
  - Enter Lightning invoice or scan QR to pay
  - Melt flow: quote request → proof selection (greedy fewest-proofs) → burn proofs → receive change as ecash
  - Fee reserve displayed before confirmation

- **P2P ecash Transfer**
  - Send: select proofs → encode as V4 Cashu token (cashuA prefix) → share as text or QR
  - Receive: decode V4 token → validate proof structure → import into wallet
  - Token creation works offline (local crypto only)

- **QR Scanner**
  - Camera-based barcode scanner (via capacitor-barcode-scanner)
  - Manual input fallback when camera is unavailable or permission denied
  - Decodes bech32 Lightning invoices and Cashu tokens

- **Transaction History**
  - All transactions stored in IndexedDB (`lnw-cash` database)
  - Filter by type: All / Mint / Melt / Transfer
  - Status tracking: Pending / Confirmed / Failed
  - Viewable offline

- **Internationalization (i18n)**
  - Thai (th) — 428 strings
  - English (en) — 428 strings
  - Language switch screen, preference persisted in localStorage

- **Progressive Web App (PWA)**
  - Service worker with asset caching (CacheFirst for static, StaleWhileRevalidate for mint API)
  - Install prompt ("Add to Home Screen")
  - Offline splash screen and error boundary
  - Workbox-powered caching strategies

- **Offline Support**
  - View balance (reads from local IndexedDB proofs)
  - View transaction history
  - Create ecash tokens for P2P transfer (no network needed)
  - Semi-verify received token structure (prefix check, proof field validation, amount sanity)
  - Online/offline detection with banner indicator

- **Android APK**
  - Built with Capacitor 8
  - Sideload distribution (not on Google Play Store)
  - Secure storage plugin for Android keystore

- **Seed Phrase Backup**
  - 12-word BIP-39 seed phrase for new wallets (24-word legacy wallets still supported)
  - Export requires PIN re-verification
  - Import restores full wallet from seed with new PIN
  - Risk warnings displayed during export flow

### Technical Foundation

- **Framework**: Svelte 5 + TypeScript 6 + Vite 8
- **Crypto**: @noble/curves (secp256k1), @noble/hashes (SHA-256), Web Crypto API (PBKDF2, AES-GCM, HMAC)
- **Storage**: IndexedDB via idb (proofs + transactions), localStorage (settings, encrypted key, PIN hash)
- **Routing**: Hash-based client-side router (#/, #/receive, #/send, #/history, #/settings, #/setup)
- **Testing**: Vitest with JSDOM environment, 173 test files
- **Mobile**: Capacitor 8 with Android platform, barcode scanner, and secure storage plugins

### Known Limitations (MVP)

- Bearer instrument risk: clearing browser data without seed backup = permanent loss of funds
- No Lightning node integration — relies entirely on mint liquidity
- No automatic proof splitting/merging for exact payments (uses greedy selection with change)
- Single-currency (sats only) — no stablecoin or other unit support
- Browser-only — no iOS native build yet
- No contact list or address book
- No transaction export (CSV/PDF)

---

## Version History Conventions

- `[Unreleased]` — changes staged for the next release
- Date format: `YYYY-MM-DD`
- Pre-release tags (alpha, beta, rc) use SemVer: `0.2.0-alpha.1`
- Breaking changes in the Cashu protocol (NUT versions) trigger a MINOR version bump
