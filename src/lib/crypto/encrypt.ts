/**
 * PIN-based encryption utilities using Web Crypto API.
 *
 * Architecture:
 * - PIN → PBKDF2 → AES-GCM key (for private key encryption)
 * - PIN → PBKDF2 → hash (for PIN verification — never stores plain PIN)
 *
 * CRITICAL: localStorage must NEVER contain a plain text private key.
 */

import { base64url } from '../util/base64';
import type { PinHash, EncryptedKey } from '../types';

// ─── Constants ───────────────────────────────────────────────

const PBKDF2_ITERATIONS = 600_000; // OWASP recommended for PBKDF2-HMAC-SHA256
const SALT_LENGTH = 32; // bytes
const IV_LENGTH = 12; // bytes for AES-GCM
const HASH_LENGTH = 32; // bytes for PIN hash
const AES_KEY_LENGTH = 256; // bits
const KEY_USAGE = 'AES-GCM';

/**
 * Guard: crypto.subtle requires Secure Context (HTTPS or localhost).
 * Early detection — prevents silent failures in Web Crypto API calls.
 */
function assertSecureContext(): void {
	if (!globalThis.isSecureContext) {
		throw new Error(
			'SECURE_CONTEXT_REQUIRED: crypto.subtle is unavailable in non-Secure Context.\n' +
			'Web Crypto API (crypto.subtle) requires HTTPS or localhost.\n' +
			'Solution: Use HTTPS (generate cert with scripts/generate-cert.sh) or access via localhost.'
		);
	}
}

// ─── Type Helpers (TS 6.0 compatibility) ─────────────────────

type FixedUint8Array = Uint8Array<ArrayBuffer>;

function toUint8Array(buf: ArrayBuffer): FixedUint8Array {
	return new Uint8Array(buf) as FixedUint8Array;
}

// ─── Helpers ─────────────────────────────────────────────────

function encodeBase64url(data: FixedUint8Array): string {
	return base64url.encode(data);
}

function decodeBase64url(data: string): FixedUint8Array {
	return base64url.decode(data) as FixedUint8Array;
}

function generateSalt(length: number = SALT_LENGTH): FixedUint8Array {
	const buf = new ArrayBuffer(length);
	const view = new Uint8Array(buf) as FixedUint8Array;
	crypto.getRandomValues(view);
	return view;
}

function generateIV(): FixedUint8Array {
	const buf = new ArrayBuffer(IV_LENGTH);
	const view = new Uint8Array(buf) as FixedUint8Array;
	crypto.getRandomValues(view);
	return view;
}

// ─── PIN → Key Derivation (PBKDF2) ──────────────────────────

/**
 * Derive an AES-GCM key from a PIN and salt using PBKDF2.
 */
async function deriveAesKey(pin: string, salt: FixedUint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const pinBytes = encoder.encode(pin);

	try {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			pinBytes,
			'PBKDF2',
			false,
			['deriveBits', 'deriveKey']
		);

		return await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: salt.buffer,
				iterations: PBKDF2_ITERATIONS,
				hash: 'SHA-256'
			},
			keyMaterial,
			{
				name: KEY_USAGE,
				length: AES_KEY_LENGTH
			},
			false,
			['encrypt', 'decrypt']
		);
	} catch (err) {
		throw new Error(
			`ENCRYPT_FAILED: Key derivation failed.\n` +
			`Ensure secure context (HTTPS or localhost) is active.\n` +
			`Original error: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

/**
 * Derive a key for PIN hashing using PBKDF2 + HMAC.
 */
async function deriveHashKey(pin: string, salt: FixedUint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const pinBytes = encoder.encode(pin);

	try {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			pinBytes,
			'PBKDF2',
			false,
			['deriveBits', 'deriveKey']
		);

		return await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: salt.buffer,
				iterations: PBKDF2_ITERATIONS,
				hash: 'SHA-256'
			},
			keyMaterial,
			{
				name: 'HMAC',
				hash: 'SHA-256',
				length: HASH_LENGTH * 8
			},
			false,
			['sign']
		);
	} catch (err) {
		throw new Error(
			`ENCRYPT_FAILED: Hash key derivation failed.\n` +
			`Ensure secure context (HTTPS or localhost) is active.\n` +
			`Original error: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

// ─── Public API: deriveKey (for external use) ────────────────

export async function deriveKey(pin: string, salt: string): Promise<CryptoKey> {
	assertSecureContext();
	const saltBytes = decodeBase64url(salt);
	return deriveAesKey(pin, saltBytes);
}

// ─── PIN Verification ───────────────────────────────────────

/**
 * Hash a PIN using PBKDF2 and return salt+hash for storage.
 */
export async function hashPin(pin: string): Promise<PinHash> {
	assertSecureContext();
	const salt = generateSalt();
	const key = await deriveHashKey(pin, salt);

	const encoder = new TextEncoder();

	try {
		const hashBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode('lnwcash-pin'));
		return {
			salt: encodeBase64url(salt),
			hash: encodeBase64url(toUint8Array(hashBuffer)),
			iterations: PBKDF2_ITERATIONS
		};
	} catch (err) {
		throw new Error(
			`ENCRYPT_FAILED: PIN hashing failed.\n` +
			`Ensure secure context (HTTPS or localhost) is active.\n` +
			`Original error: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

/**
 * Verify a PIN against a stored hash.
 */
export async function verifyPin(pin: string, storedHash: PinHash): Promise<boolean> {
	assertSecureContext();
	try {
		const saltBytes = decodeBase64url(storedHash.salt);
		const key = await deriveHashKey(pin, saltBytes);

		const encoder = new TextEncoder();
		const hashBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode('lnwcash-pin'));

		return encodeBase64url(toUint8Array(hashBuffer)) === storedHash.hash;
	} catch {
		return false;
	}
}

// ─── Private Key Encryption (AES-GCM) ───────────────────────

/**
 * Encrypt a private key using a PIN-derived AES-GCM key.
 */
export async function encryptKey(privateKey: string, pin: string): Promise<EncryptedKey> {
	assertSecureContext();
	const salt = generateSalt();
	const iv = generateIV();
	const key = await deriveAesKey(pin, salt);

	const encoder = new TextEncoder();
	const plaintext = encoder.encode(privateKey);

	try {
		const ciphertext = await crypto.subtle.encrypt(
			{
				name: KEY_USAGE,
				iv: iv.buffer
			},
			key,
			plaintext
		);

		return {
			salt: encodeBase64url(salt),
			iv: encodeBase64url(iv),
			iterations: PBKDF2_ITERATIONS,
			data: encodeBase64url(toUint8Array(ciphertext))
		};
	} catch (err) {
		throw new Error(
			`ENCRYPT_FAILED: Encryption failed.\n` +
			`Ensure secure context (HTTPS or localhost) is active.\n` +
			`Original error: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}

/**
 * Decrypt a private key using a PIN and the stored encrypted data.
 */
export async function decryptKey(encryptedKey: EncryptedKey, pin: string): Promise<string> {
	assertSecureContext();
	const saltBytes = decodeBase64url(encryptedKey.salt);
	const ivBytes = decodeBase64url(encryptedKey.iv);
	const ciphertext = decodeBase64url(encryptedKey.data);

	const key = await deriveAesKey(pin, saltBytes);

	try {
		const plaintext = await crypto.subtle.decrypt(
			{
				name: KEY_USAGE,
				iv: ivBytes.buffer
			},
			key,
			ciphertext.buffer
		);

		const decoder = new TextDecoder();
		return decoder.decode(plaintext);
	} catch (err) {
		throw new Error(
			`ENCRYPT_FAILED: Decryption failed.\n` +
			`Ensure secure context (HTTPS or localhost) is active.\n` +
			`Original error: ${err instanceof Error ? err.message : String(err)}`
		);
	}
}
