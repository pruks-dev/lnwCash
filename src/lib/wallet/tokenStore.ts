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
	markPendingNormalizeByProof,
	type StoredProof
} from './proofsDb';
import { addTransaction } from '../storage/db';
import { selectProofs, sumProofs } from './proofs';
import { encodeToken, decodeToken, getTokenAmount } from '../cashu/token';
import { decomposeAmount } from './mint';
import { completeSet } from './completeSet';
import { checkState, swapProofs } from '../cashu/client';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { fetchAndCacheKeysets, getMintPubkey, resolveKeysetId } from '../cashu/keyset';
import { getPrivateKey } from './state';
import { deriveSecretAndR, getActiveSeed } from './nut13';
import { getCounterK, incrementCounterK, withKeysetLock } from './counterK';
import { isWalletOnline, scheduleNormalizeAfterReceiveOnline } from './normalizeWiring';
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

	// TASK-244 (F-V27-005): receiving requires an unlocked wallet, and the swap
	// receive outputs must be derived deterministically (NUT-13) from the active
	// seed so they are recoverable from the seed-phrase backup.
	getPrivateKey(); // throws WalletLockedError if wallet is locked
	const seed = getActiveSeed();

	// ─── TASK-1304 (5): OFFLINE receive — passthrough 1:1 เดิม 100% ───
	// Blueprint C: "ถ้า offline ให้เก็บแบบ passthrough ก่อน แล้ว consolidate ที
	// หลังเมื่อ online". ข้อห้าม: ห้ามเปลี่ยน passthrough เป็น swap — เก็บ 1:1
	// ตามเดิม, counter_k ไม่ถูกแตะ (flag "ไม่เข้าระบบ counter") — เก็บ
	// pending_normalize แทน แล้ว T3 (flushPendingNormalizeOnBackOnline) เคลียร์
	// เมื่อกลับ online. Derivation ไม่ถูกใช้ → legacy wallet (ไม่มี seed) ยัง
	// รับ offline ได้ปกติ.
	if (!isWalletOnline()) {
		const totalAmount = decoded.proofs.reduce((sum, p) => sum + p.amount, 0);
		await addProofs(decoded.proofs, mintUrl, keysetId); // 1:1 — mark as-is
		await markPendingNormalizeByProof(decoded.proofs);
		const dleqCount = decoded.proofs.filter(p => p.dleq).length;

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
			proofCount: decoded.proofs.length,
			dleqCount: dleqCount > 0 ? dleqCount : undefined
		};
	}

	// ONLINE swap receive — deterministic derivation REQUIRES a seed.
	if (!seed) {
		throw new Error(
			'NUT-13: no active wallet seed — deterministic swap receive requires a seed-phrase wallet. ' +
			'This legacy wallet has no mnemonic; re-key or recover to a seed-phrase wallet before receiving tokens, ' +
			'otherwise received proofs would be unrecoverable on restore.'
		);
	}

	// 1. Swap old proofs for new ones (NUT-03 double-spend protection)
	// Swap acts as the gatekeeper — mint rejects spent proofs
	try {
		// Fetch mint keys to get public key for this keyset
		await fetchAndCacheKeysets(mintUrl);
		fullId = resolveKeysetId(mintUrl, keysetId) || keysetId;

		// TASK-250 (RC-3): serialize counter read → derive → submit → advance per
		// keyset, and guard against counter-0 reuse (mirror of the mint guard).
		const newProofs = await withKeysetLock(fullId, async () => {
			// Counter-0 guard: if counter_k is 0 but proofs for this keyset already
			// exist in IndexedDB, the counter was lost (localStorage cleared). Deriving
			// swap outputs at counter 0 now would reuse a secret → force NUT-9 restore.
			if (getCounterK(fullId) === 0) {
				const existingProofs = await getAllProofs();
				if (existingProofs.some((p) => p.keyset_id === fullId)) {
					throw new Error(
						`NUT-13 counter_k is 0 for keyset ${fullId} but existing proofs are stored in IndexedDB — ` +
						`the counter was likely lost (localStorage cleared). Restore the wallet (NUT-9) before receiving ` +
						`to avoid reusing counter 0 ("outputs already signed" / 11003).`
					);
				}
			}

			// TASK-1304 (3): the swap receive consolidates straight into a
			// complete set of its own sum — S = sum(decoded.proofs) →
			// outputs = completeSet(S). The mint signs EXACTLY these outputs, so
			// the counter MUST advance by outputs.length (จุดเสี่ยง 2 HIGH —
			// ห้ามค้าง decoded.proofs.length; advance = จำนวนก้อนที่ mint sign
			// เสมอ เพื่อให้ NUT-9 restore ครอบทุกก้อน).
			const targetAmounts = completeSet(
				decoded.proofs.reduce((sum, p) => sum + p.amount, 0)
			);

			// Create blinded outputs (deterministic NUT-13 secrets + blinding)
			const blindPairs: Array<{ secret: string; B_: string; r: string }> = [];
			const outputs: Array<{ amount: number; id: string; B_: string }> = [];

			const startCounter = getCounterK(fullId);
			for (let i = 0; i < targetAmounts.length; i++) {
				const { secret, r } = deriveSecretAndR(seed, fullId, startCounter + i);
				const { B_, blindingFactor } = blindMessage(secret, r);
				blindPairs.push({ secret, B_, r: blindingFactor });
				outputs.push({ amount: targetAmounts[i], id: fullId, B_ });
			}

			// Swap: send old proofs as inputs, new blinded messages as outputs
			// Use full keyset IDs for both inputs and outputs
			const swapInputs = decoded.proofs.map(p => ({ ...p, id: fullId }));
			const swapResult = await swapProofs(mintUrl, swapInputs, outputs);

			// ── TASK-313 guard (melt.ts:624 pattern — TASK-1304) ────────
			// MORE than derived: the mint created outputs we never submitted —
			// advancing the counter would desync it (widening 11003 loops).
			// FEWER than derived: NUT-03 contract violation — index alignment
			// `outputs[i] ↔ signatures[i]` cannot be trusted. Both abort BEFORE
			// the counter advance below — counter_k survives intact.
			const signedCount = swapResult.signatures.length;
			if (signedCount > outputs.length) {
				throw new Error(
					`Mint anomaly: signed ${signedCount} swap outputs but we derived only ${outputs.length} — ` +
					`aborting to prevent counter_k desync. Mint URL: ${mintUrl}`
				);
			}
			if (signedCount < outputs.length) {
				throw new Error(
					`Mint anomaly: signed only ${signedCount} of ${outputs.length} swap outputs ` +
					`(the mint must sign every submitted output) — aborting to prevent misaligned secrets. ` +
					`Mint URL: ${mintUrl}`
				);
			}

			// TASK-244 (F-V27-005) + TASK-1304 (จุดเสี่ยง 2 HIGH): the mint has
			// now signed the swap receive outputs (swapProofs returned) — advance
			// counter_k by outputs.length (= จำนวนก้อนที่ mint sign เสมอ) even if
			// local persistence (addProofs below) later throws, otherwise the next
			// receive re-derives the same B_ and the mint rejects it as "outputs
			// already signed".
			incrementCounterK(fullId, outputs.length);

			// Unblind signatures to get new proofs
			const unblinded = swapResult.signatures.map((sig, i) => {
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

			await addProofs(unblinded, mintUrl, unblinded[0]?.id || fullId);
			return unblinded;
		});

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

		// TASK-1304 (6): T1 — receive online finished → schedule the debounced
		// (~2s) auto-normalize toward a complete set (zero-swap short-circuit
		// inside normalizeToCompleteSet skips the swap when the pile already
		// IS the completeSet target).
		scheduleNormalizeAfterReceiveOnline();

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
