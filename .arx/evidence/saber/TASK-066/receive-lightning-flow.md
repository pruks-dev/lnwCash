# Receive — Lightning Tab Flow (TASK-066)

## States
1. **idle** — Shows amount label + numpad (0-9, backspace, decimal). Confirm button: "สร้างใบแจ้งหนี้"
2. **loading** — Full-spinner + "กำลังสร้างใบแจ้งหนี้..." text. Numpad disabled.
3. **invoice** — QR code (SVG) + invoice text + "คัดลอก" button. Transitions automatically to polling.
4. **polling** — Pulse animation dot + "รอการชำระเงิน..." + animated dots. Polls every 200ms (simulated).
5. **success** — Green checkmark (scale animation) + count-up balance animation (requestAnimationFrame, easeOutCubic) + "ได้รับ {amount} sat แล้ว"
6. **error** — Red error banner with dismiss button. Retry by re-entering amount.

## Interactions
- Amount input via Numpad.svelte component (reusable)
- Confirm button calls mintFlow() from $lib/wallet/mint
- Copy button uses navigator.clipboard.writeText()
- Back button navigates to home
- Each state has proper aria-live regions for accessibility

## Services Used (import only, no modification)
- $lib/wallet/mint.ts → mintFlow()
- $lib/wallet/transfer.ts (not used in Lightning tab)
