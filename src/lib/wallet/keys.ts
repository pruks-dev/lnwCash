/**
 * Key generation utilities using secp256k1 (via @noble/curves).
 *
 * CRITICAL:
 * - All key generation MUST be client-side only — NO network calls.
 * - NEVER console.log, export, or transmit a private key or seed.
 * - Private key stays in memory only when wallet is unlocked.
 *
 * Seed phrase uses BIP39 English word list (2048 words).
 * Format: 24 words for 256-bit private keys.
 * (12 words = 128 bits, insufficient for secp256k1 32-byte keys.)
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64url } from '../util/base64';
import { WORDLIST } from './wordlist';

// ─── Types ───────────────────────────────────────────────────

export interface KeyPair {
	privateKey: string; // base64url encoded 32-byte private key
	publicKey: string;  // hex-encoded compressed public key (66 chars)
}

// ─── Constants ───────────────────────────────────────────────

const PRIVATE_KEY_BYTES = 32;
const SEED_WORD_COUNT = 24; // 24 × 11 = 264 bits = 32 bytes + 1 byte checksum
const BITS_PER_WORD = 11;
const CHECKSUM_BYTES = 1;
const TOTAL_BYTES = PRIVATE_KEY_BYTES + CHECKSUM_BYTES; // 33 bytes

// ─── Helpers ─────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
	let hex = '';
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, '0');
	}
	return hex;
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

// ─── Public API ──────────────────────────────────────────────

export function generateKeyPair(): KeyPair {
	const privateKeyBytes: Uint8Array = secp256k1.utils.randomSecretKey();
	const publicKeyBytes: Uint8Array = secp256k1.getPublicKey(privateKeyBytes, true);

	const privateKey = base64url.encode(privateKeyBytes);
	const publicKey = bytesToHex(publicKeyBytes);

	return { privateKey, publicKey };
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
 * Convert a private key to a 24-word BIP39-compatible mnemonic seed phrase.
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

	const combined = new Uint8Array(TOTAL_BYTES);
	combined.set(keyBytes, 0);
	combined[TOTAL_BYTES - 1] = checksum;

	const indices = bytesToWords(combined);
	return indices.map(i => WORDLIST[i]).join(' ');
}

/**
 * Convert a 24-word seed phrase back to a private key (base64url).
 * Throws on invalid phrase or checksum mismatch.
 */
export function seedToPrivateKey(seed: string): string {
	const words = seed.trim().toLowerCase().split(/\s+/);

	if (words.length !== SEED_WORD_COUNT) {
		throw new Error(`Invalid seed phrase: expected ${SEED_WORD_COUNT} words, got ${words.length}`);
	}

	const indices: number[] = [];
	for (const word of words) {
		const index = WORDLIST.indexOf(word);
		if (index === -1) {
			throw new Error(`Invalid seed word: "${word}" not found in wordlist`);
		}
		indices.push(index);
	}

	const combined = wordsToBytes(indices, TOTAL_BYTES);

	const keyBytes = combined.slice(0, PRIVATE_KEY_BYTES);
	const storedChecksum = combined[TOTAL_BYTES - 1];

	const hash = sha256(keyBytes);
	const computedChecksum = hash[0];

	if (storedChecksum !== computedChecksum) {
		throw new Error('Invalid seed phrase: checksum mismatch — check your words');
	}

	return base64url.encode(keyBytes);
}
