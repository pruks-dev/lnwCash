/**
 * Key generation utilities using secp256k1 (via @noble/curves).
 *
 * CRITICAL:
 * - All key generation MUST be client-side only — NO network calls.
 * - NEVER console.log, export, or transmit a private key or seed.
 * - Private key stays in memory only when wallet is unlocked.
 *
 * Seed phrase (mnemonic) follows the BIP39 standard (English, 2048-word list):
 * - 12 words = 128-bit entropy (16 bytes) + 4-bit checksum.
 * - Derivation: mnemonic → PBKDF2-HMAC-SHA512 (2048 iterations,
 *   salt = "mnemonic" + passphrase [empty]) → 512-bit seed
 *   → first 32 bytes = secp256k1 private key.
 *
 * Why 12 words is correct (and sufficient) for secp256k1:
 * - A secp256k1 private key is a 32-byte scalar, but its *security level* is
 *   ~128 bits (the curve order n ≈ 2^256, so discrete-log security ≈ 2^128).
 * - 128-bit entropy (12 words) therefore provides 128-bit security, matching
 *   the curve's strength. A 256-bit private key does NOT require 256 bits of
 *   entropy. This is the industry-standard BIP39 strength for Bitcoin wallets.
 *
 * Backward compatibility (dual support):
 * - Legacy wallets used a 24-word direct-mapped phrase (32-byte key + 1-byte
 *   SHA-256 checksum → 33 bytes → 24 × 11-bit words). Those wallets remain
 *   fully unlockable via the legacy path; no forced migration.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { base64url } from '../util/base64';
import { WORDLIST, LEGACY_WORDLIST } from './wordlist';

// ─── Types ───────────────────────────────────────────────────

export interface KeyPair {
	/** base64url-encoded 32-byte private key */
	privateKey: string;
	/** hex-encoded compressed public key (66 chars) */
	publicKey: string;
	/** 12-word BIP39 mnemonic (the wallet's recovery phrase) */
	mnemonic: string;
}

// ─── Constants ───────────────────────────────────────────────

const PRIVATE_KEY_BYTES = 32;
const BITS_PER_WORD = 11;

// BIP39 (new standard) path
export const BIP39_SEED_WORD_COUNT = 12;
const ENTROPY_BYTES = 16; // 128 bits
const ENTROPY_BITS = ENTROPY_BYTES * 8; // 128
const CHECKSUM_BITS = ENTROPY_BITS / 32; // 4 bits
const BIP39_PBKDF2_ITERATIONS = 2048;
const BIP39_SEED_BYTES = 64; // 512-bit PBKDF2 output
const BIP39_SALT_PREFIX = 'mnemonic';

// Legacy (v1) direct-mapped path
export const LEGACY_SEED_WORD_COUNT = 24;
const LEGACY_CHECKSUM_BYTES = 1;
const LEGACY_TOTAL_BYTES = PRIVATE_KEY_BYTES + LEGACY_CHECKSUM_BYTES; // 33 bytes

// ─── Helpers ─────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
}

function normalizeMnemonic(mnemonic: string): string[] {
	return mnemonic.trim().toLowerCase().split(/\s+/);
}

function randomEntropy(): Uint8Array {
	const entropy = new Uint8Array(ENTROPY_BYTES);
	crypto.getRandomValues(entropy);
	return entropy;
}

// ─── BIP39: entropy ↔ mnemonic ───────────────────────────────

/**
 * Encode 16 bytes (128-bit) of entropy as a 12-word BIP39 mnemonic,
 * appending the 4-bit checksum (first 4 bits of SHA-256(entropy)).
 */
function entropyToMnemonic(entropy: Uint8Array): string {
	if (entropy.length !== ENTROPY_BYTES) {
		throw new Error(`Invalid entropy length: expected ${ENTROPY_BYTES} bytes, got ${entropy.length}`);
	}

	const hash = sha256(entropy);
	const checksum = hash[0] >> (8 - CHECKSUM_BITS);

	const indices: number[] = [];
	let bitBuffer = 0;
	let bitCount = 0;

	const pushBits = (value: number, count: number): void => {
		bitBuffer = (bitBuffer << count) | value;
		bitCount += count;
		while (bitCount >= BITS_PER_WORD) {
			bitCount -= BITS_PER_WORD;
			indices.push((bitBuffer >> bitCount) & 0x7ff);
		}
	};

	for (const byte of entropy) {
		pushBits(byte, 8);
	}
	pushBits(checksum, CHECKSUM_BITS);

	return indices.map((i) => WORDLIST[i]).join(' ');
}

/**
 * Decode a 12-word BIP39 mnemonic back to entropy, validating the checksum.
 * @throws on invalid word count, unknown word, or checksum mismatch.
 */
function mnemonicToEntropy(mnemonic: string): Uint8Array {
	const words = normalizeMnemonic(mnemonic);

	if (words.length !== BIP39_SEED_WORD_COUNT) {
		throw new Error(
			`Invalid mnemonic: expected ${BIP39_SEED_WORD_COUNT} words, got ${words.length}`
		);
	}

	const indices: number[] = [];
	for (const word of words) {
		const index = WORDLIST.indexOf(word);
		if (index === -1) {
			throw new Error(`Invalid seed word: "${word}" not found in wordlist`);
		}
		indices.push(index);
	}

	const entropy = new Uint8Array(ENTROPY_BYTES);
	let bitBuffer = 0;
	let bitCount = 0;
	let byteIndex = 0;

	for (const idx of indices) {
		bitBuffer = (bitBuffer << BITS_PER_WORD) | idx;
		bitCount += BITS_PER_WORD;
		while (bitCount >= 8 && byteIndex < ENTROPY_BYTES) {
			bitCount -= 8;
			entropy[byteIndex++] = (bitBuffer >> bitCount) & 0xff;
		}
	}

	// Remaining CHECKSUM_BITS bits hold the checksum
	const storedChecksum = bitBuffer & ((1 << CHECKSUM_BITS) - 1);
	const hash = sha256(entropy);
	const expectedChecksum = hash[0] >> (8 - CHECKSUM_BITS);

	if (storedChecksum !== expectedChecksum) {
		throw new Error('Invalid seed phrase: checksum mismatch — check your words');
	}

	return entropy;
}

// ─── BIP39: mnemonic → seed → private key ────────────────────

/**
 * Derive the 512-bit BIP39 seed from a 12-word mnemonic via
 * PBKDF2-HMAC-SHA512 (2048 iterations, salt = "mnemonic" + empty passphrase).
 * Validates the mnemonic (word count, wordlist, checksum) first.
 */
export function mnemonicToSeed(mnemonic: string): Uint8Array {
	// Validate (throws on bad word count / unknown word / checksum mismatch)
	mnemonicToEntropy(mnemonic);

	const normalized = normalizeMnemonic(mnemonic).join(' ');
	const salt = BIP39_SALT_PREFIX; // + passphrase (empty)
	return pbkdf2(sha512, normalized, salt, {
		c: BIP39_PBKDF2_ITERATIONS,
		dkLen: BIP39_SEED_BYTES
	});
}

/**
 * Derive the secp256k1 private key (base64url) from a 12-word BIP39 mnemonic.
 * Takes the first 32 bytes of the 512-bit seed; throws if that scalar is
 * outside the valid secp256k1 range (astronomically unlikely).
 */
export function mnemonicToPrivateKey(mnemonic: string): string {
	const seedBytes = mnemonicToSeed(mnemonic);
	const keyBytes = seedBytes.slice(0, PRIVATE_KEY_BYTES);

	if (!secp256k1.utils.isValidSecretKey(keyBytes)) {
		throw new Error('Invalid BIP39 seed: derived private key is out of range');
	}

	return base64url.encode(keyBytes);
}

/**
 * Generate a fresh 12-word BIP39 mnemonic from 128 bits of CSPRNG entropy.
 */
export function generateMnemonic(): string {
	return entropyToMnemonic(randomEntropy());
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Generate a new keypair from a fresh 12-word BIP39 mnemonic.
 *
 * Flow: random 128-bit entropy → mnemonic (with checksum) →
 * PBKDF2-HMAC-SHA512 → 512-bit seed → first 32 bytes = private key.
 * Retries with fresh entropy if the derived scalar is invalid (≥ curve order).
 *
 * The returned `mnemonic` MUST be persisted (encrypted) so the wallet can be
 * recovered/exported — the mnemonic cannot be derived back from the key.
 */
export function generateKeyPair(): KeyPair {
	let mnemonic: string;
	let keyBytes: Uint8Array;

	do {
		mnemonic = generateMnemonic();
		keyBytes = mnemonicToSeed(mnemonic).slice(0, PRIVATE_KEY_BYTES);
	} while (!secp256k1.utils.isValidSecretKey(keyBytes));

	const publicKeyBytes = secp256k1.getPublicKey(keyBytes, true);

	return {
		privateKey: base64url.encode(keyBytes),
		publicKey: bytesToHex(publicKeyBytes),
		mnemonic
	};
}

export function getPublicKey(privateKey: string): string {
	const keyBytes = base64url.decode(privateKey);
	const pubBytes = secp256k1.getPublicKey(keyBytes, true);
	return bytesToHex(pubBytes);
}

export function verifyKeyPair(privateKey: string, publicKey: string): boolean {
	try {
		const derived = getPublicKey(privateKey);
		return derived === publicKey;
	} catch {
		return false;
	}
}

/**
 * Convert a seed phrase to a private key (base64url), auto-detecting the format:
 * - 12 words → BIP39 standard derivation (PBKDF2-HMAC-SHA512).
 * - 24 words → legacy direct-mapped derivation (backward compatible).
 *
 * Throws on invalid phrase, unknown word, or checksum mismatch.
 */
export function seedToPrivateKey(seed: string): string {
	const words = normalizeMnemonic(seed);

	if (words.length === BIP39_SEED_WORD_COUNT) {
		return mnemonicToPrivateKey(words.join(' '));
	}

	if (words.length === LEGACY_SEED_WORD_COUNT) {
		return legacySeedToPrivateKey(words);
	}

	throw new Error(
		`Invalid seed phrase: expected ${BIP39_SEED_WORD_COUNT} or ${LEGACY_SEED_WORD_COUNT} words, got ${words.length}`
	);
}

/**
 * Convert a private key to a 24-word LEGACY mnemonic (v1 direct-map).
 *
 * ⚠️ This is kept for backward compatibility ONLY — it lets users of legacy
 * wallets re-derive their original 24-word phrase. New wallets use BIP39
 * 12-word mnemonics (see generateMnemonic / generateKeyPair); a BIP39
 * mnemonic cannot be reverse-derived from a private key, so new wallets
 * persist the mnemonic itself (encrypted) for export.
 *
 * ⚠️ ผู้ใช้ต้องเก็บ seed เอง — เครื่องหาย/ล้างข้อมูล → เงินหายถาวร
 */
export function privateKeyToSeed(privateKey: string): string {
	const keyBytes = base64url.decode(privateKey);
	if (keyBytes.length !== PRIVATE_KEY_BYTES) {
		throw new Error(`Invalid private key length: expected ${PRIVATE_KEY_BYTES}, got ${keyBytes.length}`);
	}

	const hash = sha256(keyBytes);
	const checksum = hash[0];

	const combined = new Uint8Array(LEGACY_TOTAL_BYTES);
	combined.set(keyBytes, 0);
	combined[LEGACY_TOTAL_BYTES - 1] = checksum;

	const indices = bytesToWords(combined);
	return indices.map((i) => LEGACY_WORDLIST[i]).join(' ');
}

// ─── Legacy helpers (v1 direct-map, backward compat only) ────

function bytesToWords(bytes: Uint8Array): number[] {
	const words: number[] = [];
	let bitBuffer = 0;
	let bitCount = 0;

	for (let i = 0; i < bytes.length; i++) {
		bitBuffer = (bitBuffer << 8) | bytes[i];
		bitCount += 8;

		while (bitCount >= BITS_PER_WORD) {
			bitCount -= BITS_PER_WORD;
			const index = (bitBuffer >> bitCount) & 0x7ff;
			words.push(index);
		}
	}

	return words;
}

function wordsToBytes(indices: number[], expectedBytes: number): Uint8Array {
	const result = new Uint8Array(expectedBytes);
	let bitBuffer = 0;
	let bitCount = 0;
	let byteIndex = 0;

	for (const idx of indices) {
		bitBuffer = (bitBuffer << BITS_PER_WORD) | idx;
		bitCount += BITS_PER_WORD;

		while (bitCount >= 8 && byteIndex < expectedBytes) {
			bitCount -= 8;
			result[byteIndex++] = (bitBuffer >> bitCount) & 0xff;
		}
	}

	return result;
}

function legacySeedToPrivateKey(words: string[]): string {
	const indices: number[] = [];
	for (const word of words) {
		const index = LEGACY_WORDLIST.indexOf(word);
		if (index === -1) {
			throw new Error(`Invalid seed word: "${word}" not found in wordlist`);
		}
		indices.push(index);
	}

	const combined = wordsToBytes(indices, LEGACY_TOTAL_BYTES);

	const keyBytes = combined.slice(0, PRIVATE_KEY_BYTES);
	const storedChecksum = combined[LEGACY_TOTAL_BYTES - 1];

	const hash = sha256(keyBytes);
	const computedChecksum = hash[0];

	if (storedChecksum !== computedChecksum) {
		throw new Error('Invalid seed phrase: checksum mismatch — check your words');
	}

	return base64url.encode(keyBytes);
}
