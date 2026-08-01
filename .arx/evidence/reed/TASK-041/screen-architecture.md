# Screen Architecture — LnwCash Wallet (INTENT-002)
## TASK-041 | D-002: รวม Balance, Pay, Receive

---

## 1. Current vs Proposed Screen Count

| # | Current Screen (F-code) | Proposed | Change |
|---|--------------------------|----------|--------|
| 1 | F001-Register | Onboarding → PIN Setup | Redesign |
| 2 | F002-CreateWallet | Onboarding → Mint Setup | Merge into onboarding |
| 3 | F003-Balance | **Home** (Balance + Quick Actions) | Redesign |
| 4 | F004-Receive | **Receive** (Lightning Address + Invoice + Ecash) | Redesign |
| 5 | F005-Pay | **Pay** (Scan/Paste → Confirm → Done) | Redesign |
| 6 | F006-Transfer | **Send Ecash** (merged into Pay flow) | Merge |
| 7 | F007-QRScan | QR Scan (overlay, reusable) | Keep, enhance |
| 8 | F008-History | **Activity** (Transaction History) | Redesign |
| 9 | F009-LanguageSwitch | Settings → Language | Move to Settings |
| — | — | **Settings** (NEW) | New screen |
| — | — | **Mint Manager** (NEW) | New screen |

**Current**: 9 screens + 1 component (Navigation)  
**Proposed**: 7 screens (+ QR overlay + Settings + Mint Manager)

---

## 2. Screen Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        APP LAUNCH                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Splash    │ (2s, auto-advance)
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │   Wallet State Check    │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐     ┌──────▼──────┐    ┌─────▼─────┐
    │  New    │     │  Returning  │    │  Locked   │
    │  User   │     │  (no PIN)   │    │  (has PIN)│
    └────┬────┘     └──────┬──────┘    └─────┬─────┘
         │                 │                 │
    ┌────▼────┐     ┌──────▼──────┐    ┌─────▼─────┐
    │Onboard 1│     │   PIN Setup │    │   Unlock  │
    │Welcome  │     │  (6-digit)  │    │  (6-digit)│
    └────┬────┘     └──────┬──────┘    └─────┬─────┘
         │                 │                 │
    ┌────▼────┐     ┌──────▼──────┐          │
    │Onboard 2│     │ Mint Setup  │          │
    │PIN Setup│     │ (auto/add)  │          │
    └────┬────┘     └──────┬──────┘          │
         │                 │                 │
    ┌────▼────┐           │                 │
    │Onboard 3│           │                 │
    │MintSetup│           │                 │
    └────┬────┘           │                 │
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │    HOME     │  ← Default screen
                    │  (Balance)  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌─────▼─────┐     ┌─────▼─────┐
   │  PAY    │       │  RECEIVE  │     │  ACTIVITY │
   │ (Scan/  │       │ (Address/ │     │ (History) │
   │  Paste) │       │  Invoice) │     │           │
   └────┬────┘       └─────┬─────┘     └───────────┘
        │                  │
   ┌────▼────┐       ┌─────▼─────┐
   │ Confirm │       │ QR Display│
   │ Payment │       │ / Share   │
   └────┬────┘       └───────────┘
        │
   ┌────▼────┐
   │  Done   │
   │ (Success│
   │  /Fail) │
   └─────────┘

        ┌──────────────────┐
        │   QR SCANNER     │  ← Overlay (from Pay, Receive, or FAB)
        │   (camera)       │
        └──────────────────┘

        ┌──────────────────┐
        │    SETTINGS      │  ← Accessible from Home (gear icon)
        │  ┌──────────────┐ │
        │  │ Language     │ │
        │  │ Theme        │ │
        │  │ Mint Manager ├─┼──→ MINT MANAGER (sub-screen)
        │  │ Security     │ │
        │  │ About        │ │
        │  └──────────────┘ │
        └──────────────────┘
```

---

## 3. Navigation Structure

### Bottom Tab Bar (4 tabs)

```
┌──────────┬──────────┬──────────┬──────────┐
│    💰    │    📤    │    📥    │    📋    │
│  Home    │   Pay    │ Receive  │ Activity │
│(Balance) │          │          │(History) │
└──────────┴──────────┴──────────┴──────────┘
```

### Tab Details

| Tab | Label (TH) | Label (EN) | Icon | Primary Action |
|-----|-----------|-----------|------|----------------|
| Home | หน้าแรก | Home | Wallet/Balance | View balance, quick stats |
| Pay | จ่าย | Pay | Arrow Up | Scan/Paste to pay |
| Receive | รับ | Receive | Arrow Down | Show address/invoice |
| Activity | ประวัติ | Activity | List/Clock | View transactions |

### FAB (Floating Action Button)
- **Position**: Center-docked on bottom nav (ตาม LnwCash Flutter pattern)
- **Icon**: QR Scanner
- **Action**: Open QR scanner overlay
- **Auto-detect**: Lightning invoice, Cashu token, LNURL, Lightning Address

### Header Area
- Left: User avatar / profile indicator
- Center: Screen title (หรือ mint status indicator)
- Right: Settings gear icon → Settings screen

### Gesture Navigation (Optional Enhancement)
- Swipe left/right เพื่อสลับ tab
- Pull down to refresh บน Home screen
- Long press บน balance เพื่อ copy/screenshot

---

## 4. Information Architecture

### Home Screen
```
┌────────────────────────────┐
│  [Avatar]  LnwCash  [⚙️]   │  ← Header
├────────────────────────────┤
│                            │
│    ⚡ Lightning Address     │  ← Identity
│    name@lnw.cash           │
│                            │
│  ┌──────────────────────┐  │
│  │                      │  │
│  │   ฿ 12,345.67 THB   │  │  ← Fiat balance (big)
│  │   50,000 sats        │  │  ← Sat balance (smaller)
│  │                      │  │
│  │   ▲ 2.3% this week  │  │  ← Price change (if BTC)
│  └──────────────────────┘  │
│                            │
│  ┌────────┐ ┌────────┐     │
│  │  Send  │ │Receive │     │  ← Quick actions
│  └────────┘ └────────┘     │
│                            │
│  Recent Activity            │
│  ┌──────────────────────┐  │
│  │ ✓ Received 500 sat   │  │
│  │ ↑ Sent 200 sat       │  │
│  │ ⇄ Swapped mint       │  │
│  └──────────────────────┘  │
│                            │
│  [Mint Status: ● 3 online] │  ← Mint health indicator
│                            │
└────────────────────────────┘
```

### Pay Screen
```
┌────────────────────────────┐
│  ← Back       Pay          │
├────────────────────────────┤
│                            │
│  ┌──────────────────────┐  │
│  │   📷 Scan QR Code    │  │  ← Primary action (big)
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  — or —                    │
│                            │
│  [______________________]  │  ← Paste invoice/token
│                            │
│  Recent/Frequent:          │
│  ○ Mint A (default)       │  ← Mint selector
│  ○ Mint B                 │
│                            │
│  [Pay with Lightning▼]     │  ← Method selector
│  [Pay with Ecash   ▼]     │
│                            │
└────────────────────────────┘
       │
       ▼ (after scan/paste)
┌────────────────────────────┐
│  ← Back    Confirm Pay     │
├────────────────────────────┤
│                            │
│  Pay to: Carol             │
│  Amount: 10,000 sats       │
│  Fee: ~3 sats              │
│  Total: 10,003 sats        │
│  Via: Mint A               │
│                            │
│  ┌──────────────────────┐  │
│  │   ✓ Confirm & Pay    │  │
│  └──────────────────────┘  │
│  [Cancel]                  │
└────────────────────────────┘
       │
       ▼ (after confirm)
┌────────────────────────────┐
│                            │
│         ✓ Payment          │
│         Sent!              │
│                            │
│  10,000 sats to Carol      │
│  Fee: 3 sats               │
│  Preimage: abc123...       │
│                            │
│  ┌──────────────────────┐  │
│  │      Done            │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

### Receive Screen
```
┌────────────────────────────┐
│  ← Back     Receive        │
├────────────────────────────┤
│                            │
│  ┌──────────────────────┐  │
│  │                      │  │
│  │    [QR CODE]         │  │  ← Lightning Address QR
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  name@lnw.cash      [📋]   │  ← Lightning Address + copy
│                            │
│  — or —                    │
│                            │
│  ┌──────────────────────┐  │
│  │ Create Invoice       │  │  ← Custom amount invoice
│  │ Amount: [______] sat │  │
│  │ Memo:   [______]     │  │
│  │ [Create]             │  │
│  └──────────────────────┘  │
│                            │
│  — or —                    │
│                            │
│  ┌──────────────────────┐  │
│  │ Receive Ecash Token  │  │  ← Paste token
│  │ [______________]     │  │
│  │ [Redeem]             │  │
│  └──────────────────────┘  │
│                            │
│  [Share Address]           │
└────────────────────────────┘
```

### Activity Screen
```
┌────────────────────────────┐
│          Activity          │
├────────────────────────────┤
│  [All] [Sent] [Received]   │  ← Filter chips
│  [Ecash] [Lightning]       │
├────────────────────────────┤
│                            │
│  Today                     │
│  ┌──────────────────────┐  │
│  │ ↓ Received           │  │
│  │   500 sat · 14:32    │  │
│  │   via Lightning      │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ ↑ Sent               │  │
│  │   200 sat · 10:15    │  │
│  │   via Ecash          │  │
│  └──────────────────────┘  │
│                            │
│  Yesterday                 │
│  ┌──────────────────────┐  │
│  │ ⇄ Swapped            │  │
│  │   1,000 sat · 18:45  │  │
│  │   Mint A → Mint B    │  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
```

### Settings Screen
```
┌────────────────────────────┐
│  ← Back      Settings      │
├────────────────────────────┤
│                            │
│  Profile                   │
│  ┌──────────────────────┐  │
│  │ Name: My Wallet   >  │  │
│  │ Lightning Address >  │  │
│  └──────────────────────┘  │
│                            │
│  Appearance                │
│  ┌──────────────────────┐  │
│  │ Theme: Light/Dark  > │  │
│  │ Language: ไทย     >  │  │
│  └──────────────────────┘  │
│                            │
│  Security                  │
│  ┌──────────────────────┐  │
│  │ Change PIN         >  │  │
│  │ Backup Seed        >  │  │
│  │ Nostr Keys         >  │  │
│  └──────────────────────┘  │
│                            │
│  Mints                     │
│  ┌──────────────────────┐  │
│  │ Manage Mints       >  │  │  → Mint Manager
│  │ Default Mint: Mint A  │  │
│  └──────────────────────┘  │
│                            │
│  About                     │
│  ┌──────────────────────┐  │
│  │ Version 0.2.0        │  │
│  │ Terms & Privacy    >  │  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
```

### Mint Manager Screen (sub-screen of Settings)
```
┌────────────────────────────┐
│  ← Back    Mint Manager    │
├────────────────────────────┤
│                            │
│  Your Mints                │
│  ┌──────────────────────┐  │
│  │ ● mint.lnw.cash      │  │  ← Online indicator
│  │   Balance: 800 sat   │  │
│  │   Fee: 0.5%          │  │
│  │              [⭐ Def] │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ ● testnut.cashu.space│  │
│  │   Balance: 200 sat   │  │
│  │   Fee: 0% (testnet) │  │
│  │              [Remove]│  │
│  └──────────────────────┘  │
│                            │
│  [+ Add Mint]              │
│                            │
│  Discover Mints            │
│  ┌──────────────────────┐  │
│  │ ● 8333.space        │  │
│  │   Trust: ★★★★☆      │  │
│  │   Users: 1,200      │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ ● mint.minibits.cash│  │
│  │   Trust: ★★★★☆      │  │
│  │   Users: 5,400      │  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
```

---

## 5. Screen Transition Animations

| Transition | Animation | Duration |
|------------|-----------|----------|
| Tab switch | Fade + slide (horizontal) | 200ms |
| Screen push (Pay → Confirm) | Slide from right | 250ms |
| Screen pop (Confirm → Pay) | Slide to right | 250ms |
| Modal/Overlay (QR Scan) | Fade in + scale up | 200ms |
| Modal dismiss | Fade out + scale down | 150ms |
| Success/Error | Spring bounce | 400ms |

---

*End of Screen Architecture — 31 กรกฎาคม 2569*
