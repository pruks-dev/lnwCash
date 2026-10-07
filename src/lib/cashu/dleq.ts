/**
 * DLEQ (Discrete Log Equality) proof verification — NUT-12.
 *
 * Wallet-side verification that the mint used the same private key `a`
 * for its public key `A` and for the blind signature `C'` on `B'`:
 *
 *   R1 = s*G - e*A
 *   R2 = s*B' - e*C'
 *   e == hash(R1, R2, A, C')   # must be True
 *
 * Two entry points (NUT-12):
 * - verifyDleqAlice: Alice (the minting user) has B' and C' from the mint/swap
 *   response and checks the DLEQ proof returned in BlindSignature.dleq.
 * - verifyDleqCarol: Carol (the user receiving a Proof from Alice)
 *   reconstructs B' = Y + r*G and C' = C + r*A first, then runs the Alice check.
 *
 * Spec: https://github.com/cashubtc/nuts/blob/main/12.md
 *
 * hash_e semantics (pinned against nuts/tests/12-tests.md and the live
 * TASK-1312 mint probe, Nutshell 0.20.1): the uncompressed (65-byte → 130
 * hex-char) SEC1 serialization of each point is concatenated as hexadecimal
 * text and the SHA-256 digest is taken over the UTF-8 bytes of that string.
 * NOTE: upstream NUT-12 test vectors *present* 33-byte (66-char) compressed
 * strings, but the canonical hash still requires uncompressed serialization —
 * verified: hash over the uncompressed forms reproduces the official
 * hash_e vector and the live Nutshell golden; compressed concatenation does not.
 *
 * Pure and deterministic: no network, no clock, no RNG.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { hash_to_curve } from './blind';

// ─── Types ───────────────────────────────────────────────────

/** DLEQ proof as returned by the mint (BlindSignature.dleq) or included in a Proof. */
export interface DleqProof {
	/** challenge, hex (may be non-canonical: leading zeros may be stripped on the wire) */
	e: string;
	/** response, hex */
	s: string;
	/** blinding factor, hex — required for verifyDleqCarol only */
	r?: string;
}

/**
 * TASK-1314: thrown by the wallet wiring when a mint's DLEQ proof fails Alice
 * verification (or cannot be verified, e.g. missing A from the keyset cache).
 * A distinctive class so flow-level catch/fallback handlers (e.g. transfer.ts
 * swap fall-back) can recognize it and NOT swallow it as a generic transport
 * failure — aborting is the honest outcome for a counterfeit mint response.
 */
export class DleqVerifyFailedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DleqVerifyFailedError';
	}
}

const G = secp256k1.Point.BASE;

// ─── Serialization helpers ───────────────────────────────────

/**
 * Uncompressed SEC1 (65 byte → 130 hex chars) serialization of a point.
 */
function uncompressedHex(point: typeof G): string {
	return bytesToHex(point.toBytes(false));
}

/**
 * hash_e per NUT-12: SHA256 over the UTF-8 bytes of the concatenated
 * uncompressed hex representations of the given public keys.
 */
export function hash_e(...publickeys: Array<typeof G>): Uint8Array {
	let e_ = '';
	for (const p of publickeys) {
		e_ += uncompressedHex(p);
	}
	return sha256(utf8ToBytes(e_));
}

// ─── Parsing (tolerant, deterministic) ───────────────────────

/**
 * Parse a hex scalar (e, s or r). Tolerates odd-length / leading-zero-stripped
 * wire encodings, rejects non-hex garbage. Returns null on any malformed input.
 */
function parseScalar(hex: string): bigint | null {
	if (typeof hex !== 'string' || hex.length === 0 || hex.length > 64) return null;
	if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
	return BigInt('0x' + hex);
}

/**
 * Parse a hex-encoded curve point. Accepts compressed (33 byte) and
 * uncompressed (65 byte) SEC1 encodings, rejects points not on the curve,
 * out-of-range coordinates and unknown format prefixes.
 * Returns null on any malformed input.
 */
function parsePoint(hex: string): typeof G | null {
	if (typeof hex !== 'string') return null;
	try {
		return secp256k1.Point.fromHex(hex);
	} catch {
		return null;
	}
}

/**
 * Normalize a wire `e`/`s` scalar to canonical comparison form.
 * The challenge `e` produced by hash_e is the SHA-256 digest (32-byte
 * big-endian, canonical hex form via hash output), but wire values may strip
 * leading zeros — compare with bigint equality.
 */
function scalarFromBytes(bytes: Uint8Array): bigint {
	let result = 0n;
	for (let i = 0; i < bytes.length; i++) {
		result = (result << 8n) | BigInt(bytes[i]);
	}
	return result;
}

// ─── Core kernel: Alice equation ─────────────────────────────

/**
 * Verify the DLEQ proof by checking the Alice equations (NUT-12):
 *
 *   R1 = s*G - e*A
 *   R2 = s*B' - e*C'
 *   e == hash(R1, R2, A, C')
 *
 * @param dleq - {e, s} as returned in BlindSignature.dleq
 * @param B_prime - Alice's BlindedMessage point, hex (compressed or uncompressed)
 * @param C_prime - the mint's blind signature point, hex
 * @param A - the mint's public key for this amount/keyset, hex
 * @returns true iff the proof is valid (false for any malformed input)
 */
export function verifyDleqAlice(dleq: DleqProof, B_prime: string, C_prime: string, A: string): boolean {
	if (!dleq || typeof dleq.e !== 'string' || typeof dleq.s !== 'string') return false;

	const e = parseScalar(dleq.e);
	const s = parseScalar(dleq.s);
	if (e === null || s === null) return false;

	const B_ = parsePoint(B_prime);
	const C_ = parsePoint(C_prime);
	const A_ = parsePoint(A);
	if (B_ === null || C_ === null || A_ === null) return false;

	// scalars outside [0, n) are rejected by the curve math (noble throws) —
	// deterministic false instead of a throw
	try {
		const R1 = G.multiply(s).subtract(A_.multiply(e));
		const R2 = B_.multiply(s).subtract(C_.multiply(e));
		const expected = hash_e(R1, R2, A_, C_);
		return scalarFromBytes(expected) === e;
	} catch {
		return false;
	}
}

// ─── Wrapper: Carol reconstruction, then Alice kernel ─────────

/**
 * Verify the DLEQ proof for a received Proof (NUT-12 Carol path).
 *
 * Carol reconstructs the blinded data from the Proof and then runs the same
 * Alice kernel:
 *
 *   Y  = hash_to_curve(x)   # x = the Proof's secret (NUT-00)
 *   C' = C + r*A            # reconstructed blind signature
 *   B' = Y + r*G            # reconstructed blinded message
 *   R1 = s*G - e*A ; R2 = s*B' - e*C' ; e == hash(R1,R2,A,C')
 *
 * NOTE the signs: both reconstructions are ADDITIVE (+r). The blinding is
 * B' = Y + r*G and C' = C + r*A (unblind direction is C = C' - r*A).
 * Getting a sign wrong here silently rejects every legitimate coin
 * (risk HIGH — pinned by the TASK-1312 live golden vector).
 *
 * @param dleq - {e, s, r} as carried in a received Proof.dleq
 * @param secret - the Proof's secret `x` (string as carried in the token;
 *                 hashed to curve as its UTF-8 bytes, same input convention
 *                 as blind.ts blindMessage)
 * @param C - the mint's signature on the spent secret, hex
 * @param A - the mint's public key for this amount/keyset, hex
 * @returns true iff the proof reconstructs and validates (false for any
 *          malformed input, including missing/unusuable `r`)
 */
export function verifyDleqCarol(dleq: DleqProof, secret: string, C: string, A: string): boolean {
	if (!dleq || typeof dleq.r !== 'string') return false;

	const r = parseScalar(dleq.r);
	if (r === null || r === 0n) return false; // r = 0 collapses the blinding (NUT-00: 1 ≤ r < n)

	const A_ = parsePoint(A);
	if (A_ === null) return false;

	// Y = hash_to_curve(x) — reuse blind.ts implementation (no duplicate util)
	let Y: typeof G;
	try {
		Y = hash_to_curve(utf8ToBytes(secret));
	} catch {
		return false;
	}

	const C_prime = parsePoint(C);
	if (C_prime === null) return false;

	// B' = Y + r*G (same sign as Alice's own blinding: B_ = Y + r*G)
	// C' = C + r*A (inverse of the unblind C = C_ - r*A)
	// malformed/degenerate scalars (r ≥ n) make the curve math throw — false
	let B_prime: typeof G, C_prime_recon: typeof G;
	try {
		B_prime = Y.add(G.multiply(r));
		C_prime_recon = C_prime.add(A_.multiply(r));
	} catch {
		return false;
	}

	return verifyDleqAlice(dleq, uncompressedHex(B_prime), uncompressedHex(C_prime_recon), A);
}

// ─── Boundary helper: amount → key lookup (pure, no network) ──

/**
 * Look up the mint's signing key `A` for a specific amount inside a keyset's
 * keys map. Cashu keysets only carry denominiation keys for powers of two —
 * an amount without an entry (or a malformed keys map) yields undefined and
 * DLEQ verification cannot even start.
 *
 * Pure name→value lookup on an injected map: no mint cache, no network side
 * effect (the caller is responsible for obtaining the keys map, e.g. from
 * keyset.ts getMintPubkey's data source).
 *
 * @param keys - keyset keys map { amount: pubkey-hex }
 * @param amount - the denomination amount of the BlindSignature/Proof
 */
export function lookupAmountKey(keys: Record<string, string>, amount: number): string | undefined {
	if (!keys || typeof keys !== 'object' || !Number.isInteger(amount) || amount < 0) {
		return undefined;
	}
	return keys[String(amount)];
}
