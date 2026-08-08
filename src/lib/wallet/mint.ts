/**
 * Mint flow — receive ecash from a Cashu mint via Lightning invoice.
 *
 * TASK-084 FIX: Split into two-phase async flow:
 *   Phase 1 (requestMint):   Get keysets + request quote → returns bolt11 invoice
 *   Phase 2 (completeMint):  After user pays → poll for PAID → submit outputs → unblind → store proofs
 *
 * All mint URLs are passed as parameters — no hardcoding.
 */
import {
	requestMintQuote,
	mintTokens as postMint,
	checkMintQuote,
	pollMintQuoteUntil
} from '../cashu/client';
import { fetchAndCacheKeysets, getAllKeysets, getMintPubkey } from '../cashu/keyset';
import { blindMessage, unblindSignature, deterministicBlindingFactor, blindingFactorToHex } from '../cashu/blind';
import { getPrivateKey } from './state';
import { addProofs } from './proofsDb';
import { addTransaction } from '../storage/db';
import type { TokenProof, MintQuote, Transaction } from '../types';
import { MintUnreachableError, QuoteExpiredError } from './errors';

// ─── Types ───────────────────────────────────────────────────

export interface MintResult {
	success: boolean;
	proofs: TokenProof[];
	quote: string;
	amount: number;
	error?: string;
}

export interface MintRequestResult {
	success: boolean;
	quote: string;
	request: string;  // bolt11 Lightning invoice
	amount: number;
	expiry: number;
	state: string;
	keysetId: string;
	error?: string;
}

export interface MintCompleteResult {
	success: boolean;
	proofs: TokenProof[];
	quote: string;
	amount: number;
	error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate a cryptographically random 32-byte secret for an ecash proof.
 * TASK-084: Use base64url encoding for Cashu protocol compatibility.
 * Uses crypto.getRandomValues() — never contains the wallet private key.
 */
function generateSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	// NUT-00 recommends 64-char hex string from 32 random bytes
	return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
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

// ─── Phase 1: Request Mint ──────────────────────────────────

/**
 * TASK-084: Request a mint quote and return the bolt11 invoice for user payment.
 *
 * This is Phase 1 of the two-phase mint flow:
 * 1. Fetch and validate keysets
 * 2. Request mint quote from mint → get bolt11 invoice
 * 3. Return quote ID + invoice for user to pay externally
 *
 * After the user pays the invoice, call completeMint().
 *
 * @param mintUrl - The Cashu mint URL
 * @param amount - Amount in sats to mint
 * @returns { quote (id), request (bolt11 invoice), keysetId, ... }
 */
export async function requestMint(
	mintUrl: string,
	amount: number
): Promise<MintRequestResult> {
	try {
		getPrivateKey(); // throws if wallet is locked

		// Step 1: Validate mint and get keysets
		const keysets = await fetchAndCacheKeysets(mintUrl);
		const activeKeysets = keysets.filter(k => k.active);
		if (activeKeysets.length === 0) {
			throw new Error('No active keysets found for this mint');
		}

		const keysetId = activeKeysets[0].id;

		// Step 2: Request mint quote
		const quote: MintQuote = await requestMintQuote(mintUrl, amount);

		// Step 2.5: Verify quote state (C04-06)
		// Only proceed if quote is UNPAID; reject PAID (double-mint) or EXPIRED
		const quoteState = quote.state ?? 'UNPAID';
		if (quoteState !== 'UNPAID') {
			throw new Error(`Quote state is ${quoteState} — expected UNPAID before minting (quote: ${quote.quote})`);
		}

		return {
			success: true,
			quote: quote.quote,
			request: quote.request,
			amount,
			expiry: quote.expiry,
			state: quoteState,
			keysetId
		};
	} catch (error) {
		if (error instanceof TypeError || (error instanceof Error && error.message.includes('fetch'))) {
			return {
				success: false,
				quote: '',
				request: '',
				amount: 0,
				expiry: 0,
				state: '',
				keysetId: '',
				error: `Mint unreachable: ${mintUrl}`
			};
		}
		return {
			success: false,
			quote: '',
			request: '',
			amount: 0,
			expiry: 0,
			state: '',
			keysetId: '',
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

// ─── Phase 2: Complete Mint ─────────────────────────────────

/**
 * TASK-084: Complete the mint after the user has paid the Lightning invoice.
 *
 * This is Phase 2 of the two-phase mint flow:
 * 1. Verify quote is PAID (poll if needed)
 * 2. Decompose amount into outputs
 * 3. Create blinded outputs
 * 4. Submit outputs → get blind signatures → unblind → proofs
 * 5. Store proofs in IndexedDB
 *
 * @param mintUrl - The Cashu mint URL
 * @param quoteId - The quote ID from requestMint()
 * @param amount - Amount in sats (must match request)
 * @param keysetId - Keyset ID from requestMint()
 * @param waitForPayment - If true, poll until PAID (default: true, max 120s)
 * @returns { success, proofs, quote, amount, error? }
 */
export async function completeMint(
	mintUrl: string,
	quoteId: string,
	amount: number,
	keysetId: string,
	waitForPayment: boolean = true
): Promise<MintCompleteResult> {
	try {
		getPrivateKey(); // throws if wallet is locked

		// Step 1: Verify quote is PAID before submitting outputs
		let quoteState = 'UNPAID';
		if (waitForPayment) {
			const paidQuote = await pollMintQuoteUntil(mintUrl, quoteId, 'PAID');
			quoteState = paidQuote.state ?? 'PAID';
		} else {
			const quote = await checkMintQuote(mintUrl, quoteId);
			quoteState = quote.state ?? 'UNPAID';
		}

		if (quoteState !== 'PAID') {
			throw new Error(`Quote ${quoteId} is not PAID (state: ${quoteState}) — cannot mint tokens yet`);
		}

		// Step 2: Decompose amount into outputs
		const amounts = decomposeAmount(amount);

		// Step 3: Create blinded outputs
		const outputs = createOutputs(amounts, mintUrl, keysetId);

		// Step 4: Submit outputs to mint
		const postBody = outputs.map(o => ({
			amount: o.amount,
			id: o.id,
			B_: o.B_
		}));

		const response = await postMint(mintUrl, quoteId, postBody);

		// Fetch keysets once for all outputs
		try {
			await fetchAndCacheKeysets(mintUrl);
		} catch {
			// Continue — unblinding will fall back to multiplicative if keys unavailable
		}

		// Step 5: Unblind signatures → proofs
		const proofs: TokenProof[] = response.signatures.map((sig, i) => {
			const output = outputs[i];
			// Get the denomination-specific pubkey for this proof's amount
			const pubkey = getMintPubkey(mintUrl, keysetId, sig.amount);
			const C = unblindSignature(sig.C_, output.blindingFactor, pubkey);
			const rHex = blindingFactorToHex(output.blindingFactor);
			const proof: TokenProof = {
				id: sig.id,
				amount: sig.amount,
				secret: output.secret,
				C
			};
			if (sig.dleq) {
				proof.dleq = { e: sig.dleq.e, s: sig.dleq.s, r: rHex };
			}
			return proof;
		});

		// Step 6: Store proofs
		await addProofs(proofs, mintUrl, keysetId);

		// Step 7: Record transaction (F-063) — non-blocking, best-effort
		try {
			await addTransaction({
				id: `mint-${quoteId}`,
				type: 'mint',
				amount,
				mint_url: mintUrl,
				timestamp: Date.now(),
				token_hash: null,
				invoice: null,
				status: 'confirmed'
			} as Transaction);
		} catch {
			// IndexedDB may be unavailable — transaction recording is best-effort
		}

		return {
			success: true,
			proofs,
			quote: quoteId,
			amount
		};
	} catch (error) {
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

// ─── Convenience: Combined Mint Flow (backward-compatible) ───

/**
 * TASK-084: Legacy combined mint flow — request + poll + complete.
 *
 * NOTE: For production use, prefer the two-phase flow:
 *   requestMint() → user pays invoice → completeMint()
 *
 * This combined version polls for payment (max 120s) and is suitable
 * for testing or automated flows where the invoice is paid externally.
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
		// Phase 1: Request
		const reqResult = await requestMint(mintUrl, amount);
		if (!reqResult.success) {
			return {
				success: false,
				proofs: [],
				quote: '',
				amount: 0,
				error: reqResult.error
			};
		}

		// Phase 2: Complete (polls for PAID)
		const completeResult = await completeMint(
			mintUrl,
			reqResult.quote,
			amount,
			reqResult.keysetId,
			true // wait for payment
		);

		return {
			success: completeResult.success,
			proofs: completeResult.proofs,
			quote: completeResult.quote,
			amount: completeResult.amount,
			error: completeResult.error
		};
	} catch (error) {
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
