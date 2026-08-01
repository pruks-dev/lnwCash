# LnwCash Wallet — Developer Documentation

## Overview

LnwCash is a client-side Lightning Network wallet using the [Cashu protocol](https://cashu.space) (ecash). No backend, no server — all wallet operations happen in the browser or Android WebView. Built with Svelte 5 + TypeScript + Vite + Capacitor.

**Architecture highlight**: PIN-encrypted private key → localStorage. Plaintext key exists only in memory when the wallet is unlocked. Multi-mint by design.

---

## Project Structure

```
src/
├── main.ts                          # App entry point
├── App.svelte                       # Root component (routing + lifecycle)
├── components/
│   ├── ErrorBoundary.svelte         # Catches unhandled errors
│   ├── OfflineIndicator.svelte      # Online/offline banner
│   ├── PwaInstallPrompt.svelte      # "Install app" prompt
│   └── SplashScreen.svelte          # Initial loading screen
├── screens/
│   ├── F001-Register.svelte         # PIN setup / unlock
│   ├── F002-CreateWallet.svelte     # Wallet name, mint URLs, keyset
│   ├── F003-Balance.svelte          # Balance display + refresh
│   ├── F004-Receive.svelte          # LN invoice → ecash mint
│   ├── F005-Pay.svelte              # LN invoice payment (melt)
│   ├── F006-Transfer.svelte         # P2P ecash send/receive + QR
│   ├── F007-QRScan.svelte           # Camera QR scanner
│   ├── F008-History.svelte          # Transaction history
│   ├── F009-LanguageSwitch.svelte   # Thai/English toggle
│   └── Navigation.svelte            # Bottom nav bar
├── locales/
│   ├── th.json                      # 121 Thai i18n strings
│   └── en.json                      # 121 English i18n strings
└── lib/
    ├── router.ts                    # Hash-based router (#/balance, #/receive, …)
    ├── i18n.ts                      # svelte-i18n setup + locale loader
    ├── types.ts                     # All TypeScript types
    ├── platform.ts                  # Platform detection (Android/iOS/Web)
    ├── offline-indicator.ts         # navigator.onLine event wrapper
    ├── pwa-install.ts               # beforeinstallprompt handler
    ├── cashu/
    │   ├── client.ts                # Cashu HTTP client (fetch, multi-mint)
    │   ├── blind.ts                 # Blind signature util (Schnorr-like)
    │   ├── keyset.ts                # Keyset fetch, cache, management
    │   └── token.ts                 # V4 token encode/decode (cashuA prefix)
    ├── crypto/
    │   └── encrypt.ts               # PBKDF2 → AES-GCM PIN-based encryption
    ├── storage/
    │   ├── db.ts                    # IndexedDB: transactions store (idb)
    │   ├── local.ts                 # localStorage: settings, mint config
    │   └── secure-native.ts         # Capacitor secure storage (Android)
    ├── util/
    │   └── base64.ts                # NaN-safe base64url encode/decode
    └── wallet/
        ├── index.ts                 # Barrel export
        ├── state.ts                 # Wallet state machine (UNINITIALIZED→LOCKED→UNLOCKED)
        ├── keys.ts                  # secp256k1 key generation (@noble/curves)
        ├── seed.ts                  # BIP-39 24-word seed export/import
        ├── balance.ts               # Multi-mint balance aggregation
        ├── mint.ts                  # Mint flow (quote→blind signatures→store)
        ├── melt.ts                  # Melt flow (proof selection→burn→change)
        ├── transfer.ts              # P2P ecash token encode/decode
        ├── offline.ts               # Offline balance, history, P2P, semi-verify
        ├── proofs.ts                # Proof selection algorithms (greedy)
        ├── proofsDb.ts              # IndexedDB proof storage (separate DB)
        ├── storage.ts               # localStorage PIN/encrypted-key service
        ├── errors.ts                # Error types
        └── wordlist.ts              # BIP-39 English wordlist (2048 words)
```

---

## Prerequisites

- **Node.js 18+**
- **npm** (bundled with Node.js)
- **Android Studio** (for APK builds only)

---

## Quick Start

```bash
git clone <repo-url>
cd lnw-cash
npm install
npm run dev         # Starts on http://localhost:5173
```

Open the URL in a browser. The dev server supports HMR (hot module replacement).

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run check` | svelte-check TypeScript validation |
| `npm run lint` | ESLint across the project |
| `npm run format` | Prettier code formatting |
| `npm run test` | Run all vitest tests (single run) |
| `npm run test:watch` | vitest in watch mode |
| `npm run apk:build` | Build Android APK via `scripts/build-apk.sh` |
| `npm run cap:sync` | Sync Capacitor web assets to Android |
| `npm run cap:open:android` | Open Android project in Android Studio |

### Capacitor-specific (Android)
```bash
npm run cap:add:android    # Add Android platform (first time)
npm run cap:sync           # Sync after web build
npm run cap:apk:debug      # Assemble debug APK
npm run cap:apk:release    # Assemble release APK
```

---

## Development Mint

Use `https://mint-dev.inw.cash` for development and testing. This runs a Nutshell instance (Cashu mint implementation).

### Testing the Mint Flow
1. Start the app in dev mode (`npm run dev`)
2. Create a wallet and add the dev mint URL
3. Use `#/receive` to mint ecash (the mint pays your Lightning invoice)
4. Use `#/pay` to melt ecash (burn proofs to pay a Lightning invoice)

### Checking Mint Info Directly
```bash
curl https://mint-dev.inw.cash/v1/info | jq
```

---

## Architecture

### Layered Design

```
┌──────────────────────────────────┐
│          UI (Svelte 5)           │  ← screens/, components/
├──────────────────────────────────┤
│        Domain (wallet/)          │  ← state, mint, melt, transfer, offline
├──────────────────────────────────┤
│          Core (cashu/)           │  ← client, blind, token, keyset
├──────────────────────────────────┤
│      Foundation (crypto/storage) │  ← encrypt, db, local, secure-native
└──────────────────────────────────┘
```

### Key Design Decisions

#### 1. PIN-Based Encryption
- Private key is **never** stored in plain text.
- On wallet creation: PIN → PBKDF2 (600,000 iterations) → AES-GCM key → encrypt private key → store ciphertext in localStorage.
- On unlock: PIN → PBKDF2 → AES-GCM → decrypt private key → keep in memory only.
- PIN hash stored separately for verification (HMAC-SHA256 → compare).
- See `src/lib/crypto/encrypt.ts` and `src/lib/wallet/state.ts`.

#### 2. Multi-Mint
- No hardcoded mint URLs. Every `fetchFromMint()` call receives the mint URL as a parameter.
- Wallet manages proofs per-mint via `mint_url` index in IndexedDB.
- Balance aggregation sums across all mints.
- See `src/lib/cashu/client.ts` and `src/lib/wallet/balance.ts`.

#### 3. Offline-First
- Balance and transaction history read from IndexedDB — no network needed.
- P2P ecash token creation is pure local crypto.
- Received tokens are semi-verified (structure + proof fields) before storing.
- Service worker (vite-plugin-pwa) caches static assets + API responses.
- See `src/lib/wallet/offline.ts`.

#### 4. Bearer Instrument Risk (Accepted for MVP)
- Ecash proofs are bearer instruments: whoever holds the proof data can spend it.
- Clearing browser data = permanent loss of funds.
- MVP accepts this risk. Mitigation: seed phrase backup (24-word BIP-39).
- Warning is displayed in the UI during seed export.
- See `src/lib/wallet/seed.ts` and `src/lib/wallet/keys.ts`.

#### 5. Hash-Based Router
- Simple `#/screen` routing via `hashchange` events.
- No external router library. No page reloads.
- Routes: `#/balance`, `#/receive`, `#/pay`, `#/transfer`, `#/history`.
- Default: `#/` → balance.
- See `src/lib/router.ts`.

---

## Testing

### Framework
- **Vitest** with JSDOM environment
- Test files co-located: `src/**/__tests__/*.test.ts`
- 37 test files covering wallet domain, crypto, cashu client, storage, and UI components

### Running Tests

```bash
npm run test           # Single run (all tests)
npm run test:watch     # Watch mode for development
```

### Test Structure

```
src/
├── lib/
│   ├── __tests__/
│   │   ├── router.test.ts
│   │   ├── pwa-install.test.ts
│   │   └── offline-indicator.test.ts
│   ├── cashu/__tests__/
│   │   ├── client.test.ts       # HTTP client mocking
│   │   ├── blind.test.ts        # Blind signature math
│   │   ├── token.test.ts        # V4 token encode/decode
│   │   └── keyset.test.ts       # Keyset caching
│   ├── crypto/__tests__/
│   │   └── encrypt.test.ts      # PBKDF2 + AES-GCM
│   ├── storage/__tests__/
│   │   ├── db.test.ts           # IndexedDB CRUD
│   │   └── local.test.ts        # localStorage operations
│   ├── wallet/__tests__/
│   │   ├── state.test.ts        # Wallet lifecycle
│   │   ├── keys.test.ts         # Key generation
│   │   ├── seed.test.ts         # Seed export/import
│   │   ├── mint.test.ts         # Mint flow
│   │   ├── melt.test.ts         # Melt flow
│   │   ├── transfer.test.ts     # P2P transfer
│   │   ├── balance.test.ts      # Balance aggregation
│   │   ├── proofs.test.ts       # Proof selection algorithms
│   │   ├── proofsDb.test.ts     # Proof storage
│   │   ├── offline.test.ts      # Offline operations
│   │   └── errors.test.ts       # Error types
│   └── util/__tests__/
│       └── base64.test.ts       # Base64 utilities
├── __tests__/
│   ├── components/              # Component rendering tests
│   │   ├── ErrorBoundary.test.ts
│   │   ├── PwaInstallPrompt.test.ts
│   │   ├── OfflineIndicator.test.ts
│   │   └── SplashScreen.test.ts
│   └── screens/                 # Screen integration tests
│       ├── F001-Register.test.ts
│       ├── F002-CreateWallet.test.ts
│       ├── F003-Balance.test.ts
│       ├── F004-Receive.test.ts
│       ├── F005-Pay.test.ts
│       ├── F006-Transfer.test.ts
│       ├── F007-QRScan.test.ts
│       ├── F008-History.test.ts
│       └── F009-LanguageSwitch.test.ts
│       └── Navigation.test.ts
```

---

## Android APK Build

```bash
npm run build            # Production web build
npm run apk:build        # Build APK via Capacitor
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

The APK is distributed via sideload only (not Google Play Store).

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `svelte` ^5.56 | UI framework |
| `vite` ^8.1 | Build tool |
| `@noble/curves` ^2.2 | secp256k1 elliptic curve operations |
| `@noble/hashes` ^2.2 | SHA-256 hashing |
| `idb` ^8.0 | IndexedDB wrapper (promise-based) |
| `svelte-i18n` ^4.0 | Internationalization |
| `vite-plugin-pwa` ^1.3 | Service worker + PWA manifest |
| `@capacitor/core` ^8.4 | Cross-platform native bridge |
| `capacitor-barcode-scanner` ^8.0 | QR/Barcode scanning |
| `capacitor-secure-storage-plugin` ^0.13 | Android secure key storage |
| `vitest` ^4.1 | Test runner |

---

## Environment Variables

The app is client-side only — no environment variables needed to run. The only configuration is the mint URL, which the user provides during wallet setup.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests covering your changes
4. Run `npm run test` and `npm run check` before committing
5. Follow the existing project structure and naming conventions
