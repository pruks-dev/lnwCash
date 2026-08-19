/**
 * TASK-048 (D-010) — Default mint configuration + config types.
 *
 * Provides a canonical MintConfig shape shared by discovery (fetched at runtime)
 * and a hard-coded DEFAULT_MINT_CONFIG that seeds the store before the first
 * successful /v1/info fetch.
 */
import type { CachedEndpoint } from '../types';

// ─── Mint Config Shape ────────────────────────────────────────

export interface MintConfig {
	/** Full mint URL (e.g. "https://mint.lnw.cash") — no trailing slash */
	url: string;

	/** Human-readable display name from /v1/info "name" field */
	name: string;

	/** Mint public key (hex, 33-byte compressed SEC) */
	pubkey: string;

	/** NUT version string e.g. "Nutshell/0.20.1" */
	version: string;

	/** Set of NUT numbers the mint advertises (e.g. ["4","5","07","08",…]) */
	supported_nuts: string[];

	/** NUT-19 cached endpoints (empty array when not advertised) */
	cached_endpoints: CachedEndpoint[];

	/** NUT-19 TTL in seconds. 0 = no NUT-19 / never auto-refresh */
	ttl: number;

	/** Timestamp (ms) of the last successful /v1/info fetch — 0 if never fetched */
	last_info_fetch: number;

	/** TASK-311: Timestamp (ms) of the last NUT capability check — undefined if never checked */
	capability_checked_at?: number;
}

// ─── Default Mint (lnw.cash) ──────────────────────────────────

/**
 * Canonical default mint — hard-coded values match what the real
 * https://mint.lnw.cash /v1/info returns (as of project genesis).
 *
 * These values are used as a **seed** before the discovery flow completes.
 * Once discovery succeeds, the store is updated with live data and
 * the seed is no longer referenced.
 */
export const DEFAULT_MINT_CONFIG: MintConfig = {
	url: 'https://mint.lnw.cash',
	name: 'LNWCASH mint',
	pubkey: '03d0e4cda0f937bde65b9d160b58febe04bd229243ea45e390ce80252504e1176e',
	version: 'Nutshell/0.20.1',
	supported_nuts: [
		'04', '05', '07', '08', '09', '10',
		'11', '12', '14', '17', '19', '20', '29'
	],
	cached_endpoints: [
		{ method: 'POST', path: '/v1/mint/bolt11' },
		{ method: 'POST', path: '/v1/melt/bolt11' },
		{ method: 'POST', path: '/v1/swap' }
	],
	ttl: 604800, // 7 days
	last_info_fetch: 0   // never fetched — will be set by discovery
};

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Create a minimal MintConfig from just a URL (used when mint info hasn't
 * been fetched yet). All fields are blank/empty; the caller MUST run
 * discovery to populate real values.
 */
export function createPlaceholderConfig(mintUrl: string): MintConfig {
	return {
		url: mintUrl.replace(/\/+$/, ''),
		name: '',
		pubkey: '',
		version: '',
		supported_nuts: [],
		cached_endpoints: [],
		ttl: 0,
		last_info_fetch: 0
	};
}

/**
 * Normalize a set of supported NUT numbers into zero-padded strings.
 * e.g. {4: true, 5: true, "07": true} → ["04","05","07"]
 */
export function normalizeSupportedNuts(
	nuts: Record<string, unknown>
): string[] {
	return Object.keys(nuts)
		.filter((k) => {
			// Accept any truthy value (boolean true or object)
			return Boolean(nuts[k]);
		})
		.map((k) => k.padStart(2, '0'))
		.sort();
}
