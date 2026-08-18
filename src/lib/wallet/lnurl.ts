/**
 * LNURL-pay (LUD-06) library layer — no UI dependency.
 *
 * Provides:
 *   - Lightning address parsing (alice@domain.com)
 *   - LNURL bech32 decode (lnurl... → https URL)
 *   - LNURL-pay resolution (.well-known/lnurlp + bech32)
 *   - Invoice request (callback?amount=<msat>)
 *   - msat ↔ sat conversion
 *   - SSRF-safe URL validation (http/https only)
 *   - LNURL metadata parsing (text/plain)
 *
 * Reference:
 *   - LUD-06 (https://github.com/lnurl/luds/blob/luds/06.md)
 *   - LUD-16 (https://github.com/lnurl/luds/blob/luds/16.md)
 */

import { bech32Decode, convertBits } from './bech32';

// ─── Types ──────────────────────────────────────────────────

export interface LightningAddress {
	/** Local part (case preserved, e.g. "PrukS") */
	username: string;
	/** Domain, lowercased (e.g. "coinos.io") */
	domain: string;
}

/** LNURL-pay endpoint response (tag=payRequest) — extra fields preserved. */
export interface LnurlPayInfo {
	tag: string;
	callback: string;
	/** Minimum spendable amount in millisatoshis */
	minSendable: number;
	/** Maximum spendable amount in millisatoshis */
	maxSendable: number;
	/** JSON string of [[kind, value], ...] metadata entries */
	metadata: string;
	/** Max comment length (chars), when the server accepts comments */
	commentAllowed?: number;
	[key: string]: unknown;
}

export interface LnurlResolveResult {
	info: LnurlPayInfo;
	/** The callback URL to use for requestLnurlInvoice */
	callbackUrl: string;
}

export interface LnurlFetchOptions {
	/** Custom fetch implementation (used by tests; defaults to global fetch) */
	fetchFn?: typeof fetch;
	/** Abort timeout in milliseconds (default 15000) */
	timeoutMs?: number;
}

export type LnurlErrorCode =
	| 'invalid_lnurl'
	| 'invalid_url'
	| 'invalid_response'
	| 'invalid_tag'
	| 'http_error'
	| 'timeout';

export class LnurlError extends Error {
	public readonly code: LnurlErrorCode;

	constructor(code: LnurlErrorCode, message: string) {
		super(message);
		this.name = 'LnurlError';
		this.code = code;
	}
}

const DEFAULT_TIMEOUT_MS = 15000;

// ─── msat ↔ sat Conversion ─────────────────────────────────

/** Convert millisatoshis to satoshis (rounds to nearest sat). */
export function msatToSat(msat: number): number {
	return Math.round(msat / 1000);
}

/** Convert satoshis to millisatoshis (integer). */
export function satToMsat(sat: number): number {
	return Math.round(sat * 1000);
}

// ─── URL Validation (SSRF guard) ───────────────────────────

/**
 * Validate a URL for outbound fetch.
 * Scheme MUST be http/https only — rejects javascript:, file:, data:, etc.
 * (SSRF guard — enforced before every fetch.)
 */
export function validateLnurlUrl(url: string): boolean {
	if (!url || typeof url !== 'string') return false;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

// ─── Lightning Address ──────────────────────────────────────

/**
 * Parse a lightning address 'alice@domain.com'.
 * Rejects scheme/path/space and multiple separators.
 * Returns { username, domain } or null.
 */
export function parseLightningAddress(input: string): LightningAddress | null {
	if (!input || typeof input !== 'string') return null;
	const trimmed = input.trim();

	// Reject whitespace anywhere
	if (/\s/.test(trimmed)) return null;

	// Reject scheme (mailto:...), path (.../...), query/fragment separators
	if (/[:/\\?#]/.test(trimmed)) return null;

	const at = trimmed.indexOf('@');
	if (at <= 0 || at === trimmed.length - 1) return null;

	const username = trimmed.substring(0, at);
	const domain = trimmed.substring(at + 1);

	// Exactly one '@'
	if (domain.includes('@')) return null;
	if (!username || !domain) return null;

	return { username, domain: domain.toLowerCase() };
}

/** Quick check: is this a valid lightning address? */
export function isLightningAddress(input: string): boolean {
	return parseLightningAddress(input) !== null;
}

// ─── LNURL bech32 ───────────────────────────────────────────

/** Quick check: is this a bech32 string with HRP 'lnurl'? */
export function isLnurlBech32(s: string): boolean {
	if (!s) return false;
	const decoded = bech32Decode(s);
	return decoded !== null && decoded.hrp === 'lnurl';
}

/**
 * Decode an LNURL bech32 string into its URL payload.
 * bech32Decode (HRP='lnurl') → convertBits 5→8 → UTF-8 string.
 * Returns null on any error.
 */
export function decodeLnurlBech32(lnurl: string): string | null {
	if (!lnurl) return null;
	const decoded = bech32Decode(lnurl);
	if (!decoded) return null;
	if (decoded.hrp !== 'lnurl') return null;

	const bytes = convertBits(decoded.data, 5, 8, false);
	if (!bytes || bytes.length === 0) return null;

	try {
		return bytesToUtf8(new Uint8Array(bytes));
	} catch {
		return null;
	}
}

function bytesToUtf8(bytes: Uint8Array): string {
	if (typeof TextDecoder !== 'undefined') {
		return new TextDecoder('utf-8').decode(bytes);
	}
	let out = '';
	for (const b of bytes) out += String.fromCharCode(b);
	return out;
}

// ─── Metadata Parsing ───────────────────────────────────────

/**
 * Parse LNURL metadata JSON → array of [kind, value] → return text/plain value.
 * Falls back to `fallback` (e.g. domain) on any malformed/non-array/nested input.
 * Never throws.
 */
export function parseMetadata(metadata: string, fallback = ''): string {
	if (typeof metadata !== 'string') return fallback;
	try {
		const parsed = JSON.parse(metadata);
		if (!Array.isArray(parsed)) return fallback;
		for (const entry of parsed) {
			if (Array.isArray(entry) && entry[0] === 'text/plain') {
				const value = entry[1];
				if (typeof value === 'string' && value.length > 0) return value;
			}
		}
		return fallback;
	} catch {
		return fallback;
	}
}

// ─── Fetch (timeout + CORS direct) ──────────────────────────

async function fetchJson(url: string, options?: LnurlFetchOptions): Promise<unknown> {
	if (!validateLnurlUrl(url)) {
		throw new LnurlError('invalid_url', `Unsupported URL scheme (SSRF guard): ${url}`);
	}

	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const fetchFn = options?.fetchFn ?? fetch;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetchFn(url, {
			method: 'GET',
			signal: controller.signal,
			headers: { Accept: 'application/json' },
			credentials: 'omit' // CORS direct — no proxy, no cookies
		});

		if (!response.ok) {
			throw new LnurlError('http_error', `LNURL endpoint returned HTTP ${response.status}`);
		}

		return await response.json();
	} catch (err) {
		if (err instanceof LnurlError) throw err;
		if (err instanceof Error && err.name === 'AbortError') {
			throw new LnurlError('timeout', `LNURL request timed out after ${timeoutMs}ms`);
		}
		// Network error (ENETUNREACH/ETIMEDOUT/TypeError) — rethrow raw for honest reporting
		throw err;
	} finally {
		clearTimeout(timer);
	}
}

// ─── Resolution ─────────────────────────────────────────────

function normalizePayInfo(json: unknown, source: string): LnurlPayInfo {
	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		throw new LnurlError('invalid_response', `LNURL endpoint did not return a JSON object (${source})`);
	}
	const info = json as LnurlPayInfo;
	if (info.tag !== 'payRequest') {
		throw new LnurlError('invalid_tag', `Expected tag=payRequest, got ${String(info.tag)} (${source})`);
	}
	if (typeof info.callback !== 'string' || !info.callback) {
		throw new LnurlError('invalid_response', `LNURL payRequest missing callback (${source})`);
	}
	return info;
}

/**
 * Resolve an LNURL (bech32 'lnurl...' or plain https URL) to LnurlPayInfo.
 * Validates tag === 'payRequest' and returns callback URL.
 */
export async function resolveLnurl(
	lnurl: string,
	options?: LnurlFetchOptions
): Promise<LnurlResolveResult> {
	let url = lnurl;

	if (isLnurlBech32(lnurl)) {
		const decoded = decodeLnurlBech32(lnurl);
		if (!decoded) {
			throw new LnurlError('invalid_lnurl', 'Failed to decode LNURL bech32 payload');
		}
		url = decoded;
	}

	if (!validateLnurlUrl(url)) {
		throw new LnurlError('invalid_url', `Unsupported URL scheme (SSRF guard): ${url}`);
	}

	const json = await fetchJson(url, options);
	const info = normalizePayInfo(json, url);
	return { info, callbackUrl: info.callback };
}

/**
 * Resolve a lightning address (username@domain) via
 * GET https://{domain}/.well-known/lnurlp/{username}.
 */
export async function resolveLightningAddress(
	username: string,
	domain: string,
	options?: LnurlFetchOptions
): Promise<LnurlResolveResult> {
	const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
	const url = `https://${cleanDomain}/.well-known/lnurlp/${encodeURIComponent(username)}`;
	return resolveLnurl(url, options);
}

// ─── Invoice Request ────────────────────────────────────────

/**
 * Request a bolt11 invoice from an LNURL-pay callback.
 * GET {callback}?amount={msat}[&comment={urlencoded}]
 * Returns the bolt11 'pr' string.
 */
export async function requestLnurlInvoice(
	callback: string,
	amountMsat: number,
	comment?: string,
	options?: LnurlFetchOptions
): Promise<string> {
	if (!validateLnurlUrl(callback)) {
		throw new LnurlError('invalid_url', `Unsupported callback URL scheme (SSRF guard): ${callback}`);
	}

	const amount = Math.floor(amountMsat);
	const separator = callback.includes('?') ? '&' : '?';
	let url = `${callback}${separator}amount=${amount}`;

	if (comment !== undefined && comment !== '') {
		url += `&comment=${encodeURIComponent(comment)}`;
	}

	const json = await fetchJson(url, options);
	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		throw new LnurlError('invalid_response', 'Invoice response was not a JSON object');
	}
	const pr = (json as Record<string, unknown>).pr;
	if (typeof pr !== 'string' || !pr) {
		throw new LnurlError('invalid_response', 'Invoice response missing "pr" (bolt11) field');
	}
	return pr;
}
