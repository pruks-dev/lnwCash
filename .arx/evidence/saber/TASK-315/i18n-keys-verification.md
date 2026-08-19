# TASK-315: i18n keys verification

Three new i18n keys added to BOTH `src/locales/en.json` and `src/locales/th.json`,
plus two new keys for the new "Display" section heading + description in Settings.

## New keys (5 total)

| Key | en | th |
| --- | --- | --- |
| `settings.fee_return.title` | `Show fee return indicator` | `แสดงสัญลักษณ์คืนค่าธรรมเนียม` |
| `settings.fee_return.description` | `Show '+X sats return' badge in history when mint returns fee (NUT-08)` | `แสดง badge '+X sats return' ในประวัติเมื่อ mint คืนค่าธรรมเนียม (NUT-08)` |
| `history.fee_return` (placeholder `{amount}`) | `+{amount} sats return` | `คืน {amount} sats` |
| `screen.settings.display_section` | `Display` | `การแสดงผล` |
| `screen.settings.display_description` | `Control what is shown in transaction history` | `ควบคุมสิ่งที่แสดงในประวัติธุรกรรม` |

## Parity test result

```
$ npx vitest run src/__tests__/lib/i18n-parity.test.ts

RUN  v4.1.10 /home/debian/arx-projects/lnw-cash

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

**PASS** — key counts `en = th = 422` (was 417 before TASK-315 → +5 keys each).

## Usage

- `settings.fee_return.title` / `.description` → Settings.svelte toggle row label + description
- `history.fee_return` → badge text, called with `{ values: { amount: <number> } }`
  - en example: `+5 sats return`
  - th example: `คืน 5 sats`
- `screen.settings.display_section` / `.display_description` → new Display section heading in Settings

## Spec-required vs added

Spec required exactly 3 keys (fee_return.title / .description / history.fee_return).
Added 2 extra keys for the Display section heading/description (a clean section is
better than reusing the Theme heading for a fee-return toggle).
