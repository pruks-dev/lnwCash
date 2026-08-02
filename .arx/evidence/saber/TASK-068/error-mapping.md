# TASK-068: API Error → User-Friendly Message Mapping

## Architecture
Errors flow: API / Mint → CashuError → mapMintError()/mapMeltError() → i18n key → user message

## Mapping Table

| Source | Condition | i18n Key | TH Message | EN Message |
|--------|-----------|----------|------------|------------|
| **Mint/Receive** |
| CashuError | HTTP 404 | `screen.receive.error_mint_404` | ไม่พบ endpoint ของ mint — ตรวจสอบ URL | Mint endpoint not found — check the URL |
| CashuError | HTTP 403 | `screen.receive.error_mint_forbidden` | Mint ปฏิเสธการเชื่อมต่อ — ตรวจสอบสิทธิ์ | Mint denied the connection — check permissions |
| CashuError | HTTP 5xx | `screen.receive.error_mint_server` | Mint มีปัญหาภายใน — ลองใหม่ภายหลัง | Mint internal error — try again later |
| Error | fetch/network/unreachable | `screen.receive.error_mint_unreachable` | ไม่สามารถเชื่อมต่อ mint ได้ — ตรวจสอบเครือข่าย | Cannot reach the mint — check your network |
| Error | timeout | `screen.receive.error_mint_timeout` | Mint ตอบกลับช้า — ลองใหม่ | Mint response timeout — try again |
| Error | expired | `screen.receive.error_quote_expired` | เวลาสร้าง invoice หมดอายุ — กรุณาสร้างใหม่ | Invoice creation expired — create a new one |
| Poll timeout | pollCount >= 60 | `screen.receive.error_payment_timeout` | ไม่พบการชำระเงินภายในเวลา — กรุณาลองใหม่ | Payment not detected — please try again |
| Default | any other | `screen.receive.error_mint_fail` | ไม่สามารถ mint ได้ | Minting failed |
| **Melt/Send** |
| InsufficientFundsError | — | `screen.send.error_insufficient` | เงินไม่พอ | Insufficient funds |
| CashuError | HTTP 404 | `screen.send.error_melt_fail` | ไม่สามารถชำระได้ | Payment failed |
| CashuError | HTTP 5xx | `screen.send.error_melt_fail` | ไม่สามารถชำระได้ | Payment failed |
| Error | insufficient/not enough | `screen.send.error_insufficient` | เงินไม่พอ | Insufficient funds |
| Error | fetch/network/unreachable | `screen.send.mint_unreachable` | ไม่สามารถเชื่อมต่อ mint ได้ | Mint unreachable |
| Error | already spent | `screen.send.error_already_spent` | Proof ถูกใช้ไปแล้ว — อาจมีการใช้ซ้ำ | Proof already spent — possible double-spend |
| Error | timeout | `screen.send.error_melt_timeout` | Mint ตอบกลับช้า — ลองใหม่ | Mint response timeout — try again |
| Default | any other | `screen.send.error_melt_fail` | ไม่สามารถชำระได้ | Payment failed |

## Implementation

### Receive.svelte — mapMintError()
```typescript
function mapMintError(error: unknown): string {
    if (error instanceof CashuError) {
        if (error.status === 404) return $_('screen.receive.error_mint_404');
        if (error.status === 403) return $_('screen.receive.error_mint_forbidden');
        if (error.status && error.status >= 500) return $_('screen.receive.error_mint_server');
        return $_('screen.receive.error_mint_fail');
    }
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('unreachable'))
            return $_('screen.receive.error_mint_unreachable');
        if (msg.includes('timeout'))
            return $_('screen.receive.error_mint_timeout');
        if (msg.includes('expired') || msg.includes('timeout'))
            return $_('screen.receive.error_quote_expired');
    }
    return $_('screen.receive.error_mint_fail');
}
```

### Send.svelte — mapMeltError()
```typescript
function mapMeltError(error: unknown): string {
    if (error instanceof InsufficientFundsError) return $_('screen.send.error_insufficient');
    if (error instanceof CashuError) {
        if (error.status === 404) return $_('screen.send.error_melt_fail');
        if (error.status && error.status >= 500) return $_('screen.send.error_melt_fail');
        return $_('screen.send.error_melt_fail');
    }
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('insufficient')) return $_('screen.send.error_insufficient');
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('unreachable'))
            return $_('screen.send.mint_unreachable');
        if (msg.includes('already spent')) return $_('screen.send.error_already_spent');
    }
    return $_('screen.send.error_melt_fail');
}
```

## i18n Keys Added (th.json + en.json)

New keys added for receive errors:
- `screen.receive.error_mint_404`
- `screen.receive.error_mint_forbidden`
- `screen.receive.error_mint_server`
- `screen.receive.error_mint_unreachable`
- `screen.receive.error_mint_timeout`
- `screen.receive.error_quote_expired`
- `screen.receive.error_payment_timeout`

New keys added for send errors:
- `screen.send.error_already_spent`
- `screen.send.error_melt_timeout`
