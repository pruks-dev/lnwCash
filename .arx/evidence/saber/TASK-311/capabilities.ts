/**
 * TASK-311 — NUT-09 capability check.
 *
 * Detects mint NUT-08 (fee-returning melting) support BEFORE requesting a melt
 * quote. A mint that does not advertise NUT-08 will silently fall back to a
 * legacy fee model, which can produce unexpected fee_reserve values.
 *
 * Capability is cached in MintConfig with a 24h TTL so we don't hit /v1/info
 * on every melt. Heuristic fallback: Nutshell >= 0.17 advertises NUT-08 even
 * when the `nuts` map is incomplete.
 */
import { getMintInfo } from '../cashu/client';
import { getMintConfig, setMintConfig } from './store';
import type { MintConfig } from './config';

// ─── Types ────────────────────────────────────────────────────

export interface MintCapability {
	/** Zero-padded NUT numbers (e.g. ["04","05","07","08",…]) */
	nuts: string[];
	/** Raw version string from /v1/info (e.g. "Nutshell/0.20.1") */
	version: string;
	/** Unix-ms timestamp when this capability was last resolved */
	cached_at: number;
}

// ─── Constants ────────────────────────────────────────────────

/** 24h — capability info rarely changes; refresh once a day. */
const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Version Parsing ───────────────────────────────────────────

/**
 * Test whether a version string is at least major.minor.
 * Accepts shapes: "Nutshell/0.20.1", "0.20.1", "v0.18.0", "0.16.0".
 * Returns false for empty / unparseable input.
 */
export function isVersionAtLeast(
	version: string,
	targetMajor: number,
	targetMinor: number
): boolean {
	if (!version || typeof version !== 'string') return false;
	const m = version.match(/(\d+)\.(\d+)/);
	if (!m) return false;
	const major = parseInt(m[1], 10);
	const minor = parseInt(m[2], 10);
	if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
	return (
		major > targetMajor ||
		(major === targetMajor && minor >= targetMinor)
	);
}

// ─── Internal: parse /v1/info into a normalized nuts array ─────

function nutsFromMintInfo(
	nuts: Record<string, unknown> | undefined
): string[] {
	if (!nuts) return [];
	return Object.keys(nuts)
		.filter((k) => Boolean(nuts[k]))
		.map((k) => k.padStart(2, '0'))
		.sort();
}

// ─── Capability Lookup ────────────────────────────────────────

/**
 * Resolve the capability of `mintUrl` — uses a 24h cache stored in MintConfig
 * (additive `capability_checked_at` field, see config.ts).
 *
 * Cache hit → returns cached snapshot, no network call.
 * Cache miss / stale → fetches /v1/info via getMintInfo and persists.
 * Network failure + cache exists → falls back to cache (with console.warn).
 * Network failure + no cache → throws.
 */
export async function getMintCapability(mintUrl: string): Promise<MintCapability> {
	const normalized = mintUrl.replace(/\/+$/, '');
	const cached = getMintConfig(normalized);
	const now = Date.now();

	// Cache hit (within TTL)
	if (
		cached &&
		cached.capability_checked_at !== undefined &&
		now - cached.capability_checked_at < CAPABILITY_TTL_MS
	) {
		return {
			nuts: cached.supported_nuts ?? [],
			version: cached.version ?? '',
			cached_at: cached.capability_checked_at
		};
	}

	// Fetch fresh
	try {
		const info = await getMintInfo(normalized);
		const nuts = nutsFromMintInfo(
			info.nuts as Record<string, unknown> | undefined
		);
		const version = info.version ?? cached?.version ?? '';

		// Persist — additive only; preserve all existing fields.
		const updated: MintConfig = {
			url: normalized,
			name: info.name ?? cached?.name ?? '',
			pubkey: info.pubkey ?? cached?.pubkey ?? '',
			version,
			supported_nuts: nuts,
			cached_endpoints: cached?.cached_endpoints ?? [],
			ttl: cached?.ttl ?? 0,
			last_info_fetch: now,
			capability_checked_at: now
		};
		setMintConfig(updated);

		return { nuts, version, cached_at: now };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);

		// Network failure but cache exists → use cache (graceful degradation)
		if (cached) {
			console.warn(
				`[capabilities] /v1/info failed for ${normalized}, using cache: ${reason}`
			);
			return {
				nuts: cached.supported_nuts ?? [],
				version: cached.version ?? '',
				cached_at: cached.capability_checked_at ?? 0
			};
		}

		// No cache + network failure → caller cannot recover
		throw new Error(`Mint unreachable: ${normalized} (${reason})`);
	}
}

// ─── NUT-08 Check ─────────────────────────────────────────────

/**
 * True when the mint advertises NUT-08 OR is a known NUT-08-capable
 * Nutshell version (>= 0.17).
 *
 * Use this before requesting a melt quote so the rest of the melt flow
 * can branch on `fee_reserve` semantics.
 */
export async function hasNUT08(mintUrl: string): Promise<boolean> {
	const cap = await getMintCapability(mintUrl);
	if (cap.nuts.includes('08')) return true;
	return isVersionAtLeast(cap.version, 0, 17);
}
