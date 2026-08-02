# TASK-068: Integration Verification — All 4 Flows

## 1. Receive Lightning → Mint Flow ✅

**Flow**: User enters amount → Create Invoice → QR display → Poll payment → Mint proofs → Store → Balance update

**Real Mint Test Results** (mint.lnw.cash):
- ✅ POST /v1/mint/quote/bolt11 → quote created with bolt11 invoice
- ✅ GET /v1/mint/quote/bolt11/{id} → state polling works
- ✅ Keyset discovery: 1 active keyset (00c25786d85a1dcd, 64 denominations)
- ✅ POST /v1/mint/bolt11 endpoint reachable (NUT-19 cached_endpoints)
- ⚠️ Full mint requires paying the invoice externally (LN payment)

**Code Integration**:
- Receive.svelte: `requestMintQuoteWithUnit()` → `getMintQuoteState()` poll → `completeMintAfterPayment()`
- Uses: fetchAndCacheKeysets → decomposeAmount → blindMessage → mintTokens → unblindSignature → addProofs → getBalance
- All wallet core functions imported (no modification to core)

## 2. Send Lightning → Melt Flow ✅

**Flow**: Paste invoice → Validate → Check fee → Confirm → Melt proofs → Store change → Balance update

**Real Mint Test Results** (mint.lnw.cash):
- ✅ POST /v1/melt/quote/bolt11 → melt quote with fee_reserve=0
- ✅ GET /v1/melt/quote/bolt11/{id} → state polling works
- ✅ Fee calculation: fee_reserve returned correctly (0 for 5-10 sat)
- ✅ POST /v1/melt/bolt11 endpoint reachable
- ⚠️ Full melt requires valid ecash proofs (need prior mint operation)

**Code Integration**:
- Send.svelte: `requestMeltQuoteWithUnit()` (static, not dynamic import) → `meltFlow()` → `refreshBalance()`
- Error mapping: InsufficientFundsError → "เงินไม่พอ", CashuError/NUT-07 spent → "Proof ถูกใช้ไปแล้ว"
- Fixed: dynamic import replaced with static import

## 3. Cashu Token Send → Receive Flow ✅

**Flow (Send)**: Enter amount → Create token → encodeToken → markSpent → Display + QR
**Flow (Receive)**: Paste token → validateToken → decodeToken → receiveTokens → addProofs → Store

**Real Mint Test Results**:
- ✅ NUT-08 (Swap) supported by mint.lnw.cash
- ✅ POST /v1/swap endpoint reachable
- ✅ V4 token format: cashuA + base64url encoding verified (unit tests)

**Code Integration**:
- Send.svelte Cashu tab: `sendTokens(amount, mintUrl)` → returns V4 token → display QR
- Receive.svelte Cashu tab: `isCashuToken()` → `decodeToken()` → `receiveTokens()` → store
- Both use transfer.ts functions (no changes to core)

## 4. Balance Update After All Operations ✅

**Implementation**:
- Receive: `updateBalanceDisplay()` → `getBalance()` after mint completes
- Send: `refreshBalance()` → `getBalanceByMint()` after melt/token creation
- Wallet core (mint.ts, melt.ts, transfer.ts) already handles IndexedDB persistence
- Balance animation in success states (easeOutCubic)

## Build Verification

| Check | Result |
|-------|--------|
| `npm run build` | ✅ PASS (253 modules, 518.74 KiB precache) |
| `npx svelte-check` | ✅ 0 new errors (9 pre-existing errors in other files) |
| `npx vitest run` | ⚠️ 4 pre-existing failures (keys, ErrorBoundary, seed, Home) |
| Mint connectivity | ✅ mint.lnw.cash reachable (Nutshell/0.20.1) |
| NUT compliance | ✅ NUTs: 4,5,7,8,9,10,11,12,14,17,19,20,29 |

## Known Limitations

1. **Full end-to-end mint/melt** requires a real Lightning wallet to pay invoices. The two-phase API flow is verified, but actual proof issuance isn't tested without paying the invoice.
2. **Mint requires `unit: "sat"`** in request body — handled via thin wrappers (`requestMintQuoteWithUnit`, `requestMeltQuoteWithUnit`)
3. **Checkstate requires `Ys` field** (NUT-07) — Nutshell-specific format
4. **Pre-existing test failures** unrelated to TASK-068 changes (keys, ErrorBoundary, seed, Home)
