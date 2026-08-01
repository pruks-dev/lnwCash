# Crypto Audit Notes — TASK-046

## C00-05: hash_to_curve Implementation

### Status: RESOLVED ✅

### Finding
The function `hash_to_curve` was NOT IMPLEMENTED. The `blindMessage` function was using
a simple hash-to-scalar approach (`sha256(msg) → scalar → scalar * G`) instead of the proper
try-and-increment hash_to_curve algorithm specified in NUT-00.

### Resolution
Implemented `hash_to_curve(message: Uint8Array): Point` using the try-and-increment method
matching the Python Cashu reference implementation:

```
def hash_to_curve(message: bytes) -> PublicKey:
    point = None
    msg_to_hash = message
    while point is None:
        _hash = hashlib.sha256(msg_to_hash).digest()
        try:
            point = PublicKey.from_bytes(b'\x02' + _hash, raw=True)
        except Exception:
            msg_to_hash = _hash
    return point
```

The JavaScript implementation:
1. SHA-256 hash the message
2. Prepend 0x02 (compressed, even y) to the hash bytes
3. Try `secp256k1.Point.fromHex('02' + bytesToHex(hash))`
4. If the point is not on curve (sqrt error), re-hash and try again
5. Returns a valid secp256k1 point

### Test Results
- 5 hash_to_curve-specific test cases: ALL PASS
- Deterministic, different messages → different points, validates curve membership

### Files Changed
- `src/lib/cashu/blind.ts`: Added `hash_to_curve` function (exported)
- Import added: `bytesToHex` from `@noble/hashes/utils`

---

## C00-06: BDHKE Multiplicative Scheme

### Status: RESOLVED ✅

### Finding
The `blindMessage` function was using a non-standard blinding approach:
```
messageScalar = sha256(msg) as bigint
blindedScalar = messageScalar * r (mod n)
B_ = blindedScalar * G
```

This is algebraically equivalent to `(hash_to_curve(msg)) * r` if we define `hash_to_curve` as
`scalar * G`, but it does NOT match the NUT-00 reference implementation which uses proper
try-and-increment hash_to_curve and point multiplication.

### Resolution
Updated `blindMessage` to use the proper multiplicative BDHKE:

1. `Y = hash_to_curve(message)` — map message to a point using try-and-increment
2. `B_ = Y * r` — multiplicative blinding (point scalar multiplication)

The unblinding `C = C_ * r^{-1}` was already correctly implemented.

### Verification
For integration testing, added `verifySignature(C, secret, mintPrivateKey)` which:
1. Computes `Y = hash_to_curve(secret)`
2. Computes `expected = Y * mintPrivateKey`
3. Checks `C === expected.toHex(true)`

### Test Results
- 5 BDHKE-specific test cases: ALL PASS
  - Round-trip: blind → sign → unblind → verify
  - Wrong key detection
  - Cross-secret tamper detection
  - Multiplicative property: (Y * r) * r^{-1} = Y
  - Different mints produce different signatures

### Files Changed
- `src/lib/cashu/blind.ts`: Updated `blindMessage` to use hash_to_curve + multiplicative blinding
- Added `verifySignature` helper for integration testing
