/**
 * NUT-13: Deterministic secrets — HMAC-SHA256 derivation (keyset V2).
 *
 * Makes ecash proof `secret` and blinding factor `r` reproducible from a
 * single wallet `seed` (the 64-byte BIP39 seed derived from the 12-word
 * mnemonic). This is the foundation for seed-phrase backup/restore:
 *   mnemonic → seed → { private key, deterministic proof secrets }.
 *
 * Derivation (per NUT-13 "HMAC-SHA256 Derivation", keyset version `01`):
 *   message      = "Cashu_KDF_HMAC_SHA256" || keyset_id_bytes || counter_k_bytes || type
 *   secret       = HMAC-SHA256(seed, message || 0x00)                (32 bytes, hex)
 *   r            = OS2IP(HMAC-SHA256(seed, message || 0x01)) mod N   (blinding factor)
 *
 * - `keyset_id_bytes` are the hex-decoded raw bytes of the keyset ID.
 * - `counter_k_bytes` is the counter encoded as an unsigned 64-bit big-endian.
 * - `type` is `0x00` for secrets, `0x01` for blinded messages.
 *
 * Keyset version `00` (legacy BIP32 derivation) is deprecated by NUT-13 and
 * intentionally NOT implemented here — we throw rather than silently derive
 * incompatible secrets.
 */
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes, concatBytes } from '@noble/hashes/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { mnemonicToSeed } from './keys';

// ─── Constants ───────────────────────────────────────────────

/** NUT-13 domain-separation / purpose string. */
export const CASHU_KDF_DOMAIN = 'Cashu_KDF_HMAC_SHA256';

/** secp256k1 scalar field (group) order N. */
const SECP256K1_N = secp256k1.Point.Fn.ORDER;

/** Keyset version prefixes (first two hex chars of the keyset ID). */
const KEYSET_V2_PREFIX = '01';
const KEYSET_V1_PREFIX = '00';

/** derivation_type_byte — appended to the KDF message. */
const DERIVE_SECRET = 0x00;
const DERIVE_BLINDING_FACTOR = 0x01;

// ─── Types ───────────────────────────────────────────────────

export interface DerivedSecretAndR {
	/** 32-byte proof secret, hex-encoded (64 chars). */
	secret: string;
	/** Blinding factor r as a bigint in [1, N-1]. */
	r: bigint;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Encode a counter as an unsigned 64-bit big-endian byte string. */
function counterBytes(counter: number): Uint8Array {
	const bytes = new Uint8Array(8);
	let v = BigInt(counter);
	for (let i = 7; i >= 0; i--) {
		bytes[i] = Number(v & 0xffn);
		v >>= 8n;
	}
	return bytes;
}

/** Big-endian byte string → integer (OS2IP). */
function os2ip(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) {
		x = (x << 8n) | BigInt(b);
	}
	return x;
}

/** Build the HMAC message: domain || keyset_id_bytes || counter(8B BE) || type. */
function buildMessage(keysetId: string, counter: number, type: number): Uint8Array {
	return concatBytes(
		utf8ToBytes(CASHU_KDF_DOMAIN),
		hexToBytes(keysetId),
		counterBytes(counter),
		new Uint8Array([type])
	);
}

// ─── Derivation ──────────────────────────────────────────────

/**
 * Derive the deterministic proof `secret` and blinding factor `r` for output
 * `counterK` of `keysetId`, per NUT-13 HMAC-SHA256 derivation (keyset V2).
 *
 * @param seed    64-byte BIP39 seed (HMAC key).
 * @param keysetId  Keyset ID (hex string, version byte `01`).
 * @param counterK  Per-keyset counter (0-based output index).
 * @throws if the keyset version is not supported (`00` legacy or unknown).
 */
export function deriveSecretAndR(
	seed: Uint8Array,
	keysetId: string,
	counterK: number
): DerivedSecretAndR {
	const version = keysetId.slice(0, 2);

	if (version === KEYSET_V1_PREFIX) {
		throw new Error(
			'NUT-13: legacy BIP32 derivation for keyset version "00" is not supported'
		);
	}
	if (version !== KEYSET_V2_PREFIX) {
		throw new Error(
			`NUT-13: unsupported keyset version "${version}" (expected "01" for HMAC-SHA256)`
		);
	}

	const secretDigest = hmac(sha256, seed, buildMessage(keysetId, counterK, DERIVE_SECRET));
	const rDigest = hmac(sha256, seed, buildMessage(keysetId, counterK, DERIVE_BLINDING_FACTOR));

	const r = os2ip(rDigest) % SECP256K1_N;
	if (r === 0n) {
		throw new Error('NUT-13: derived invalid blinding scalar r == 0');
	}

	return {
		secret: bytesToHex(secretDigest),
		r
	};
}

/**
 * Convenience: derive only the proof `secret` (hex) for `counterK` of `keysetId`.
 */
export function deriveSecret(seed: Uint8Array, keysetId: string, counterK: number): string {
	return deriveSecretAndR(seed, keysetId, counterK).secret;
}

// ─── Seed helpers ────────────────────────────────────────────

/**
 * Derive the 64-byte BIP39 seed from a 12-word mnemonic (PBKDF2-HMAC-SHA512).
 * Delegates to keys.ts (TASK-205).
 */
export function seedFromMnemonic(mnemonic: string): Uint8Array {
	return mnemonicToSeed(mnemonic);
}

// ─── In-memory active seed (never persisted) ─────────────────

/**
 * The wallet's deterministic seed, held in memory only while the wallet is
 * unlocked. Populated by the app layer from the decrypted mnemonic via
 * `setActiveSeed(seedFromMnemonic(mnemonic))`. NOT written to storage.
 */
let activeSeed: Uint8Array | null = null;

export function setActiveSeed(seed: Uint8Array): void {
	activeSeed = seed;
}

export function getActiveSeed(): Uint8Array | null {
	return activeSeed;
}

export function clearActiveSeed(): void {
	activeSeed = null;
}
