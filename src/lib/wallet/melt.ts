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
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { fetchAndCacheKeysets, getAllKeysets, getKeysetById, getMintPubkey } from '../cashu/keyset';
import { getPrivateKey } from './state';
import { deriveSecretAndR, getActiveSeed } from './nut13';
import { getCounterK, incrementCounterK, withKeysetLock } from './counterK';
import { getUnspentProofsByMint, addProofs, markSpent, getAllProofs, type StoredProof } from './proofsDb';
import { selectProofs, sumProofs } from './proofs';
import { decomposeAmount } from './mint';
import { hasNUT08 } from './capabilities';
import { addTransaction, updateTransaction } from '../storage/db';
import type { TokenProof, MeltQuote, PostMeltResponse, Transaction } from '../types';
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
 * TASK-244 (F-V27-005): Require the active wallet seed for deterministic melt
 * change (NUT-13). Change outputs are mint-signed, so their secrets MUST be
 * reproducible from the seed (NUT-9 restore) — otherwise change funds are
 * silently lost on restore.
 *
 * @throws a clear re-key/recover error if no active seed is set (legacy wallet
 *   with no mnemonic) — never falls back to a random secret.
 */
function requireChangeSeed(): Uint8Array {
	const seed = getActiveSeed();
	if (!seed) {
		throw new Error(
			'NUT-13: no active wallet seed — deterministic melt change requires a seed-phrase wallet. ' +
			'This legacy wallet has no mnemonic; re-key or recover to a seed-phrase wallet before melting, ' +
			'otherwise change funds would be unrecoverable on restore.'
		);
	}
	return seed;
}

/**
 * TASK-244 (F-V27-005) / TASK-MELT-DECOMPOSE: Derive the deterministic melt
 * change secret + blinding factor for the `counterIndex`-th change output of
 * `keysetId` (NUT-13). Change is decomposed into multiple denominations, so
 * each output derives its own secret from its counter offset (the per-keyset
 * counter `startCounter + i`).
 */
function generateChangeSecretAndR(keysetId: string, counterIndex: number): { secret: string; r: bigint } {
	return deriveSecretAndR(requireChangeSeed(), keysetId, counterIndex);
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

		// TASK-311 (NUT-09): Detect NUT-08 support before requesting a melt
		// quote. Mints that don't advertise NUT-08 will silently use the
		// legacy fee model — warn so the rest of the flow can branch.
		try {
			const supportsNUT08 = await hasNUT08(mintUrl);
			if (!supportsNUT08) {
				console.warn(
					`[melt] Mint ${mintUrl} does not advertise NUT-08 — using legacy fee calculation`
				);
			}
		} catch (capErr) {
			// Capability check must NEVER break the melt flow — best-effort.
			console.warn(
				`[melt] NUT-08 capability check failed for ${mintUrl}: ${capErr instanceof Error ? capErr.message : String(capErr)}`
			);
		}

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

		// F-069: Account for fee_reserve in proof selection
		const totalNeeded = amount + quote.fee_reserve;
		const selectedSum = sumProofs(meltProofs.map(p => ({ ...p, spent: false } as unknown as StoredProof)));
		let finalProofs = meltProofs;
		if (selectedSum < totalNeeded) {
			const reselected = selectProofs(allProofs, totalNeeded);
			const { verified: reverified, orphaned: reorphaned } = await verifyProofsMintOwnership(
				reselected.map(p => ({
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
			if (reverified.length === 0 && reorphaned.length > 0) {
				throw new Error(
					`All ${reorphaned.length} reselected proofs belong to a different mint. ` +
					`Cannot melt — proofs were stored with wrong mint_url or are orphaned.`
				);
			}
			finalProofs = reverified.length > 0 ? reverified : reorphaned;

			// F-090: Re-check proof state after reselection (double-spend gap fix)
			// selectProofs may return different proofs that haven't been checked yet
			const recheckState = await checkState(mintUrl,
				finalProofs.map(p => ({ secret: p.secret, C: p.C }))
			);
			for (const ps of recheckState.states) {
				if (ps.state === 'SPENT') {
					throw new Error(`Proof spent during reselection — secret: ${ps.secret?.substring(0, 12)}... abort melt to prevent double-spend`);
				}
			}
		}

		const proofInfos: SelectedProofInfo[] = finalProofs.map(p => ({
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
	feeReserve: number,
	pendingTxId?: string
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
		let response: PostMeltResponse;

		if (changeAmount > 0) {
			const changeKeysetId = inputs[0].id;
			// TASK-250 (RC-3): serialize counter read → derive → submit → advance per
			// keyset, and guard against counter-0 reuse (mirror of the mint guard).
			response = await withKeysetLock(changeKeysetId, async () => {
				// Counter-0 guard: if counter_k is 0 but proofs for this keyset already
				// exist in IndexedDB, the counter was lost (localStorage cleared). Deriving
				// change at counter 0 now would reuse a secret → force NUT-9 restore.
				if (getCounterK(changeKeysetId) === 0) {
					const existingProofs = await getAllProofs();
					if (existingProofs.some((p) => p.keyset_id === changeKeysetId)) {
						throw new Error(
							`NUT-13 counter_k is 0 for keyset ${changeKeysetId} but existing proofs are stored in IndexedDB — ` +
							`the counter was likely lost (localStorage cleared). Restore the wallet (NUT-9) before melting ` +
							`to avoid reusing counter 0 ("outputs already signed" / 11003).`
						);
					}
				}

				// TASK-MELT-DECOMPOSE: decompose change into standard Cashu
				// denominations. A single change output with an off-denomination
				// amount (e.g. 30) is truncated by the mint to the nearest lower
				// denomination in its keyset (e.g. 16), silently losing the rest
				// (Commander live test: melt 64, pay 34 → change 30 came back 16,
				// 14 sats lost). Decomposing 30 → [16, 8, 4, 2] keeps every sat.
				const changeAmounts = decomposeAmount(changeAmount);
				const startCounter = getCounterK(changeKeysetId);

				outputs = changeAmounts.map((amt, i) => {
					const { secret, r } = generateChangeSecretAndR(changeKeysetId, startCounter + i);
					const { B_, blindingFactor } = blindMessage(secret, r);
					return {
						amount: amt,
						id: changeKeysetId,
						B_,
						secret,
						blindingFactor
					};
				});

				// Step 4: Submit melt to mint
				const outputBodies = outputs.map(o => ({
					amount: o.amount,
					id: o.id,
					B_: o.B_
				}));

				const meltResponse = await postMelt(mintUrl, quoteId, inputBodies, outputBodies);

				// TASK-244 (F-V27-005) / TASK-MELT-DECOMPOSE: the mint has now
				// signed all change outputs (postMelt returned) — advance counter_k
				// by the number of outputs even if local persistence (addProofs
				// below) later throws, otherwise the next melt re-derives the same
				// B_ and the mint rejects it as "outputs already signed".
				incrementCounterK(changeKeysetId, changeAmounts.length);

				return meltResponse;
			});
		} else {
			// No change output — nothing derived from the counter, so no lock needed.
			const outputBodies: Array<{ amount: number; id: string; B_: string }> = [];
			response = await postMelt(mintUrl, quoteId, inputBodies, outputBodies);
		}

		// Step 5: Unblind change signatures (use keyset-specific denomination key)
		if (response.change && outputs.length > 0) {
			changeProofs = response.change.map((sig, i) => {
				const output = outputs[i];
				const pubkey = getMintPubkey(mintUrl, inputs[0].id, sig.amount);
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
		}

		// Step 6: Mark inputs as spent, store change
		await markSpent(inputs.map(p => p.local_id));

		if (changeProofs.length > 0) {
			await addProofs(changeProofs, mintUrl, inputs[0].id);
		}

		// Step 7: Record transaction (F-063) — no silent swallowing
		let txStatus = 'Recording failed ⚠️';
		try {
			if (pendingTxId) {
				// Update the pending transaction created by meltFlow
				await updateTransaction(pendingTxId, {
					status: 'confirmed',
					preimage: response.payment_preimage ?? undefined,
					fee: feeReserve
				});
			} else {
				// Standalone: create a new transaction record
				await addTransaction({
					id: `melt-${quoteId}`,
					type: 'melt',
					amount,
					mint_url: mintUrl,
					timestamp: Date.now(),
					token_hash: null,
					invoice,
					preimage: response.payment_preimage ?? null,
					status: 'confirmed',
					protocol: 'lightning',
					fee: feeReserve
				} as Transaction);
			}
			txStatus = 'Transaction recorded: ✅';
			console.log('[melt]', txStatus);
		} catch (err) {
			console.error('[melt] Recording failed ⚠️', err);
		}

		const netSpent = amount + feeReserve;

		return {
			success: true,
			change: changeProofs,
			preimage: response.payment_preimage,
			spentAmount: netSpent,
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
	// Create pending transaction at start (best-effort — don't break the flow)
	const txId = `melt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	try {
		await addTransaction({
			id: txId,
			type: 'melt',
			protocol: 'lightning',
			amount,
			mint_url: mintUrl,
			timestamp: Date.now(),
			token_hash: null,
			invoice,
			status: 'pending',
			fee: 0
		} as Transaction);
	} catch {
		// Best-effort: silently ignore — don't break the melt flow
	}

	try {
		// Phase 1: Request
		const reqResult = await requestMelt(mintUrl, invoice, amount);
		if (!reqResult.success) {
			// Phase 1 failed → update pending tx to failed (best-effort)
			try { await updateTransaction(txId, { status: 'failed' }); } catch { /* best-effort */ }
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
			reqResult.feeReserve,
			txId  // pass pending tx ID — completeMelt will update it to 'confirmed'
		);

		if (!completeResult.success) {
			// Phase 2 failed → update pending tx to failed (best-effort)
			try { await updateTransaction(txId, { status: 'failed' }); } catch { /* best-effort */ }
		}
		// On success: completeMelt already updated the pending tx to 'confirmed'

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
		// Unexpected error → update pending tx to failed (best-effort)
		try { await updateTransaction(txId, { status: 'failed' }); } catch { /* best-effort */ }

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
