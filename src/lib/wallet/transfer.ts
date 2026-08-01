/**
 * P2P ecash transfer: send and receive Cashu tokens.
 *
 * Uses V4 token encoding (cashuA prefix) from ../cashu/token.ts.
 * No network needed for send — just local crypto.
 * Receive validates structure before storing proofs.
 *
 * All mint URLs are passed as parameters — no hardcoding.
 */
import { encodeToken, decodeToken, getTokenAmount } from '../cashu/token';
import { getPrivateKey } from './state';
import { selectProofs, sumProofs } from './proofs';
import { getUnspentProofsByMint, addProofs, markSpent } from './proofsDb';
import type { TokenProof, DecodedToken } from '../types';
import { InsufficientFundsError, TokenValidationError } from './errors';

// ─── Types ───────────────────────────────────────────────────

export interface SendResult {
	token: string;
	amount: number;
	mint: string;
}

export interface ReceiveResult {
	amount: number;
	mint: string;
	unit: string;
	proofCount: number;
}

// ─── Send ────────────────────────────────────────────────────

/**
 * Send ecash tokens: select proofs, encode as V4 token, remove from wallet.
 *
 * @param amount - Amount in sats to send
 * @param mintUrl - Mint URL for the proofs
 * @param memo - Optional memo note
 * @returns { token, amount, mint } — token string to share with recipient
 * @throws InsufficientFundsError if not enough proofs
 */
export async function sendTokens(
	amount: number,
	mintUrl: string,
	memo?: string
): Promise<SendResult> {
	const privateKey = getPrivateKey(); // wallet must be unlocked

	// Select proofs
	const allProofs = await getUnspentProofsByMint(mintUrl);
	const selected = selectProofs(allProofs, amount);

	// Encode as V4 token
	const tokenProofs: TokenProof[] = selected.map(p => ({
		id: p.id,
		amount: p.amount,
		secret: p.secret,
		C: p.C
	}));

	const token = encodeToken(tokenProofs, mintUrl, 'sat', memo);

	// Remove proofs from wallet (mark as spent)
	await markSpent(selected.map(p => p.local_id));

	return {
		token,
		amount: sumProofs(selected),
		mint: mintUrl
	};
}

/**
 * Send ecash as a raw token (without removing from wallet) — for P2P display/QR.
 * Only creates the token; does NOT alter wallet state.
 */
export function createTokenForDisplay(
	proofs: TokenProof[],
	mintUrl: string,
	memo?: string
): string {
	return encodeToken(proofs, mintUrl, 'sat', memo);
}

// ─── Receive ─────────────────────────────────────────────────

/**
 * Receive ecash tokens: decode V4 token, validate, store in IndexedDB.
 *
 * @param tokenString - Cashu V4 token string (cashuA prefix)
 * @returns { amount, mint, unit, proofCount }
 * @throws TokenValidationError if token is invalid
 */
export async function receiveTokens(tokenString: string): Promise<ReceiveResult> {
	// Decode token
	let decoded: DecodedToken;
	try {
		decoded = decodeToken(tokenString);
	} catch (err) {
		throw new TokenValidationError(
			err instanceof Error ? err.message : 'Failed to decode token'
		);
	}

	// Validate proofs structure
	if (!decoded.proofs || decoded.proofs.length === 0) {
		throw new TokenValidationError('Token contains no proofs');
	}

	for (const proof of decoded.proofs) {
		if (!proof.secret || !proof.C || !proof.id || proof.amount <= 0) {
			throw new TokenValidationError(
				`Invalid proof: missing required fields (secret, C, id, amount)`
			);
		}
	}

	// Determine keyset ID from the first proof
	const keysetId = decoded.proofs[0].id;

	// Store proofs in IndexedDB
	await addProofs(decoded.proofs, decoded.mint, keysetId);

	const totalAmount = getTokenAmount(decoded);

	return {
		amount: totalAmount,
		mint: decoded.mint,
		unit: decoded.unit,
		proofCount: decoded.proofs.length
	};
}
