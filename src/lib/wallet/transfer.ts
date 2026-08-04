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
import { swapProofs } from '../cashu/client';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { fetchAndCacheKeysets, getMintPubkey } from '../cashu/keyset';
import { getPrivateKey } from './state';
import { selectProofs, sumProofs } from './proofs';
import { getUnspentProofsByMint, addProofs, markSpent } from './proofsDb';
import { decomposeAmount } from './mint';
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
	dleqCount?: number;
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
	const totalSelected = sumProofs(selected);
	const excess = totalSelected - amount;

	let sendProofs = selected;

	// F-070: If single proof has excess, swap it to get exact amounts
	if (excess > 0 && selected.length === 1 && !selected[0].amount.toString().startsWith('-')) {
		try {
			await fetchAndCacheKeysets(mintUrl);
			const keysetId = selected[0].id;
			const pubkey = getMintPubkey(mintUrl, keysetId, selected[0].amount);

			// Create blinded output for the send amount and the change amount
			const sendSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
			const changeSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
			const sendBlind = blindMessage(sendSecret);
			const changeBlind = blindMessage(changeSecret);

			const outputs = [
				{ amount, id: keysetId, B_: sendBlind.B_ },
				{ amount: excess, id: keysetId, B_: changeBlind.B_ }
			];

			const swapResult = await swapProofs(mintUrl, [selected[0]], outputs);

			// Unblind the returned signatures
			sendProofs = swapResult.signatures.map((sig, i) => {
				const bp = i === 0 ? sendBlind : changeBlind;
				const C = pubkey ? unblindSignature(sig.C_, bp.blindingFactor, pubkey) : sig.C_;
				const rHex = blindingFactorToHex(bp.blindingFactor);
				return {
					local_id: '', id: sig.id, amount: sig.amount,
					secret: i === 0 ? sendSecret : changeSecret, C,
					mint_url: mintUrl, keyset_id: keysetId,
					stored_at: Date.now(), spent: false,
					dleq: sig.dleq ? { e: sig.dleq.e, s: sig.dleq.s, r: rHex } : undefined
				};
			});

			// Mark the original proof as spent
			await markSpent([selected[0].local_id]);

			// Store change proof back to wallet
			if (sendProofs.length > 1) {
				const changeProof = sendProofs[1];
				await addProofs([{
					id: changeProof.id, amount: changeProof.amount,
					secret: changeProof.secret, C: changeProof.C,
					dleq: changeProof.dleq
				}], mintUrl, keysetId);
			}

			// Only send the first proof (matching the requested amount)
			sendProofs = [sendProofs[0]];
		} catch {
			// Swap failed — fall back to sending the entire proof
		}
	} else if (excess > 0 && selected.length > 1) {
		// Multiple proofs: keep excess in wallet (greedy selection already minimized)
		sendProofs = [];
		let remaining = amount;
		for (const p of selected) {
			if (remaining <= 0) break;
			sendProofs.push(p);
			remaining -= p.amount;
		}
	}

	// Encode as V4 token
	const tokenProofs: TokenProof[] = sendProofs.map(p => {
		const tp: TokenProof = {
			id: p.id,
			amount: p.amount,
			secret: p.secret,
			C: p.C
		};
		if (p.dleq) {
			tp.dleq = p.dleq;
		}
		return tp;
	});

	const token = encodeToken(tokenProofs, mintUrl, 'sat', memo);

	// Mark only sent proofs as spent
	await markSpent(sendProofs.map(p => p.local_id));

	return {
		token,
		amount: sumProofs(sendProofs),
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
	const dleqCount = decoded.proofs.filter(p => p.dleq).length;

	return {
		amount: totalAmount,
		mint: decoded.mint,
		unit: decoded.unit,
		proofCount: decoded.proofs.length,
		dleqCount: dleqCount > 0 ? dleqCount : undefined
	};
}
