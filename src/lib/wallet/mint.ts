/**
 * Mint flow — receive ecash from a Cashu mint via Lightning invoice.
 *
 * Flow:
 * 1. Get mint info + keysets (validate mint supports NUT-04)
 * 2. Request mint quote (POST /v1/mint/quote/bolt11)
 * 3. User pays Lightning invoice
 * 4. Create blinded outputs for desired amounts
 * 5. Submit outputs → get blind signatures → unblind → proofs
 * 6. Store proofs in IndexedDB
 *
 * All mint URLs are passed as parameters — no hardcoding.
 */
import { getMintInfo, requestMintQuote, mintTokens as postMint } from '../cashu/client';
import { fetchAndCacheKeysets, getAllKeysets } from '../cashu/keyset';
import { blindMessage, unblindSignature, deterministicBlindingFactor } from '../cashu/blind';
import { getPrivateKey } from './state';
import { addProofs } from './proofsDb';
import type { TokenProof, MintQuote } from '../types';
import { MintUnreachableError, QuoteExpiredError } from './errors';

// ─── Types ───────────────────────────────────────────────────

export interface MintResult {
	success: boolean;
	proofs: TokenProof[];
	quote: string;
	amount: number;
	error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate a cryptographically random 32-byte secret for an ecash proof.
 * Uses crypto.getRandomValues() — never contains the wallet private key.
 */
function generateSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Create blinded outputs for given amounts.
 */
function createOutputs(
	amounts: number[],
	mintUrl: string,
	keysetId: string,
): Array<{ amount: number; id: string; B_: string; secret: string; blindingFactor: string }> {
	return amounts.map((amount) => {
		const secret = generateSecret();
		const r = deterministicBlindingFactor(secret);
		const { B_, blindingFactor } = blindMessage(secret, r);
		return {
			amount,
			id: keysetId,
			B_,
			secret,
			blindingFactor
		};
	});
}

/**
 * Decompose an amount into standard Cashu denominations.
 * Uses powers of 2: 1, 2, 4, 8, 16, ...
 * Returns array of amounts whose sum equals the target.
 */
export function decomposeAmount(amount: number): number[] {
	const result: number[] = [];
	let remaining = amount;

	// Common powers of 2
	const denominations = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864, 134217728, 268435456, 536870912, 1073741824, 2147483648];

	for (let i = denominations.length - 1; i >= 0; i--) {
		while (remaining >= denominations[i]) {
			result.push(denominations[i]);
			remaining -= denominations[i];
		}
	}

	// If there's any remainder, add it as-is (unusual but valid)
	if (remaining > 0) {
		result.push(remaining);
	}

	return result;
}

// ─── Mint Flow ───────────────────────────────────────────────

/**
 * Mint ecash tokens from a mint by paying a Lightning invoice.
 *
 * @param mintUrl - The Cashu mint URL
 * @param amount - Amount in sats to mint
 * @returns { success, proofs, quote, amount, error? }
 */
export async function mintFlow(
	mintUrl: string,
	amount: number
): Promise<MintResult> {
	try {
		const privateKey = getPrivateKey(); // throws if wallet is locked
		// Step 1: Validate mint and get keysets
		const keysets = await fetchAndCacheKeysets(mintUrl);
		const activeKeysets = keysets.filter(k => k.active);
		if (activeKeysets.length === 0) {
			throw new Error('No active keysets found for this mint');
		}

		// Use the first active keyset (typically 'sat' unit)
		const keysetId = activeKeysets[0].id;

		// Step 2: Request mint quote
		const quote: MintQuote = await requestMintQuote(mintUrl, amount);

		// Step 2.5: Verify quote state before submitting outputs (C04-06)
		// Only proceed if quote is in UNPAID state; reject PAID (double-mint attempt)
		// or EXPIRED quotes to prevent invalid mint operations.
		const quoteState = quote.state ?? 'UNPAID'; // default when state not provided
		if (quoteState !== 'UNPAID') {
			throw new Error(`Quote state is ${quoteState} — expected UNPAID before minting (quote: ${quote.quote})`);
		}

		// Step 3: In real flow, user pays invoice here (quote.request is bolt11 invoice)
		// For now we return the quote so the caller can handle payment UI
		// Step 4: Decompose amount into outputs
		const amounts = decomposeAmount(amount);

		// Step 5: Create blinded outputs
		const outputs = createOutputs(amounts, mintUrl, keysetId);

		// Step 6: Submit outputs to mint
		const postBody = outputs.map(o => ({
			amount: o.amount,
			id: o.id,
			B_: o.B_
		}));

		const response = await postMint(mintUrl, quote.quote, postBody);

		// Step 7: Unblind signatures → proofs
		const proofs: TokenProof[] = response.signatures.map((sig, i) => {
			const output = outputs[i];
			const C = unblindSignature(sig.C_, output.blindingFactor);
			return {
				id: sig.id,
				amount: sig.amount,
				secret: output.secret,
				C
			};
		});

		// Step 8: Store proofs
		await addProofs(proofs, mintUrl, keysetId);

		return {
			success: true,
			proofs,
			quote: quote.quote,
			amount
		};
	} catch (error) {
		// Classify errors
		if (error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))) {
			return {
				success: false,
				proofs: [],
				quote: '',
				amount: 0,
				error: `Mint unreachable: ${mintUrl}`
			};
		}

		return {
			success: false,
			proofs: [],
			quote: '',
			amount: 0,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
