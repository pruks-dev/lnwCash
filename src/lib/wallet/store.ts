/**
 * TASK-048 (D-010) — Mint config store (client-side, localStorage-backed).
 *
 * Persists MintConfig objects keyed by mint URL so that:
 *  - mint info survives page reloads
 *  - TTL-based auto-refresh is honoured
 *  - multiple mints can be tracked simultaneously
 *
 * All data is stored in localStorage under a single JSON key.
 */
import type { MintConfig } from './config';
import { DEFAULT_MINT_CONFIG, createPlaceholderConfig } from './config';

// ─── Storage Key ──────────────────────────────────────────────

const STORE_KEY = 'lnwcash_mint_configs';

// ─── Internal State ───────────────────────────────────────────

interface MintConfigStore {
	/** Map of normalized mint URL → MintConfig */
	mints: Record<string, MintConfig>;
	/** Timestamp of last store write (Unix ms) */
	_updated: number;
}

/** In-memory mirror — syncs to localStorage on every write */
let _store: MintConfigStore | null = null;

// ─── Persistence ──────────────────────────────────────────────

function loadStore(): MintConfigStore {
	if (_store) return _store;

	try {
		const raw = localStorage.getItem(STORE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as MintConfigStore;
			if (parsed && parsed.mints && typeof parsed.mints === 'object') {
				_store = parsed;
				return _store;
			}
		}
	} catch {
		// corrupt data — reset
	}

	_store = { mints: {}, _updated: 0 };
	return _store;
}

function saveStore(): void {
	if (!_store) return;
	_store._updated = Date.now();
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify(_store));
	} catch {
		console.warn('[mint-store] Failed to persist mint configs');
	}
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Get MintConfig for a specific mint URL.
 * Falls back to DEFAULT_MINT_CONFIG when the requested URL matches the
 * default mint and nothing has been stored yet.
 *
 * Returns `undefined` for unknown/non-default mints with no stored config.
 */
export function getMintConfig(mintUrl: string): MintConfig | undefined {
	const normalizedUrl = mintUrl.replace(/\/+$/, '');
	const store = loadStore();

	if (store.mints[normalizedUrl]) {
		return store.mints[normalizedUrl];
	}

	// Seed with default when it's the canonical default mint
	if (normalizedUrl === DEFAULT_MINT_CONFIG.url) {
		return { ...DEFAULT_MINT_CONFIG };
	}

	return undefined;
}

/**
 * Persist (upsert) a MintConfig in the store.
 */
export function setMintConfig(config: MintConfig): void {
	const normalizedUrl = config.url.replace(/\/+$/, '');
	const store = loadStore();

	store.mints[normalizedUrl] = {
		...config,
		url: normalizedUrl
	};

	saveStore();
}

/**
 * Remove a mint config from the store.
 */
export function removeMintConfig(mintUrl: string): void {
	const normalizedUrl = mintUrl.replace(/\/+$/, '');
	const store = loadStore();
	delete store.mints[normalizedUrl];
	saveStore();
}

/**
 * Get ALL stored mint configs.
 * Always includes the default mint (with cached or seed values)
 * unless it was explicitly removed.
 */
export function getAllMintConfigs(): MintConfig[] {
	const store = loadStore();
	const configs = Object.values(store.mints);

	// If default mint is not in store, seed it
	const hasDefault = configs.some(c => c.url === DEFAULT_MINT_CONFIG.url);
	if (!hasDefault) {
		configs.unshift({ ...DEFAULT_MINT_CONFIG });
	}

	return configs;
}

/**
 * Check whether a mint config's TTL has expired (needs refresh).
 * Returns `true` when discovery should re-fetch.
 */
export function isMintConfigStale(config: MintConfig): boolean {
	if (config.ttl <= 0) return false;        // no NUT-19 → treat as fresh
	if (config.last_info_fetch <= 0) return true; // never fetched
	const ageMs = Date.now() - config.last_info_fetch;
	return ageMs >= config.ttl * 1000;
}

/**
 * Clear ALL mint configs from the store (used during wallet deletion).
 */
export function clearMintConfigs(): void {
	_store = { mints: {}, _updated: 0 };
	try {
		localStorage.removeItem(STORE_KEY);
	} catch {
		// ignore
	}
}

/**
 * Get the default mint URL (convenience accessor).
 */
export function getDefaultMintUrl(): string {
	return DEFAULT_MINT_CONFIG.url;
}

// ─── Active Mint Tracking (shared with App.svelte) ─────────────

const ACTIVE_MINT_KEY = 'lnwcash_active_mint';

/**
 * Get the currently active mint URL.
 *
 * Reads from localStorage key `lnwcash_active_mint`.
 * Falls back to `DEFAULT_MINT_CONFIG.url` when:
 *  - no active mint is stored
 *  - the stored mint is no longer in the config store
 *  - localStorage is unavailable
 */
export function getActiveMintUrl(): string {
	try {
		const stored = localStorage.getItem(ACTIVE_MINT_KEY);
		if (stored && getMintConfig(stored)) return stored;
	} catch { /* ignore — return default */ }
	return getDefaultMintUrl();
}

/**
 * Persist the active mint URL to localStorage.
 * Used by Mint Settings page and Setup flow.
 */
export function setActiveMintUrl(url: string): void {
	try {
		localStorage.setItem(ACTIVE_MINT_KEY, url);
	} catch { /* ignore — localStorage unavailable */ }
}

/**
 * Get a MintConfig for a URL, creating a placeholder if nothing exists.
 * Always returns a MintConfig (never undefined).
 */
export function getOrCreateMintConfig(mintUrl: string): MintConfig {
	const existing = getMintConfig(mintUrl);
	if (existing) return existing;

	const placeholder = createPlaceholderConfig(mintUrl);
	setMintConfig(placeholder);
	return placeholder;
}
