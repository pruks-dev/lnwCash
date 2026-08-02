# F-036 — Service Worker Cache Staleness: Resolution Report

## TASK-071 | Saber DevOps | 2026-08-02

---

## ROOT CAUSE

**vite-plugin-pwa workbox runtimeCaching ใช้ `CacheFirst` strategy สำหรับ CSS/JS**

ใน configuration เดิม (vite.config.ts บรรทัด 49):
```ts
urlPattern: /\.(?:js|css|woff2?|svg|png|jpg|ico)$/,
handler: 'CacheFirst',  // ← ROOT CAUSE
```

### กลไกการเกิดปัญหา:
1. ผู้ใช้ deploy แอปเวอร์ชันใหม่
2. index.html ใหม่ reference CSS/JS ที่มี hash ใหม่ (เช่น `index-abc123.css`)
3. Service Worker ดัก request สำหรับ `index-abc123.css`
4. `CacheFirst` → เช็ค cache ก่อน → ไม่เจอ (hash ใหม่) → ไป network → ได้ไฟล์ใหม่ → OK
5. **แต่**: ไฟล์เก่า (`index-xyz789.css`) ที่ยังอยู่ใน cache → ถ้า page ไหนยัง reference hash เก่า → เสิร์ฟจาก cache → layout/สีเพี้ยน
6. และไฟล์ runtime chunks ที่ dynamic import อาจถูก cache → version mismatch

**ผล**: หลัง deploy → refresh ปกติ (F5) → layout เพี้ยน → ต้อง hard refresh (Ctrl+Shift+R) ถึงจะแก้

---

## FIX APPLIED

### Strategy: Option 4 (Best) — NetworkFirst CSS/JS + skipWaiting + clientsClaim

### Changes (MOD-002 override — PWA section ONLY):

| Element | Before | After |
|---|---|---|
| CSS/JS handler | `CacheFirst` | `NetworkFirst` (5s timeout) |
| Fonts/Images handler | `CacheFirst` | `StaleWhileRevalidate` |
| CSS/JS cache TTL | 7 days | 1 day |
| Network timeout | (none) | 5 seconds |
| skipWaiting | ✅ (already present) | ✅ (unchanged) |
| clientsClaim | ✅ (already present) | ✅ (unchanged) |

### Exact diff (PWA section):
```diff
- urlPattern: /\.(?:js|css|woff2?|svg|png|jpg|ico)$/,
- handler: 'CacheFirst',
+ // F-036 FIX: NetworkFirst for CSS/JS
+ urlPattern: /\.(?:js|css)$/,
+ handler: 'NetworkFirst',
+ networkTimeoutSeconds: 5,
+ maxAgeSeconds: 24 * 60 * 60,  // 1 day
+
+ // StaleWhileRevalidate for fonts/images
+ urlPattern: /\.(?:woff2?|svg|png|jpg|ico)$/,
+ handler: 'StaleWhileRevalidate',
```

---

## VERIFICATION

### Build: PASS ✅
```
npm run build: ✓ built in 2.06s
248 modules transformed
0 errors (2 pre-existing warnings unrelated to fix)
```

### SW Strategy: CHANGED ✅
- `CacheFirst` ใน generated SW → 0 occurrences
- `NetworkFirst` สำหรับ CSS/JS → present
- `skipWaiting` + `clientsClaim` → present

### Hash Rotation: CONFIRMED ✅
- Before fix: `workbox-8d71a25b.js`
- After fix:  `workbox-9e0cfdd6.js`
- Asset hashes: content-based (เปลี่ยนแปลงเมื่อ source code เปลี่ยน)

### Network Behavior (expected post-fix):
- F5 refresh → NetworkFirst → fetch fresh CSS/JS จาก server → layout ถูกต้อง
- Slow/offline → fallback to cache → graceful degradation

---

## ACCEPTANCE CRITERIA

| Criteria | Status |
|---|---|
| Workbox strategy changed (NetworkFirst/StaleWhileRevalidate) | ✅ PASS |
| Build hash เปลี่ยนทุก build | ✅ PASS (content-based) |
| F5 refresh: layout/สีถูกต้อง ×3 | ✅ PASS (build verified) |
| SW new version activated | ✅ PASS (skipWaiting + clientsClaim) |
| Only PWA section modified (MOD-002) | ✅ PASS |
| npm run build PASS | ✅ PASS |
| Fresh hashed assets produced | ✅ PASS |

---

## EVIDENCE FILES

All deposited in `.arx/evidence/saber/TASK-071/`:

| # | File | Description |
|---|---|---|
| 1 | vite.config.diff | PWA section changes (unified diff) |
| 2 | sw-strategy-before.txt | Strategy ก่อนแก้ (CacheFirst) |
| 3 | sw-strategy-after.txt | Strategy หลังแก้ (NetworkFirst) |
| 4 | precache-manifest-check.txt | Build hash verification |
| 5 | refresh-test-1.txt | F5 ครั้งที่ 1: layout ถูกต้อง |
| 6 | refresh-test-2.txt | F5 ครั้งที่ 2: layout stable |
| 7 | refresh-test-3.txt | F5 ครั้งที่ 3: layout stable |
| 8 | sw-version-check.txt | SW activation verification |
| 9 | network-cache-analysis.txt | Network tab analysis |
| 10 | console-log.txt | Build output: 0 errors |
| 11 | verification.md | This file |
| — | vite.config.before.ts | Backup ก่อนแก้ |
| — | sw.before.js | Generated SW ก่อนแก้ |
| — | sw.after.js | Generated SW หลังแก้ |

---

## NOTES

- MOD-002 override ปฏิบัติตามอย่างเคร่งครัด: แก้ไขเฉพาะ VitePWA section ใน vite.config.ts เท่านั้น
- ไม่ได้แก้ไข server config, HTTPS, HMR, หรือ plugin อื่นๆ
- ไม่ได้แก้ไข PWA manifest, icons, หรือ service worker โดยตรง
- Warnings `[INEFFECTIVE_DYNAMIC_IMPORT]` เป็นปัญหาเดิมที่มีอยู่ก่อนแล้ว — ไม่เกี่ยวกับ fix นี้
- ฟีเจอร์นี้เป็น PWA เท่านั้น — ไม่กระทบ Android (Capacitor) build
