/**
 * Cashu V4 token encode/decode utilities.
 * Format: base64url-encoded JSON with "cashuA" prefix.
 */

import { base64url } from '../util/base64';
import type { CashuToken, DecodedToken, TokenProof } from '../types';

export const TOKEN_PREFIX = 'cashuA';
const TOKEN_VERSION = 'A';

/**
 * Encode proofs into a Cashu V4 token string.
 *
 * @param proofs - Array of TokenProof objects
 * @param mintUrl - The mint URL for these proofs
 * @param unit - Optional unit (default: "sat")
 * @param memo - Optional memo note
 * @returns Cashu token string (e.g. "cashuAeyJ0b2tlbiI6...")
 */
export function encodeToken(
	proofs: TokenProof[],
	mintUrl: string,
	unit: string = 'sat',
	memo?: string
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

	return `${TOKEN_PREFIX}${base64}`;
}

/**
 * Decode a Cashu V4 token string back into its components.
 *
 * @param token - Cashu token string (e.g. "cashuAeyJ0b2tlbiI6...")
 * @returns DecodedToken with proofs, mint URL, and unit
 */
export function decodeToken(token: string): DecodedToken {
	let encoded: string;

	if (token.startsWith(TOKEN_PREFIX)) {
		encoded = token.slice(TOKEN_PREFIX.length);
	} else {
		// Try without prefix (some implementations omit it)
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
