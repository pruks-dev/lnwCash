/**
 * Cashu V4 token encode/decode utilities (NUT-00 V4).
 *
 * Supports both legacy cashuA (V3) and current cashuB (V4) token formats.
 * Default encoding uses cashuB prefix; fallback to legacy cashuA available.
 *
 * Format: base64url-encoded JSON with "cashuB" (V4) or "cashuA" (V3 legacy) prefix.
 */

import { base64url } from '../util/base64';
import type { CashuToken, DecodedToken, TokenProof } from '../types';

/** NUT-00 V4 token prefix (current, default) */
export const TOKEN_PREFIX_V4 = 'cashuB';
/** NUT-00 V3 legacy token prefix (backward compatible) */
export const TOKEN_PREFIX = 'cashuA';
const TOKEN_VERSION = 'A';

/**
 * Encode proofs into a Cashu V4 token string.
 *
 * @param proofs - Array of TokenProof objects
 * @param mintUrl - The mint URL for these proofs
 * @param unit - Optional unit (default: "sat")
 * @param memo - Optional memo note
 * @param legacy - Use legacy cashuA prefix instead of cashuB (default: false)
 * @returns Cashu token string (e.g. "cashuBeyJ0b2tlbiI6..." or "cashuAeyJ0b2tlbiI6...")
 */
export function encodeToken(
	proofs: TokenProof[],
	mintUrl: string,
	unit: string = 'sat',
	memo?: string,
	legacy?: boolean
): string {
	const token: CashuToken = {
		token: [
			{
				mint: mintUrl,
				proofs
			}
		],
		unit
	};

	if (memo) {
		token.memo = memo;
	}

	const jsonStr = JSON.stringify(token);
	const encoder = new TextEncoder();
	const jsonBytes = encoder.encode(jsonStr);
	const base64 = base64url.encode(jsonBytes);

	const prefix = legacy ? TOKEN_PREFIX : TOKEN_PREFIX_V4;
	return `${prefix}${base64}`;
}

/**
 * Decode a Cashu V4 token string back into its components.
 *
 * Auto-detects token prefix:
 *   - cashuB → decode as V4 token
 *   - cashuA → decode as legacy V3 token
 *   - other cashu* prefix → throws error (unknown format)
 *   - no prefix → attempt decode as-is (backward compatibility)
 *
 * @param token - Cashu token string (e.g. "cashuBeyJ0b2tlbiI6..." or "cashuA...")
 * @returns DecodedToken with proofs, mint URL, and unit
 */
export function decodeToken(token: string): DecodedToken {
	let encoded: string;

	if (token.startsWith(TOKEN_PREFIX_V4)) {
		encoded = token.slice(TOKEN_PREFIX_V4.length);
	} else if (token.startsWith(TOKEN_PREFIX)) {
		encoded = token.slice(TOKEN_PREFIX.length);
	} else if (/^cashu[A-Za-z]/.test(token)) {
		// Unknown cashu prefix (e.g. "cashuC", "cashuX")
		const match = token.match(/^cashu[A-Za-z]+/);
		const prefix = match ? match[0] : token.slice(0, 8);
		throw new Error(`Unknown Cashu token prefix: "${prefix}". Expected "cashuB" (V4) or "cashuA" (legacy).`);
	} else {
		// No recognized prefix — try to decode as-is (backward compatibility)
		encoded = token;
	}

	const jsonBytes = base64url.decode(encoded);
	const decoder = new TextDecoder();
	const jsonStr = decoder.decode(jsonBytes);
	const parsed = JSON.parse(jsonStr) as CashuToken;

	if (!parsed.token || !Array.isArray(parsed.token) || parsed.token.length === 0) {
		throw new Error('Invalid token format: missing token array');
	}

	const firstEntry = parsed.token[0];

	if (!firstEntry.proofs || !Array.isArray(firstEntry.proofs)) {
		throw new Error('Invalid token format: missing proofs array');
	}

	return {
		proofs: firstEntry.proofs,
		mint: firstEntry.mint,
		unit: parsed.unit ?? 'sat'
	};
}

/**
 * Check if a string is a valid Cashu token format.
 */
export function isCashuToken(str: string): boolean {
	try {
		decodeToken(str);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the total amount of a Cashu token (sum of proof amounts).
 */
export function getTokenAmount(token: DecodedToken): number {
	return token.proofs.reduce((sum, p) => sum + p.amount, 0);
}

/** @internal — exposed for testing */
export const __TOKEN_VERSION = TOKEN_VERSION;

/** @internal — exposed for testing: valid token prefixes */
export const VALID_TOKEN_PREFIXES = [TOKEN_PREFIX_V4, TOKEN_PREFIX];
