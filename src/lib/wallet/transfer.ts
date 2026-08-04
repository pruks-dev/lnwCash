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
import { fetchAndCacheKeysets, getMintPubkey, resolveKeysetId } from '../cashu/keyset';
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

	// If there's excess, find best proof to swap for exact amount
	let swapProof: StoredProof | undefined;
	if (excess > 0) {
		// Pick the smallest proof that covers the amount (minimize excess)
		swapProof = [...selected].sort((a, b) => a.amount - b.amount).find(p => p.amount >= amount);
		// If no single proof covers, swap the largest one to break it down
		if (!swapProof) {
			swapProof = [...selected].sort((a, b) => b.amount - a.amount)[0];
		}
	}

	// Swap the chosen proof to get exact send amount + change
	if (swapProof && excess > 0) {
		const swapAmount = swapProof.amount;
		// Amount needed from this proof to reach total target
		const otherSum = sumProofs(selected) - swapAmount;
		const needFromSwap = amount - otherSum;
		const swapExcess = swapAmount - needFromSwap;

		if (swapExcess > 0 && needFromSwap > 0) {
		try {
			await fetchAndCacheKeysets(mintUrl);
			const keysetId = resolveKeysetId(mintUrl, swapProof.id) || swapProof.id;

			// Create blinded outputs: exact need + change
			const sendSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
			const changeSecret = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
			const sendBlind = blindMessage(sendSecret);
			const changeBlind = blindMessage(changeSecret);

			const outputs = [
				{ amount: needFromSwap, id: keysetId, B_: sendBlind.B_ },
				{ amount: swapExcess, id: keysetId, B_: changeBlind.B_ }
			];

			const swapResult = await swapProofs(mintUrl, [swapProof], outputs);

			// Unblind — use denomination-specific pubkey per signature
			const swappedProofs = swapResult.signatures.map((sig, i) => {
				const bp = i === 0 ? sendBlind : changeBlind;
				const pubkey = getMintPubkey(mintUrl, keysetId, sig.amount);
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

			await markSpent([swapProof.local_id]);

			// Replace swapProof in selected with the split pieces
			sendProofs = selected.filter(p => p.local_id !== swapProof.local_id);
			sendProofs.push(swappedProofs[0]); // the needFromSwap piece
			// Store change back
			if (swappedProofs.length > 1) {
				await addProofs([{
					id: swappedProofs[1].id, amount: swappedProofs[1].amount,
					secret: swappedProofs[1].secret, C: swappedProofs[1].C,
					dleq: swappedProofs[1].dleq
				}], mintUrl, keysetId);
			}
		} catch {
			// Swap failed — fall back
		}
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
