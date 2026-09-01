# LNWCASH Wallet

**A private, client-side ecash wallet for Bitcoin — built on the [Cashu protocol](https://cashu.space).**

No Lightning node required. No backend. No accounts. Your keys, your coins — everything runs in your browser (or Android app), and your funds exist as bearer ecash tokens you fully control.

![version](https://img.shields.io/badge/version-1.0.0-blue) ![stack](https://img.shields.io/badge/Svelte%205-TypeScript-blueviolet) ![license](https://img.shields.io/badge/license-MIT-green) ![pwa](https://img.shields.io/badge/PWA-installable-9cf)

---

## What is LNWCASH?

LNWCASH lets you receive, spend, and transfer **ecash** — private Bitcoin tokens issued by mints on the Lightning Network. The wallet is a pure client-side app: wallet operations, encryption, and storage all happen locally on your device. There is no central LNWCASH server holding your funds.

Key properties:

- **Self-custodial** — your private key is encrypted with your PIN and never leaves your device
- **Private by default** — ecash tokens are bearer instruments; payments don't link identities
- **No node required** — mints handle Lightning liquidity; you just need a browser
- **Multi-mint** — hold balances across several mints and switch between them

## Features

- 💰 **Balance** — total balance across all your mints, in sats
- 📥 **Receive** — get a Lightning invoice, pay it, receive ecash
- 📤 **Send** — melt ecash back to a Lightning invoice
- 🔄 **P2P Transfer** — send ecash directly to someone via token string or QR code
- 📱 **Animated QR** — scan and display large tokens as animated QR (NUT-16)
- 📋 **History** — full transaction history with filters
- 🌱 **Seed backup** — 12-word BIP39 seed phrase (24-word legacy wallets supported), with verify quiz
- 🔢 **Multi-mint** — add, edit, and switch mints; per-mint keyset handling
- 🌗 **Light / dark theme** — with system-preference detection
- 🌐 **Thai & English UI** — full i18n parity
- 📲 **Installable** — PWA on desktop/iOS, native Android build via Capacitor

## Installation

### Web (PWA)

1. Open the wallet URL in your browser
2. Install it from your browser menu ("Install app" / "Add to Home Screen")
3. Set your PIN, back up your seed phrase, and you're ready

> 📱 **Android app is planned** — a native APK build via Capacitor is on the roadmap (Capacitor Android platform is already wired in the codebase).

## Getting Started

1. **Set your PIN** (6+ digits) — encrypts your private key and unlocks the wallet
2. **Back up your seed phrase** — Settings → Backup. Without it, clearing browser data means permanent loss of funds
3. **Add mints** — mints issue and redeem your ecash. Only add mints you trust

For the full walkthrough see the [User Guide](docs/user-guide-en.md) (ไทย: [คู่มือผู้ใช้](docs/user-guide-th.md)).

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | Svelte 5 + TypeScript |
| Build | Vite 8 |
| Crypto | @noble/curves (secp256k1), @noble/hashes, Web Crypto API (PBKDF2, AES-GCM, HMAC) |
| Protocol | Cashu (NUT-00 … NUT-16), Lightning bolt11 |
| Storage | IndexedDB (proofs, transactions) + localStorage (encrypted key, settings) |
| Mobile | Capacitor 8 (Android) |
| Testing | Vitest + JSDOM, svelte-check |

## For Developers

### Quick Start

```bash
# Prerequisites: Node 22+, pnpm
pnpm install

# Generate a self-signed dev certificate (HTTPS dev server)
bash scripts/generate-cert.sh

# Start the dev server
pnpm dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server (HTTPS) |
| `pnpm build` | Production build (with PWA service worker) |
| `pnpm preview` | Preview the production build |
| `pnpm test` | Run the full test suite |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm check` | Type-check with svelte-check |
| `pnpm lint` | Lint with ESLint |
| `pnpm format` | Format with Prettier |
| `pnpm env:check` | Verify dev environment |

<details>
<summary>Capacitor scripts (future Android build)</summary>

| Script | Description |
|--------|-------------|
| `pnpm cap:init` | Initialize Capacitor |
| `pnpm cap:sync` | Sync web assets to Android project |
| `pnpm cap:add:android` | Add Android platform |
| `pnpm cap:open:android` | Open Android project in Android Studio |
| `pnpm apk:build` | Build Android APK |

</details>

### Architecture

The app is a hash-routed single-page application (`#/balance`, `#/receive`, `#/pay`, `#/history`) with a layered wallet core:

```
src/
├── main.ts              # Entry point
├── App.svelte           # Root router + lifecycle
├── screens/             # One file per feature (F00x-*.svelte)
├── lib/
│   ├── wallet/          # Crypto core: mint, melt, swap, keys, seed
│   ├── cashu/           # Cashu protocol client (NUTs)
│   ├── components/      # Shared UI components
│   └── iconly/          # Icon system
└── locales/             # i18n (en / th)
```

Design highlights: PIN-encrypted private key (plaintext exists only in memory while unlocked), deterministic derivation for recoverability, multi-mint by design, offline-first with PWA service worker.

Read the full [Developer Documentation](docs/developer.md) for the layered design, key decisions, and testing guide.

## Security Notes

- **Your private key is encrypted with your PIN** and stored locally — it is never sent to any server
- **Ecash is a bearer instrument** — anyone holding the token can spend it; clearing browser data without a seed backup means permanent loss
- **Only use mints you trust** — a mint holds the Bitcoin backing your ecash

## Documentation

| Document | Content |
|----------|---------|
| [User Guide (EN)](docs/user-guide-en.md) | Full walkthrough for end users |
| [คู่มือผู้ใช้ (TH)](docs/user-guide-th.md) | คู่มือฉบับภาษาไทย |
| [Developer Docs](docs/developer.md) | Architecture, scripts, testing |
| [API Reference](docs/api-reference.md) | Wallet core internals |
| [Changelog](docs/CHANGELOG.md) | Release history |
| [Deployment](infra/DEPLOY.md) | Self-hosting / deploy guide |

## Project Status

**v1.0.0** — first stable release. See the [changelog](docs/CHANGELOG.md) for details.

- Legacy pre-release history (0.1.x beta) is preserved on the [`legacy-v0.x`](../../tree/legacy-v0.x) branch

## Contributing

Issues and pull requests are welcome. For development setup see the [Developer Documentation](docs/developer.md). Please run `pnpm check && pnpm test` before submitting.

## License

Released under the [MIT License](LICENSE) — free to use, modify, and build upon, with attribution.
