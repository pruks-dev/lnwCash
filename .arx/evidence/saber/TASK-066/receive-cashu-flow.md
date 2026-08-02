# Receive — Cashu Tab Flow (TASK-066)

## States
1. **idle** — Textarea for pasting Cashu token + "วาง" (paste) button + "ตรวจสอบ" (validate) button
2. **validating** — Validate button shows "..." while isCashuToken() + decodeToken() runs
3. **preview** — Shows token preview: amount, mint URL, proof count. Two buttons: "ยกเลิก" / "รับ token"
4. **loading** — Full spinner + "กำลังรับ token..."
5. **success** — Green checkmark + amount + mint URL + proof count + "ตกลง" button
6. **error** — Red error banner with dismiss button

## Validation
- Validates token has `cashuA` prefix using isCashuToken()
- Decodes token structure using decodeToken() from $lib/cashu/token
- Shows full preview before committing

## Services Used (import only, no modification)
- $lib/wallet/transfer.ts → receiveTokens()
- $lib/cashu/token.ts → isCashuToken(), decodeToken(), getTokenAmount()
