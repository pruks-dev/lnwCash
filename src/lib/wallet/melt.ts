/**
 * Melt flow — spend ecash by paying a Lightning invoice.
 *
 * Flow:
 * 1. Select proofs with sufficient amount
 * 2. Request melt quote (POST /v1/melt/quote/bolt11)
 * 3. Submit proofs + outputs for change → get blind signatures
 * 4. Unblind change signatures → change proofs
 * 5. Remove spent proofs, store change proofs
 *
 * All mint URLs are passed as parameters — no hardcoding.
 */
import { requestMeltQuote, meltTokens as postMelt, checkState } from '../cashu/client';
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

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate a cryptographically random 32-byte secret for a melt change proof.
 * Uses crypto.getRandomValues() — never contains the wallet private key.
 */
function generateChangeSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// ─── Melt Flow ───────────────────────────────────────────────

/**
 * Melt ecash tokens to pay a Lightning invoice.
 *
 * @param mintUrl - The Cashu mint URL
 * @param invoice - Bolt11 Lightning invoice to pay
 * @param amount - Amount in sats to pay (must have proofs covering this)
 * @returns { success, change, preimage?, spentAmount, feeReserve?, error? }
 */
export async function meltFlow(
	mintUrl: string,
	invoice: string,
	amount: number
): Promise<MeltResult> {
	try {
		const privateKey = getPrivateKey(); // throws if wallet is locked
		// Step 1: Select proofs with sufficient amount
		const allProofs = await getUnspentProofsByMint(mintUrl);
		const selectedProofs = selectProofs(allProofs, amount);

		// Step 1.5: Calculate fee from keyset input_fee_ppk (C05-05)
		// input_fee_ppk = fee per input (per 1000 sats of input value)
		let inputFeePpk = 0;
		let calculatedFee = 0;
		let cachedKeysets = getAllKeysets(mintUrl);
		if (cachedKeysets.length === 0) {
			// Fetch keysets if not cached
			cachedKeysets = await fetchAndCacheKeysets(mintUrl);
		}
		// Use the keyset of the first selected proof
		const proofKeysetId = selectedProofs[0].keyset_id;
		const proofKeyset = cachedKeysets.find(k => k.id === proofKeysetId);
		if (proofKeyset) {
			inputFeePpk = proofKeyset.input_fee_ppk ?? 0;
			calculatedFee = inputFeePpk * selectedProofs.length;
		}

		// Step 1.6: Verify proof state with mint before melting (C07-02)
		// Prevents double-spend attempts by checking if any input proof is already spent
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

		if (quote.paid) {
			throw new Error('Quote already paid — this should not happen before melt');
		}

		// Step 3: Prepare inputs (the proofs to spend)
		const inputs = selectedProofs.map(p => ({
			amount: p.amount,
			id: p.id, // keyset ID (stored in proof.id, which is the keyset_id from Cashu)
			secret: p.secret,
			C: p.C
		}));

		// Step 4: Create blind outputs for change (if total > amount + fee)
		const spentTotal = sumProofs(selectedProofs);
		const feeReserve = quote.fee_reserve ?? 0;
		const changeAmount = spentTotal - amount - feeReserve;

		let outputs: Array<{ amount: number; id: string; B_: string; secret: string; blindingFactor: string }> = [];
		let changeProofs: TokenProof[] = [];

		if (changeAmount > 0) {
			// Create single change output
			const changeSecret = generateChangeSecret();
			const r = deterministicBlindingFactor(changeSecret);
			const { B_, blindingFactor } = blindMessage(changeSecret, r);

			outputs = [
				{
					amount: changeAmount,
					id: selectedProofs[0].id,
					B_,
					secret: changeSecret,
					blindingFactor
				}
			];
		}

		// Step 5: Submit melt to mint
		const outputBodies = outputs.map(o => ({
			amount: o.amount,
			id: o.id,
			B_: o.B_
		}));

		const response = await postMelt(mintUrl, quote.quote, inputs, outputBodies);

		// Step 6: Unblind change signatures
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

		// Step 7: Mark inputs as spent, store change
		await markSpent(selectedProofs.map(p => p.local_id));

		if (changeProofs.length > 0) {
			await addProofs(changeProofs, mintUrl, selectedProofs[0].id);
		}

		return {
			success: true,
			change: changeProofs,
			preimage: response.preimage,
			spentAmount: spentTotal,
			feeReserve,
			inputFeePpk,
			calculatedFee
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
