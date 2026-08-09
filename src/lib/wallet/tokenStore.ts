/**
 * TASK-084: Token Store — higher-level proof/token management layer.
 *
 * Wraps proofsDb.ts with additional operations:
 * - Mint-specific proof queries
 * - Balance aggregation by keyset
 * - Proof validation (checking if proofs are still valid with mint)
 * - Token import/export with V4 encoding
 *
 * This is the canonical token management API for the wallet.
 */
import {
	addProofs,
	getAllProofs,
	getUnspentProofs,
	getProofsByMint,
	getUnspentProofsByMint,
	removeProofs,
	markSpent,
	getTotalBalance,
	getBalanceByMint,
	getProofCount,
	clearProofs,
	type StoredProof
} from './proofsDb';
import { addTransaction } from '../storage/db';
import { selectProofs, sumProofs } from './proofs';
import { encodeToken, decodeToken, getTokenAmount } from '../cashu/token';
import { decomposeAmount } from './mint';
import { checkState, swapProofs } from '../cashu/client';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { fetchAndCacheKeysets, getMintPubkey, resolveKeysetId } from '../cashu/keyset';
import type { TokenProof, DecodedToken } from '../types';
import { TokenValidationError } from './errors';

// ─── Types ───────────────────────────────────────────────────

export interface TokenStateCheck {
	proof: StoredProof;
	mintState: 'UNSPENT' | 'PENDING' | 'SPENT' | 'UNKNOWN';
	valid: boolean;
}

export interface ProofBalance {
	total: number;
	byMint: Record<string, number>;
	byKeyset: Record<string, number>;
	proofCount: number;
}

// ─── Token Store Operations ──────────────────────────────────

/**
 * Store newly minted tokens.
 * Delegates to proofsDb.addProofs with validation.
 */
export async function storeTokens(
	proofs: TokenProof[],
	mintUrl: string,
	keysetId: string
): Promise<void> {
	if (!proofs || proofs.length === 0) {
		throw new Error('Cannot store empty proofs');
	}

	// Validate each proof has required fields
	for (const proof of proofs) {
		if (!proof.secret || !proof.C || !proof.id || proof.amount <= 0) {
			throw new Error(`Invalid proof: missing required fields`);
		}
	}

	await addProofs(proofs, mintUrl, keysetId);
}

/**
 * Get comprehensive balance including by-keyset breakdown.
 */
export async function getProofBalance(): Promise<ProofBalance> {
	const proofs = await getUnspentProofs();

	const byMint: Record<string, number> = {};
	const byKeyset: Record<string, number> = {};

	for (const p of proofs) {
		byMint[p.mint_url] = (byMint[p.mint_url] ?? 0) + p.amount;
		byKeyset[p.keyset_id] = (byKeyset[p.keyset_id] ?? 0) + p.amount;
	}

	const total = Object.values(byMint).reduce((sum, amt) => sum + amt, 0);

	return {
		total,
		byMint,
		byKeyset,
		proofCount: proofs.length
	};
}

/**
 * Validate proofs against the mint to check their current state.
 * Used before melt/swap to prevent double-spend attempts.
 *
 * @param mintUrl - The mint URL to check against
 * @param proofs - The proofs to validate
 * @returns Array of TokenStateCheck with mint state
 */
export async function validateProofs(
	mintUrl: string,
	proofs: StoredProof[]
): Promise<TokenStateCheck[]> {
	try {
		const response = await checkState(
			mintUrl,
			proofs.map(p => ({ secret: p.secret, C: p.C }))
		);

		return proofs.map((proof, i) => {
			const state = response.states[i];
			return {
				proof,
				mintState: state?.state ?? 'UNKNOWN',
				valid: state?.state === 'UNSPENT' || state?.state === 'PENDING'
			};
		});
	} catch {
		// If mint is unreachable, mark all as UNKNOWN (not invalid)
		return proofs.map(proof => ({
			proof,
			mintState: 'UNKNOWN' as const,
			valid: true // optimistic — assume valid if mint unreachable
		}));
	}
}

/**
 * Check if any proof in a set is already spent (double-spend detection).
 *
 * @returns The spent proof if found, null if all proofs are unspent
 */
export async function findSpentProof(
	mintUrl: string,
	proofs: StoredProof[]
): Promise<StoredProof | null> {
	const checks = await validateProofs(mintUrl, proofs);
	const spent = checks.find(c => c.mintState === 'SPENT');
	return spent?.proof ?? null;
}

// ─── Re-exports from proofsDb for convenience ────────────────

export {
	getAllProofs,
	getUnspentProofs,
	getProofsByMint,
	getUnspentProofsByMint,
	removeProofs,
	markSpent,
	getTotalBalance,
	getBalanceByMint,
	getProofCount,
	clearProofs,
	type StoredProof
};

// ─── Send / Receive (P2P token transfer) ──────────────────────

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

/**
 * Send ecash tokens: select proofs, encode as V4 token, mark spent.
 *
 * F-070: When totalSelected > amount, excess proofs stay in wallet.
 * Uses decomposeAmount to identify exactly which amounts sum to the
 * requested send amount, keeping the rest as change in wallet.
 *
 * @param amount - Amount in sats to send
 * @param mintUrl - Mint URL for the proofs
 * @param memo - Optional memo note
 * @returns { token, amount, mint }
 */
export async function sendTokens(
	amount: number,
	mintUrl: string,
	memo?: string
): Promise<SendResult> {
	const allProofs = await getUnspentProofsByMint(mintUrl);
	const selected = selectProofs(allProofs, amount);
	const totalSelected = sumProofs(selected);

	// F-070: Decompose selected amounts into send portion and change
	const excess = totalSelected - amount;
	const sendAmounts = decomposeAmount(amount);
	const excessAmounts = excess > 0 ? decomposeAmount(excess) : [];
	const allOutputAmounts = [...sendAmounts, ...excessAmounts];

	// Match selected proofs to output amounts greedily
	// First N output amounts = send; rest = change
	let sendProofs: typeof selected = [];
	let changeProofs: typeof selected = [];
	let remainingSend = amount;
	const unusedRemaining: typeof selected = [];

	for (const p of selected) {
		if (remainingSend <= 0) {
			changeProofs.push(p);
		} else if (p.amount > remainingSend && sendProofs.length === 0) {
			sendProofs.push(p);
			remainingSend = 0;
		} else if (p.amount <= remainingSend) {
			sendProofs.push(p);
			remainingSend -= p.amount;
		} else {
			changeProofs.push(p);
		}
	}

	// Encode send proofs as V4 token
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

	// Record transaction (F-088) — best-effort
	const sentAmount = sumProofs(sendProofs);
	try {
		await addTransaction({
			id: `cashu-send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			type: 'cashu_send',
			protocol: 'cashu',
			amount: sentAmount,
			mint_url: mintUrl,
			timestamp: Date.now(),
			token_hash: token,
			status: 'confirmed',
			fee: 0
		});
	} catch {
		// IndexedDB may be unavailable
	}

	return {
		token,
		amount: sentAmount,
		mint: mintUrl
	};
}

/**
 * Receive ecash tokens: decode V4 token, validate, store in IndexedDB.
 *
 * @param tokenString - Cashu V4 token string
 * @returns { amount, mint, unit, proofCount }
 * @throws TokenValidationError if token is invalid
 */
export async function receiveTokens(tokenString: string): Promise<ReceiveResult> {
	let decoded: DecodedToken;
	try {
		decoded = decodeToken(tokenString);
	} catch (err) {
		throw new TokenValidationError(
			err instanceof Error ? err.message : 'Failed to decode token'
		);
	}

	if (!decoded.proofs || decoded.proofs.length === 0) {
		throw new TokenValidationError('Token contains no proofs');
	}

	for (const proof of decoded.proofs) {
		if (!proof.secret || !proof.C || !proof.id || proof.amount <= 0) {
			throw new TokenValidationError('Invalid proof: missing required fields');
		}
	}

	const mintUrl = decoded.mint;
	const keysetId = decoded.proofs[0].id;
	let fullId = keysetId; // Will be resolved to full ID if short form

	// 1. Swap old proofs for new ones (NUT-03 double-spend protection)
	// Swap acts as the gatekeeper — mint rejects spent proofs
	try {
		// Fetch mint keys to get public key for this keyset
		await fetchAndCacheKeysets(mintUrl);
		fullId = resolveKeysetId(mintUrl, keysetId) || keysetId;

		// Create blinded outputs (new secrets + blinding)
		const blindPairs: Array<{ secret: string; B_: string; r: string }> = [];
		const outputs: Array<{ amount: number; id: string; B_: string }> = [];

		for (const proof of decoded.proofs) {
			const newSecret = Array.from(
				crypto.getRandomValues(new Uint8Array(32)),
				b => b.toString(16).padStart(2, '0')
			).join('');
			const { B_, blindingFactor } = blindMessage(newSecret);
			blindPairs.push({ secret: newSecret, B_: B_, r: blindingFactor });
			outputs.push({ amount: proof.amount, id: fullId, B_ });
		}

		// Swap: send old proofs as inputs, new blinded messages as outputs
		// Use full keyset IDs for both inputs and outputs
		const swapInputs = decoded.proofs.map(p => ({ ...p, id: fullId }));
		const swapResult = await swapProofs(mintUrl, swapInputs, outputs);

		// Unblind signatures to get new proofs
		const newProofs = swapResult.signatures.map((sig, i) => {
			const bp = blindPairs[i];
			const pubkey = getMintPubkey(mintUrl, fullId, sig.amount);
			const C = pubkey ? unblindSignature(sig.C_, bp.r, pubkey) : sig.C_;
			return {
				id: sig.id || keysetId,
				amount: sig.amount,
				secret: bp.secret,
				C,
				dleq: sig.dleq ? {
					e: sig.dleq.e,
					s: sig.dleq.s,
					r: blindingFactorToHex(bp.r)
				} : undefined
			};
		});

		await addProofs(newProofs, mintUrl, newProofs[0]?.id || fullId);

		const totalAmount = newProofs.reduce((sum, p) => sum + p.amount, 0);
		const dleqCount = newProofs.filter(p => p.dleq).length;

		// Record transaction (F-088) — best-effort
		try {
			await addTransaction({
				id: `cashu-recv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				type: 'cashu_receive',
				protocol: 'cashu',
				amount: totalAmount,
				mint_url: mintUrl,
				timestamp: Date.now(),
				token_hash: tokenString,
				status: 'confirmed',
				fee: 0
			});
		} catch {
			// IndexedDB may be unavailable
		}

		return {
			amount: totalAmount,
			mint: mintUrl,
			unit: decoded.unit,
			proofCount: newProofs.length,
			dleqCount: dleqCount > 0 ? dleqCount : undefined
		};
	} catch (err) {
		if (err instanceof TokenValidationError) throw err;
		throw new TokenValidationError(
			err instanceof Error ? err.message : 'Swap failed — token may be spent or invalid'
		);
	}

	// Not reached — swap or throw above
}
