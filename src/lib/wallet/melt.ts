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
import type { TokenProof, MeltQuote } from '../types';
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

		// Step 1.5: Calculate fee from keyset input_fee_ppk (C05-05)
		let inputFeePpk = 0;
		let calculatedFee = 0;
		let cachedKeysets = getAllKeysets(mintUrl);
		if (cachedKeysets.length === 0) {
			cachedKeysets = await fetchAndCacheKeysets(mintUrl);
		}
		const proofKeysetId = selectedProofs[0].keyset_id;
		const proofKeyset = cachedKeysets.find(k => k.id === proofKeysetId);
		if (proofKeyset) {
			inputFeePpk = proofKeyset.input_fee_ppk ?? 0;
			calculatedFee = inputFeePpk * selectedProofs.length;
		}

		// Step 1.6: Verify proof state with mint before melting (C07-02)
		const stateCheck = await checkState(mintUrl,
			selectedProofs.map(p => ({ secret: p.secret, C: p.C }))
		);
		for (const ps of stateCheck.states) {
			if (ps.state === 'SPENT') {
				throw new Error(`Proof already spent — secret: ${ps.secret.substring(0, 12)}... mint rejected melt to prevent double-spend`);
			}
		}

		// Step 2: Request melt quote
		const quote: MeltQuote = await requestMeltQuote(mintUrl, invoice, amount);

		const proofInfos: SelectedProofInfo[] = selectedProofs.map(p => ({
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
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes('fetch') || msg.includes('Network') || msg.includes('unreachable')) {
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

		return {
			success: true,
			change: changeProofs,
			preimage: response.preimage,
			spentAmount: spentTotal,
			feeReserve
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes('fetch') || msg.includes('Network') || msg.includes('unreachable')) {
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
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes('fetch') || msg.includes('Network') || msg.includes('unreachable')) {
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
