/**
 * Keyset management — fetch, cache, and retrieve keysets per mint.
 * Uses localStorage for caching (via storage/local.ts).
 */

import { getKeysets as fetchKeysetsFromMint } from './client';
import { setKeysetCache, getKeysetCache, clearKeysetCache } from '../storage/local';
import type { KeysetCacheEntry } from '../types';

// ─── Cache helpers ───────────────────────────────────────────

/**
 * Fetch keysets from mint API and cache them in localStorage.
 * Each mint's keysets are stored separately by mint URL.
 */
export async function fetchAndCacheKeysets(mintUrl: string): Promise<KeysetCacheEntry[]> {
	// Fetch from mint API
	const mintKeysets = await fetchKeysetsFromMint(mintUrl);

	// Convert to cache entries
	const cache: KeysetCacheEntry[] = mintKeysets.map(ks => ({
		id: ks.id,
		unit: ks.unit,
		active: ks.active,
		input_fee_ppk: ks.input_fee_ppk ?? 0,
		keys: {},
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
