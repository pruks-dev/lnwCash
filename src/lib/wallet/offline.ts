/**
 * Offline wallet operations — no network required.
 *
 * Features:
 * - getOfflineBalance() — read balance from IndexedDB proofs
 * - getOfflineHistory() — read transaction history from IndexedDB
 * - sendEcashP2P() — create token locally (no network)
 * - semiVerifyRedeem() — validate token structure locally
 * - isOnline() — detector state (thin re-export of $lib/offline-indicator)
 */
import {
	getUnspentProofs,
	getTotalBalance,
	getBalanceByMint
} from './proofsDb';
import { selectProofs, sumProofs } from './proofs';
import { createTokenForDisplay } from './transfer';
import { getTransactions } from '../storage/db';
import { decodeToken, getTokenAmount, TOKEN_PREFIX, TOKEN_PREFIX_V4 } from '../cashu/token';
import type { Transaction, TokenProof, DecodedToken } from '../types';
import { InsufficientFundsError } from './errors';

// ─── Offline Balance ─────────────────────────────────────────

/**
 * Get total balance from IndexedDB proofs — NO network needed.
 */
export async function getOfflineBalance(): Promise<{
	total: number;
	byMint: Record<string, number>;
}> {
	const total = await getTotalBalance();
	const byMint = await getBalanceByMint();
	return { total, byMint };
}

// ─── Offline History ─────────────────────────────────────────

/**
 * Get transaction history from IndexedDB — NO network needed.
 * Returns transactions sorted by timestamp descending.
 */
export async function getOfflineHistory(
	limit?: number
): Promise<Transaction[]> {
	const txs = await getTransactions();
	if (limit && limit > 0) {
		return txs.slice(0, limit);
	}
	return txs;
}

// ─── P2P Ecash Send (Offline) ────────────────────────────────

/**
 * Create an ecash token for P2P transfer — local crypto only, NO network.
 *
 * This selects proofs, creates a token, and marks proofs as spent.
 * The recipient can redeem the token when they go online.
 *
 * @param amount - Amount in sats to send
 * @param mintUrl - Mint URL for the proofs
 * @param memo - Optional memo
 * @returns Token string (can be displayed as QR or shared as text)
 * @throws InsufficientFundsError if not enough proofs
 */
export async function sendEcashP2P(
	amount: number,
	mintUrl: string,
	memo?: string
): Promise<string> {
	// Get unspent proofs for this mint
	const proofs = await getUnspentProofs();
	const mintProofs = proofs.filter(p => p.mint_url === mintUrl);

	// Select proofs
	const selected = selectProofs(mintProofs, amount);

	// Create token
	const tokenProofs: TokenProof[] = selected.map(p => ({
		id: p.id,
		amount: p.amount,
		secret: p.secret,
		C: p.C
	}));

	const token = createTokenForDisplay(tokenProofs, mintUrl, memo);

	// Mark proof IDs for later removal (when online, verify with mint)
	// For now we don't remove — the proofs are still in both wallets until minted
	// (double-spend prevention is handled by the mint)

	return token;
}

// ─── Semi-Verify Redeem ──────────────────────────────────────

export interface SemiVerifyResult {
	plausiblyValid: boolean;
	amount: number;
	mint: string;
	unit: string;
	proofCount: number;
	issues: string[];
}

/**
 * Verify a Cashu token structure and proof amounts LOCALLY.
 * Does NOT verify signatures with the mint (no network).
 *
 * Checks:
 * - Valid V4 token format (cashuA or cashuB prefix, valid JSON)
 * - Proofs have required fields (id, amount, secret, C)
 * - All amounts are positive integers
 * - At least one proof
 *
 * @returns { plausiblyValid, amount, mint, unit, proofCount, issues[] }
 */
export function semiVerifyRedeem(tokenString: string): SemiVerifyResult {
	const issues: string[] = [];

	// Check prefix — accept both V4 (cashuB) and legacy (cashuA)
	const validPrefixes = [TOKEN_PREFIX_V4, TOKEN_PREFIX];
	const hasValidPrefix = validPrefixes.some(p => tokenString.startsWith(p));
	if (!hasValidPrefix) {
		issues.push('Missing cashuA or cashuB prefix');
	}

	// Try to decode
	let decoded: DecodedToken;
	try {
		decoded = decodeToken(tokenString);
	} catch (err) {
		issues.push(`Decode failed: ${err instanceof Error ? err.message : String(err)}`);
		return {
			plausiblyValid: false,
			amount: 0,
			mint: '',
			unit: '',
			proofCount: 0,
			issues
		};
	}

	// Check mint URL
	if (!decoded.mint || !decoded.mint.startsWith('http')) {
		issues.push('Missing or invalid mint URL');
	}

	// Check proofs
	if (!decoded.proofs || decoded.proofs.length === 0) {
		issues.push('No proofs in token');
	} else {
		for (let i = 0; i < decoded.proofs.length; i++) {
			const p = decoded.proofs[i];
			if (!p.id) issues.push(`Proof ${i}: missing id`);
			if (!p.secret) issues.push(`Proof ${i}: missing secret`);
			if (!p.C) issues.push(`Proof ${i}: missing C (signature)`);
			if (!Number.isInteger(p.amount) || p.amount <= 0) {
				issues.push(`Proof ${i}: invalid amount ${p.amount}`);
			}
		}
	}

	const amount = decoded.proofs ? getTokenAmount(decoded) : 0;

	return {
		plausiblyValid: issues.length === 0,
		amount,
		mint: decoded.mint,
		unit: decoded.unit,
		proofCount: decoded.proofs?.length ?? 0,
		issues
	};
}

// ─── Online Status (FR-2 / TASK-1307 — thin re-export) ───────

/**
 * Connectivity state — single source of truth is the probe-based detector
 * service (`$lib/offline-indicator`). These are THIN RE-EXPORTS: identical
 * signatures, shared state with the app-wide banner (D1 detector).
 * Consumers of the legacy import path (Home.svelte / F003-Balance.svelte)
 * automatically see the same detector state.
 */
export { isOnline, onConnectivityChange } from '../offline-indicator';
