# TASK-015 Evidence: Code Accuracy Check

Generated: 2026-07-30
Project: LnwCash Wallet (~/arx-projects/lnw-cash/)

---

## 1. Seed Phrase — 24 Words

### Claim
Pipeline claims: "seed 24 words" (BIP-39 compatible, 24-word mnemonic)

### Code Evidence

**src/lib/wallet/keys.ts** (line 28):
```ts
const SEED_WORD_COUNT = 24; // 24 × 11 = 264 bits = 32 bytes + 1 byte checksum
```

**src/lib/wallet/seed.ts** (line 31, JSDoc):
```ts
@returns 24-word BIP39 seed phrase
```

**src/lib/wallet/__tests__/seed.test.ts** (line 34):
```ts
expect(seed.split(' ').length).toBe(24);
```

**src/lib/wallet/keys.ts** (line 137, validation):
```ts
if (words.length !== SEED_WORD_COUNT) { // 24
    throw new Error(`Invalid seed phrase: expected ${SEED_WORD_COUNT} words, got ${words.length}`);
}
```

### Docs Evidence
- user-guide-th.md line 62: "## สำรอง Seed Phrase (24 คำ)"
- user-guide-en.md line 62: "## Backing Up Your Seed Phrase (24 Words)"
- developer.md line 60: "seed.ts — BIP-39 24-word seed export/import"
- CHANGELOG.md line 107: "24-word BIP-39 compatible seed phrase"

**Verdict: ✅ PASS — 24-word seed confirmed in code and all docs**

---

## 2. PBKDF2 — 600,000 Iterations

### Claim
Pipeline claims: "PBKDF2 600k" (600,000 iterations for PIN-based key derivation)

### Code Evidence

**src/lib/crypto/encrypt.ts** (line 16):
```ts
const PBKDF2_ITERATIONS = 600_000; // OWASP recommended for PBKDF2-HMAC-SHA256
```

This constant is used in:
- `deriveAesKey()` — line 77: `iterations: PBKDF2_ITERATIONS`
- `deriveHashKey()` — line 109: `iterations: PBKDF2_ITERATIONS`
- `hashPin()` response — line 144: `iterations: PBKDF2_ITERATIONS`
- `encryptKey()` response — line 190: `iterations: PBKDF2_ITERATIONS`

### Docs Evidence
- developer.md line 159: "PIN → PBKDF2 (600,000 iterations) → AES-GCM key"
- CHANGELOG.md line 47: "PBKDF2 (600k iterations) → AES-GCM private key encryption"

**Verdict: ✅ PASS — 600,000 PBKDF2 iterations confirmed in code and docs**

---

## 3. Token Prefix — cashuA

### Claim
Pipeline claims: "token prefix cashuA" (V4 Cashu ecash token format)

### Code Evidence

**src/lib/cashu/token.ts** (lines 9-10):
```ts
export const TOKEN_PREFIX = 'cashuA';
const TOKEN_VERSION = 'A';
```

Token encoding (line 46):
```ts
return `${TOKEN_PREFIX}${base64}`;  // returns e.g. "cashuAeyJ0b2tlbiI6..."
```

Token decoding (line 58):
```ts
if (token.startsWith(TOKEN_PREFIX)) {
    encoded = token.slice(TOKEN_PREFIX.length);
}
```

### Docs Evidence
- developer.md line 47: "V4 token encode/decode (cashuA prefix)"
- CHANGELOG.md line 68: "encode as V4 Cashu token (cashuA prefix)"

**Verdict: ✅ PASS — cashuA prefix confirmed in code and docs**

---

## 4. API Endpoints — 7 Endpoints in client.ts

### Claim
Pipeline claims: "7 API endpoints in client.ts"

### Code Evidence

**src/lib/cashu/client.ts** contains 7 exported API functions:

| # | Function | Method | Path | Line |
|---|----------|--------|------|------|
| 1 | `getMintInfo` | GET | `/v1/info` | 136 |
| 2 | `getKeysets` | GET | `/v1/keysets` | 145 |
| 3 | `getKeys` | GET | `/v1/keys/{keysetId}` | 167 |
| 4 | `requestMintQuote` | POST | `/v1/mint/quote/bolt11` | 190 |
| 5 | `mintTokens` | POST | `/v1/mint/bolt11` | 203 |
| 6 | `requestMeltQuote` | POST | `/v1/melt/quote/bolt11` | 219 |
| 7 | `meltTokens` | POST | `/v1/melt/bolt11` | 235 |

All use the shared `fetchFromMint()` helper which:
- Never hardcodes a mint URL (multi-mint compatible) ✅
- Uses 15-second timeout via AbortController ✅
- Standardizes error handling (CashuError, MintUnreachableError, NetworkError) ✅

### Docs Evidence

**api-reference.md** documents exactly these 7 endpoints:
1. GET /v1/info (line 13)
2. GET /v1/keysets (line 50)
3. GET /v1/keys/{keysetId} (line 79)
4. POST /v1/mint/quote/bolt11 (line 130)
5. POST /v1/mint/bolt11 (line 180)
6. POST /v1/melt/quote/bolt11 (line 257)
7. POST /v1/melt/bolt11 (line 311)

**Verdict: ✅ PASS — 7 endpoints match exactly between client.ts and api-reference.md**

---

## 5. Cross-Documentation Consistency Check

Additional checks to ensure docs don't contradict each other:

| Claim | developer.md | CHANGELOG.md | user-guide-th/en | Code | Match? |
|-------|-------------|-------------|-------------------|------|--------|
| 24-word seed | L60 | L107 | L62 | keys.ts:L28 | ✅ |
| PBKDF2 600k | L159 | L47 | — | encrypt.ts:L16 | ✅ |
| cashuA prefix | L47 | L68 | — | token.ts:L9 | ✅ |
| 7 endpoints | L44-47 implied | — | — | client.ts (7 fns) | ✅ |
| PIN 6+ digits | — | L46 | L15/L14 | seed.ts:L88 | ✅ |
| Multi-mint | L47,L164-168 | L52-55 | L18,L94-95 | client.ts:L52-54 | ✅ |
| Offline P2P | L170-175 | L94-98 | L52,L91-92 | offline.ts | ✅ |
| IndexedDB storage | L51-52 | L78 | L58 | db.ts, proofsDb.ts | ✅ |

---

## Overall Code Accuracy Verdict

| Check | Status |
|-------|--------|
| 1. Seed phrase (24 words) | ✅ PASS |
| 2. PBKDF2 iterations (600k) | ✅ PASS |
| 3. Token prefix (cashuA) | ✅ PASS |
| 4. API endpoints (7) | ✅ PASS |
| 5. Cross-doc consistency | ✅ PASS |

**All 5 accuracy checks pass. Code truth matches documentation claims.**
