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
// TASK-316: i18n for NUT-08 warning strings (en + th, see src/locales/*.json)
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

/**
 * TASK-316: Safe i18n lookup for .ts modules.
 *
 * svelte-i18n's `get(t)` (Readable<MessageFormatter>) throws if called before
 * `init()` (e.g., in unit tests that don't initialize i18n). The error message
 * "Cannot format a message without first setting the initial locale" must
 * NEVER break the melt flow — these are non-critical warning logs.
 *
 * Returns the translated string when i18n is initialized, otherwise the
 * literal English fallback so console.warn output stays human-readable and
 * the melt flow completes normally.
 */
function safeT(key: string, fallback: string): string {
	try {
		const msg = get(t)(key);
		return msg || fallback;
	} catch {
		return fallback;
	}
}

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
	/** TASK-FIX-320: true fee paid after NUT-08 mint overpaid return.
	 *  Propagated from completeMelt() for Send.svelte success UI display. */
	actualFee?: number;
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
	/** TASK-FIX-320: true fee paid after NUT-08 mint overpaid return.
	 *  Equals feeReserve minus overpaid refund. Exposed for Send.svelte
	 *  success UI to show "Fee: X sats (reserve: Y sats)" when actualFee < feeReserve.
	 *  Matches TransactionDetailSheet UX (TASK-314). */
	actualFee?: number;
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
				// TASK-316: i18n.t('nut08.not_supported') — see src/locales/{en,th}.json
				// `get(t)` returns the MessageFormatter function (Readable<MessageFormatter> unwrap).
				console.warn(
					`[melt] ${safeT('nut08.not_supported', 'This mint does not support NUT-08 — using legacy fee calculation')} (${mintUrl})`
				);
			}
		} catch (capErr) {
			// Capability check must NEVER break the melt flow — best-effort.
			// TASK-316: i18n.t('nut08.checking_capability')
			console.warn(
				`[melt] ${safeT('nut08.checking_capability', 'Checking mint NUT-08 support...')} — failed for ${mintUrl}: ${capErr instanceof Error ? capErr.message : String(capErr)}`
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

		// TASK-312 (NUT-08): Detect NUT-08 support before computing change.
		// Mint returns all overpaid sats as change (min_fee_estimate = 0) if NUT-08
		// is supported. Legacy mints reserve feeReserve upfront instead.
		// Capability check must NEVER break melt flow — log warning on failure
		// and fall back to legacy path.
		let supportsNUT08 = false;
		try {
			supportsNUT08 = await hasNUT08(mintUrl);
			if (!supportsNUT08) {
				// TASK-316: i18n.t('nut08.not_supported')
				console.warn(
					`[melt completeMelt] ${safeT('nut08.not_supported', 'This mint does not support NUT-08 — using legacy fee calculation')} (${mintUrl})`
				);
			}
		} catch (capErr) {
			// TASK-316: i18n.t('nut08.checking_capability')
			console.warn(
				`[melt completeMelt] ${safeT('nut08.checking_capability', 'Checking mint NUT-08 support...')} — failed for ${mintUrl}: ${capErr instanceof Error ? capErr.message : String(capErr)}`
			);
		}

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
		// TASK-312 (NUT-08): branch changeAmount calculation.
		// NUT-08 mint: min_fee_estimate = 0 (mint returns all overpaid as change).
		// Legacy mint: feeReserve (reserved upfront, change = spentTotal - amount - feeReserve).
		// Math.max(0, ...) clamps negative cases (over-paid fees) to 0 — no change output.
		const spentTotal = inputs.reduce((sum, p) => sum + p.amount, 0);
		const minFeeEstimate = supportsNUT08 ? 0 : feeReserve;
		const changeAmount = Math.max(0, spentTotal - amount - minFeeEstimate);

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

				// TASK-313 (CRITICAL — money-loss bug prevention): advance counter_k
				// by the ACTUAL signed count (meltResponse.change.length), NOT the
				// derived count (changeAmounts.length / outputs.length).
				//
				// Why this matters: the mint may sign FEWER change outputs than we
				// derived. With NUT-08, the mint only signs the overpaid amount
				// and may pick a different denomination breakdown (or no change at
				// all if the fee consumed everything). If we advance by derived
				// count, counter_k desyncs past what the mint actually consumed →
				// the next melt reuses a B_ the mint already signed → mint returns
				// 11003 "outputs already signed" → DOUBLE-SPEND / money loss.
				const signedCount = meltResponse.change?.length ?? 0;

				// Sanity guard: mint anomaly — signed MORE outputs than we derived.
				// This should be impossible (mint cannot create outputs we didn't
				// ask for), but if it happens we must abort BEFORE corrupting the
				// counter — otherwise the next melt would skip even more counters
				// and the 11003 loop would widen. Throw to abort the melt.
				if (signedCount > outputs.length) {
					throw new Error(
						`Mint anomaly: signed ${signedCount} change outputs but we derived only ${outputs.length} — ` +
						`aborting to prevent counter_k desync. Mint URL: ${mintUrl}`
					);
				}

				// Advance by ACTUAL signed count (0 if mint signed nothing, which
				// is fine — no B_ was consumed). The next melt will re-derive the
				// same B_ at the same counter, which the mint will accept as a
				// re-issuance of a previously unsigned request (no double-spend).
				incrementCounterK(changeKeysetId, signedCount);

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
		// TASK-314 (NUT-08): compute actual_fee from mint response.change.
		// Formula (verbatim from blueprint):
		//   actual_fee = feeReserve - (change.length > 0 ? sum(change.amounts) - changeAmount : 0)
		//
		// IMPORTANT: this formula uses the LEGACY changeAmount
		// (spentTotal - amount - feeReserve), NOT the NUT-08 MAX changeAmount
		// derived above for output decomposition (TASK-312).
		//
		// Why legacy: the NUT-08 MAX changeAmount equals `spentTotal - amount`
		// (the wallet derives for the maximum possible refund). If we plug that
		// into the formula, a full refund would give:
		//   actual_fee = feeReserve - (changeAmount - changeAmount) = feeReserve
		// which lies to the user (says they paid the full reserve when they
		// paid zero). Using LEGACY changeAmount instead, the formula subtracts
		// the overpaid refund (sum - legacyChangeAmount) from feeReserve:
		//   actual_fee = feeReserve - (sum - legacy)
		// which correctly gives 0 for full refund, feeReserve for no refund,
		// and partial values in between.
		//
		// Edges:
		//   - response.change.length === 0 → actual_fee = feeReserve (no refund)
		//   - sum(change) < legacyChangeAmount (only checked when feeReserve > 0)
		//     → mint anomaly → throw (means mint charged > feeReserve, impossible)
		//   - sum(change) >= legacyChangeAmount → actual_fee reduced by overpaid
		//   - feeReserve === 0 → no anomaly check possible (mint has no fee cap)
		const legacyChangeAmount = Math.max(0, spentTotal - amount - feeReserve);
		let actualFee: number;
		if (response.change && response.change.length > 0) {
			const sumChange = response.change.reduce(
				(s: number, c: { amount?: number }) => s + (c.amount ?? 0),
				0
			);
			// Anomaly guard only fires when feeReserve > 0. When feeReserve = 0,
			// legacyChangeAmount = spentTotal - amount (= NUT-08 MAX), and mint
			// signing fewer outputs is LEGITIMATE (it's just keeping sats as fee —
			// there's no fee cap to violate). When feeReserve > 0, signing less
			// than legacy means actual fee > feeReserve — impossible.
			if (feeReserve > 0 && sumChange < legacyChangeAmount) {
				// Sanity guard — consistent with TASK-313 signedCount > outputs.length guard.
				// Mint must not return less change than the legacy changeAmount
				// (spentTotal - amount - feeReserve). If it does, the actual fee
				// exceeds feeReserve — impossible. Abort BEFORE recording incorrect
				// fee accounting.
				throw new Error(
					`Mint anomaly: signed change sum (${sumChange}) < expected changeAmount (${legacyChangeAmount}) — ` +
					`aborting to prevent incorrect fee accounting. Mint URL: ${mintUrl}`
				);
			}
			// Clamp to >= 0 to guard against floating-point drift on overpaid sums.
			actualFee = Math.max(0, feeReserve - (sumChange - legacyChangeAmount));
		} else {
			// No change returned → mint kept the entire fee reserve.
			actualFee = feeReserve;
		}

		let txStatus = 'Recording failed ⚠️';
		try {
			if (pendingTxId) {
				// Update the pending transaction created by meltFlow
				await updateTransaction(pendingTxId, {
					status: 'confirmed',
					preimage: response.payment_preimage ?? undefined,
					fee: feeReserve,       // legacy fallback (TASK-084 contract)
					actual_fee: actualFee  // TASK-314: true fee paid (NUT-08 overpaid return)
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
					fee: feeReserve,
					actual_fee: actualFee
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
			txStatus,
			actualFee  // TASK-FIX-320: expose for Send.svelte success UI
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
			actualFee: completeResult.actualFee,  // TASK-FIX-320: propagate for Send.svelte
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
