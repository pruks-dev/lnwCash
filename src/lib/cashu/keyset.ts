/**
 * Keyset management — fetch, cache, and retrieve keysets per mint.
 * Uses localStorage for caching (via storage/local.ts).
 */

import { setKeysetCache, getKeysetCache, clearKeysetCache } from '../storage/local';
import type { KeysetCacheEntry } from '../types';

// ─── Cache helpers ───────────────────────────────────────────

/**
 * Fetch keysets from mint API and cache them in localStorage.
 * Each mint's keysets are stored separately by mint URL.
 *
 * Calls /v1/keys to get keysets with their keys included.
 */
export async function fetchAndCacheKeysets(mintUrl: string): Promise<KeysetCacheEntry[]> {
	// Fetch from /v1/keys endpoint (includes keys in response)
	const url = `${mintUrl.replace(/\/+$/, '')}/v1/keys`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	let data: { keysets?: Array<{ id: string; unit: string; active: boolean; input_fee_ppk?: number; keys: Record<number, string> }> };
	try {
		const res = await fetch(url, {
			headers: { 'Accept': 'application/json' },
			signal: controller.signal
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}: Failed to fetch keys`);
		}
		data = await res.json();
	} finally {
		clearTimeout(timeout);
	}

	// Convert to cache entries with keys populated
	const mintKeysets = data?.keysets ?? [];
	const cache: KeysetCacheEntry[] = mintKeysets.map(ks => ({
		id: ks.id,
		unit: ks.unit,
		active: ks.active,
		input_fee_ppk: ks.input_fee_ppk ?? 0,
		keys: ks.keys ?? {},
		last_updated: Date.now()
	}));

	// Store in localStorage by mint URL
	setKeysetCache(mintUrl, cache);

	return cache;
}

/**
 * Get a keyset from cache by mint URL and keyset ID.
 */
export function getKeysetById(mintUrl: string, keysetId: string): KeysetCacheEntry | null {
	const cache = getKeysetCache(mintUrl);
	return cache.find(k => k.id === keysetId) ?? null;
}

/**
 * Get all cached keysets for a mint.
 */
export function getAllKeysets(mintUrl: string): KeysetCacheEntry[] {
	return getKeysetCache(mintUrl);
}

/**
 * Rotate keysets: re-fetch from mint API and replace cache.
 * Returns the new keyset list.
 */
export async function rotateKeysets(mintUrl: string): Promise<KeysetCacheEntry[]> {
	// Clear existing cache for this mint
	clearKeysetCache(mintUrl);

	// Fetch and store fresh keysets
	return fetchAndCacheKeysets(mintUrl);
}

/**
 * Get the mint's public key for a given keyset ID.
 *
 * The mint key A is the public key used to sign outputs for a specific
 * denomination in this keyset. Returns the key for the lowest available
 * denomination (which is the mint's signing key).
 *
 * @param mintUrl - The Cashu mint URL
 * @param keysetId - The keyset ID
 * @returns The mint's public key as a hex string, or undefined if not found
 */
export function 	getMintPubkey(mintUrl: string, keysetId: string): string | undefined {
	const fullId = resolveKeysetId(mintUrl, keysetId) || keysetId;
	const keyset = getKeysetById(mintUrl, fullId);
	if (!keyset || !keyset.keys) return undefined;

	// Find the lowest denomination key
	const amounts = Object.keys(keyset.keys).map(Number).filter(n => !isNaN(n));
	if (amounts.length === 0) return undefined;

	const minAmount = Math.min(...amounts);
	return keyset.keys[minAmount];
}

/**
 * Resolve a short keyset ID (first 8 bytes as hex) to the full keyset ID.
 */
export function resolveKeysetId(mintUrl: string, shortId: string): string | undefined {
	if (shortId.length > 16) return shortId; // Already full ID

	const allKeysets = getAllKeysets(mintUrl);
	for (const ks of allKeysets) {
		if (ks.id.startsWith(shortId)) {
			return ks.id;
		}
	}
	return undefined;
}

/**
 * Check if keyset cache is stale (older than maxAge ms).
 */
export function isCacheStale(mintUrl: string, maxAge: number = 3600000): boolean {
	const cache = getKeysetCache(mintUrl);
	if (cache.length === 0) return true;

	// Check if any entry is older than maxAge
	const now = Date.now();
	return cache.some(k => now - k.last_updated > maxAge);
}

/**
 * Clear all cached keysets for a mint (or all mints if no URL specified).
 */
export function clearCache(mintUrl?: string): void {
	clearKeysetCache(mintUrl);
}
