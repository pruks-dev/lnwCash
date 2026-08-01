# Source References — TASK-041

ทุก URL ที่เข้าถึงระหว่างการวิจัย พร้อมหมายเหตุสิ่งที่พบ

---

## Phase 1: Current Codebase

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 1 | `/home/debian/arx-projects/lnw-cash/src/` | Local filesystem | Complete Svelte 5 project: 9 screens, 4 components, 2 locales, hash router |
| 2 | `src/App.svelte` | Local file | App shell with splash→auth→main flow, QR overlay, bottom nav |
| 3 | `src/lib/router.ts` | Local file | Hash-based routing: balance/receive/pay/transfer/history |
| 4 | `src/locales/th.json` | Local file | 120 Thai i18n keys |
| 5 | `src/locales/en.json` | Local file | 120 English i18n keys |
| 6 | `src/app.css` | Local file | Global styles: system-ui font, #fafafa bg, #1a1a2e text |
| 7 | `vite.config.ts` | Local file | PWA manifest: theme_color #f7931a, bg #1a1a2e |
| 8 | `package.json` | Local file | Svelte 5.56.4, Capacitor 8.4.2, Vite 8.1.1 |
| 9 | `src/screens/*.svelte` (all 9) | Local files | Full screen implementations with scoped CSS |

### Current Screen List
- F001-Register: PIN setup/unlock (6-digit) 
- F002-CreateWallet: Wallet name + mint URL setup
- F003-Balance: Total balance + per-mint breakdown
- F004-Receive: Invoice input + mint (receive ecash)
- F005-Pay: Invoice input + melt (pay Lightning)
- F006-Transfer: Send/Receive ecash tokens (P2P, tabbed)
- F007-QRScan: Camera-based QR scanner
- F008-History: Transaction list with type/status filters
- F009-LanguageSwitch: TH/EN toggle
- Navigation: Bottom nav with 5 emoji-icon tabs

### Current Color Palette (from code)
- Primary: `#f7931a` (Bitcoin orange)
- Primary hover: `#e6820f`
- Background: `#fafafa`
- Text: `#1a1a2e`
- Splash bg: `linear-gradient(135deg, #1a1a2e, #16213e)`
- Splash logo gradient: `linear-gradient(135deg, #f7931a, #ffab40)`
- Success bg: `#d4edda`, text: `#155724`, border: `#c3e6cb`
- Error text: `#e74c3c`, bg: `#fdeaea`
- Warning bg: `#fff3cd`, text: `#856404`
- Neutral bg: `#f9f9f9`, border: `#eee`, `#e0e0e0`
- Disabled text: `#aaa`, `#bbb`

---

## Phase 2: LnwCash Flutter

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 10 | https://github.com/pruks-dev/lnwCash | GitHub repo | Flutter project: 84 commits, MIT license, 10 stars |
| 11 | `lib/main.dart` (raw) | GitHub raw | Material 3 with ColorSchemeSeed, customizable theme, light/dark |
| 12 | `lib/pages/walletpage.dart` (raw) | GitHub raw | Wallet page: balance display, send/receive buttons, QR dialog, bottom nav |
| 13 | `pubspec.yaml` (raw) | GitHub raw | Iconly icons, qr_flutter, animate_do, NIP-60 Nostr wallet, cashu_dart |
| 14 | https://lnw.cash | Live site | Landing page for LnwCash wallet |

### LnwCash Flutter Findings
- **Framework**: Flutter 3.5.0+, Dart 3.5.0+
- **Theme**: Material 3 with customizable `colorSchemeSeed`
- **Default seed color**: `Colors.lightBlue` (not Bitcoin orange)
- **Dark mode**: Supported via Settings
- **Icons**: Iconly (custom icon pack) + Material Icons
- **Navigation**: Bottom nav: Wallet + History (2 tabs only)
- **FAB**: QR scanner (center-docked)
- **Screens**: WalletPage (balance + send/receive), History, QRScanner, Settings
- **Nostr**: NIP-60 wallet storage on relays, NIP-01 relay communication
- **Cashu**: cashu_dart library for mint interactions, ecash token handling
- **Animations**: animate_do (fade-in effects)
- **Widgets**: ProfileCard, TransactionView, ReceiveBottom, SendBottom, Sidebar, WalletManager
- **Version**: 0.1.3

---

## Phase 3: External Wallets

### 3a. cashu.me

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 15 | https://cashu.me | Live site | Landing page with full feature showcase |
| 16 | https://github.com/cashubtc/cashu.me | GitHub repo | Quasar + Vue.js PWA, 211 stars, MIT license |
| 17 | https://wallet.cashu.me | Live wallet | PWA wallet interface |

**Key findings**:
- Quasar Framework + Vue.js + Capacitor
- iOS (TestFlight), Android (Zapstore), Browser (PWA)
- NFC tap-to-pay between devices
- iMessage/SMS/Bluetooth token sharing ("anywhere you can paste a string")
- 12-word BIP39 seed backup
- Lightning Address receive (BOLT12, on-chain)
- Dark/light mode (shown in screenshots)
- FAQ: privacy model, mint risk, account vs ecash, backup methods
- Experimental iCloud backup
- No account, no login

### 3b. Minibits

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 18 | https://minibits.cash | Live site | Product landing page |
| 19 | https://github.com/minibits-cash/minibits_wallet | GitHub repo | Mobile wallet source |

**Key findings**:
- Native Android + iOS
- Free Lightning Address (@minibits.cash)
- Nostr Wallet Connect (NWC) for Nostr zaps
- NFC tap-to-pay (compatible with Numo terminal)
- Seed-based recovery tool at recovery.minibits.cash
- Minibits test mint (mint.minibits.cash)
- "Ippon": AI agent wallet with REST API (no UI, seedless, short-lived)
- Ippon MCP server for AI agent integration
- Supported by HRF Bitcoin Bounty, OpenSats

### 3c. Nutstash

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 20 | https://nutstash.app | Live site | PWA landing page |
| 21 | https://github.com/gandlafbtc/nutstash-wallet | GitHub repo | PWA source code |

**Key findings**:
- PWA only (browser-based, no app stores)
- Multi-mint support with mint discovery
- Nostr integration for P2P token sending (throwaway keys or NIP-07 extension)
- Air-gapped animated QR codes for offline token transfer
- BIP32/BIP39 seed phrase recovery
- Mint swap (exchange tokens between mints)
- Self-hostable (git clone + npm run dev)
- **Security notes**: Unencrypted localStorage, PWA update risks, bearer token risks
- Install as PWA via browser "Add to Home Screen"
- Written in TypeScript, uses cashu-ts library

### 3d. awesome-cashu

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 22 | https://github.com/cashubtc/awesome-cashu | GitHub repo | Curated resource list, 213 stars |

**Key findings**:
- **50+ wallets** listed across platforms
- **15+ mints** including nutshell (Python), mintd (Rust), arxmint, nutmix (Go), fibernuts
- **10+ language libraries**: Rust (CDK), TypeScript (cashu-ts), Python, Dart, Go, Java, Swift, C#, C++, Kotlin
- **NIP-60/61 Nostr wallets**: 15+ listed including lnw.cash
- **Common patterns**: multi-mint, seed backup, Nostr integration, PWA distribution, QR-based P2P
- **LLM/AI agent wallets**: Ippon, cashu-agent, hexnuts, botwallets, cashu-skill
- **X-Cashu ecosystem**: HTTP 402 payment headers, L402 bridges
- **Marketplace projects**: 402.markets, Athenut, Europa VPN, Stashu, Switchboard
- **Documentation**: docs.cashu.space, CDK docs, cashu-ts.dev

### 3e. Wallet of Satoshi

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 23 | https://www.walletofsatoshi.com | Live site | Product landing page |

**Key findings**:
- iOS + Android native
- "The World's Simplest Lightning Wallet"
- Two modes: Custodial (email recovery) + Self-custodial (key backup)
- Free Lightning Address (random + customizable)
- Scan-to-pay: scan QR, confirm, done
- In-app Bitcoin purchase (region-dependent)
- On-chain + Lightning payments
- Simple layout: "Just what you need to see, and nothing you don't"
- Top-up options (exchange or in-app buy)
- No KYC
- Mass adoption focus ("So easy — your mum could use it")
- Screens shown: Home (balance), Pay (QR scan), Top-up, Splash

### 3f. Zeus

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 24 | https://zeusln.com | Live site | JS-only app (could not fetch content) |
| 25 | https://github.com/ZeusLN/zeus | GitHub repo | React Native source, 1.4k stars, AGPLv3 |

**Key findings**:
- React Native + TypeScript
- Self-custodial Bitcoin/Lightning wallet
- LND + Core Lightning remote node manager
- Cashu ecash integration (topics: cashu, ecash)
- Multi-node management
- NFC payments and requests
- PIN/passphrase encryption
- Tor support, privacy mode
- Nostr Wallet Connect (service + client)
- Lightning Address send (ZEUS Pay)
- Multi-theme support
- Point of Sale (Standalone + Square)
- Fiat currency integrations
- 17+ language translations
- App Store + Google Play + F-Droid + Zapstore

---

## Phase 4: Cashu NUTs

| # | Source | Type | What was found |
|---|--------|------|----------------|
| 26 | https://raw.githubusercontent.com/cashubtc/nuts/main/00.md | NUT spec | Token format, BDHKE crypto, V3/V4 serialization |
| 27 | https://raw.githubusercontent.com/cashubtc/nuts/main/04.md | NUT spec | Mint flow: quote→pay→mint, 2-step process |
| 28 | https://raw.githubusercontent.com/cashubtc/nuts/main/05.md | NUT spec | Melt flow: quote→prove→melt, sync/async, fee_reserve |
| 29 | https://raw.githubusercontent.com/cashubtc/nuts/main/07.md | NUT spec | Token state check: UNSPENT/PENDING/SPENT |
| 30 | https://raw.githubusercontent.com/cashubtc/nuts/main/08.md | NUT spec | Lightning fee return via blank outputs |

---

## Summary

- **Total sources accessed**: 30
- **Live websites visited**: 7 (cashu.me, minibits.cash, nutstash.app, walletofsatoshi.com, zeusln.com, lnw.cash, wallet.cashu.me)
- **GitHub repos studied**: 7 (lnwCash Flutter, cashu.me, awesome-cashu, Zeus, Minibits, Nutstash, NUTs)
- **Local files read**: 20+ files from lnw-cash Svelte project
- **NUT specs read**: 5 (NUT-00, 04, 05, 07, 08)
