# Send — Cashu Tab Flow (TASK-066)

## States
1. **idle** — Amount label + numpad. Confirm button: "ดูตัวอย่าง token"
2. **preview** — Preview card: "จะสร้าง token มูลค่า {amount} sat" + mint URL + "ยกเลิก" / "สร้าง token" buttons
3. **loading** — Full spinner + "กำลังสร้าง token..."
4. **success** — Green checkmark + QR code of token + raw token textarea (readonly) + "คัดลอก" button + "ส่ง token นี้ให้ผู้รับ" hint
5. **error** — Red error banner with dismiss button

## Interactions
- Amount input via same Numpad.svelte component (reused)
- Preview shows confirmation before token creation
- Token creation calls sendTokens() from $lib/wallet/transfer
- Success state shows QR code for recipient scanning
- Copy button copies token to clipboard

## Services Used (import only, no modification)
- $lib/wallet/transfer.ts → sendTokens()
- $lib/wallet/errors.ts → InsufficientFundsError
