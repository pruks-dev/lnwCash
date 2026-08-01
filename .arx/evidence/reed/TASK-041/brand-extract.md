# Brand Extract — LnwCash Design Tokens
## TASK-041 | INTENT-002 Phase 0

**Source**: LnwCash Svelte codebase, LnwCash Flutter repo, Lnw.cash landing page

---

## 1. Color Palette

### Primary Colors (จาก Svelte codebase — source #1-#8)

| Token | Hex | Usage | Source |
|-------|-----|-------|--------|
| `--color-primary` | `#F7931A` | Bitcoin Orange — buttons, active nav, titles | F003-Balance, F005-Pay, Navigation, vite.config.ts |
| `--color-primary-hover` | `#E6820F` | Button hover state | F001-Register |
| `--color-primary-light` | `#F7931A20` | Balance card gradient start | F003-Balance |
| `--color-primary-lighter` | `#F7931A05` | Balance card gradient end | F003-Balance |
| `--color-primary-border` | `#F7931A30` | Balance card border | F003-Balance |
| `--color-primary-glow` | `rgba(247,147,26,0.4)` | Splash logo shadow | SplashScreen |

### Secondary / Background Colors

| Token | Hex | Usage | Source |
|-------|-----|-------|--------|
| `--color-bg` | `#FAFAFA` | Page background | app.css |
| `--color-surface` | `#FFFFFF` | Cards, nav bar | Navigation, F003-Balance |
| `--color-surface-hover` | `#F9F9F9` | Mint list items, tx items | F003-Balance, F008-History |
| `--color-surface-alt` | `#F8F8F8` | Tab inactive bg | F006-Transfer |
| `--color-input-bg` | `#F5F5F5` | Disabled input bg | Multiple screens |

### Dark Theme (Splash Screen)

| Token | Hex | Usage | Source |
|-------|-----|-------|--------|
| `--color-dark-bg-start` | `#1A1A2E` | Splash gradient start | SplashScreen, app.css (text) |
| `--color-dark-bg-end` | `#16213E` | Splash gradient end | SplashScreen |
| `--color-dark-text` | `#FFFFFF` | Splash title | SplashScreen |
| `--color-dark-text-dim` | `rgba(255,255,255,0.6)` | Splash tagline | SplashScreen |

### Semantic Colors

| Token | Hex | Usage | Source |
|-------|-----|-------|--------|
| `--color-success-bg` | `#D4EDDA` | Success card bg | F004-Receive, F005-Pay |
| `--color-success-text` | `#155724` | Success card text | F004-Receive, F005-Pay |
| `--color-success-border` | `#C3E6CB` | Success card border | F004-Receive |
| `--color-success-btn` | `#28A745` | Action button | F004-Receive |
| `--color-error-text` | `#E74C3C` | Error messages | All screens |
| `--color-error-bg` | `#FDEAEA` | Error message bg | All screens |
| `--color-error-status` | `#C0392B` | Failed status text | F008-History |
| `--color-warning-bg-start` | `#FFF3CD` | Offline banner gradient start | OfflineIndicator |
| `--color-warning-bg-end` | `#FFEBA` | Offline banner gradient end | OfflineIndicator |
| `--color-warning-text` | `#856404` | Offline banner text | OfflineIndicator |
| `--color-warning-border` | `#FFC107` | Offline banner border | OfflineIndicator |

### Neutral/UI Colors

| Token | Hex | Usage | Source |
|-------|-----|-------|--------|
| `--color-border` | `#E0E0E0` | Input borders | F004-Receive, F005-Pay |
| `--color-border-light` | `#EEE` | Card borders, nav border | F003-Balance, Navigation |
| `--color-border-muted` | `#CCC` | Reset button border | F006-Transfer |
| `--color-text` | `#1A1A2E` | Body text (dark) | app.css |
| `--color-text-secondary` | `#555` | Labels, secondary text | Multiple screens |
| `--color-text-muted` | `#888` | Nav inactive, filter inactive | Navigation, F008-History |
| `--color-text-dim` | `#AAA` | Loading, empty state | F003-Balance, F008-History |
| `--color-text-dimmer` | `#BBB` | Mint URL in tx | F008-History |
| `--color-text-subtle` | `#666` | Prompt text | F001-Register |
| `--color-bg-light` | `#F0F0F0` | Filter buttons, token display | F008-History, F006-Transfer |

### LnwCash Flutter Colors (source #10, #11, #12)

| Token | Value | Usage | Source |
|-------|-------|-------|--------|
| Default seed color | `Colors.lightBlue` | Material 3 colorSchemeSeed | main.dart |
| Wallet gradient start | `surfaceContainerHighest` | Page bg gradient start | walletpage.dart |
| Wallet gradient end | `surfaceContainerLowest` | Page bg gradient end | walletpage.dart |
| Balance amount | `colorScheme.primary` | Balance display | walletpage.dart |
| Section titles | `colorScheme.primary` | History title | walletpage.dart |
| Button border | `colorScheme.secondary` | Send/Receive button border | walletpage.dart |
| Button icon | `colorScheme.secondary` | Send/Receive button icon | walletpage.dart |
| SnackBar success | `Colors.green` | Transaction received | walletpage.dart |
| SnackBar error | `Colors.red` | Transaction sent/error | walletpage.dart |
| FAB shadow | `colorScheme.primary` | Bottom nav shadow | walletpage.dart |

### Brand Color Conflict
**ISSUE**: Svelte version ใช้ `#F7931A` (Bitcoin Orange) แต่ Flutter version ใช้ `Colors.lightBlue` เป็น default — **ต้อง unified เป็นสีเดียวกัน**

### Recommendation
ใช้ `#F7931A` (Bitcoin Orange) เป็น primary ทั้งสอง platform เพราะ:
1. Bitcoin brand recognition ที่แข็งแกร่งที่สุด
2. Svelte codebase ใช้แล้ว — consistency
3. Flutter version มี dynamic color อยู่แล้ว — เปลี่ยน default seed ได้

---

## 2. Typography

### Font Family (Svelte — source: app.css)
```css
font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

### Font Family (Flutter — source: pubspec.yaml)
ใช้ Material 3 default typography — ไม่มี custom font loaded

### Font Sizes (จาก Svelte screens)

| Token | Size | Weight | Usage | Source |
|-------|------|--------|-------|--------|
| `--text-2xl` | `2.5rem` | 800 | Balance amount | F003-Balance |
| `--text-splash-title` | `1.8rem` | 800 | Splash title | SplashScreen |
| `--text-xl` | `1.5rem` | — | Register title | F001-Register |
| `--text-lg` | `1.3rem` | — | Screen titles | F003-Balance, etc. |
| `--text-base` | `1rem` / `0.95rem` | 600-700 | Body, buttons | Multiple |
| `--text-sm` | `0.85rem` - `0.9rem` | 600 | Labels, secondary | Multiple |
| `--text-xs` | `0.8rem` | 600 | Filter buttons | F008-History |
| `--text-2xs` | `0.75rem` | 600 | Status badges | F003-Balance |
| `--text-3xs` | `0.7rem` | 600 | Nav labels, tx dates | Navigation, F008-History |
| `--text-tiny` | `0.65rem` | — | Mint URL in tx list | F008-History |

### Font Weights Used
- 400: Body text (default)
- 600: Labels, buttons, secondary text
- 700: Bold emphasis, amounts, button text
- 800: Extra bold — balance display, splash title

### Typography Recommendations
- เพิ่ม custom font ที่รองรับ Thai + English (เช่น **Sarabun**, **Noto Sans Thai**, **IBM Plex Sans Thai**)
- Monospace font สำหรับ token/invoice: `'Courier New', monospace` → พิจารณา **JetBrains Mono** หรือ **Fira Code**

---

## 3. Spacing / Layout Tokens

### Screen Layout (จาก Svelte screens)
```css
max-width: 420px (mobile-first)
margin: 0 auto
padding: 1.5rem (screen padding)
```

### Spacing Scale (inferred from codebase)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `0.2rem` | Nav icon gap |
| `--space-sm` | `0.35rem` | Input group gap |
| `--space-md` | `0.5rem` | List gaps, badge padding |
| `--space-lg` | `0.75rem` | Card gaps, button row gap |
| `--space-xl` | `1rem` | Section gaps, form gaps |
| `--space-2xl` | `1.5rem` | Screen padding, title margin |
| `--space-3xl` | `2rem` | Balance card padding |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `8px` | Error messages, token display |
| `--radius-md` | `10px` | Inputs, buttons (secondary), tabs, refresh btn |
| `--radius-lg` | `12px` | Primary buttons, tx items |
| `--radius-xl` | `16px` | Cards (balance, success, confirm, result) |
| `--radius-pill` | `20px` | Filter buttons, status badges |
| `--radius-splash` | `24px` | Splash logo |

### Shadow Tokens

| Token | Value | Usage | Source |
|-------|-------|-------|--------|
| `--shadow-nav` | `0 -2px 10px rgba(0,0,0,0.05)` | Bottom nav | Navigation |
| `--shadow-splash` | `0 8px 32px rgba(247,147,26,0.4)` | Splash logo glow | SplashScreen |

---

## 4. Component Style Tokens

### Button Styles

**Primary Button** (ใช้ใน F001, F003-F006):
```css
padding: 0.85rem
background: #F7931A
color: white
font-weight: 700
border-radius: 12px
border: none
```
Hover: `background: #E6820F`
Disabled: `opacity: 0.5`

**Secondary/Outline Button** (ใช้ใน F003, F005, F008):
```css
padding: 0.6rem 1.5rem
background: white
color: #F7931A
border: 2px solid #F7931A
border-radius: 10px
font-weight: 600
```

**Scan Button** (ใช้ใน F004, F005):
```css
padding: 0.85rem 1.25rem
background: white
color: #F7931A
border: 2px solid #F7931A
border-radius: 12px
```

### Input Styles
```css
padding: 0.7rem 0.85rem
border: 2px solid #E0E0E0
border-radius: 10px
font-family: monospace
```
Focus: `border-color: #F7931A`
Disabled: `opacity: 0.6, background: #F5F5F5`

### Card Styles

**Balance Total Card**:
```css
padding: 2rem 1rem
background: linear-gradient(135deg, #F7931A20, #F7931A05)
border-radius: 16px
border: 1px solid #F7931A30
```

**Success Card**:
```css
background: #D4EDDA
border-radius: 16px
border: 1px solid #C3E6CB
```

**Confirm Card** (Pay):
```css
background: #FFF8F0
border-radius: 16px
border: 1px solid #F7931A40
```

**Result Card** (Transfer):
```css
background: #FFF8F0
border-radius: 16px
border: 1px solid #F7931A40
```

### Navigation
```css
Bottom nav: flex row, space-around
Background: white
Border-top: 1px solid #EEE
Padding: 0.5rem 0
Shadow: 0 -2px 10px rgba(0,0,0,0.05)
Active color: #F7931A
Inactive color: #888
```

---

## 5. Icon Style Guide

### Current State
- **Svelte**: ใช้ emoji (💰 ⬇ ⬆ ⇄ 📄 ⚡ 🔴 🟢 ✓ 📋 ❓)
- **Flutter**: ใช้ Iconly + Material Icons (`IconlyLight.arrow_down`, `Icons.wallet`, `Icons.format_list_bulleted`, `Icons.qr_code_scanner`)

### Recommendation
เปลี่ยนจาก emoji เป็น SVG custom icon set:
- สร้าง icon ในสไตล์เดียวกันทั้งหมด
- ขนาด base: 24×24px
- Stroke width: 2px (outline style)
- สี: inherited จาก parent (`currentColor`)
- สอดคล้องกับ Bitcoin/Cashu ecosystem iconography

**Icon Set ที่ต้องมี**:
- Wallet/Balance (💰 แทน)
- Receive/Arrow Down (⬇ แทน)
- Send/Arrow Up (⬆ แทน)
- Transfer/Swap (⇄ แทน)
- History/List (📄 แทน)
- QR Scan
- Settings/Gear
- Lightning bolt (⚡ — ใช้ใน splash)
- Checkmark (✓ — success)
- Close/Cross
- Copy
- Refresh
- Offline/Cloud-off
- Online/Cloud

---

## 6. Dark/Light Mode Tokens

### Light Mode (Current)
| Property | Value |
|----------|-------|
| Background | `#FAFAFA` |
| Surface | `#FFFFFF` |
| Text Primary | `#1A1A2E` |
| Text Secondary | `#555` |
| Text Muted | `#888` |
| Border | `#E0E0E0` |
| Primary | `#F7931A` |

### Dark Mode (Proposed — ยังไม่มีใน Svelte version)
| Property | Value |
|----------|-------|
| Background | `#0D1117` |
| Surface | `#1A1A2E` |
| Text Primary | `#FFFFFF` |
| Text Secondary | `#AAAAAA` |
| Text Muted | `#666666` |
| Border | `#2A2A3E` |
| Primary | `#F7931A` (คงเดิม) |

**หมายเหตุ**: Splash screen ใน Svelte version ใช้ dark theme เป็น baseline แล้ว (`#1A1A2E` → `#16213E` gradient) — สามารถ extend เป็น full dark mode ได้

---

## 7. Motion Tokens (Proposed — ยังไม่มี)

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `150ms ease` | Button hover, input focus |
| `--transition-base` | `200ms ease` | Nav active, tab switch |
| `--transition-slow` | `300ms ease` | Card appear, modal open |
| `--easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Material standard |

---

*End of Brand Extract — 31 กรกฎาคม 2569*
