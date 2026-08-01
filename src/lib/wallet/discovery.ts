/**
 * TASK-048 (D-010) — Mint endpoint discovery flow.
 *
 * Implements NUT-06 (mint info) + NUT-19 (cached endpoint discovery):
 *  App start → GET /v1/info → parse name, version, pubkey, nuts, NUT-19 →
 *  resolve endpoint paths via TASK-047 helpers → store in MintConfig.
 */
import { getMintInfo, resolveEndpointPath } from '../cashu/client';
import type { MintInfo, CachedEndpoint, Nut19Settings } from '../types';
import {
	getMintConfig,
	setMintConfig,
	type MintConfig
} from './store';
import { createPlaceholderConfig, normalizeSupportedNuts } from './config';

// ─── Error Types ───────────────────────────────────────────────

export class DiscoveryError extends Error {
	constructor(
		message: string,
		public readonly mintUrl: string,
		public readonly cause?: Error
	) {
		super(message);
		this.name = 'DiscoveryError';
	}
}

// ─── NUT-19 Parsing ───────────────────────────────────────────

interface ParsedNut19 {
	cached_endpoints: CachedEndpoint[];
	ttl: number;
}

function parseNut19(mintInfo: MintInfo): ParsedNut19 {
	const nut19 = mintInfo.nuts?.['19'] as Nut19Settings | undefined;
	if (!nut19) return { cached_endpoints: [], ttl: 0 };

	return {
		cached_endpoints: nut19.cached_endpoints ?? [],
		ttl: nut19.ttl ?? 0
	};
}

// ─── Info → Config Conversion ─────────────────────────────────

/**
 * Convert raw MintInfo (from GET /v1/info) into a stored MintConfig.
 */
export function mintInfoToConfig(mintUrl: string, mintInfo: MintInfo): MintConfig {
	const supported_nuts = mintInfo.nuts
		? normalizeSupportedNuts(mintInfo.nuts)
		: [];

	const { cached_endpoints, ttl } = parseNut19(mintInfo);

	return {
		url: mintUrl.replace(/\/+$/, ''),
		name: mintInfo.name ?? '',
		pubkey: mintInfo.pubkey ?? '',
		version: mintInfo.version ?? '',
		supported_nuts,
		cached_endpoints,
		ttl,
		last_info_fetch: Date.now()
	};
}

// ─── Discovery Flow ───────────────────────────────────────────

/** Result shape returned by discoverMintEndpoints */
export interface DiscoveryResult {
	success: boolean;
	config: MintConfig;

	/**
	 * Resolved endpoint paths per TASK-047 resolveEndpointPath logic.
	 * Keys are logical operations: mint_operation, mint_quote, melt_operation, melt_quote, swap
	 */
	resolvedPaths: Partial<Record<string, string>>;

	/** True if the info was fetched fresh (not from cache) */
	wasRefreshed: boolean;

	error?: string;
}

/**
 * Discover (or refresh) mint info and resolve all endpoint paths.
 *
 * Flow:
 *  1. Check store for cached config — if TTL is still valid, skip fetch
 *  2. GET /v1/info from the mint
 *  3. Parse MintInfo → MintConfig
 *  4. Resolve all 5 operation endpoints via resolveEndpointPath() (TASK-047)
 *  5. Persist MintConfig in the store
 *
 * @param mintUrl — URL of the Cashu mint (e.g. "https://mint.lnw.cash")
 * @returns DiscoveryResult  { success, config, resolvedPaths, wasRefreshed }
 */
export async function discoverMintEndpoints(
	mintUrl: string
): Promise<DiscoveryResult> {
	const normalizedUrl = mintUrl.replace(/\/+$/, '');

	// Step 1 — check store cache
	const cached = getMintConfig(normalizedUrl);
	const now = Date.now();

	if (cached && cached.ttl > 0 && cached.last_info_fetch > 0) {
		const ageMs = now - cached.last_info_fetch;
		const ttlMs = cached.ttl * 1000;
		if (ageMs < ttlMs) {
			// Cache still fresh — resolve paths from cached data
			const resolvedPaths = resolveAllPaths(cached);
			return {
				success: true,
				config: cached,
				resolvedPaths,
				wasRefreshed: false
			};
		}
	}

	// Step 2 — fetch fresh info
	let mintInfo: MintInfo;
	try {
		mintInfo = await getMintInfo(normalizedUrl);
	} catch (error) {
		// Fallback to store or placeholder
		const fallback = cached ?? createPlaceholderConfig(normalizedUrl);
		const resolvedPaths = resolveAllPaths(fallback);

		return {
			success: false,
			config: fallback,
			resolvedPaths,
			wasRefreshed: false,
			error: `Mint unreachable: ${normalizedUrl} — ${error instanceof Error ? error.message : String(error)}`
		};
	}

	// Step 3 — validate response has required fields
	if (!mintInfo || typeof mintInfo !== 'object') {
		const fallback = cached ?? createPlaceholderConfig(normalizedUrl);
		return {
			success: false,
			config: fallback,
			resolvedPaths: resolveAllPaths(fallback),
			wasRefreshed: false,
			error: `Invalid mint info response from ${normalizedUrl}`
		};
	}

	// Step 4 — convert + persist
	const config = mintInfoToConfig(normalizedUrl, mintInfo);
	setMintConfig(config);

	// Step 5 — resolve endpoint paths
	const resolvedPaths = resolveAllPaths(config);

	return {
		success: true,
		config,
		resolvedPaths,
		wasRefreshed: true
	};
}

// ─── Path Resolution ──────────────────────────────────────────

/** Resolve all 5 operation paths for a given mint config */
function resolveAllPaths(config: MintConfig): Partial<Record<string, string>> {
	// Reconstruct minimal MintInfo for the resolver from TASK-047
	const mintInfo: MintInfo = {
		name: config.name,
		pubkey: config.pubkey,
		version: config.version,
		nuts: {}
	};

	// Inject NUT-19 if available
	if (config.cached_endpoints.length > 0) {
		mintInfo.nuts!['19'] = {
			cached_endpoints: config.cached_endpoints,
			ttl: config.ttl
		};
	}

	// Build minimal NUT-04/05 from supported_nuts for quote resolution
	if (config.supported_nuts.includes('04')) {
		mintInfo.nuts!['4'] = {
			methods: [{ method: 'bolt11', unit: 'sat' }],
			disabled: false
		};
	}
	if (config.supported_nuts.includes('05')) {
		mintInfo.nuts!['5'] = {
			methods: [{ method: 'bolt11', unit: 'sat' }],
			disabled: false
		};
	}

	return {
		mint_operation: resolveEndpointPath(mintInfo, 'mint_operation'),
		mint_quote: resolveEndpointPath(mintInfo, 'mint_quote'),
		melt_operation: resolveEndpointPath(mintInfo, 'melt_operation'),
		melt_quote: resolveEndpointPath(mintInfo, 'melt_quote'),
		swap: resolveEndpointPath(mintInfo, 'swap')
	};
}

/**
 * Lightweight check: can the mint be reached?
 * Returns boolean — does NOT throw.
 */
export async function isMintReachable(mintUrl: string): Promise<boolean> {
	try {
		await getMintInfo(mintUrl);
		return true;
	} catch {
		return false;
	}
}
