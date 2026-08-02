# Send — Lightning Tab Flow (TASK-066)

## States
1. **idle** — Textarea for Lightning invoice + "วาง" (paste) button + optional "📷 สแกน QR" button
2. **validating** — Auto-validates bolt11 prefix on input; shows amount + description preview
3. **fee-calculating** — "ตรวจสอบค่าธรรมเนียม" button → calls requestMeltQuote() → spinner
4. **confirmed (fee shown)** — Fee + total displayed with styled total row
5. **confirming** — Confirmation dialog (Modal): "ยืนยันการส่ง" + amount + fee + total + ⚠️ irreversible warning + red "ยืนยันการส่ง — ไม่สามารถยกเลิกได้" button
6. **sending** — Full-screen overlay (z-index 1000): spinner + "กำลังส่ง..." + "กรุณารอ อย่าปิดแอป"
7. **success** — Green checkmark + count-up spent amount animation + preimage (if available) + "ตกลง" button
8. **error** — Red error banner with dismiss button

## Interactions
- Textarea auto-validates bolt11 invoices (lnbc/lntb/lnbcrt prefix)
- Paste button reads clipboard
- Check fee calls requestMeltQuote() from $lib/cashu/client
- Confirm button (orange #ff6f00) opens Modal dialog
- Send overlay prevents interruption (fixed full-screen)
- Count-up animation: easeOutCubic, 1s duration

## Services Used (import only, no modification)
- $lib/wallet/melt.ts → meltFlow()
- $lib/cashu/client.ts → requestMeltQuote() (dynamic import for fee check)
- $lib/wallet/errors.ts → InsufficientFundsError
