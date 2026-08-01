# Component Tree — LnwCash Wallet (INTENT-002)
## TASK-041 | D-006: Design System

---

## 1. Design System Architecture

```
Design System ("LNW-UI")
├── tokens/
│   ├── colors.css          (CSS custom properties)
│   ├── typography.css      (font sizes, weights, families)
│   ├── spacing.css         (spacing scale)
│   ├── radius.css          (border radius tokens)
│   └── shadows.css         (box-shadow tokens)
│
├── icons/                  (SVG icon library — D-005)
│   ├── wallet.svg
│   ├── arrow-up.svg
│   ├── arrow-down.svg
│   ├── swap.svg
│   ├── history.svg
│   ├── qr-scan.svg
│   ├── settings.svg
│   ├── lightning.svg
│   ├── check.svg
│   ├── close.svg
│   ├── copy.svg
│   ├── refresh.svg
│   ├── offline.svg
│   ├── online.svg
│   └── index.ts           (icon registry)
│
├── components/
│   ├── primitives/        (base components — reusable)
│   │   ├── Button.svelte
│   │   ├── Input.svelte
│   │   ├── Card.svelte
│   │   ├── Badge.svelte
│   │   ├── Chip.svelte
│   │   ├── Icon.svelte
│   │   ├── Avatar.svelte
│   │   ├── Divider.svelte
│   │   ├── Spinner.svelte
│   │   └── Toast.svelte
│   │
│   ├── composites/        (composed components — reusable)
│   │   ├── BalanceCard.svelte
│   │   ├── TransactionItem.svelte
│   │   ├── MintCard.svelte
│   │   ├── QRCode.svelte
│   │   ├── QRScanner.svelte (uses capacitor-barcode-scanner)
│   │   ├── PinInput.svelte
│   │   ├── LightningAddress.svelte
│   │   ├── FeeBreakdown.svelte
│   │   ├── TokenDisplay.svelte
│   │   ├── FilterBar.svelte
│   │   ├── EmptyState.svelte
│   │   ├── ErrorState.svelte
│   │   ├── LoadingState.svelte
│   │   ├── SuccessCard.svelte
│   │   ├── ConfirmSheet.svelte
│   │   └── BottomSheet.svelte
│   │
│   └── layout/            (layout components)
│       ├── AppShell.svelte
│       ├── BottomNav.svelte
│       ├── Header.svelte
│       ├── ScreenContainer.svelte
│       └── TabContent.svelte
│
└── screens/
    ├── Home.svelte         (Balance + Quick Actions)
    ├── Pay.svelte          (Pay flow: Scan → Confirm → Done)
    ├── Receive.svelte      (Lightning Address + Invoice + Ecash)
    ├── Activity.svelte     (Transaction history)
    ├── Settings.svelte     (App settings)
    ├── MintManager.svelte  (Mint management sub-screen)
    └── Onboarding.svelte   (Welcome + PIN + Mint setup — merged)
```

---

## 2. Component Hierarchy & Dependencies

### AppShell → Screen → Composite → Primitive

```
App.svelte
└── AppShell.svelte
    ├── Header.svelte
    │   ├── Avatar.svelte
    │   └── Icon.svelte (settings gear)
    │
    ├── ScreenContainer.svelte
    │   └── [Active Screen].svelte
    │       └── [Composite Components]
    │           └── [Primitives]
    │
    ├── BottomNav.svelte
    │   ├── Icon.svelte ×4
    │   └── Badge.svelte (notifications)
    │
    └── QRScanner.svelte (overlay, triggered by FAB)
        └── Icon.svelte (close)
```

### Per-Screen Component Map

#### Home Screen
```
Home.svelte
├── BalanceCard.svelte
│   ├── Card.svelte
│   ├── Icon.svelte (lightning)
│   └── Spinner.svelte (while loading)
├── LightningAddress.svelte
│   ├── Icon.svelte (copy)
│   └── Toast.svelte (copied feedback)
├── Button.svelte (Send — primary)
├── Button.svelte (Receive — outline)
├── TransactionItem.svelte ×3 (recent)
│   ├── Icon.svelte (type icon)
│   ├── Badge.svelte (status)
│   └── Card.svelte
├── MintCard.svelte ×N (mini status)
│   └── Badge.svelte (online/offline)
└── EmptyState.svelte (if no transactions)
```

#### Pay Screen
```
Pay.svelte (multi-step)
├── Step 1: Input
│   ├── Card.svelte (scan prompt)
│   ├── Input.svelte (paste invoice/token)
│   ├── Button.svelte (scan QR)
│   └── Chip.svelte (mint selector)
│
├── Step 2: Confirm
│   ├── Card.svelte (confirm)
│   ├── FeeBreakdown.svelte
│   │   ├── Divider.svelte
│   │   └── Icon.svelte (info)
│   ├── Button.svelte (Confirm & Pay — primary)
│   └── Button.svelte (Cancel — ghost)
│
└── Step 3: Result
    ├── SuccessCard.svelte / ErrorState.svelte
    ├── Icon.svelte (check/cross)
    ├── TokenDisplay.svelte (if ecash sent)
    └── Button.svelte (Done)
```

#### Receive Screen
```
Receive.svelte
├── QRCode.svelte (Lightning Address)
│   └── Card.svelte
├── LightningAddress.svelte
│   ├── Input.svelte (readonly)
│   └── Button.svelte (copy)
├── Divider.svelte
├── Card.svelte (Create Invoice)
│   ├── Input.svelte (amount)
│   ├── Input.svelte (memo)
│   └── Button.svelte (Create)
├── Card.svelte (Receive Ecash)
│   ├── Input.svelte (paste token)
│   └── Button.svelte (Redeem)
└── Button.svelte (Share — outline)
```

#### Activity Screen
```
Activity.svelte
├── FilterBar.svelte
│   └── Chip.svelte ×5
├── TransactionItem.svelte ×N
│   ├── Icon.svelte
│   ├── Badge.svelte
│   └── Card.svelte
├── EmptyState.svelte
├── LoadingState.svelte
│   └── Spinner.svelte
└── ErrorState.svelte
    └── Button.svelte (Retry)
```

#### Settings Screen
```
Settings.svelte
├── Card.svelte (Profile)
│   ├── Input.svelte (name)
│   └── LightningAddress.svelte
├── Card.svelte (Appearance)
│   ├── Chip.svelte (theme toggle)
│   └── Chip.svelte (language)
├── Card.svelte (Security)
│   ├── Button.svelte (Change PIN)
│   ├── Button.svelte (Backup Seed)
│   └── Button.svelte (Nostr Keys)
├── Card.svelte (Mints)
│   └── MintCard.svelte ×N
└── Card.svelte (About)
    └── Divider.svelte
```

#### Mint Manager Screen
```
MintManager.svelte
├── Header.svelte
├── MintCard.svelte ×N (user's mints)
│   ├── Badge.svelte (online/offline)
│   ├── Icon.svelte (star — default)
│   └── Button.svelte (remove)
├── Button.svelte (Add Mint)
├── Divider.svelte
├── MintCard.svelte ×N (discover)
│   ├── Badge.svelte (trust score)
│   └── Icon.svelte (add)
└── Input.svelte (add mint URL — in modal)
    └── BottomSheet.svelte
```

#### Onboarding Screen
```
Onboarding.svelte (multi-step wizard)
├── Step 1: Welcome
│   ├── Icon.svelte (lnw logo)
│   └── Button.svelte (Get Started)
├── Step 2: PIN Setup
│   ├── PinInput.svelte ×2 (set + confirm)
│   ├── ErrorState.svelte (mismatch)
│   └── Button.svelte (Next)
└── Step 3: Mint Setup
    ├── MintCard.svelte ×2 (default mints)
    ├── Button.svelte (Add Custom)
    └── Button.svelte (Finish — primary)
```

---

## 3. Reusable vs One-Off Components

### Fully Reusable (Design System)
| Component | Used In | Props |
|-----------|---------|-------|
| Button | Every screen | variant, size, disabled, loading, icon, fullWidth |
| Input | Pay, Receive, Settings, MintManager | type, placeholder, disabled, error, icon |
| Card | Every screen | variant, padding, onClick |
| Badge | Home, Activity, MintManager | variant (success/warning/error/neutral), size |
| Chip | Pay, Activity, Settings | selected, onClick, icon, dismissible |
| Icon | Every screen | name, size, color |
| Spinner | Home, Activity, Pay | size |
| Toast | Global | message, variant, duration |

### Screen-Specific Composites
| Component | Screen(s) | Reusability |
|-----------|-----------|-------------|
| BalanceCard | Home only | Could be reused in widget |
| TransactionItem | Home, Activity | Reusable |
| MintCard | Home, Settings, MintManager | Reusable |
| QRCode | Receive, Pay (token display) | Reusable |
| QRScanner | Global overlay | Single instance |
| PinInput | Onboarding, Settings (change PIN) | Reusable |
| LightningAddress | Home, Receive, Settings | Reusable |
| FeeBreakdown | Pay | Single use |
| FilterBar | Activity | Could be generic |
| SuccessCard | Pay, Receive, Transfer | Reusable |
| ConfirmSheet | Pay | Could be generic BottomSheet |

### One-Off / Screen-Only
| Component | Screen |
|-----------|--------|
| WelcomeStep | Onboarding (step 1 only) |
| PinSetupStep | Onboarding (step 2 only) |
| MintSetupStep | Onboarding (step 3 only) |
| PayInputStep | Pay (step 1) |
| PayConfirmStep | Pay (step 2) |
| PayResultStep | Pay (step 3) |

---

## 4. SVG Icon Set Proposal (D-005)

### Icon Naming Convention
`icon-{category}-{name}.svg`

### Required Icons (24 total)

| # | File Name | Description | Current (emoji) |
|---|-----------|-------------|-----------------|
| 1 | `icon-nav-wallet.svg` | Wallet/balance | 💰 |
| 2 | `icon-nav-send.svg` | Send/arrow up | ⬆ |
| 3 | `icon-nav-receive.svg` | Receive/arrow down | ⬇ |
| 4 | `icon-nav-activity.svg` | History/list | 📄 |
| 5 | `icon-action-scan.svg` | QR scanner | — |
| 6 | `icon-action-settings.svg` | Settings/gear | — |
| 7 | `icon-action-copy.svg` | Copy to clipboard | — |
| 8 | `icon-action-share.svg` | Share | — |
| 9 | `icon-action-refresh.svg` | Refresh/reload | — |
| 10 | `icon-action-close.svg` | Close/cross | — |
| 11 | `icon-action-back.svg` | Back arrow | — |
| 12 | `icon-status-success.svg` | Checkmark | ✓ |
| 13 | `icon-status-error.svg` | Cross/circle-x | — |
| 14 | `icon-status-pending.svg` | Clock/hourglass | — |
| 15 | `icon-status-online.svg` | Cloud/connected | 🟢 |
| 16 | `icon-status-offline.svg` | Cloud-off/disconnected | 🔴 |
| 17 | `icon-brand-lightning.svg` | Lightning bolt | ⚡ |
| 18 | `icon-brand-lnw.svg` | LnwCash logo mark | — |
| 19 | `icon-type-mint.svg` | Mint/receive ecash | — |
| 20 | `icon-type-melt.svg` | Melt/send ecash | — |
| 21 | `icon-type-transfer.svg` | Transfer/swap | ⇄ |
| 22 | `icon-type-lightning.svg` | Lightning Network | — |
| 23 | `icon-ui-chevron.svg` | Chevron (expand) | — |
| 24 | `icon-ui-more.svg` | More/ellipsis | — |

### Icon Specifications
- **Format**: SVG (inline)
- **ViewBox**: `0 0 24 24`
- **Stroke**: `currentColor`
- **Stroke Width**: `2px`
- **Fill**: `none` (outline style)
- **Line Cap**: `round`
- **Line Join**: `round`

---

## 5. Component Props Patterns

### Button Props
```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled: boolean;
  loading: boolean;
  fullWidth: boolean;
  icon?: string;       // icon name
  iconPosition?: 'left' | 'right';
  onClick: () => void;
}
```

### Card Props
```typescript
interface CardProps {
  variant: 'default' | 'elevated' | 'outlined' | 'flat';
  padding: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  href?: string;
}
```

### Input Props
```typescript
interface InputProps {
  type: 'text' | 'number' | 'password' | 'url' | 'email';
  placeholder: string;
  value: string;
  disabled: boolean;
  error?: string;
  icon?: string;
  monospace?: boolean;  // for tokens/invoices
  onInput: (value: string) => void;
}
```

### Badge Props
```typescript
interface BadgeProps {
  variant: 'success' | 'warning' | 'error' | 'neutral' | 'info';
  size: 'sm' | 'md';
  dot?: boolean;        // just a colored dot
}
```

### Icon Props
```typescript
interface IconProps {
  name: string;         // maps to SVG file
  size?: number;        // default 24
  color?: string;       // default currentColor
}
```

### Toast Props
```typescript
interface ToastProps {
  message: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  duration: number;     // ms, default 3000
  action?: { label: string; onClick: () => void };
}
```

---

*End of Component Tree — 31 กรกฎาคม 2569*
