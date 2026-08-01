/**
 * Capacitor Secure Storage adapter — uses Android Keystore / iOS Keychain
 * for storing sensitive keys when running as a native app.
 *
 * Fallback: localStorage (keys are already encrypted by the encrypt module).
 *
 * API matches capacitor-secure-storage-plugin's SecureStoragePlugin interface.
 */

import { isNativePlatform } from '../platform';

// ─── Types ───────────────────────────────────────────────────

interface NativeSecureStorage {
	get(options: { key: string }): Promise<{ value: string }>;
	set(options: { key: string; value: string }): Promise<{ value: boolean }>;
	remove(options: { key: string }): Promise<{ value: boolean }>;
	clear(): Promise<{ value: boolean }>;
}

// ─── Lazy Native Plugin Load ─────────────────────────────────

let nativePlugin: NativeSecureStorage | null = null;
let loadAttempted = false;

async function getNativePlugin(): Promise<NativeSecureStorage | null> {
	if (loadAttempted) return nativePlugin;
	loadAttempted = true;

	if (!isNativePlatform()) return null;

	try {
		const mod = await import('capacitor-secure-storage-plugin');
		nativePlugin = mod.SecureStoragePlugin as unknown as NativeSecureStorage;
		return nativePlugin;
	} catch {
		console.warn('[secure-native] Failed to load capacitor-secure-storage-plugin');
		return null;
	}
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Get a value by key.
 * - Native: reads from Android Keystore / iOS Keychain
 * - Web: falls back to localStorage
 */
export async function secureGet(key: string): Promise<string | null> {
	const plugin = await getNativePlugin();

	if (plugin) {
		try {
			const result = await plugin.get({ key });
			return result.value;
		} catch {
			return null;
		}
	}

	// Fallback: localStorage
	try {
		return localStorage.getItem(`lnwcash_secure_${key}`);
	} catch {
		return null;
	}
}

/**
 * Set a value by key.
 * - Native: stores in Android Keystore / iOS Keychain
 * - Web: falls back to localStorage
 */
export async function secureSet(key: string, value: string): Promise<boolean> {
	const plugin = await getNativePlugin();

	if (plugin) {
		try {
			const result = await plugin.set({ key, value });
			return result.value;
		} catch {
			return false;
		}
	}

	// Fallback: localStorage
	try {
		localStorage.setItem(`lnwcash_secure_${key}`, value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Remove a value by key.
 * - Native: removes from Android Keystore / iOS Keychain
 * - Web: falls back to localStorage
 */
export async function secureRemove(key: string): Promise<boolean> {
	const plugin = await getNativePlugin();

	if (plugin) {
		try {
			const result = await plugin.remove({ key });
			return result.value;
		} catch {
			return false;
		}
	}

	// Fallback: localStorage
	try {
		localStorage.removeItem(`lnwcash_secure_${key}`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Clear all secure storage entries for this app.
 * - Native: clears all from Android Keystore / iOS Keychain
 * - Web: clears localStorage entries under our prefix
 */
export async function secureClear(): Promise<boolean> {
	const plugin = await getNativePlugin();

	if (plugin) {
		try {
			const result = await plugin.clear();
			return result.value;
		} catch {
			return false;
		}
	}

	// Fallback: localStorage — clear all lnwcash_secure_* entries
	try {
		const keysToRemove: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith('lnwcash_secure_')) {
				keysToRemove.push(key);
			}
		}
		keysToRemove.forEach(k => localStorage.removeItem(k));
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if secure storage is using native backend (Keystore/Keychain) or fallback.
 */
export async function isSecureNative(): Promise<boolean> {
	const plugin = await getNativePlugin();
	return plugin !== null;
}
