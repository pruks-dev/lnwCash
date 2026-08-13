/**
 * Typed localStorage wrapper for wallet metadata, settings, and keyset cache.
 * Includes validation and fallback when localStorage is unavailable.
 */

import type { WalletMetadata, WalletSettings, ThemeMode, KeysetCacheEntry } from '../types';

// ─── Storage Keys ────────────────────────────────────────────

const KEYS = {
	WALLET_META: 'lnwcash_wallet_meta',
	SETTINGS: 'lnwcash_settings',
	KEYSET_CACHE: 'lnwcash_keyset_cache'
} as const;

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Check if localStorage is available (handles private browsing modes)
 */
function isLocalStorageAvailable(): boolean {
	try {
		const testKey = '__lnwcash_test__';
		window.localStorage.setItem(testKey, '1');
		window.localStorage.removeItem(testKey);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read and parse a JSON value from localStorage
 */
function readJSON<T>(key: string, fallback: T): T {
	if (!isLocalStorageAvailable()) return fallback;

	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		console.warn(`[localStorage] Failed to read key: ${key}`);
		return fallback;
	}
}

/**
 * Write a JSON-serialized value to localStorage
 */
function writeJSON<T>(key: string, value: T): boolean {
	if (!isLocalStorageAvailable()) return false;

	try {
		window.localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		console.warn(`[localStorage] Failed to write key: ${key}`);
		return false;
	}
}

/**
 * Remove a key from localStorage
 */
function removeKey(key: string): boolean {
	if (!isLocalStorageAvailable()) return false;

	try {
		window.localStorage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}

// ─── Wallet Metadata ─────────────────────────────────────────

export function getWalletMetadata(): WalletMetadata | null {
	const data = readJSON<WalletMetadata | null>(KEYS.WALLET_META, null);

	// Validate structure
	if (data && typeof data.name === 'string' && typeof data.created_at === 'number') {
		return data;
	}
	return null;
}

export function setWalletMetadata(meta: WalletMetadata): boolean {
	return writeJSON(KEYS.WALLET_META, meta);
}

export function clearWalletMetadata(): boolean {
	return removeKey(KEYS.WALLET_META);
}

// ─── Wallet Settings ─────────────────────────────────────────

const DEFAULT_SETTINGS: WalletSettings = {
	language: 'en',
	theme: 'dark',
	default_mint: '',
	// TASK-220: PIN keypad shuffle — default OFF per Commander.
	pin_shuffle: false
};

export function getSettings(): WalletSettings {
	const data = readJSON<Partial<WalletSettings>>(KEYS.SETTINGS, {});

	// Merge with defaults and validate
	const validThemes: ThemeMode[] = ['light', 'dark', 'system'];
	return {
		language: typeof data.language === 'string' ? data.language : DEFAULT_SETTINGS.language,
		theme: validThemes.includes(data.theme as ThemeMode) ? (data.theme as ThemeMode) : DEFAULT_SETTINGS.theme,
		default_mint:
			typeof data.default_mint === 'string' ? data.default_mint : DEFAULT_SETTINGS.default_mint,
		pin_shuffle:
			typeof data.pin_shuffle === 'boolean' ? data.pin_shuffle : DEFAULT_SETTINGS.pin_shuffle
	};
}

export function setSettings(settings: Partial<WalletSettings>): boolean {
	const current = getSettings();
	const merged: WalletSettings = { ...current, ...settings };
	return writeJSON(KEYS.SETTINGS, merged);
}

export function clearSettings(): boolean {
	return removeKey(KEYS.SETTINGS);
}

// ─── Keyset Cache ────────────────────────────────────────────

/**
 * Get keyset cache for a specific mint
 */
export function getKeysetCache(mintUrl: string): KeysetCacheEntry[] {
	const cache = readJSON<Record<string, KeysetCacheEntry[]>>(KEYS.KEYSET_CACHE, {});
	return cache[mintUrl] ?? [];
}

/**
 * Store keyset cache for a specific mint
 */
export function setKeysetCache(mintUrl: string, keysets: KeysetCacheEntry[]): boolean {
	const cache = readJSON<Record<string, KeysetCacheEntry[]>>(KEYS.KEYSET_CACHE, {});
	cache[mintUrl] = keysets;
	return writeJSON(KEYS.KEYSET_CACHE, cache);
}

/**
 * Clear keyset cache for a specific mint
 */
export function clearKeysetCache(mintUrl?: string): boolean {
	if (mintUrl) {
		const cache = readJSON<Record<string, KeysetCacheEntry[]>>(KEYS.KEYSET_CACHE, {});
		delete cache[mintUrl];
		return writeJSON(KEYS.KEYSET_CACHE, cache);
	}
	return removeKey(KEYS.KEYSET_CACHE);
}

/**
 * Get a single keyset by ID and mint URL
 */
export function getKeysetById(mintUrl: string, keysetId: string): KeysetCacheEntry | null {
	const cache = getKeysetCache(mintUrl);
	return cache.find(k => k.id === keysetId) ?? null;
}

// ─── Utility: Check localStorage availability ────────────────

export function isAvailable(): boolean {
	return isLocalStorageAvailable();
}

// ─── Clear all LNWCASH data from localStorage ────────────────

export function clearAll(): void {
	removeKey(KEYS.WALLET_META);
	removeKey(KEYS.SETTINGS);
	removeKey(KEYS.KEYSET_CACHE);
}
