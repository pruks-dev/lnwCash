# LnwCash Wallet — User Guide

LnwCash Wallet is a Lightning Network wallet built on the Cashu protocol. It lets you receive, pay, and transfer ecash — no Lightning node required. Entirely client-side, no central server. Works on web and mobile.

---

## Getting Started

### 1. Install
- **Android**: Download the APK and sideload it (not on the Play Store yet)
- **iOS / Desktop**: Open `https://lnw.cash` in your browser, or run as a PWA from your home screen

### 2. Set Your PIN
When you open the app for the first time, you'll be asked to set a PIN (6+ digits). This PIN both unlocks the wallet and encrypts your private key. **Memorize it** — if you forget your PIN and haven't backed up your seed phrase, recovery is impossible.

### 3. Name Your Wallet & Add Mints
- Give your wallet a name (e.g., "Daily spending")
- Add at least 2 Mint URLs. Mints are the servers that issue and redeem ecash.
- Dev/testing mint: `https://mint-dev.inw.cash`
- Choose a keyset (typically `sat` for bitcoin)

### 4. Unlock
On subsequent visits, enter your PIN to unlock the wallet.

---

## Features

### 💰 Balance
- See total balance across all mints in sats
- Breakdown by mint available on tap
- Refresh button to fetch latest
- Green badge (online) / Red badge (offline) shows connectivity status

### 📥 Receive
1. Go to the **Receive** tab
2. Enter a Lightning invoice or scan a QR code
3. Tap **Receive (Mint)**
4. The app requests a mint quote → the mint pays your Lightning invoice → you receive ecash proofs
5. Amount received and proof count shown after completion

### 📤 Pay
1. Go to the **Pay** tab
2. Enter the invoice you want to pay (or scan a QR code)
3. The app shows the amount and fee before confirming
4. Tap **Pay** → proofs are selected → sent to the mint for burning → change is returned if overpaid
5. An "Insufficient funds" message appears if your balance doesn't cover the payment

### 🔄 P2P Transfer
- **Send**: Pick a mint → enter amount → tap Create Token → you get a token string + QR code → share it with the recipient
- **Receive**: Switch to the Receive tab → paste the token string → the app validates its structure → proofs are added to your wallet
- Transfers work entirely offline on the sender's side (local crypto only)

### 📋 History
- Lists all Mint, Melt, and Transfer transactions
- Filter by type
- Shows date, amount, and status (Confirmed / Pending / Failed)
- Data is stored in IndexedDB — viewable even when offline

---

## Backing Up Your Seed Phrase (24 Words)

The seed phrase is your recovery key. **Guard it with your life.** If you lose your device or clear browser data without a seed backup, your funds are gone permanently.

### How to Export
1. Go to Settings → Export Seed
2. Re-enter your PIN for confirmation
3. The app shows 24 English words (BIP-39)
4. **Write them down on paper** and store securely. Do not screenshot. Do not take a photo. Never share with anyone.

### ⚠️ Warnings
- Seed phrase = full access to all funds. Whoever holds it can spend everything.
- LnwCash does not store your seed. It is entirely your responsibility.
- Clearing browser data without your seed → permanent and irreversible loss of funds.

---

## FAQ

### What is ecash?
Ecash is digital cash that works like physical banknotes. You hold it yourself — no bank custody needed. It's issued by a trusted mint over the Lightning Network and can be spent privately.

### Will I lose my funds if I clear browser data?
**Yes.** Ecash proofs are bearer instruments — whoever holds the proof data owns the funds. Proofs live in your browser's IndexedDB. Clearing data without exporting your seed means irreversible loss.

### What works offline?
- ✅ View your balance (reads from IndexedDB)
- ✅ View transaction history
- ✅ Create ecash tokens for P2P transfer
- ❌ Mint and Melt operations (require network to talk to the mint)
- ✅ Semi-verify received tokens (structure check only, no mint verification)

### Why do I need more than one mint?
Different mints have different fee structures, liquidity, and uptime. Having multiple mints prevents vendor lock-in and gives you fallback options.

### Where can I find mint URLs?
- The Cashu community maintains lists of public mints
- `https://mint-dev.inw.cash` for development and testing
- Private mints, or mints run by friends

---

## Language Settings
- Go to Settings → **ภาษา / Change Language**
- Choose Thai or English
- Your preference is saved for subsequent sessions

---

## Installing as PWA
LnwCash supports Progressive Web App installation:
1. Open in your browser
2. Tap **Install** on the banner that appears
3. Tap **Add to Home Screen**

---

*LnwCash Wallet · Lightning Network Wallet — Fast, Easy, Secure*
