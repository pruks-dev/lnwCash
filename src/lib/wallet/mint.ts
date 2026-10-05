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
	pollMintQuoteUntil,
	CashuError
} from '../cashu/client';
import { fetchAndCacheKeysets, getAllKeysets, getMintPubkey } from '../cashu/keyset';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { getPrivateKey } from './state';
import { deriveSecretAndR, getActiveSeed } from './nut13';
import { getCounterK, incrementCounterK, withKeysetLock } from './counterK';
import { completeSet } from './completeSet';
import { scheduleNormalizeAfterMint } from './normalizeWiring';
import { addProofs, getAllProofs } from './proofsDb';
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
 * Create blinded outputs for given amounts.
 *
 * TASK-250 (RC-2): outputs are ALWAYS derived deterministically (NUT-13) from
 * the wallet seed with per-keyset counters. There is no random-secret fallback —
 * minting without a seed is a caller error (see the require-seed guard in
 * `completeMint`) because random-secret proofs are unrecoverable on restore.
 */
function createOutputs(
	amounts: number[],
	keysetId: string,
	seed: Uint8Array,
): Array<{ amount: number; id: string; B_: string; secret: string; blindingFactor: string }> {
	const startCounter = getCounterK(keysetId);
	return amounts.map((amount, i) => {
		const derived = deriveSecretAndR(seed, keysetId, startCounter + i);
		const { B_, blindingFactor } = blindMessage(derived.secret, derived.r);
		return {
			amount,
			id: keysetId,
			B_,
			secret: derived.secret,
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

// ─── Benign 11003 handling (TASK-260) ───────────────────────
//
// "outputs already signed" (NUT code 11003) is an idempotent mint response: the
// mint has already signed the exact outputs we submitted. It is NOT a fund-loss
// or derivation error — it means another tab (or a lost-response retry) already
// submitted the same B_. Recovery is to advance the counter past the collided
// outputs and re-derive fresh secrets, not to surface an error loop to the user.
//
// This must NOT be a blanket catch: a real error (any other code, or a
// non-Cashu error) must still fail the mint exactly as before.

/** Max retries when the mint reports benign 11003 (1 initial + 3 retries). */
const MAX_ALREADY_SIGNED_RETRIES = 3;

/** True only for a CashuError whose code is 11003 (numeric or string). */
function isAlreadySigned(err: unknown): boolean {
	if (!(err instanceof CashuError)) return false;
	return err.code === 11003 || err.code === '11003';
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
 * @param seed - Optional 64-byte BIP39 seed for NUT-13 deterministic outputs.
 *   Defaults to the in-memory active seed when omitted.
 * @returns { success, proofs, quote, amount, error? }
 */
export async function completeMint(
	mintUrl: string,
	quoteId: string,
	amount: number,
	keysetId: string,
	waitForPayment: boolean = true,
	seed?: Uint8Array
): Promise<MintCompleteResult> {
	try {
		getPrivateKey(); // throws if wallet is locked

		// Step 1: Verify quote is PAID before submitting outputs
		let quoteState = 'UNPAID';
		let bolt11Invoice: string | null = null;
		if (waitForPayment) {
			const paidQuote = await pollMintQuoteUntil(mintUrl, quoteId, 'PAID');
			quoteState = paidQuote.state ?? 'PAID';
			bolt11Invoice = paidQuote.request ?? null;
		} else {
			const quote = await checkMintQuote(mintUrl, quoteId);
			quoteState = quote.state ?? 'UNPAID';
			bolt11Invoice = quote.request ?? null;
		}

		if (quoteState !== 'PAID') {
			throw new Error(`Quote ${quoteId} is not PAID (state: ${quoteState}) — cannot mint tokens yet`);
		}

		// Step 2: Decompose amount into outputs
		// TASK-1304 (INTENT-013): mint into a complete-set of the amount —
		// completeSet(amount) yields [1,1,2,4,…] so the wallet can pay EVERY
		// amount 1..amount exactly without a swap (fold C). With amounts =
		// completeSet, the counter advance below (amounts.length — the count of
		// outputs the mint actually signed) stays automatically correct.
		const amounts = completeSet(amount);

		// TASK-250 (RC-2): minting now REQUIRES a seed — no random-secret fallback.
		// A legacy (24-word) wallet has no mnemonic, so deterministic NUT-13 output
		// derivation is impossible; minting with random secrets would create proofs
		// that cannot be recovered on restore. Point the user at re-key/recover instead.
		const resolvedSeed = seed ?? getActiveSeed();
		if (!resolvedSeed) {
			throw new Error(
				'NUT-13: no active wallet seed — deterministic mint requires a seed-phrase wallet. ' +
				'This legacy wallet has no mnemonic; re-key or recover to a seed-phrase wallet before minting, ' +
				'otherwise minted proofs would be unrecoverable on restore.'
			);
		}

		// TASK-250 (RC-3): serialize the counter read → derive → submit → advance
		// window per keyset. Two concurrent mints on the same keyset would otherwise
		// both read the same counter_k, derive the same secret/B_, and the second
		// would be rejected with "outputs already signed" (11003).
		const proofs: TokenProof[] = await withKeysetLock(keysetId, async () => {
			// TASK-240 (F-V27-001): NUT-13 counter-reuse guard.
			// If counter_k is 0 for this keyset but proofs for this keyset already exist
			// in IndexedDB, then the counter was lost (e.g. localStorage cleared while
			// IndexedDB survived). Minting now would re-derive counter 0 → the mint rejects
			// it with "outputs already signed" (11003). Force NUT-9/NUT-13 restore first.
			if (getCounterK(keysetId) === 0) {
				const existingProofs = await getAllProofs();
				if (existingProofs.some((p) => p.keyset_id === keysetId)) {
					throw new Error(
						`NUT-13 counter_k is 0 for keyset ${keysetId} but existing proofs are stored in IndexedDB — ` +
						`the counter was likely lost (localStorage cleared). Restore the wallet (NUT-9) before minting ` +
						`to avoid reusing counter 0 ("outputs already signed" / 11003).`
					);
				}
			}

			// TASK-260: derive → submit → advance, retrying once per benign
			// "outputs already signed" (11003). Each retry advances the counter past
			// the collided outputs and re-derives fresh secrets.
			const submitMint = async (): Promise<TokenProof[]> => {
				const outputs = createOutputs(amounts, keysetId, resolvedSeed);

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

				// ── TASK-313 guard (melt.ts:624 pattern — TASK-1304) ────
				// MORE than derived: the mint created outputs we never
				// submitted — advancing the counter would desync it (the
				// 11003 loop widens). Aborting BEFORE the counter advance
				// below keeps counter_k intact.
				// FEWER than derived: mint-contract violation — the index
				// alignment `outputs[i] ↔ signatures[i]` cannot be trusted
				// (a short return would store wrong secret/signature pairs).
				// Both directions throw before addProofs/counter-advance.
				if (response.signatures.length > amounts.length) {
					throw new Error(
						`Mint anomaly: signed ${response.signatures.length} outputs but we derived only ${amounts.length} — ` +
						`aborting to prevent counter_k desync. Mint URL: ${mintUrl}`
					);
				}
				if (response.signatures.length < amounts.length) {
					throw new Error(
						`Mint anomaly: signed only ${response.signatures.length} of ${amounts.length} outputs ` +
						`(the mint must sign every submitted output) — aborting to prevent misaligned secrets. Mint URL: ${mintUrl}`
					);
				}

				// Step 5: Unblind signatures → proofs
				const mintedProofs: TokenProof[] = response.signatures.map((sig, i) => {
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

				// Step 6: Store proofs, then advance counter_k in `finally`.
				// TASK-240 (F-V27-001): the mint has already signed these outputs (postMint
				// returned), so the NUT-13 counter_k MUST advance even if local persistence
				// (addProofs) throws — otherwise the next mint re-derives the same B_ and the
				// mint rejects it with "outputs already signed" (11003).
				try {
					await addProofs(mintedProofs, mintUrl, keysetId);
				} finally {
					incrementCounterK(keysetId, amounts.length);
				}

				return mintedProofs;
			};

			for (let attempt = 0; ; attempt++) {
				try {
					return await submitMint();
				} catch (err) {
					if (isAlreadySigned(err) && attempt < MAX_ALREADY_SIGNED_RETRIES) {
						// Skip the collided outputs: advance the counter before re-deriving.
						incrementCounterK(keysetId, amounts.length);
						continue;
					}
					throw err;
				}
			}
		});

		// Step 7: Record transaction (F-063) — non-blocking, best-effort
		try {
			await addTransaction({
				id: `mint-${quoteId}`,
				type: 'mint',
				amount,
				mint_url: mintUrl,
				timestamp: Date.now(),
				token_hash: null,
				invoice: bolt11Invoice,
				status: 'confirmed',
				protocol: 'lightning',
				fee: 0
			} as Transaction);
		} catch {
			// IndexedDB may be unavailable — transaction recording is best-effort
		}

		// TASK-1304 (2): T2 — completeMint finished → schedule the debounced
		// (~2s) auto-normalize of the whole spendable pile toward a complete
		// set. Zero-swap short-circuit inside `normalizeToCompleteSet` skips
		// the mint round-trip entirely when the pile already IS one.
		if (proofs.length > 0) {
			scheduleNormalizeAfterMint();
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
