/**
 * NUT-13: Deterministic secrets — versioned derivation.
 *
 * Makes ecash proof `secret` and blinding factor `r` reproducible from a
 * single wallet `seed` (the 64-byte BIP39 seed derived from the 12-word
 * mnemonic). This is the foundation for seed-phrase backup/restore:
 *   mnemonic → seed → { private key, deterministic proof secrets }.
 *
 * The derivation method depends on the keyset ID version (first two hex chars):
 * - Keyset version `00` → legacy BIP32 derivation (see deriveSecretAndRBip32).
 * - Keyset version `01` → HMAC-SHA256 derivation:
 *   message      = "Cashu_KDF_HMAC_SHA256" || keyset_id_bytes || counter_k_bytes || type
 *   secret       = HMAC-SHA256(seed, message || 0x00)                (32 bytes, hex)
 *   r            = OS2IP(HMAC-SHA256(seed, message || 0x01)) mod N   (blinding factor)
 *
 * - `keyset_id_bytes` are the hex-decoded raw bytes of the keyset ID.
 * - `counter_k_bytes` is the counter encoded as an unsigned 64-bit big-endian.
 * - `type` is `0x00` for secrets, `0x01` for blinded messages.
 */
import { HDKey } from '@scure/bip32';
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

/** BIP32 purpose for NUT-13 legacy derivation (UTF-8 for 🥜), hardened. */
const BIP32_PURPOSE = 129372;
/** BIP32 coin type for NUT-13 legacy derivation (always 0), hardened. */
const BIP32_COIN_TYPE = 0;
/** BIP32 child index (non-hardened) for the proof `secret` private key. */
const BIP32_SECRET_INDEX = 0;
/** BIP32 child index (non-hardened) for the blinding factor `r` private key. */
const BIP32_R_INDEX = 1;

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
 * `counterK` of `keysetId`, per NUT-13 (versioned derivation).
 *
 * - Keyset version `00` → legacy BIP32 derivation.
 * - Keyset version `01` → HMAC-SHA256 derivation.
 * - Any other version → throws.
 *
 * @param seed    64-byte BIP39 seed (HMAC key / BIP32 master-seed input).
 * @param keysetId  Keyset ID (hex string, version byte `00` or `01`).
 * @param counterK  Per-keyset counter (0-based output index).
 * @throws if the keyset version is unsupported.
 */
export function deriveSecretAndR(
	seed: Uint8Array,
	keysetId: string,
	counterK: number
): DerivedSecretAndR {
	const version = keysetId.slice(0, 2);

	if (version === KEYSET_V1_PREFIX) {
		return deriveSecretAndRBip32(seed, keysetId, counterK);
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
 * Derive the deterministic proof `secret` and blinding factor `r` for output
 * `counterK` of a legacy keyset (`00`), per NUT-13 "Legacy Derivation".
 *
 * Derivation paths:
 *   secret_path = m/129372'/0'/{keyset_id_int}'/{counter_k}'/0
 *   r_path      = m/129372'/0'/{keyset_id_int}'/{counter_k}'/1
 *
 * where `keyset_id_int = BigInt('0x' + keysetId) % (2^31 - 1)`.
 *
 * `secret` is the 32-byte BIP32 private key at `secret_path` (hex-encoded);
 * `r` is the 32-byte BIP32 private key at `r_path` interpreted as a bigint.
 * BIP32 private keys are already valid secp256k1 scalars in [1, N-1], so no
 * mod-N reduction is applied (unlike the HMAC path).
 */
export function deriveSecretAndRBip32(
	seed: Uint8Array,
	keysetId: string,
	counterK: number
): DerivedSecretAndR {
	const keysetIdInt = BigInt('0x' + keysetId) % (2n ** 31n - 1n);

	const secretPath = `m/${BIP32_PURPOSE}'/${BIP32_COIN_TYPE}'/${keysetIdInt}'/${counterK}'/${BIP32_SECRET_INDEX}`;
	const rPath = `m/${BIP32_PURPOSE}'/${BIP32_COIN_TYPE}'/${keysetIdInt}'/${counterK}'/${BIP32_R_INDEX}`;

	const root = HDKey.fromMasterSeed(seed);

	const secretKey = root.derive(secretPath).privateKey;
	const rKey = root.derive(rPath).privateKey;

	if (secretKey === null || secretKey.length !== 32) {
		throw new Error('NUT-13: BIP32 derivation produced no secret private key');
	}
	if (rKey === null || rKey.length !== 32) {
		throw new Error('NUT-13: BIP32 derivation produced no r private key');
	}

	return {
		secret: bytesToHex(secretKey),
		r: os2ip(rKey)
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
