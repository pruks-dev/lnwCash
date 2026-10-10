# Cashu API Reference

Endpoints used by LNWCASH Wallet to communicate with Cashu mints. All endpoints follow the [Cashu NUT (Notation, Usage, and Terminology) specification](https://github.com/cashubtc/nuts).

**Base URL**: `{MINT_URL}` — replace with your mint URL (e.g., `https://mint.lnw.cash`).

> **Multi-mint note**: LNWCASH supports multiple mints simultaneously. The mint URL is passed as a parameter on every call — the default mint ships as `DEFAULT_MINT_CONFIG` (`https://mint.lnw.cash`). See `src/lib/cashu/client.ts` and `src/lib/wallet/config.ts` for the implementation.

---

## 1. Get Mint Info

```
GET /v1/info
```

Returns basic information about the mint, including supported NUT versions and contact details.

### Response Shape

```json
{
  "name": "string",
  "pubkey": "string (hex)",
  "version": "string",
  "description": "string (optional)",
  "description_long": "string (optional)",
  "contact": [
    { "method": "string", "info": "string" }
  ],
  "motd": "string (optional)",
  "nuts": {
    "4": { "methods": [{ "method": "bolt11", "unit": "sat" }], "disabled": false },
    "5": { "methods": [{ "method": "bolt11", "unit": "sat" }], "disabled": false }
  }
}
```

### curl Example

```bash
curl -s https://mint.lnw.cash/v1/info | jq
```

---

## 2. Get Keysets

```
GET /v1/keysets
```

Returns all keysets available at this mint. A keyset represents a set of public keys for a specific currency unit (e.g., `sat` for bitcoin sats).

### Response Shape

```json
{
  "keysets": [
    { "id": "string (hex)", "unit": "sat", "active": true, "input_fee_ppk": 0 },
    ...
  ]
}
```

> Some mints return keysets as an array of strings (IDs only). The client normalizes both formats.

### curl Example

```bash
curl -s https://mint.lnw.cash/v1/keysets | jq
```

---

## 3. Get Keys for a Keyset

```
GET /v1/keys/{keysetId}
```

Returns the public keys for a specific keyset. Each key maps an amount (2^n satoshis) to its public key.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `keysetId` | string (hex) | The keyset ID from `/v1/keysets` |

### Response Shape

```json
{
  "keysets": [
    {
      "id": "string (hex)",
      "keys": {
        "1": "string (hex compressed pubkey)",
        "2": "string (hex compressed pubkey)",
        "4": "string (hex compressed pubkey)",
        ...
      }
    }
  ]
}
```

Some mints return the keys directly without the `keysets` wrapper:

```json
{
  "1": "string (hex)",
  "2": "string (hex)",
  ...
}
```

### curl Example

```bash
KEYSET_ID="00ad268c4d..."
curl -s "https://mint.lnw.cash/v1/keys/${KEYSET_ID}" | jq
```

---

## 4. Request Mint Quote (Bolt11)

```
POST /v1/mint/quote/bolt11
```

Request a quote for minting ecash. The mint generates a Lightning invoice that you must pay to receive ecash tokens.

### Request Body

```json
{
  "amount": 1000
}
```

| Field | Type | Description |
|---|---|---|
| `amount` | number | Amount in satoshis to mint |

### Response Shape

```json
{
  "quote": "string (quote ID)",
  "request": "string (Bolt11 Lightning invoice)",
  "paid": false,
  "expiry": 1712345678,
  "state": "UNPAID"
}
```

| Field | Type | Description |
|---|---|---|
| `quote` | string | Unique quote identifier |
| `request` | string | Bolt11 invoice to pay |
| `paid` | boolean | Has the invoice been paid? |
| `expiry` | number | Unix timestamp when quote expires |
| `state` | string | Quote state (`UNPAID`, `PAID`, `ISSUED`) |

### curl Example

```bash
curl -s -X POST https://mint.lnw.cash/v1/mint/quote/bolt11 \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}' | jq
```

---

## 5. Mint Tokens (Submit Blinded Outputs)

```
POST /v1/mint/bolt11
```

After paying the Lightning invoice from the mint quote, submit your blinded outputs to receive blind signatures. Unblinding these signatures yields spendable ecash proofs.

### Request Body

```json
{
  "quote": "string (quote ID from step 4)",
  "outputs": [
    {
      "amount": 1,
      "id": "string (keyset ID)",
      "B_": "string (blinded message, hex)"
    },
    {
      "amount": 2,
      "id": "string (keyset ID)",
      "B_": "string (blinded message, hex)"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `quote` | string | Quote ID from the mint quote response |
| `outputs` | array | Array of blinded outputs (one per denomination) |
| `outputs[].amount` | number | Denomination in sats |
| `outputs[].id` | string | Keyset ID |
| `outputs[].B_` | string | Blinded message (hex-encoded) |

### Response Shape

```json
{
  "signatures": [
    {
      "id": "string (keyset ID)",
      "amount": 1,
      "C_": "string (blind signature, hex)"
    },
    {
      "id": "string (keyset ID)",
      "amount": 2,
      "C_": "string (blind signature, hex)"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `signatures` | array | Blind signatures, one per output |
| `signatures[].id` | string | Keyset ID |
| `signatures[].amount` | number | Amount (matches submitted output) |
| `signatures[].C_` | string | Blind signature (unblind with your blinding factor to get the proof signature `C`) |

### curl Example

```bash
curl -s -X POST https://mint.lnw.cash/v1/mint/bolt11 \
  -H "Content-Type: application/json" \
  -d '{
    "quote": "<quote-id>",
    "outputs": [
      {"amount": 1, "id": "<keyset-id>", "B_": "<blinded-message>"}
    ]
  }' | jq
```

---

## 6. Request Melt Quote (Bolt11)

```
POST /v1/melt/quote/bolt11
```

Request a quote for melting (burning) ecash to pay a Lightning invoice. The mint tells you how many sats are needed (including fees).

### Request Body

```json
{
  "request": "lnbc... (Bolt11 Lightning invoice)",
  "amount": 5000
}
```

| Field | Type | Description |
|---|---|---|
| `request` | string | Bolt11 Lightning invoice to pay |
| `amount` | number | Amount in sats (must match or exceed invoice) |

### Response Shape

```json
{
  "quote": "string (quote ID)",
  "amount": 5000,
  "fee_reserve": 10,
  "paid": false,
  "expiry": 1712345678,
  "state": "UNPAID"
}
```

| Field | Type | Description |
|---|---|---|
| `quote` | string | Unique quote identifier |
| `amount` | number | Total amount needed (invoice + fees) |
| `fee_reserve` | number | Fee reserve in sats |
| `paid` | boolean | Whether the melt has been processed |
| `expiry` | number | Unix timestamp when quote expires |
| `state` | string | Quote state |

### curl Example

```bash
curl -s -X POST https://mint.lnw.cash/v1/melt/quote/bolt11 \
  -H "Content-Type: application/json" \
  -d '{"request": "lnbc...", "amount": 5000}' | jq
```

---

## 7. Melt Tokens (Submit Proofs to Burn)

```
POST /v1/melt/bolt11
```

Submit ecash proofs to be burned (spent) in exchange for paying the Lightning invoice. Optionally include blinded outputs to receive change.

### Request Body

```json
{
  "quote": "string (quote ID from step 6)",
  "inputs": [
    {
      "amount": 2048,
      "id": "string (keyset ID)",
      "secret": "string (secret value)",
      "C": "string (unblinded signature, hex)"
    }
  ],
  "outputs": [
    {
      "amount": 2000,
      "id": "string (keyset ID)",
      "B_": "string (blinded message for change, hex)"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `quote` | string | Quote ID from the melt quote response |
| `inputs` | array | Proofs to burn |
| `inputs[].amount` | number | Proof denomination |
| `inputs[].id` | string | Keyset ID |
| `inputs[].secret` | string | Proof secret |
| `inputs[].C` | string | Unblinded signature (hex) |
| `outputs` | array (optional) | Blinded outputs for change (if overpaying) |
| `outputs[].amount` | number | Change amount |
| `outputs[].id` | string | Keyset ID |
| `outputs[].B_` | string | Blinded message for change (hex) |

### Response Shape

```json
{
  "paid": true,
  "preimage": "string (hex, Lightning payment preimage)",
  "change": [
    {
      "id": "string (keyset ID)",
      "amount": 2000,
      "C_": "string (blind signature for change, hex)"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `paid` | boolean | Whether the melt was successful |
| `preimage` | string (optional) | Lightning payment preimage (hex) |
| `change` | array (optional) | Blind signatures for change outputs |

### curl Example

```bash
curl -s -X POST https://mint.lnw.cash/v1/melt/bolt11 \
  -H "Content-Type: application/json" \
  -d '{
    "quote": "<quote-id>",
    "inputs": [
      {"amount": 2048, "id": "<keyset-id>", "secret": "<secret>", "C": "<signature>"}
    ],
    "outputs": [
      {"amount": 2000, "id": "<keyset-id>", "B_": "<blinded-change>"}
    ]
  }' | jq
```

---

## Error Responses

All endpoints return standard JSON error responses on failure:

```json
{
  "detail": "Human-readable error message",
  "code": 10001
}
```

HTTP status codes:
- `400` — Bad request (invalid parameters)
- `404` — Not found (unknown keyset, unknown quote)
- `500` — Internal mint error

---

## Notes

- **Timeout**: The LNWCASH client uses a 15-second timeout on all mint requests (`AbortController`).
- **Rate limiting**: Mints may impose rate limits. The client does not retry automatically — the user must trigger a retry.
- **Mint discovery**: LNWCASH ships with a default mint (`DEFAULT_MINT_CONFIG`, `https://mint.lnw.cash`). Users can add their own mint URLs on top.
- **All amounts are in satoshis (sats)** — no other units are currently supported in MVP.
