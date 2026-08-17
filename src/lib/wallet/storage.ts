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
import { clearAllCounters } from './counterK';

// ─── Storage Keys ────────────────────────────────────────────

const KEYS = {
	ENCRYPTED_KEY: 'lnwcash_encrypted_key',
	ENCRYPTED_MNEMONIC: 'lnwcash_encrypted_mnemonic',
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
	if (key === KEYS.ENCRYPTED_MNEMONIC) return 'encrypted_mnemonic';
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

// ─── Encrypted Mnemonic (BIP39 12-word recovery phrase) ───────

/**
 * Encrypted BIP39 mnemonic for new (12-word) wallets.
 * Stored in addition to the encrypted key so the recovery phrase can be
 * re-exported — a BIP39 mnemonic cannot be reverse-derived from a private key.
 * Legacy (24-word) wallets do not have this key; export falls back to
 * re-deriving the legacy phrase from the private key.
 */
export function getEncryptedMnemonic(): EncryptedKey | null {
	return readJSON<EncryptedKey | null>(KEYS.ENCRYPTED_MNEMONIC, null);
}

export function setEncryptedMnemonic(key: EncryptedKey): void {
	writeJSON(KEYS.ENCRYPTED_MNEMONIC, key);
	// Mirror to secure storage (fire-and-forget)
	_mirrorToSecure(KEYS.ENCRYPTED_MNEMONIC, JSON.stringify(key));
}

export function clearEncryptedMnemonic(): void {
	removeKey(KEYS.ENCRYPTED_MNEMONIC);
	_removeFromSecure(KEYS.ENCRYPTED_MNEMONIC);
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
	clearEncryptedMnemonic();
	clearPinHash();
	clearWalletState();
	clearWalletMetadata();
	clearAllCounters();

	// TASK-273 (fix 5): wipe the ENTIRE localStorage (not selective key counting)
	// so a full delete leaves ZERO residue — rekey journal, lockout counter +
	// device secret, active mint, autolock timeout, keyset cache, mint configs,
	// and settings. The explicit clear*() calls above also removed the native
	// secure-storage mirrors (Android Keystore / iOS Keychain), which
	// localStorage.clear() cannot reach.
	try {
		localStorage.clear();
	} catch {
		// localStorage unavailable — best effort
	}

	// Clear proofs DB (may fail in test environments — handle gracefully)
	try {
		const { deleteProofDB } = await import('./proofsDb');
		await deleteProofDB();
	} catch {
		// Ignore cleanup errors
	}
}

// ─── Auto-lock timeout (TASK-210) ──────────────────────────
//
// Configurable idle timeout for the AutoLockTimer.
// Stored as a plain number of minutes under `lnwcash_autolock_timeout`.
// Default: 5 minutes. `0` = "Never" (auto-lock disabled).
// NOTE: added as NEW functions only — existing storage functions unchanged.

const AUTOLOCK_TIMEOUT_KEY = 'lnwcash_autolock_timeout';

/** Default auto-lock timeout in minutes (5 min). */
export const DEFAULT_AUTOLOCK_TIMEOUT_MINUTES = 5;

/**
 * Read the configured auto-lock timeout (minutes).
 * Returns DEFAULT_AUTOLOCK_TIMEOUT_MINUTES when unset or invalid.
 */
export function getAutolockTimeoutMinutes(): number {
	const raw = readJSON<number | null>(AUTOLOCK_TIMEOUT_KEY, null);
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
		return Math.round(raw);
	}
	return DEFAULT_AUTOLOCK_TIMEOUT_MINUTES;
}

/**
 * Persist the auto-lock timeout (minutes).
 * Clamps to `>= 0`; `0` disables auto-lock.
 */
export function setAutolockTimeoutMinutes(minutes: number): void {
	const value = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
	writeJSON(AUTOLOCK_TIMEOUT_KEY, value);
}
