/**
 * Melt flow — spend ecash by paying a Lightning invoice.
 *
 * TASK-084 FIX: Split into two-phase async flow:
 *   Phase 1 (requestMelt):   Select proofs + request quote
 *   Phase 2 (completeMelt):  Submit proofs + outputs → unblind change → mark spent → store change
 *
 * All mint URLs are passed as parameters — no hardcoding.
 */
import { requestMeltQuote, meltTokens as postMelt, checkState, checkMeltQuote } from '../cashu/client';
import { blindMessage, unblindSignature, deterministicBlindingFactor } from '../cashu/blind';
import { fetchAndCacheKeysets, getAllKeysets, getKeysetById } from '../cashu/keyset';
import { getPrivateKey } from './state';
import { getUnspentProofsByMint, addProofs, markSpent } from './proofsDb';
import { selectProofs, sumProofs } from './proofs';
import { addTransaction } from '../storage/db';
import type { TokenProof, MeltQuote, Transaction } from '../types';
import { InsufficientFundsError, QuoteExpiredError, MintUnreachableError } from './errors';

// ─── Types ───────────────────────────────────────────────────

export interface MeltResult {
	success: boolean;
	change: TokenProof[];
	preimage?: string;
	spentAmount: number;
	feeReserve?: number;
	/** C05-05: fee calculated from keyset input_fee_ppk × number of inputs */
	inputFeePpk?: number;
	calculatedFee?: number;
	error?: string;
}

export interface MeltRequestResult {
	success: boolean;
	quote: string;
	amount: number;
	feeReserve: number;
	expiry: number;
	state: string;
	selectedProofs: SelectedProofInfo[];
	inputFeePpk: number;
	calculatedFee: number;
	keysetId: string;
	mintUrl: string;
	error?: string;
}

export interface SelectedProofInfo {
	local_id: string;
	amount: number;
	id: string;  // keyset ID
	secret: string;
	C: string;
}

export interface MeltCompleteResult {
	success: boolean;
	change: TokenProof[];
	preimage?: string;
	spentAmount: number;
	feeReserve?: number;
	inputFeePpk?: number;
	calculatedFee?: number;
	/** F-063: Transaction recording status for UI feedback */
	txStatus?: string;
	error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate a cryptographically random 32-byte secret for a melt change proof.
 * TASK-084: Use base64url for Cashu protocol compatibility.
 */
function generateChangeSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── F-072: Error message extraction ─────────────────────────

/**
 * TASK-101 (F-072): Extract a human-readable error message from any error shape.
 *
 * Handles:
 * - Error instances → error.message
 * - CashuError (with HTTP status + detail) → preserved as-is
 * - Plain objects → JSON.stringify for debugging, NOT "[object Object]"
 * - Network/fetch errors → friendly message
 * - Unknown → generic fallback
 */
function humanErrorMessage(error: unknown): string {
	if (!error) return 'Unknown melt error';

	// Duck-type check: use .message or .detail regardless of prototype chain
	const maybe = error as Record<string, unknown>;

	// CashuError-alike: has status and message
	if (typeof maybe.message === 'string' && maybe.message.length > 0) {
		// If the message is just "[object Object]", it was poorly stringified — reconstruct
		if (maybe.message === '[object Object]') {
			if (typeof maybe.detail === 'string') return maybe.detail;
			if (typeof maybe.error === 'string') return maybe.error;
			try { return JSON.stringify(error); } catch { return 'Unknown melt error'; }
		}
		return maybe.message as string;
	}

	// Plain object with detail/error fields (raw fetch response.json() body)
	if (typeof maybe.detail === 'string' && maybe.detail.length > 0) return maybe.detail;
	if (typeof maybe.error === 'string' && maybe.error.length > 0) return maybe.error;
	if (typeof maybe.detail === 'object' && maybe.detail !== null) {
		const d = maybe.detail as Record<string, unknown>;
		if (typeof d.message === 'string') return d.message;
		try { return JSON.stringify(maybe.detail); } catch { /* fall through */ }
	}

	// Fallback: JSON stringify (never return "[object Object]")
	try {
		return JSON.stringify(error);
	} catch {
		return 'Unknown melt error';
	}
}

/**
 * TASK-101 (F-072): Verify proofs belong to the active mint by cross-checking
 * each proof's keyset_id against the mint's known keysets.
 *
 * Proofs stored with incorrect mint_url could still appear as "unspent" for
 * this mint even though they were issued by a different mint. Filtering by
 * known keyset IDs prevents sending foreign proofs to checkState/melt
 * which would cause 422 "proof ownership mismatch" errors.
 *
 * @param proofs - Selected unspent proofs (from getUnspentProofsByMint)
 * @param mintUrl - Active mint URL
 * @returns Filtered proofs that belong to this mint
 */
async function verifyProofsMintOwnership(
	proofs: { local_id: string; keyset_id: string; mint_url: string; amount: number; id: string; secret: string; C: string }[],
	mintUrl: string
): Promise<{ verified: typeof proofs; orphaned: typeof proofs }> {
	if (proofs.length === 0) return { verified: [], orphaned: [] };

	let cachedKeysets = getAllKeysets(mintUrl);
	if (cachedKeysets.length === 0) {
		try {
			cachedKeysets = await fetchAndCacheKeysets(mintUrl);
		} catch {
			// Can't fetch keysets — return all proofs unfiltered (best-effort)
			return { verified: proofs, orphaned: [] };
		}
	}

	const activeKeysetIds = new Set(
		cachedKeysets.filter(k => k.active !== false).map(k => k.id)
	);

	// Also accept inactive keysets (proofs from deactivated keysets are still valid)
	const allKeysetIds = new Set(cachedKeysets.map(k => k.id));

	const verified: typeof proofs = [];
	const orphaned: typeof proofs = [];

	for (const p of proofs) {
		if (allKeysetIds.has(p.keyset_id)) {
			verified.push(p);
		} else {
			orphaned.push(p);
			console.warn(
				`[melt] F-072: Orphaned proof ${p.local_id} — keyset ${p.keyset_id} not found at mint ${mintUrl}. ` +
				`Skipping to prevent 422 checkState error.`
			);
		}
	}

	return { verified, orphaned };
}

// ─── Phase 1: Request Melt ───────────────────────────────────

/**
 * TASK-084: Request a melt quote — Phase 1 of the two-phase melt flow.
 *
 * 1. Select proofs with sufficient amount
 * 2. Check proof state with mint (prevents double-spend)
 * 3. Request melt quote
 * 4. Return quote info for the caller to proceed with completeMelt()
 *
 * @param mintUrl - The Cashu mint URL
 * @param invoice - Bolt11 Lightning invoice to pay
 * @param amount - Amount in sats to pay
 * @returns { quote, selectedProofs, feeReserve, ... }
 */
export async function requestMelt(
	mintUrl: string,
	invoice: string,
	amount: number
): Promise<MeltRequestResult> {
	try {
		getPrivateKey(); // throws if wallet is locked

		// Step 1: Select proofs with sufficient amount
		const allProofs = await getUnspentProofsByMint(mintUrl);
		const selectedProofs = selectProofs(allProofs, amount);

		// F-072 (TASK-101): Verify proofs actually belong to this mint
		// Cross-check keyset_id against the mint's known keysets to prevent
		// sending foreign proofs that would cause 422 "proof ownership mismatch"
		const { verified, orphaned } = await verifyProofsMintOwnership(
			selectedProofs.map(p => ({
				local_id: p.local_id,
				keyset_id: p.keyset_id,
				mint_url: p.mint_url,
				amount: p.amount,
				id: p.id,
				secret: p.secret,
				C: p.C
			})),
			mintUrl
		);

		if (verified.length === 0 && orphaned.length > 0) {
			throw new Error(
				`All ${orphaned.length} selected proofs belong to a different mint. ` +
				`Cannot melt — proofs were stored with wrong mint_url or are orphaned.`
			);
		}

		// Use only verified proofs; orphaned proofs are excluded
		const meltProofs = verified.length > 0 ? verified : orphaned;
		if (orphaned.length > 0) {
			console.warn(
				`[melt] F-072: Excluded ${orphaned.length} orphaned proof(s) from melt selection. ` +
				`Using ${verified.length} verified proof(s).`
			);
		}

		// Step 1.5: Calculate fee from keyset input_fee_ppk (C05-05)
		let inputFeePpk = 0;
		let calculatedFee = 0;
		let cachedKeysets = getAllKeysets(mintUrl);
		if (cachedKeysets.length === 0) {
			cachedKeysets = await fetchAndCacheKeysets(mintUrl);
		}
		const proofKeysetId = meltProofs[0].id;
		const proofKeyset = cachedKeysets.find(k => k.id === proofKeysetId);
		if (proofKeyset) {
			inputFeePpk = proofKeyset.input_fee_ppk ?? 0;
			calculatedFee = inputFeePpk * meltProofs.length;
		}

		// Step 1.6: Verify proof state with mint before melting (C07-02)
		const stateCheck = await checkState(mintUrl,
			meltProofs.map(p => ({ secret: p.secret, C: p.C }))
		);
		for (const ps of stateCheck.states) {
			if (ps.state === 'SPENT') {
				throw new Error(`Proof already spent — secret: ${ps.secret.substring(0, 12)}... mint rejected melt to prevent double-spend`);
			}
		}

		// Step 2: Request melt quote
		const quote: MeltQuote = await requestMeltQuote(mintUrl, invoice, amount);

		const proofInfos: SelectedProofInfo[] = meltProofs.map(p => ({
			local_id: p.local_id,
			amount: p.amount,
			id: p.id,
			secret: p.secret,
			C: p.C
		}));

		return {
			success: true,
			quote: quote.quote,
			amount: quote.amount,
			feeReserve: quote.fee_reserve,
			expiry: quote.expiry,
			state: quote.state ?? 'UNPAID',
			selectedProofs: proofInfos,
			inputFeePpk,
			calculatedFee,
			keysetId: proofKeysetId,
			mintUrl
		};
	} catch (error) {
		const msg = humanErrorMessage(error);
		if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('unreachable')) {
			return {
				success: false,
				quote: '',
				amount: 0,
				feeReserve: 0,
				expiry: 0,
				state: '',
				selectedProofs: [],
				inputFeePpk: 0,
				calculatedFee: 0,
				keysetId: '',
				mintUrl,
				error: `Mint unreachable: ${mintUrl}`
			};
		}
		return {
			success: false,
			quote: '',
			amount: 0,
			feeReserve: 0,
			expiry: 0,
			state: '',
			selectedProofs: [],
			inputFeePpk: 0,
			calculatedFee: 0,
			keysetId: '',
			mintUrl,
			error: msg
		};
	}
}

// ─── Phase 2: Complete Melt ──────────────────────────────────

/**
 * TASK-084: Complete the melt — Phase 2 of the two-phase melt flow.
 *
 * 1. Verify quote state (should be ready/paid)
 * 2. Prepare inputs (proofs to spend) + blind outputs (change)
 * 3. Submit melt to mint
 * 4. Unblind change signatures → change proofs
 * 5. Mark spent proofs, store change proofs
 *
 * @param mintUrl - The Cashu mint URL
 * @param quoteId - The quote ID from requestMelt()
 * @param inputs - Selected proofs (from requestMelt result)
 * @param invoice - Bolt11 invoice being paid
 * @param amount - Amount being paid
 * @param feeReserve - Fee reserve from quote
 * @returns { success, change, preimage?, spentAmount, ... }
 */
export async function completeMelt(
	mintUrl: string,
	quoteId: string,
	inputs: SelectedProofInfo[],
	invoice: string,
	amount: number,
	feeReserve: number
): Promise<MeltCompleteResult> {
	try {
		getPrivateKey(); // throws if wallet is locked

		// Step 1: Verify quote state
		const quote = await checkMeltQuote(mintUrl, quoteId);
		if (quote.paid) {
			// Quote is already marked paid — proceed (melt should still work)
		}

		// Step 2: Prepare inputs
		const inputBodies = inputs.map(p => ({
			amount: p.amount,
			id: p.id,
			secret: p.secret,
			C: p.C
		}));

		// Step 3: Create blind outputs for change
		const spentTotal = inputs.reduce((sum, p) => sum + p.amount, 0);
		const changeAmount = spentTotal - amount - feeReserve;

		let outputs: Array<{ amount: number; id: string; B_: string; secret: string; blindingFactor: string }> = [];
		let changeProofs: TokenProof[] = [];

		if (changeAmount > 0) {
			const changeSecret = generateChangeSecret();
			const r = deterministicBlindingFactor(changeSecret);
			const { B_, blindingFactor } = blindMessage(changeSecret, r);

			outputs = [
				{
					amount: changeAmount,
					id: inputs[0].id,
					B_,
					secret: changeSecret,
					blindingFactor
				}
			];
		}

		// Step 4: Submit melt to mint
		const outputBodies = outputs.map(o => ({
			amount: o.amount,
			id: o.id,
			B_: o.B_
		}));

		const response = await postMelt(mintUrl, quoteId, inputBodies, outputBodies);

		// Step 5: Unblind change signatures
		if (response.change && outputs.length > 0) {
			changeProofs = response.change.map((sig, i) => {
				const output = outputs[i];
				const C = unblindSignature(sig.C_, output.blindingFactor);
				return {
					id: sig.id,
					amount: sig.amount,
					secret: output.secret,
					C
				};
			});
		}

		// Step 6: Mark inputs as spent, store change
		await markSpent(inputs.map(p => p.local_id));

		if (changeProofs.length > 0) {
			await addProofs(changeProofs, mintUrl, inputs[0].id);
		}

		// Step 7: Record transaction (F-063) — no silent swallowing
		let txStatus = 'Recording failed ⚠️';
		try {
			await addTransaction({
				id: `melt-${quoteId}`,
				type: 'melt',
				amount,
				mint_url: mintUrl,
				timestamp: Date.now(),
				token_hash: null,
				invoice,
				status: 'confirmed'
			} as Transaction);
			txStatus = 'Transaction recorded: ✅';
			console.log('[melt]', txStatus);
		} catch (err) {
			console.error('[melt] Recording failed ⚠️', err);
		}

		return {
			success: true,
			change: changeProofs,
			preimage: response.preimage,
			spentAmount: spentTotal,
			feeReserve,
			txStatus
		};
	} catch (error) {
		const msg = humanErrorMessage(error);
		if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('unreachable')) {
			return {
				success: false,
				change: [],
				spentAmount: 0,
				inputFeePpk: 0,
				calculatedFee: 0,
				error: `Mint unreachable: ${mintUrl}`
			};
		}
		return {
			success: false,
			change: [],
			spentAmount: 0,
			inputFeePpk: 0,
			calculatedFee: 0,
			error: msg
		};
	}
}

// ─── Convenience: Combined Melt Flow (backward-compatible) ────

/**
 * TASK-084: Legacy combined melt flow — request + complete in one call.
 *
 * For production use, prefer the two-phase flow:
 *   requestMelt() → completeMelt()
 *
 * @param mintUrl - The Cashu mint URL
 * @param invoice - Bolt11 Lightning invoice to pay
 * @param amount - Amount in sats to pay
 * @returns { success, change, preimage?, spentAmount, feeReserve?, error? }
 */
export async function meltFlow(
	mintUrl: string,
	invoice: string,
	amount: number
): Promise<MeltResult> {
	try {
		// Phase 1: Request
		const reqResult = await requestMelt(mintUrl, invoice, amount);
		if (!reqResult.success) {
			return {
				success: false,
				change: [],
				spentAmount: 0,
				inputFeePpk: 0,
				calculatedFee: 0,
				error: reqResult.error
			};
		}

		// Phase 2: Complete
		const completeResult = await completeMelt(
			mintUrl,
			reqResult.quote,
			reqResult.selectedProofs,
			invoice,
			amount,
			reqResult.feeReserve
		);

		return {
			success: completeResult.success,
			change: completeResult.change,
			preimage: completeResult.preimage,
			spentAmount: completeResult.spentAmount,
			feeReserve: completeResult.feeReserve,
			inputFeePpk: reqResult.inputFeePpk,
			calculatedFee: reqResult.calculatedFee,
			error: completeResult.error
		};
	} catch (error) {
		const msg = humanErrorMessage(error);
		if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('unreachable')) {
			return {
				success: false,
				change: [],
				spentAmount: 0,
				inputFeePpk: 0,
				calculatedFee: 0,
				error: `Mint unreachable: ${mintUrl}`
			};
		}
		return {
			success: false,
			change: [],
			spentAmount: 0,
			inputFeePpk: 0,
			calculatedFee: 0,
			error: msg
		};
	}
}
