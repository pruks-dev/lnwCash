/**
 * Wallet state storage — uses localStorage for:
 * - Encrypted private key (EncryptedKey)
 * - PIN hash (PinHash)
 * - Wallet state (enum + metadata)
 * - In-memory unlocked private key (never persisted in plain text)
 *
 * On Capacitor native platforms: also mirrors sensitive keys to
 * Android Keystore / iOS Keychain via capacitor-secure-storage-plugin
 * for defense-in-depth.
 */
import type { PinHash, EncryptedKey } from '../types';
import {
	getWalletMetadata,
	setWalletMetadata,
	clearWalletMetadata
} from '../storage/local';
import { isNativePlatform } from '../platform';

// ─── Storage Keys ────────────────────────────────────────────

const KEYS = {
	ENCRYPTED_KEY: 'lnwcash_encrypted_key',
	PIN_HASH: 'lnwcash_pin_hash',
	WALLET_STATE: 'lnwcash_wallet_state'
} as const;

// ─── Helpers ─────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		if (raw === null) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeJSON<T>(key: string, value: T): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		console.warn('[wallet-storage] Failed to write:', key);
	}
}

function removeKey(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		/* ignore */
	}
}

// ─── Secure Storage Mirror (Native only, fire-and-forget) ─────

let _secureStorageLoaded = false;
let _securePlugin: {
	get(opts: { key: string }): Promise<{ value: string }>;
	set(opts: { key: string; value: string }): Promise<{ value: boolean }>;
	remove(opts: { key: string }): Promise<{ value: boolean }>;
} | null = null;

async function _loadSecurePlugin(): Promise<void> {
	if (_secureStorageLoaded) return;
	_secureStorageLoaded = true;

	if (!isNativePlatform()) return;

	try {
		const mod = await import('capacitor-secure-storage-plugin');
		_securePlugin = mod.SecureStoragePlugin as unknown as typeof _securePlugin;
	} catch {
		// Not available — that's fine
	}
}

function _shortKey(key: string): string {
	// Map localStorage key → short key for secure storage
	if (key === KEYS.ENCRYPTED_KEY) return 'encrypted_key';
	if (key === KEYS.PIN_HASH) return 'pin_hash';
	if (key === KEYS.WALLET_STATE) return 'wallet_state';
	return key.replace('lnwcash_', '');
}

/**
 * Mirror a key-value pair to native secure storage (Android Keystore / iOS Keychain).
 * Fire-and-forget — failures are silently ignored.
 */
async function _mirrorToSecure(key: string, value: string): Promise<void> {
	await _loadSecurePlugin();
	if (!_securePlugin) return;

	try {
		await _securePlugin.set({ key: _shortKey(key), value });
	} catch {
		// Best effort only
	}
}

/**
 * Remove a key from native secure storage.
 */
async function _removeFromSecure(key: string): Promise<void> {
	await _loadSecurePlugin();
	if (!_securePlugin) return;

	try {
		await _securePlugin.remove({ key: _shortKey(key) });
	} catch {
		// Best effort only
	}
}

// ─── Encrypted Key ───────────────────────────────────────────

export function getEncryptedKey(): EncryptedKey | null {
	const data = readJSON<EncryptedKey | null>(KEYS.ENCRYPTED_KEY, null);

	// On native: if localStorage is empty, try reading from secure storage as fallback
	if (!data && isNativePlatform()) {
		_loadSecurePlugin().then(() => {
			if (_securePlugin) {
				_securePlugin.get({ key: 'encrypted_key' }).then(result => {
					if (result.value) {
						try {
							const parsed = JSON.parse(result.value) as EncryptedKey;
							// Restore to localStorage
							writeJSON(KEYS.ENCRYPTED_KEY, parsed);
						} catch { /* ignore */ }
					}
				}).catch(() => {});
			}
		});
	}

	return data;
}

export function setEncryptedKey(key: EncryptedKey): void {
	writeJSON(KEYS.ENCRYPTED_KEY, key);
	// Mirror to secure storage (fire-and-forget)
	_mirrorToSecure(KEYS.ENCRYPTED_KEY, JSON.stringify(key));
}

export function clearEncryptedKey(): void {
	removeKey(KEYS.ENCRYPTED_KEY);
	_removeFromSecure(KEYS.ENCRYPTED_KEY);
}

// ─── PIN Hash ────────────────────────────────────────────────

export function getPinHash(): PinHash | null {
	return readJSON<PinHash | null>(KEYS.PIN_HASH, null);
}

export function setPinHash(hash: PinHash): void {
	writeJSON(KEYS.PIN_HASH, hash);
	// Mirror to secure storage (fire-and-forget)
	_mirrorToSecure(KEYS.PIN_HASH, JSON.stringify(hash));
}

export function clearPinHash(): void {
	removeKey(KEYS.PIN_HASH);
	_removeFromSecure(KEYS.PIN_HASH);
}

// ─── Wallet State ────────────────────────────────────────────

export type WalletStateEnum = 'UNINITIALIZED' | 'LOCKED' | 'UNLOCKED' | 'DELETED';

interface StoredWalletState {
	state: WalletStateEnum;
	last_updated: number;
}

export function getWalletState(): WalletStateEnum {
	const stored = readJSON<StoredWalletState | null>(KEYS.WALLET_STATE, null);
	return stored?.state ?? 'UNINITIALIZED';
}

export function setWalletState(state: WalletStateEnum): void {
	writeJSON(KEYS.WALLET_STATE, {
		state,
		last_updated: Date.now()
	});
}

export function clearWalletState(): void {
	removeKey(KEYS.WALLET_STATE);
}

// ─── Bulk Operations ─────────────────────────────────────────

/**
 * Clear ALL wallet data from localStorage and IndexedDB.
 * Called by deleteWallet().
 */
export async function clearAllWalletData(): Promise<void> {
	clearEncryptedKey();
	clearPinHash();
	clearWalletState();
	clearWalletMetadata();

	// Clear proofs DB (may fail in test environments — handle gracefully)
	try {
		const { deleteProofDB } = await import('./proofsDb');
		await deleteProofDB();
	} catch {
		// Ignore cleanup errors
	}
}
