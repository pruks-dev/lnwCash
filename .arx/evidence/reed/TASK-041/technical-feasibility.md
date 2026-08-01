# Technical Feasibility Assessment — LnwCash Wallet (INTENT-002)
## TASK-041

---

## 1. What CAN Be Done in Svelte + Capacitor + PWA

### ✅ Confirmed Feasible (Already Working in Current Codebase)

| Feature | Implementation | Status | Evidence |
|---------|---------------|--------|----------|
| Hash-based routing | `src/lib/router.ts` — hashchange events | ✅ Working | Source #3 |
| IndexedDB storage | `src/lib/storage/db.ts` — via `idb` library | ✅ Working | Source #8 |
| LocalStorage fallback | `src/lib/storage/local.ts` | ✅ Working | Source #8 |
| PWA with service worker | `vite-plugin-pwa` — Workbox caching | ✅ Working | Source #7 |
| QR scanning | `capacitor-barcode-scanner` v8.0.0 | ✅ Integrated | Source #8 |
| Secure storage (native) | `capacitor-secure-storage-plugin` v0.13.0 | ✅ Integrated | Source #8 |
| i18n (TH/EN) | `svelte-i18n` v4.0.1 — 120 keys each | ✅ Working | Source #4, #5 |
| Offline detection | `src/lib/offline-indicator.ts` | ✅ Working | Source #1 |
| Cashu crypto (blind sigs) | `@noble/curves`, `@noble/hashes` | ✅ Working | Source #8 |
| Cashu token encode/decode | `src/lib/cashu/token.ts` | ✅ Working | Source #1, #8 |
| Cashu mint client | `src/lib/cashu/client.ts` | ✅ Working | Source #1 |
| Android build | Capacitor Android v8.4.2 | ✅ Working | Source #8, Gradle scripts |
| APK generation | `scripts/build-apk.sh` | ✅ Working | Source #8 |

### ✅ Feasible (Requires Implementation — No Blockers)

| Feature | How to Implement | Risk Level |
|---------|-----------------|------------|
| SVG icon system | Svelte components that render inline SVG — no library needed | Low |
| Design tokens (CSS vars) | `:root { --color-primary: #F7931A; }` in `app.css` | Low |
| Dark/light mode | CSS custom properties + `prefers-color-scheme` media query | Low |
| Fiat conversion (THB) | Fetch from API (e.g., Coingecko, Binance) — simple HTTP call | Low |
| Lightning Address | Need LNURL-pay server (or proxy service) — backend dependency | Medium |
| Mint management central | Refactor mint URL from per-screen to shared store | Low |
| Onboarding wizard | Multi-step form — pure Svelte component | Low |
| Transaction history with filters | Already have `F008-History` — needs UI polish | Low |
| Toast/notification system | Svelte store + portal component | Low |
| Bottom sheet | CSS animation + portal | Low |
| QR code generation | `qrcode` npm library (pure JS, lightweight) | Low |
| Clipboard API | `navigator.clipboard.writeText()` — already used in F006-Transfer | Low |
| Pull-to-refresh | CSS + touch events or use `@sveltejs/gestures` | Low |
| Swipe navigation | Touch event handling or Swiper.js | Low |
| Biometric auth | `capacitor-biometric` plugin (if needed for PIN alternative) | Low |
| Deeplink handling | Capacitor `App` plugin + URL scheme registration | Low |

---

## 2. What Needs Additional Libraries (Flag for Commander)

### ⚠️ Libraries to Add

| Need | Library | Reason | Risk |
|------|---------|--------|------|
| QR code generation | `qrcode` (~30KB) | Generate QR for Lightning Address, invoice, ecash token | Low — well-maintained |
| Chart (mini balance chart) | `chart.js` + `svelte-chartjs` or lightweight SVG | Optional — balance trend visualization | Medium — adds bundle size |
| Animation library | `svelte/transition` (built-in) or `@sveltejs/motion` | Already built into Svelte — no external dependency | Low |
| Date formatting | `date-fns` or `luxon` (tree-shakeable) | Better than native `Date` for Thai locale formatting | Low |
| HTTP client | Native `fetch` API — no external library needed | Already used in `client.ts` | Low |
| State management | Svelte 5 runes (`$state`) — already using, no external needed | Current codebase uses runes | Low |
| Nostr (NIP-60/61) | `nostr-tools` (~50KB) or custom WebSocket | Needed for Nostr integration — **Commander decision** | Medium |
| NFC | Web NFC API (Chrome only) or Capacitor plugin | tap-to-pay feature — browser-limited | High |
| WebSocket | Native `WebSocket` API — no library needed | For real-time mint quote updates (NUT-05 async) | Low |

### ❌ Libraries to AVOID
- **Tailwind CSS** — เพิ่ม build complexity, current vanilla CSS works fine for mobile-first app
- **SvelteKit** — overkill สำหรับ SPA PWA, current Vite setup เพียงพอ
- **Redux/Zustand** — Svelte 5 runes (`$state`) เพียงพอสำหรับ state management
- **Axios** — `fetch` API เพียงพอ, ลด bundle size
- **Moment.js** — deprecated, ใช้ `date-fns` หรือ `Intl.DateTimeFormat`

---

## 3. Browser Compatibility

### Target Browsers
| Browser | Version | PWA Support | Web Crypto | IndexedDB | Web NFC |
|---------|---------|-------------|------------|-----------|---------|
| Chrome Android | 90+ | ✅ Full | ✅ | ✅ | ✅ (if enabled) |
| Safari iOS | 15+ | ✅ (limited) | ✅ | ✅ | ❌ |
| Samsung Internet | 16+ | ✅ | ✅ | ✅ | ❌ |
| Firefox Android | 120+ | ✅ | ✅ | ✅ | ❌ |
| Chrome Desktop | 90+ | ✅ | ✅ | ✅ | ❌ |

### Critical APIs Used
| API | Support | Fallback |
|-----|---------|----------|
| Web Crypto (`SubtleCrypto`) | 96%+ global | ❌ No fallback — essential for Cashu crypto |
| IndexedDB | 95%+ global | LocalStorage fallback (already implemented) |
| Service Worker (PWA) | 95%+ global | App works without — just no offline caching |
| `navigator.clipboard` | 92%+ global | Manual select + copy fallback |
| `navigator.onLine` | 100% | Already used in offline indicator |
| Web NFC | ~70% (Chrome Android only) | Manual paste/scan fallback |

**Conclusion**: All core features work on 95%+ of mobile browsers. NFC is the only Chrome-only feature.

---

## 4. Performance Considerations

### Bundle Size Budget (Target)
| Asset | Current (estimated) | Target | Notes |
|-------|---------------------|--------|-------|
| JS (initial) | ~150KB gzipped | <200KB | Svelte compiles small |
| CSS | ~10KB gzipped | <30KB | Scoped styles per component |
| Icons (SVG) | N/A (emoji) | <20KB | 24 icons × ~800B each |
| Fonts | 0 (system fonts) | <50KB (if custom) | Only if custom Thai font |
| Total initial | ~160KB | <300KB | Acceptable for mobile |

### Performance Targets
| Metric | Target | How |
|--------|--------|-----|
| First Contentful Paint | <1.5s | Minimal initial JS, inline critical CSS |
| Time to Interactive | <2.5s | Defer non-critical code |
| Balance load | <500ms | IndexedDB local, mint API cached |
| Transaction list (100 items) | <200ms render | Virtual list if needed |
| QR scan startup | <1s | Preload camera permissions |

### Optimization Strategies
1. **Code splitting**: Lazy-load screens (Svelte `{#if}` blocks already do this)
2. **Icon tree-shaking**: Only bundle used icons
3. **IndexedDB**: Use for all persistent data — avoid localStorage for large datasets
4. **Service Worker caching**: Already configured in `vite.config.ts` — cache static assets 7 days, mint API 5 min
5. **Image optimization**: SVG only — no raster images needed

---

## 5. Mobile-Specific Concerns

### Capacitor Integration
| Concern | Solution | Status |
|---------|----------|--------|
| Android APK size | Svelte bundles are small — APK ~5-10MB | ✅ Acceptable |
| iOS support | Capacitor supports iOS — not yet configured | ⚠️ Need to add iOS platform |
| Keyboard handling | `capacitor-keyboard` plugin or CSS `visualViewport` | ⚠️ Test on real devices |
| Safe area (notch) | CSS `env(safe-area-inset-*)` | ⚠️ Need to implement |
| Back button (Android) | Capacitor `App` plugin — handle back navigation | ⚠️ Need to implement |
| Status bar | Capacitor `StatusBar` plugin — match theme | ⚠️ Need to implement |
| Deep links | `capacitor://` scheme + intent filters | ⚠️ Need to implement |
| Push notifications | `capacitor-push-notifications` — for payment confirmations | ⚠️ Future feature |
| Background sync | Service Worker Background Sync API | ⚠️ Future feature |

### PWA-Specific Concerns
| Concern | Solution | Status |
|---------|----------|--------|
| Install prompt | Already implemented — `PwaInstallPrompt.svelte` | ✅ Working |
| Offline mode | Already working — offline detection + limited features | ✅ Working |
| iOS PWA limitations | No background sync, no push (until iOS 17.4+) | ⚠️ Known limitation |
| Storage persistence | IndexedDB may be evicted under storage pressure | ⚠️ Need `navigator.storage.persist()` |
| Update flow | `vite-plugin-pwa` auto-update — already configured | ✅ Working |
| Splash screen | Already implemented — `SplashScreen.svelte` | ✅ Working |

### Thai Market Specific
| Concern | Solution | Status |
|---------|----------|--------|
| Thai font rendering | system-ui includes Thai fonts on all platforms | ✅ Good enough |
| Line app integration | Line URI scheme for sharing tokens | ⚠️ Need to implement |
| Thai QR payment (PromptPay) | Not applicable (Bitcoin wallet) | N/A |
| True/DTAC network issues | Offline-first architecture handles this | ✅ Already working |
| Low-end devices | Svelte is lightweight — works on 2GB RAM devices | ✅ Should be fine |

---

## 6. Architecture Decisions (For Commander)

### Decision 1: Nostr Integration
**Question**: Should we add NIP-60/61 (Nostr wallet storage)?

**Analysis**:
- Flutter version already has it — feature parity
- Enables wallet backup/recovery via Nostr relays
- Adds ~50KB bundle size (nostr-tools)
- Requires WebSocket connections to relays

**Recommendation**: ✅ ADD — but as optional, user-enabled feature. Not required for basic wallet functionality.

### Decision 2: NFC Support
**Question**: Should we implement NFC tap-to-pay?

**Analysis**:
- Only works on Chrome Android (~70% of Android users)
- No iOS support (Apple limits NFC to Apple Pay)
- Killer feature for in-person payments

**Recommendation**: ⚠️ DEFER to P2 — implement basic wallet first, add NFC later.

### Decision 3: Custom Font
**Question**: Should we bundle a custom Thai + English font?

**Analysis**:
- `system-ui` already renders Thai well on all platforms
- Adding a font adds ~50-100KB to bundle
- Brand differentiation vs performance

**Recommendation**: ⚠️ DEFER — use system fonts for v1, consider **Sarabun** or **Noto Sans Thai** for v2.

### Decision 4: Lightning Address Server
**Question**: Do we need to run an LNURL-pay server for `@lnw.cash` addresses?

**Analysis**:
- Required for human-readable Lightning Address
- Adds backend dependency (not just client-side)
- Could use existing service (e.g., Minibits-style proxy)

**Recommendation**: ⚠️ NEED COMMANDER DECISION — client-side UI ready, but server infrastructure needed.

---

## 7. Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| IndexedDB data loss | Medium | High | Implement `navigator.storage.persist()` + seed backup |
| Mint API downtime | High | Medium | Multi-mint fallback, offline queue |
| PWA update breaks storage | Low | High | Data migration scripts, versioned storage schema |
| iOS PWA killed by Apple | Low | Critical | Capacitor native build as fallback |
| Cashu protocol breaking changes | Medium | Medium | Version negotiation, NUT feature detection |
| Thai language CSS issues | Low | Low | Test on real devices, use `word-break: keep-all` |

---

*End of Technical Feasibility — 31 กรกฎาคม 2569*
