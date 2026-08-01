# LnwCash Wallet UX/UI Overhaul — UX Research Report
## INTENT-002 Phase 0 — TASK-041

**Author**: Reed Writer sub-agent  
**Date**: 31 กรกฎาคม 2569  
**Audience**: Minister Reed → Commander  
**Status**: DRAFT v1 — รอการ verify จาก Minister

---

# บทสรุปผู้บริหาร (Executive Summary)

งานวิจัยนี้ศึกษา UX/UI ของกระเป๋า Bitcoin/Cashu/Ecash จำนวน 7 ตัว เพื่อเป็นฐานข้อมูลสำหรับการ overhaul UX ของ LnwCash Wallet (INTENT-002) โดยวิเคราะห์จาก source code จริง, live website, GitHub repository, และเอกสาร specification ของ Cashu protocol

## ข้อค้นพบหลัก (Key Findings)

1. **ทุกกระเป๋า Cashu ที่ประสบความสำเร็จใช้แนวทาง simplicity-first** — Wallet of Satoshi พิสูจน์แล้วว่า "So easy your mum could use it" คือมาตรฐานทองคำของ Lightning wallet UX กระเป๋า Cashu ยังไม่มีตัวไหนที่ไปถึงระดับนั้น

2. **กระเป๋า Cashu ยังขาด identity ด้านภาพที่ชัดเจน** — cashu.me ใช้ดีไซน์เรียบแต่ไม่มี "brand moment" ที่น่าจดจำ Minibits ดูเป็น technical tool มากกว่า consumer app Nutstash มีความขี้เล่นแต่ก็ยังไม่ polished LnwCash มีโอกาสสร้าง brand identity ที่โดดเด่นในตลาดนี้

3. **Nostr integration กลายเป็นมาตรฐานอุตสาหกรรม** — กระเป๋า Cashu รุ่นใหม่ทุกตัวรวม Nostr (NIP-60/61) เป็นฟีเจอร์มาตรฐาน ไม่ใช่ตัวเลือกเสริม LnwCash Flutter ทำแล้ว แต่ LnwCash Svelte ยังไม่ได้ทำ

4. **P2P ecash transfer เป็น differentiator หลักของ Cashu** — การส่ง token ผ่านแชท, QR, NFC, air-gap คือสิ่งที่ Lightning ทำไม่ได้โดยตรง นี่ควรเป็นพระเอกของ UX

5. **Mint management เป็น pain point ที่ยังไม่มีใครแก้ได้ดี** — ผู้ใช้ต้องเลือก mint, ไว้ใจ mint, จัดการหลาย mint — UX ตรงนี้ยังซับซ้อนเกินไปสำหรับมือใหม่

---

# 1. ภาพรวมระบบนิเวศ Cashu Wallet (Ecosystem Landscape)

## 1.1 ขนาดตลาดและจำนวนผู้เล่น

จาก awesome-cashu (แหล่งที่มา #22) พบว่ามีกระเป๋า Cashu มากกว่า 50 ตัว ในจำนวนนี้:
- **Mobile-native**: cashu.me (iOS/Android), Minibits, Zeus, Macadamia (iOS), ElCaju (Flutter), Kashir (React Native)
- **PWA/Browser**: Nutstash, cashu.me (browser), eNuts, wallet.endfiat.money, Satoshi Pay
- **Desktop**: Harbor, malibu, Nutshell CLI
- **Hardware/Embedded**: Cashu Pixel (Raspberry Pi), Nucula (ESP32-C6 NFC)
- **AI Agent**: Ippon, cashu-agent, hexnuts, botwallets

ตลาดยังอยู่ในช่วง early adopter — จำนวนผู้ใช้จริงประเมินจาก GitHub stars และ community activity อยู่ในหลักพันถึงหมื่น ไม่ใช่หลักล้าน *(assumption — ไม่มีตัวเลขจริง)*

## 1.2 การแข่งขันและตำแหน่งทางการตลาด

| Wallet | Positioning | Target User | Maturity |
|--------|------------|-------------|----------|
| cashu.me | Reference wallet, official | Early adopters, devs | Beta |
| Minibits | Full-featured mobile | Nostr users, tippers | Production |
| Nutstash | PWA, privacy-first | Cypherpunks, privacy advocates | Early dev |
| Wallet of Satoshi | Mass adoption Lightning | Everyone ("your mum") | Production |
| Zeus | Power user, node manager | Node operators, advanced | Production |
| LnwCash Flutter | Thai-first, Nostr+Cashu | Thai Bitcoin community | Early beta |
| LnwCash Svelte | PWA, dev-focused | Developers, testers | Pre-alpha |

**ช่องว่างที่ LnwCash สามารถยึดได้**:
- ไม่มีใครทำ wallet ที่เป็น **Thai-first** อย่างจริงจัง (ภาษา, วัฒนธรรม, การใช้งาน)
- ไม่มีใครทำ **consumer-grade Cashu wallet** ที่สวยและง่ายเท่า Wallet of Satoshi
- Nostr integration ที่ seamless (NIP-60/61) + Cashu = unique combo
- PWA + Capacitor = cross-platform โดยไม่ต้องพึ่ง app stores

---

# 2. Per-Wallet Analysis

## 2.1 cashu.me — Reference Implementation

**แหล่งที่มา**: #15, #16, #17

### Screen Architecture
- **Home**: Balance card ใหญ่ตรงกลาง + Recent activity list
- **Receive**: Lightning Address QR + copy/share bottom sheet
- **Send**: 3 วิธี — paste token, scan QR, NFC tap
- **Settings**: Mint management, backup (seed + iCloud), theme

### UX Patterns ที่น่าสนใจ
1. **NFC tap-to-pay** — "Hold your phone near the receiver. The ecash token transfers over NFC in seconds." นี่คือ killer feature ที่ทำให้รู้สึกเหมือนใช้บัตรแตะจ่าย
2. **Token sharing via iMessage/SMS** — "Ecash is just text. Anywhere you can paste a string, you can send money." ลดแรงเสียดทานในการส่งเงินระหว่างบุคคล
3. **12-word seed backup** — "Twelve words back up your whole wallet, the same way Bitcoin does." ใช้ metaphor เดียวกับ Bitcoin ทำให้ผู้ใช้เข้าใจทันที
4. **Dark/Light mode** — แสดงทั้งสองโหมดใน screenshot การตลาด แสดงถึงความใส่ใจด้าน accessibility

### Weaknesses
- ไม่มี onboarding flow ที่ชัดเจน — ผู้ใช้ใหม่ต้องรู้ว่าต้องทำอะไร
- Mint management ซับซ้อน — ผู้ใช้ต้องเข้าใจว่า mint คืออะไร
- ไม่มี fiat conversion — เห็นแต่ sat

### Color & Typography
- Logo: รูปเงาคนบนพื้นหลัง gradient สีส้ม/เหลือง
- UI: Minimalist, ใช้พื้นที่ว่างมาก
- Typography: Sans-serif, เน้น readability
- **ไม่ได้ใช้ Bitcoin orange เป็น primary** — ใช้สีน้ำเงิน/เทาเป็นหลักใน dark mode

---

## 2.2 Minibits — Popular Cashu Mobile Wallet

**แหล่งที่มา**: #18, #19

### Screen Architecture
- **Home**: Balance + Lightning Address + Quick actions
- **Send**: Scan/Paste invoice, NFC tap, ecash token send
- **Receive**: Lightning Address QR, ecash token receive
- **Settings**: Mint management, NWC connections, backup
- **Ippon**: AI agent wallet (separate product)

### UX Patterns ที่น่าสนใจ
1. **Free Lightning Address** — "Get a human-readable Lightning address instantly — no sign-up or KYC required." สร้าง identity ให้ผู้ใช้ทันทีโดยไม่มีขั้นตอน registration
2. **Nostr Wallet Connect (NWC)** — "Built-in NWC lets you send tips (zaps) on Nostr social networks straight from your wallet." ผสาน social + payment
3. **NFC + Numo terminal** — รองรับการจ่ายที่ร้านค้าผ่าน NFC
4. **Recovery tool** — แยกเป็น microservice (recovery.minibits.cash) — ไม่ต้องพึ่ง wallet app ในการกู้คืน

### Weaknesses
- UI ดู technical — ไม่เหมาะกับผู้ใช้ทั่วไป
- ฟีเจอร์เยอะแต่จัดกลุ่มไม่ชัดเจน
- Ippon (AI wallet) แยกเป็นอีก product — fragment ecosystem

### Innovation: Ippon AI Agent Wallet
- REST API สำหรับ AI agents สร้าง wallet ได้ใน 1 HTTP call
- ไม่มี seed phrase, ไม่มี UI — ออกแบบให้ machine ใช้
- MCP server สำหรับ Claude/OpenAI integration
- **Implication สำหรับ LnwCash**: นี่คือ trend — wallet ไม่ได้มีไว้แค่มนุษย์อีกต่อไป

---

## 2.3 Nutstash — PWA Browser Wallet

**แหล่งที่มา**: #20, #21

### Screen Architecture
- **Wallet**: Multi-mint balance overview
- **Send**: Token generation with QR, Nostr DM send, clipboard
- **Receive**: Paste token, scan QR, Nostr DM receive
- **Swap**: Mint-to-mint swap
- **Settings**: Nostr keys, mint management, seed backup

### UX Patterns ที่น่าสนใจ
1. **Air-gapped animated QR** — ใช้ animated QR codes สำหรับส่ง token แบบไม่ต้องต่อเน็ต — "Send peer-to-peer ecash without leaving a trace"
2. **Nostr as transport layer** — ส่ง token ผ่าน Nostr DM โดยใช้ throwaway keys หรือ NIP-07 extension
3. **PWA install flow** — มีขั้นตอนชัดเจน: Open Mobile Browser → Browser Options → Save to Home Screen → Offline Access
4. **Honest about risks** — FAQ ตรงไปตรงมา: "Nutstash is an unfinished product" — transparency สร้าง trust

### Weaknesses
- **Unencrypted localStorage** — "The tokens in nutstash are stored in the browsers local storage. Unencrypted." — ความเสี่ยงด้าน security สูง
- PWA update risk — "if the server that ships nutstash gets compromised, so will every wallet"
- UI ไม่ polished — ดูเหมือน prototype มากกว่า product

### สิ่งที่ LnwCash เรียนรู้ได้
- Nutstash แสดงให้เห็นว่า PWA ทำได้ทุกอย่างที่ native app ทำได้ (รวมถึง offline)
- ความโปร่งใสเรื่องความเสี่ยงสร้างความน่าเชื่อถือ
- Multi-mint UX ยังเป็น pain point — ไม่มี wallet ไหนแก้ได้ดี

---

## 2.4 Wallet of Satoshi — Lightning UX Benchmark

**แหล่งที่มา**: #23

### Screen Architecture
- **Home**: Balance ใหญ่ + "Buy Bitcoin" button + Recent transactions
- **Pay**: Scan QR → Confirm → Done (3 steps)
- **Receive**: Lightning Address + QR
- **Top-up**: Buy Bitcoin in-app or receive from exchange

### ทำไม WoS ถึงสำเร็จ (Mass Adoption Factors)
1. **"So easy — your mum could use it"** — ไม่ใช่แค่ slogan แต่คือ design principle ทุกอย่าง
2. **Instant setup** — โหลดแอป, เปิด, มี Lightning Address ทันที ไม่ต้อง setup อะไร
3. **Simple Layout** — "Just what you need to see, and nothing you don't"
4. **Human-readable identity** — Lightning Address (`satoshi@walletofsatoshi.com`) จำง่ายกว่า hex string
5. **Scan → Confirm → Done** — 3 ขั้นตอนสำหรับการจ่าย ไม่มีอะไรเกิน
6. **In-app Bitcoin purchase** — ลดแรงเสียดทานในการได้มาซึ่ง Bitcoin
7. **Dual mode**: Custodial (ง่าย, email restore) + Self-custodial (คุม keys เอง)

### สิ่งที่ LnwCash เรียนรู้ได้
- WoS พิสูจน์ว่าความเรียบง่ายชนะทุกอย่าง — "your mum could use it" คือเป้าหมาย
- Lightning Address คือ identity layer ที่จำเป็น
- 3-step payment flow: Scan → Confirm → Done
- In-app on-ramp คือ game changer สำหรับ adoption
- Cashu wallet ทุกวันนี้ยังไม่มีตัวไหนที่ UX ดีเท่า WoS — นี่คือโอกาส

---

## 2.5 Zeus — Power User Lightning Wallet

**แหล่งที่มา**: #25

### Screen Architecture (จาก GitHub README)
- **Home**: Balance overview, recent activity, node status
- **Send**: Multiple methods (Lightning, on-chain, LNURL, Keysend)
- **Receive**: Invoice generation, Lightning Address
- **Node Management**: LND/Core Lightning connections, channel management
- **Settings**: Security center, Nostr NWC, themes, languages

### UX Patterns สำหรับ Power Users
1. **Multi-node management** — จัดการหลาย Lightning node ได้จากแอปเดียว
2. **Activity menu** — "Easy to use activity menu" — จัดกลุ่ม actions ตามประเภท
3. **Privacy mode** — ซ่อนข้อมูล sensitive ได้ (balance, transactions)
4. **NFC payments and requests** — ทั้งจ่ายและขอเงินผ่าน NFC
5. **Point of Sale** — มีโหมดขายของ (Standalone + Square integration)
6. **Security center** — รวมทุก setting ด้านความปลอดภัยไว้ที่เดียว
7. **Fiat currency integrations** — แสดงมูลค่าเป็นสกุลเงิน fiat

### Cashu Integration
- Zeus เพิ่งเพิ่ม Cashu support (อยู่ในรายชื่อ topics ของ repo)
- มี `cashu-cdk` directory ใน source — ใช้ CDK (Rust library)
- แสดงให้เห็นว่า Lightning wallet เจ้าใหญ่เริ่ม adopt Cashu แล้ว

### สิ่งที่ LnwCash เรียนรู้ได้
- "Activity menu" — การจัดกลุ่ม actions ช่วยลดความซับซ้อน
- Privacy mode — ผู้ใช้ขั้นสูงต้องการซ่อนยอดเงิน
- Security center — รวมเรื่องความปลอดภัยไว้ที่เดียว
- Cashu ไม่ได้แทน Lightning — แต่อยู่คู่กัน (complementary)

---

## 2.6 LnwCash Flutter — Existing Brand Reference

**แหล่งที่มา**: #10, #11, #12, #13

### Current Implementation
- **Framework**: Flutter 3.5+ with Material 3
- **Theme**: Customizable colorSchemeSeed (default: lightBlue)
- **Screens**: Wallet (balance + send/receive), History, QR Scanner, Settings
- **Navigation**: Bottom nav (Wallet, History) + FAB (QR scan) + Drawer (settings)
- **Nostr**: NIP-60 wallet storage, NIP-01 relay communication
- **Icons**: Iconly (custom) + Material Icons
- **Animation**: animate_do (FadeIn effects)
- **Version**: 0.1.3

### Brand Analysis
- **Tagline**: "Take Control of Your Satoshi with Ecash" — เน้น empowerment
- **Theme**: Material 3 with dynamic color — น่าสนใจแต่ขาด identity ที่ชัดเจน
- **Default color**: `Colors.lightBlue` (ไม่ใช่ Bitcoin orange) — **ขัดแย้งกับ Svelte version ที่ใช้ #f7931a**
- **Icons**: Iconly — สวย, modern, แต่ไม่มีเอกลักษณ์เฉพาะ
- **Type**: Default Material 3 typography — เรียบแต่ generic

### Key Innovation
- NIP-60 integration — wallet state อยู่บน Nostr relays, recover ได้จากทุก device
- EncryptedSharedPreferences — local encryption
- Multi-mint support ผ่าน cashu_dart
- Lightning + Ecash dual mode (receive/send ทั้ง lightning invoice และ ecash token)

### Brand Gap (LnwCash Flutter vs Svelte)
| Element | Flutter | Svelte | Recommended |
|---------|---------|--------|-------------|
| Primary Color | lightBlue (dynamic) | #f7931a | #f7931a (Bitcoin orange) |
| Icons | Iconly | Emoji | SVG custom set |
| Theme Engine | Material 3 colorSchemeSeed | Hardcoded CSS | Design tokens |
| Animation | animate_do FadeIn | None | Transition library |
| Font | Material default | system-ui | Custom Thai-friendly font |

---

## 2.7 LnwCash Svelte — Current State (Baseline)

**แหล่งที่มา**: #1-#9

### Current Screens
1. **F001-Register**: PIN setup (6-digit) or unlock
2. **F002-CreateWallet**: Wallet name + mint URLs (≥2 required)
3. **F003-Balance**: Total balance card + per-mint breakdown
4. **F004-Receive**: Mint URL input + invoice input → mint ecash
5. **F005-Pay**: Mint URL + invoice → melt to Lightning (2-step confirm)
6. **F006-Transfer**: Tabbed send/receive ecash tokens
7. **F007-QRScan**: Camera scanner overlay
8. **F008-History**: Filterable transaction list
9. **F009-LanguageSwitch**: TH/EN toggle

### UX Issues Identified
1. **ทุก screen แยก Mint URL** — ผู้ใช้ต้องกรอก mint URL ซ้ำใน F003, F004, F005, F006 → ควรมี mint management กลาง
2. **Emoji icons ใน Navigation** — `💰 ⬇ ⬆ ⇄ 📄` — ไม่สื่อความหมายชัดเจน และดูไม่ professional
3. **No fiat conversion** — เห็นแต่ sat ไม่มีมูลค่าเป็นบาท
4. **No Lightning Address** — ขาด human-readable identity
5. **No onboarding flow** — ผู้ใช้ใหม่เจอ PIN setup ทันที ไม่มีการอธิบายว่าแอปนี้คืออะไร
6. **Mint concept ไม่ถูกอธิบาย** — ผู้ใช้ต้องรู้ว่า mint คืออะไร, เลือก mint ไหน, ไว้ใจได้แค่ไหน
7. **Balance card ขาด visual hierarchy** — ตัวเลขใหญ่แต่ไม่มี context (เปลี่ยนแปลงเท่าไหร่, คิดเป็นกี่บาท)
8. **Transfer tab UX สับสน** — Send/Receive แยก tab แต่ทั้งคู่คือ "โอน" — ผู้ใช้สับสนระหว่าง Transfer กับ Pay/Receive

---

# 3. Common UX Patterns Across Cashu Wallets

## 3.1 Navigation Patterns
| Pattern | Wallets using | Recommendation |
|---------|--------------|----------------|
| Bottom Tab Bar (3-5 items) | cashu.me, Minibits, Nutstash, LnwCash | ใช้ 3-4 tabs |
| Floating Action Button (FAB) | LnwCash Flutter | สำหรับ QR scan |
| Drawer/Sidebar | LnwCash Flutter, Zeus | สำหรับ settings เท่านั้น |
| Swipe between tabs | Minibits | Optional enhancement |

## 3.2 Balance Display
| Pattern | Example | Notes |
|---------|---------|-------|
| Large number center | cashu.me, LnwCash, Minibits | Standard approach |
| Fiat conversion below | Wallet of Satoshi, Zeus | เพิ่ม context |
| Recent activity below balance | cashu.me, Minibits | Context + action |
| Hideable balance | Zeus (privacy mode) | สำหรับ power users |
| Per-mint breakdown | LnwCash, Nutstash | เฉพาะ multi-mint |

## 3.3 Receive Flow
| Method | Wallets | UX Complexity |
|--------|---------|---------------|
| Lightning Address | cashu.me, Minibits, WoS | ง่ายที่สุด |
| Lightning Invoice (manual amount) | All | ปานกลาง |
| Ecash token receive (paste) | All Cashu wallets | ซับซ้อน |
| QR code scan | All | ปานกลาง |
| NFC tap | cashu.me, Minibits | ง่าย |

## 3.4 Send/Pay Flow
| Method | Wallets | UX Complexity |
|--------|---------|---------------|
| Scan QR → Confirm → Done | WoS, all | ง่าย |
| Paste Lightning invoice | All | ปานกลาง |
| Paste Lightning Address + amount | WoS, Zeus | ปานกลาง |
| Create ecash token (P2P) | All Cashu wallets | ซับซ้อน |
| NFC tap-to-pay | cashu.me, Minibits | ง่าย |
| Air-gapped QR | Nutstash | ปานกลาง |

## 3.5 Security & Backup
| Method | Wallets | Notes |
|--------|---------|-------|
| 12/24-word BIP39 seed | cashu.me, Nutstash, Zeus | Bitcoin standard |
| PIN/biometric lock | All mobile wallets | Basic security |
| Encrypted cloud backup | cashu.me (iCloud experimental) | Convenient but risky |
| Email recovery | WoS (custodial mode) | Easiest but custodial |
| Nostr relay backup (NIP-60) | LnwCash Flutter | Decentralized |
| Encrypted local storage | LnwCash Svelte | IndexedDB + encryption |

---

# 4. Cashu-Specific UX vs Lightning UX

## 4.1 จุดแข็งของ Cashu UX
| Feature | Cashu | Lightning | UX Advantage |
|---------|-------|-----------|-------------|
| Token format | Text string (cashuA/B...) | Invoice string (lnbc...) | ทั้งคู่เป็น text — เท่าเทียม |
| P2P send | ได้ ผ่านแชท, QR, NFC | ไม่ได้ ต้องใช้ invoice | Cashu ง่ายกว่าสำหรับ P2P |
| Offline receive | ได้ Token สร้าง offline ได้ | ไม่ได้ ต้อง online | Cashu ดีกว่าสำหรับ offline |
| Privacy | ✅ Blind signatures | ❌ Sender/receiver visible | Cashu private กว่า |
| Account required | ไม่ต้อง | ไม่ต้อง (สำหรับ self-custody) | เท่าเทียม |
| Multi-mint | เลือก mint ได้ | ใช้ node เดียว | Cashu flexible กว่า |
| Fees | ต่ำ (ecash layer) | แปรผันตาม network | Cashu predictable กว่า |

## 4.2 จุดอ่อนของ Cashu UX
| Weakness | Impact | Mitigation |
|----------|--------|------------|
| Mint trust | ผู้ใช้ต้องไว้ใจ mint | Mint discovery + ratings + education |
| Token expiry | Token หมดอายุได้ (mint keys rotate) | Auto-refresh, notifications |
| Proof fragmentation | ยอดเงินแตกเป็น proofs ย่อยๆ | ซ่อน complexity — แสดงแต่ total |
| No Lightning Address (native) | ไม่มี human-readable identity | Lightning Address proxy service |
| Fewer merchants | รับชำระด้วย Cashu ได้น้อยกว่า | Focus on P2P + online merchants |
| Bearer instrument risk | token หลุด = เงินหาย | Encryption + backup education |

---

# 5. NUTs UX Impact Analysis

## NUT-00: Token Format
**สิ่งที่ผู้ใช้เห็น**: Token เป็นข้อความยาวๆ (V3: base64 JSON, V4: base64 CBOR) V4 token สั้นกว่า V3 ~30-40% → QR code เล็กลง สแกนง่ายขึ้น URI scheme `cashu:` ทำให้คลิกได้บนเว็บ

**ผลต่อ UX**:
- ✅ V4 adoption = QR code เล็กลง สแกนง่าย
- ⚠️ ผู้ใช้ไม่ควรต้องเห็น token string เลย — แค่ "คัดลอก" หรือ "แชร์" ก็พอ
- ⚠️ Token มี mint URL ฝังอยู่ — wallet ต้อง parse และ validate ให้ผู้ใช้

## NUT-04: Mint Tokens (Receive)
**สิ่งที่ผู้ใช้เห็น**: 2 ขั้นตอน — (1) ขอ quote → (2) รอจ่าย Lightning invoice → (3) mint ecash Quote มี expiry — ต้องรีบจ่ายก่อนหมดอายุ

**ผลต่อ UX**:
- ⚠️ ต้องมี loading states ระหว่าง quote → payment → minting
- ⚠️ ต้องแสดง quote expiry timer เพื่อไม่ให้ผู้ใช้เสียเวลา
- ✅ Mint แบบทยอยได้ (partial mint) — flexible

## NUT-05: Melt Tokens (Pay)
**สิ่งที่ผู้ใช้เห็น**: 2 ขั้นตอน — (1) ขอ melt quote → (2) ส่ง proofs → (3) รอ Lightning payment complete `fee_reserve` — ต้องมีเงินเผื่อค่าธรรมเนียม

**ผลต่อ UX**:
- ⚠️ ต้องแสดง fee breakdown: amount + fee_reserve + input_fee
- ⚠️ ถ้า async — ต้องมี "กำลังดำเนินการ..." พร้อม progress/polling
- ✅ WebSocket notification ทำให้ UX real-time ได้

## NUT-07: Token State Check
**สิ่งที่ผู้ใช้เห็น**: 3 สถานะ — UNSPENT (ใช้ได้), PENDING (กำลังดำเนินการ), SPENT (ใช้แล้ว) ใช้ตรวจสอบว่า token ที่ส่งไปให้เพื่อนถูก redeem แล้วหรือยัง

**ผลต่อ UX**:
- ✅ ใช้ทำ "ส่งแล้วหรือยัง?" — แสดงสถานะ token ที่ส่งไป
- ✅ ใช้จัดการกรณี Lightning payment ค้าง — restart wallet แล้วเช็คสถานะ
- ⚠️ ควรทำให้เป็น automatic — ผู้ใช้ไม่ต้องมากดเช็คเอง

## NUT-08: Lightning Fee Return
**สิ่งที่ผู้ใช้เห็น**: จ่าย Lightning invoice แล้วเหลือเงินทอน → ได้ ecash คืน (change) ผู้ใช้ไม่เห็นกระบวนการ — wallet จัดการให้

**ผลต่อ UX**:
- ✅ ต้องแสดง "เงินทอน" ใน receipt — ผู้ใช้ควรรู้ว่าเหลือเงินเท่าไหร่
- ✅ fee_reserve เป็นการประมาณการ — อาจไม่ตรงกับค่าธรรมเนียมจริง → ต้องอธิบาย
- ⚠️ ถ้าไม่คืน change → ผู้ใช้เสียเงิน → wallet ต้อง handle error นี้

---

# 6. Recommendations for INTENT-002

## 6.1 Strategic Priorities

### P0 — Must Have (เปลี่ยนทันที)
1. **Lightning Address** — human-readable identity (เช่น `name@lnw.cash`)
2. **Fiat conversion** — แสดงมูลค่าเป็นบาท (THB) ควบคู่กับ sat
3. **Mint management กลาง** — ไม่ต้องกรอก mint URL ซ้ำทุก screen
4. **SVG icon system** — แทน emoji ใน navigation และ UI
5. **Design tokens** — colors, spacing, typography ที่ reuse ได้

### P1 — High Impact
6. **Onboarding flow** — อธิบายว่า LnwCash คืออะไรก่อนขอ PIN
7. **Nostr NIP-60 integration** — wallet state on relays (เหมือน Flutter version)
8. **3-step payment flow** — Scan → Confirm → Done (ตาม WoS pattern)
9. **Balance card redesign** — เพิ่ม %change, fiat value, mini chart
10. **P2P ecash send via Thai social apps** — Line, Facebook Messenger integration

### P2 — Differentiators
11. **NFC tap-to-pay** — ตาม cashu.me/Minibits
12. **Mint rating/discovery** — ช่วยผู้ใช้เลือก mint
13. **In-app on-ramp** — ซื้อ Bitcoin ในแอป (ผ่าน partner)
14. **Air-gapped QR** — animated QR for offline P2P

## 6.2 Brand Direction

### Color System
```
Primary:     #F7931A (Bitcoin Orange) — energy, trust, Bitcoin identity
Secondary:   #1A1A2E (Deep Navy) — stability, security, night mode base
Accent:      #FFAB40 (Warm Amber) — highlights, CTAs, gradients
Success:     #28A745 (Green) — confirmed transactions
Warning:     #FFC107 (Amber) — pending, offline
Error:       #E74C3C (Red) — failed, alerts
Surface:     #FAFAFA (Light grey) — cards, backgrounds
```

### Typography
- **Thai + English**: ใช้ฟอนต์ที่รองรับทั้งไทยและอังกฤษใน family เดียวกัน
- **Headings**: Bold, ใช้สี primary หรือ white (บน dark bg)
- **Body**: Regular, readability-first, line-height 1.5+
- **Monospace**: สำหรับ token, invoice, mint URL

### Design Principles
1. **Simplicity First** — "So easy your mum could use it"
2. **Thai-First** — ภาษาไทยนำ, อังกฤษเสริม
3. **Ecash is Cash** — ทำให้รู้สึกเหมือนใช้เงินสด: เร็ว, private, จับต้องได้
4. **Trust Through Transparency** — แสดง fee ชัดเจน, mint status ชัดเจน, ไม่ซ่อนความเสี่ยง

---

# 7. Assumptions & Limitations

## Assumptions Marked
1. **LnwCash Flutter colors**: ไม่มีไฟล์ theme แยก — สีมาจาก Material 3 `colorSchemeSeed` และ hardcoded ใน widget → สรุปว่า theme ยังไม่ถูกรวมศูนย์
2. **LnwCash website (lnw.cash)**: ได้แค่ title จาก webfetch — **ไม่สามารถเข้าถึงเนื้อหาเต็มของ live site ได้** (อาจต้องใช้ browser จริง)
3. **Zeus website (zeusln.com)**: ต้องใช้ JavaScript — **ไม่สามารถ fetch เนื้อหาได้** — ข้อมูลจาก GitHub repo เท่านั้น
4. **จำนวนผู้ใช้จริง**: ประเมินจาก GitHub stars, community activity — **ไม่ใช่ตัวเลขจริง**
5. **NUT-08 adoption**: ไม่รู้ว่ามีกี่ mint ที่ implement — **assume ทุก mint ทำ**
6. **Svelte codebase**: อ่านจาก source code เท่านั้น — **ไม่ได้ run จริง**

## Limitations
- ไม่ได้ทดลองใช้กระเป๋าจริง (ไม่ได้ install wallet บนอุปกรณ์) — UX analysis จาก screenshot + documentation
- ไม่ได้สัมภาษณ์ผู้ใช้ — ไม่มีข้อมูล qualitative feedback
- เวลาจำกัด — ไม่ได้อ่านทุก commit/locale/component ของทุก wallet
- Zeus: เนื้อหา live site เข้าถึงไม่ได้ (JS-only) — ใช้ข้อมูลจาก GitHub README

---

*End of Report — 31 กรกฎาคม 2569*
