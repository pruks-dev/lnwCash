# TASK-316: i18n NUT-08 Keys Verification

**Date:** 2026-08-19
**Task:** TASK-316 (P0 — i18n NUT-08 namespace + parity check)
**Branch:** task-311-nut09-capability (parent: 437a788 TASK-315)

## Parity Snapshot

| Locale | Keys Before (TASK-315) | Keys Added (TASK-316) | Total After | Parity |
|--------|------------------------|----------------------|-------------|--------|
| en.json | 422 | +5 (nut08.*) | **427** | ✅ |
| th.json | 422 | +5 (nut08.*) | **427** | ✅ |
| Diff | — | — | **0** | ✅ |

Both locale files have the **same key set** (427 keys each). The 5 new
nut08.* keys are present in both, no existing keys were modified or removed.

## Key Table

| Key | en.json | th.json | Natural Thai? |
|-----|---------|---------|---------------|
| `nut08.not_supported` | "This mint does not support NUT-08 — using legacy fee calculation" | "มินต์นี้ไม่รองรับ NUT-08 — ใช้การคำนวณค่าธรรมเนียมแบบเดิม" | ✅ มินต์ (mint), �่าธรรมเนียม (fee), แบบเดิม (legacy) — natural Thai matching existing tone (e.g. "ค่าธรรมเนียม" appears in `fee_reserve` translations elsewhere) |
| `nut08.fee_return` | "+{amount} sats returned" | "คืน {amount} sats" | ✅ คืน (return) — short, natural Thai |
| `nut08.checking_capability` | "Checking mint NUT-08 support..." | "กำลังตรวจสอบการรองรับ NUT-08 �องมินต์..." | ✅ กำลังตรวจสอบ (in the process of checking), การรองรับ (support), ของมินต์ (of the mint) — natural Thai |
| `nut08.error.decompose` | "Failed to decompose change amount" | "ไม่สา�ารถแยกจำนวนเงินทอนได้" | ✅ ไม่สามารถ (unable to), แยก (separate/decompose), จำนวนเงินทอน (change amount) — natural Thai, formal register |
| `nut08.error.derive` | "Failed to derive change secrets" | "ไม่สามารถสร้า� secret สำหรับเงินทอนได้" | ✅ ไม่สามารถ (unable to), สร้าง (create/derive), secret (kept as-is, technical term), สำหรับเงินทอน (for change) — natural Thai, consistent with existing usage of "secret" as a technical loan-word in the codebase |

## Verification Commands

```bash
# Count keys per locale
python3 -c "
import json
en = json.load(open('src/locales/en.json'))
th = json.load(open('src/locales/th.json'))
print('en:', len(en))
print('th:', len(th))
print('diff:', set(en.keys()) ^ set(th.keys()))
"
# Expected: en: 427, th: 427, diff: set()

# Verify all 5 nut08 keys present in both
python3 -c "
import json
en = json.load(open('src/locales/en.json'))
th = json.load(open('src/locales/th.json'))
for k in ['nut08.not_supported','nut08.fee_return','nut08.checking_capability','nut08.error.decompose','nut08.error.derive']:
    print(f'{k:40s} | en={en[k]!r:60s} | th={th[k]!r}')
"
```

## Test Coverage

| Scenario | Status | Description |
|----------|--------|-------------|
| (a) all 5 nut08.* keys present in en.json | ✅ PASS | asserts `en[key]` truthy + non-empty + not-equal-to-key |
| (b) all 5 nut08.* keys present in th.json | ✅ PASS | asserts `th[key]` truthy + non-empty + Thai-char present |
| (c) parity: en.keys === th.keys (427=427) | ✅ PASS | index-by-index comparison + set-based diff |
| (d) t('nut08.fee_return', { amount: 5 }) | ✅ PASS | verifies EN '+5 sats returned' + TH 'คืน 5 sats' via mocked svelte-i18n |

Test file: `src/__tests__/lib/i18n/i18n-nut08-parity.test.ts`

## Code Changes

`src/lib/wallet/melt.ts`:
- Added `import { t } from 'svelte-i18n'; import { get } from 'svelte/store';`
- Added `safeT(key, fallback)` helper — try/catch around `get(t)(key)` to handle
  the case where svelte-i18n is not initialized (e.g., unit tests). Returns
  the literal English fallback when the store throws.
- Replaced 4 hardcoded `console.warn` literals:
  - `[melt] Mint ${mintUrl} does not advertise NUT-08 — using legacy fee calculation`
    → `safeT('nut08.not_supported', ...)`
  - `[melt] NUT-08 capability check failed for ${mintUrl}: ${errMsg}`
    → `safeT('nut08.checking_capability', ...)`
  - `[melt completeMelt] Mint ${mintUrl} does not advertise NUT-08 — using legacy feeReserve`
    → `safeT('nut08.not_supported', ...)`
  - `[melt completeMelt] NUT-08 capability check failed for ${mintUrl}: ${errMsg}`
    → `safeT('nut08.checking_capability', ...)`

The 2 unrelated F-072 orphaned-proofs warnings (lines 198 and 278) were left
as-is per spec ("Replace ALL nut08-related warning strings. Keep unrelated
warnings ... as-is.").
