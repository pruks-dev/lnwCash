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
import { getUnspentProofsByMint, addProofs, markSpent, markReserved, clearReserved, getAllProofs, type StoredProof } from './proofsDb';
import { selectProofs, sumProofs } from './proofs';
import { decomposeAmount } from './mint';
import { hasNUT08 } from './capabilities';
import { addTransaction, updateTransaction } from '../storage/db';
import { decodeBolt11 } from './bolt11';
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

// ─── TASK-4902 (INTENT-049): reconcile-before-settle + invoice-bound ──
//
// Pillar 2 (settle guard): after an unknown submit the flow reconciles FIRST
// (melt quote state + NUT-07 checkState of the inputs) — never hammer.
// Pillar 3 (no false failed): failed ONLY on proven non-payment, never on a
// timeout/client error alone.
//
// TASK-4911 (failed-policy ใหม่ตามกฎบอส): invoice expiry is NOT a signal —
// the deadline/expiry-fail step is CUT. failed ⟺ the mint declares FAILED
// (or the owner verifies UNPAID + all inputs UNSPENT); PENDING quotes stay
// pending with no time limit anywhere in the fail path.
//
// TASK-4913 (INTENT-049, BLUEPRINT-049 v4 + Commander ORDER rev58): the
// auto re-send path is CUT entirely — retryable ⟹ failed. When reconcile
// finds quote UNPAID/PENDING + ALL inputs UNSPENT, meltFlow fails at once +
// releases the coins (clearReserved) so History shows failed and the user
// starts over manually with a FRESH quote (never reuse the old quote id).
// No second POST leaves this wallet on its own — the user sends it.

// TASK-4913: the re-send attempts/backoff constants are DELETED (no
// auto second POST exists anymore — one submit only). The poll/central timings
// below are UNTOUCHED (MELT_POST 120s / on-demand poll 20s / central 15s).
/** Invoice-expiry grace (ms) — RETAINED export (TASK-4911: no fail path
 * consults it anymore; kept for isMeltInvoiceDead compat + external callers). */
export const MELT_INVOICE_GRACE_MS = 60_000;

/**
 * TASK-4902: resolve the poll deadline (ms epoch) from the LNBC invoice:
 * deadline = (timestamp + expiry) * 1000 + MELT_INVOICE_GRACE_MS.
 * Pure offline decode — no network call (precedent: pending-tx-resolver
 * getLnbcExpiryMs, TASK-4406).
 *
 * RETAINED export (TASK-4911: no fail path calls it anymore — the owner
 * poll passes null; kept so external/test importers keep compiling).
 *
 * @returns deadlineMs, or null when the invoice is missing/undecodable
 *          (caller treats as "no invoice bound" — polls within budget only).
 */
export function getMeltInvoiceDeadlineMs(invoice: string | null | undefined): number | null {
	if (!invoice) return null;
	const decoded = decodeBolt11(invoice);
	if ('code' in decoded) return null;
	return (decoded.timestamp + decoded.expiry) * 1000 + MELT_INVOICE_GRACE_MS;
}

/** Outcome of one reconcile check (mint-agnostic — NUT-guaranteed only).
 * TASK-4913: no 'retryable' outcome exists — quote UNPAID/PENDING + all
 * inputs UNSPENT is proven non-payment ⟹ 'failed' at once (the user sends
 * again manually with a fresh quote; this wallet never POSTs a second time
 * on its own). */
export type MeltReconcileOutcome = 'paid' | 'failed' | 'unknown';

export interface MeltReconcileResult {
	outcome: MeltReconcileOutcome;
	quoteState: string;
	detail: string;
}

/**
 * TASK-4902 pillar 2: reconcile AFTER an unknown submit (single check, no
 * follow-up POST — TASK-4913 cut the auto re-send path entirely).
 *
 * 1. checkMeltQuote → PAID means the mint paid (confirm, never POST again).
 * 2. A FAILED-ish quote state means proven non-payment (fail, never POST again).
 * 3. Otherwise checkState(inputs): all UNSPENT + quote UNPAID/PENDING means
 *    the POST never took effect ⟹ proven non-payment ⟹ 'failed' at once
 *    (TASK-4913: the caller fails the tx + clearReserved immediately; the
 *    user starts over manually with a FRESH quote — this wallet never
 *    re-uses the old quote id on its own).
 *    Any PENDING/SPENT input, any check failure, or any unknown quote state
 *    means "do NOT settle here" (poll instead — never hammer, never kill).
 *
 * TASK-4911: NO invoice-expiry step — an expired invoice with a PENDING (or
 * UNPAID-but-unproven) quote stays pending; failed ⟺ proven non-payment
 * only (mint-FAILED above, or UNPAID/PENDING + all inputs UNSPENT here).
 * The `invoice` parameter is retained for signature stability and is NOT
 * consulted for any verdict.
 *
 * Mint-agnostic: only UNPAID/PENDING/PAID + checkState + error codes are
 * trusted. Unknown state strings are never terminal.
 */
export async function reconcileMeltAttempt(
	mintUrl: string,
	quoteId: string,
	inputs: SelectedProofInfo[],
	invoice?: string | null
): Promise<MeltReconcileResult> {
	let quoteState = 'UNKNOWN';
	try {
		const quote = await checkMeltQuote(mintUrl, quoteId);
		quoteState = quote.state ?? (quote.paid ? 'PAID' : 'UNPAID');
	} catch (err) {
		// Quote check itself failed (network/429) — uncertainty, never settle
		// on it and never POST again on it.
		return {
			outcome: 'unknown',
			quoteState,
			detail: `quote check failed: ${humanErrorMessage(err)}`
		};
	}

	if (quoteState === 'PAID') {
		return { outcome: 'paid', quoteState, detail: 'mint reports PAID — confirm, never POST again' };
	}
	if (/failed/i.test(quoteState)) {
		return { outcome: 'failed', quoteState, detail: `mint reports ${quoteState} — proven non-payment` };
	}

	// Quote UNPAID/PENDING (or an unknown state string): the inputs decide.
	// TASK-4913: all UNSPENT ⟹ the POST never took effect ⟹ proven
	// non-payment ⟹ 'failed' at once (fail + clearReserved at the caller;
	// the user retries manually with a fresh quote — no second POST here).
	try {
		const stateCheck = await checkState(
			mintUrl,
			inputs.map((p) => ({ secret: p.secret, C: p.C }))
		);
		const states = stateCheck.states.map((s) => s.state);
		if (states.length > 0 && states.every((s) => s === 'UNSPENT')) {
			return {
				outcome: 'failed',
				quoteState,
				detail: `quote ${quoteState} + all ${states.length} inputs UNSPENT — POST took no effect, proven non-payment: fail now, user retries manually with a fresh quote`
			};
		}
		return {
			outcome: 'unknown',
			quoteState,
			detail: `quote ${quoteState} + inputs [${states.join(',')}] — mint may hold them, poll instead of settling`
		};
	} catch (err) {
		return {
			outcome: 'unknown',
			quoteState,
			detail: `inputs check failed: ${humanErrorMessage(err)} — poll instead of settling`
		};
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
	/**
	 * TASK-4902: true when the melt outcome is UNKNOWN (submitted but
	 * unconfirmed) and the tx was left pending for auto-reconcile (M1/M2).
	 * Send.svelte needs no change — it already renders result.error.
	 */
	pending?: boolean;
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
	/**
	 * TASK-4902: true when proofs/outputs were actually submitted to the mint
	 * but the outcome is UNKNOWN (postMelt threw, anomaly, or local
	 * persistence broke after payment). The caller must NOT mark failed on
	 * this alone — reconcile (quote + checkState) first, poll until terminal
	 * (no invoice deadline — TASK-4911), and fail only on proven non-payment.
	 * False/absent means nothing was submitted (deterministic pre-submit
	 * abort) — failing is safe there.
	 */
	unknownOutcome?: boolean;
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
	// TASK-4902: visible to the catch below — true once a POST actually left
	// this wallet (set inside try). Anything thrown after a submit is
	// uncertainty (mint may have paid) → unknownOutcome, never failed alone.
	let meltSubmitted = false;
	try {
		getPrivateKey(); // throws if wallet is locked

		// TASK-4906: reserve the inputs the moment this submit starts — the
		// coins are on the wire from here until a terminal settle. Idempotent
		// (meltFlow already marked them; standalone callers get covered here).
		// Unknown local_ids (unit-test stubs) are skipped inside markReserved.
		// Release contract: success consumes via markSpent (clears the flag);
		// deterministic pre-submit failure clears below (meltSubmitted=false);
		// unknown outcome KEEPS the lock for reconcile (never fail blind).
		await markReserved(inputs.map(p => p.local_id));

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
		// (meltSubmitted is function-scoped for the catch — see above.)

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

				if (supportsNUT08) {
					// TASK-MELT-NUT08-BLANKS (NUT-08 spec): send BLANK outputs and let
					// the mint imprint the amounts. The wallet previously decomposed
					// `spentTotal - amount` into denominations itself (e.g. 8 → [8],
					// 1 output), but the mint signs its OWN split (e.g. 6 → [4, 2] =
					// 2 outputs). When the mint's split needs MORE outputs than the
					// wallet sent, the mint TRUNCATES to what is available (8 → [4])
					// — silently losing the rest and tripping the Step-7 anomaly
					// guard AFTER the LN payment already succeeded (Commander repro:
					// spentTotal=208, amount=200 → "signed change sum (4) < expected
					// changeAmount (6)" + 2 sats lost to truncation).
					//
					// NUT-08 fix: n = max(ceil(log2(changeAmount)), 1) outputs with
					// amount = 0 each. ceil(log2(n)) blanks is always enough for the
					// mint's binary split of any amount ≤ changeAmount (worst case:
					// 2^k − 1 needs k outputs); the mint signs whatever it owes
					// (possibly fewer, keeping the fee) and imprints each signature's
					// amount per its own split. Unblinding (Step 5) reads the amount
					// from the signature (sig.amount), not from the request.
					const blankCount = Math.max(Math.ceil(Math.log2(changeAmount)), 1);
					const startCounter = getCounterK(changeKeysetId);

					outputs = Array.from({ length: blankCount }, (_, i) => {
						const { secret, r } = generateChangeSecretAndR(changeKeysetId, startCounter + i);
						const { B_, blindingFactor } = blindMessage(secret, r);
						return {
							amount: 0, // blank — mint imprints the amount when signing (NUT-08)
							id: changeKeysetId,
							B_,
							secret,
							blindingFactor
						};
					});
				} else {
					// Legacy mint (no NUT-08): fee is reserved upfront, so the change
					// is exactly `spentTotal - amount - feeReserve`. Decompose into
					// standard Cashu denominations (TASK-MELT-DECOMPOSE): a single
					// change output with an off-denomination amount (e.g. 30) is
					// truncated by the mint to the nearest lower denomination in its
					// keyset (e.g. 16), silently losing the rest (Commander live
					// test: melt 64, pay 34 → change 30 came back 16, 14 sats lost).
					// Decomposing 30 → [16, 8, 4, 2] keeps every sat.
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
				}

				// Step 4: Submit melt to mint
				const outputBodies = outputs.map(o => ({
					amount: o.amount,
					id: o.id,
					B_: o.B_
				}));

				// TASK-4902 advance-on-submit (precedent mint.ts:389-391):
				// incrementCounterK lives in `finally` AFTER the actual send —
				// never before it, never outside `finally`. If postMelt throws
				// (routing/timeout/5xx/11002/20004/DLEQ-path), the mint may
				// still have signed our B_ — freezing the counter would make
				// the retry re-derive the SAME B_ → 11003 (WINDOW-1/C4).
				// Advance amount: the ACTUAL signed count when the mint
				// answered (TASK-313, incl. 0), else the FULL derived count
				// when the outcome is unknown (safe direction: a counter gap
				// is recoverable via NUT-9, a B_ reuse is money-loss).
				// The mint anomaly (signed > derived) still throws — but the
				// counter advances by the derived count first, because those
				// B_ were consumed on the wire regardless.
				let meltResponse: PostMeltResponse;
				let submittedCount = 0;
				let signedCount = -1; // -1 = postMelt never returned (unknown)
				try {
					submittedCount = outputs.length;
					meltSubmitted = true;
					meltResponse = await postMelt(mintUrl, quoteId, inputBodies, outputBodies);
					signedCount = meltResponse.change?.length ?? 0;

					// Sanity guard: mint anomaly — signed MORE outputs than we
					// derived. This should be impossible (mint cannot create
					// outputs we didn't ask for). Throw to abort the melt, but
					// the `finally` below still advances past the consumed B_.
					if (signedCount > outputs.length) {
						throw new Error(
							`Mint anomaly: signed ${signedCount} change outputs but we derived only ${outputs.length} — ` +
							`aborting to prevent counter_k desync. Mint URL: ${mintUrl}`
						);
					}
				} finally {
					if (submittedCount > 0) {
						incrementCounterK(
							changeKeysetId,
							signedCount >= 0 ? Math.min(signedCount, submittedCount) : submittedCount
						);
					}
				}

				return meltResponse;
			});
		} else {
			// No change output — nothing derived from the counter, so no lock needed.
			const outputBodies: Array<{ amount: number; id: string; B_: string }> = [];
			meltSubmitted = true;
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
		//     → TASK-MELT-NUT08-BLANKS: NO LONGER a hard throw. With the NUT-08
		//     blank-output model the mint signs its own denomination split and
		//     may legitimately return FEWER outputs than the blanks we sent
		//     (keeping the fee). The Lightning payment has ALREADY succeeded at
		//     this point — throwing would lose the tx record and misreport a
		//     successful payment as failed. Instead: warn, and clamp actualFee
		//     to >= 0 so the recorded fee never exceeds the reserve.
		//   - sum(change) >= legacyChangeAmount → actual_fee reduced by overpaid
		//   - feeReserve === 0 → no anomaly check possible (mint has no fee cap)
		const legacyChangeAmount = Math.max(0, spentTotal - amount - feeReserve);
		let actualFee: number;
		if (response.change && response.change.length > 0) {
			const sumChange = response.change.reduce(
				(s: number, c: { amount?: number }) => s + (c.amount ?? 0),
				0
			);
			// TASK-MELT-NUT08-BLANKS: under-refund is now a WARNING, not an
			// abort. sumChange < legacyChangeAmount means the mint refunded less
			// than the legacy expectation (it charged more than feeReserve, or
			// truncated the change split) — suspicious, but the payment already
			// went through, so we record truthfully what actually happened.
			if (feeReserve > 0 && sumChange < legacyChangeAmount) {
				console.warn(
					`[melt] Mint anomaly: signed change sum (${sumChange}) < expected changeAmount (${legacyChangeAmount}) — ` +
					`possible under-refund; clamping actual fee to feeReserve. Mint URL: ${mintUrl}`
				);
			}
			// Clamp to >= 0 (guards overpaid sums / floating-point drift). NOTE:
			// on under-refund (sumChange < legacyChangeAmount) the formula
			// legitimately yields actualFee > feeReserve — that IS the truthful
			// fee the mint actually kept (it charged more than the reserve).
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
				// TASK-4906: bind the consumed inputs so the resolver can
				// settle the reservation on any path (meltFlow passes
				// pendingTxId and already binds its own proofIds).
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
					actual_fee: actualFee,
					proofIds: inputs.map(p => p.local_id)
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
		// TASK-4902 pillar 3: failed ONLY on proven non-payment. meltSubmitted
		// means a POST left this wallet — the mint may have paid, so this is
		// uncertainty (unknownOutcome), never a failure verdict on its own.
		// TASK-4906: nothing was submitted (meltSubmitted=false — counter
		// guard, deterministic mint reject, pre-submit abort) → the coins
		// never left: release the reservation so they return to the pool.
		// Submitted-but-unknown KEEPS the lock for reconcile (meltFlow +
		// pending-tx-resolver settle it via quote/checkState, never blind).
		if (!meltSubmitted) {
			try { await clearReserved(inputs.map(p => p.local_id)); } catch { /* best-effort — never break the fail path */ }
		}
		if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('unreachable')) {
			return {
				success: false,
				change: [],
				spentAmount: 0,
				inputFeePpk: 0,
				calculatedFee: 0,
				unknownOutcome: meltSubmitted,
				error: `Mint unreachable: ${mintUrl}`
			};
		}
		return {
			success: false,
			change: [],
			spentAmount: 0,
			inputFeePpk: 0,
			calculatedFee: 0,
			unknownOutcome: meltSubmitted,
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
	// Phase 1: Request (nothing submitted yet — a failure here is proven
	// non-payment, so failing is safe and no reconcile is needed).
	const reqResult = await requestMelt(mintUrl, invoice, amount);
	if (!reqResult.success) {
		// No quote exists, so the tx id cannot bind one — record the failed
		// attempt under a local-only id the resolver recognises as
		// non-reconcilable (see extractMeltQuoteId in pending-tx-resolver).
		const reqTxId = `melt-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		try {
			await addTransaction({
				id: reqTxId,
				type: 'melt',
				protocol: 'lightning',
				amount,
				mint_url: mintUrl,
				timestamp: Date.now(),
				token_hash: null,
				invoice,
				status: 'failed',
				fee: 0
			} as Transaction);
		} catch {
			// Best-effort: silently ignore — don't break the melt flow
		}
		return {
			success: false,
			change: [],
			spentAmount: 0,
			inputFeePpk: 0,
			calculatedFee: 0,
			error: reqResult.error
		};
	}

	// TASK-4902 pillar 4: txid = melt-{quoteId} — extractMeltQuoteId can
	// always recover the quote for reconcile (closes the orphan gap where
	// melt-{timestamp}-{rand} left melt txs nobody could follow up).
	// TASK-4906: reserve the selected inputs NOW (they leave the wallet on
	// the first completeMelt POST) and bind their local_ids to the pending
	// tx (proofIds trail — the pending-tx-resolver releases/consumes the
	// reservation on its own terminal settles). completeMelt re-marks
	// idempotently at its own entry for standalone callers.
	const txId = `melt-${reqResult.quote}`;
	const reservedIds = reqResult.selectedProofs.map(p => p.local_id);
	try { await markReserved(reservedIds); } catch { /* best-effort — the submit still guards via checkState */ }
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
			fee: 0,
			proofIds: reservedIds
		} as Transaction);
	} catch {
		// Best-effort: silently ignore — don't break the melt flow.
		// NOTE: addTransaction throws on duplicate id — a retry of the same
		// quote reuses the existing pending tx (idempotent by construction).
	}

	const failTx = async () => {
		try { await updateTransaction(txId, { status: 'failed' }); } catch { /* best-effort */ }
	};

	try {
		// Phase 2: Complete + single reconcile settle (TASK-4913: exactly ONE
		// submit — no loop, no second POST. Reconcile decides once: PAID ⟹
		// confirm, proven non-payment (mint-FAILED, or UNPAID/PENDING + all
		// inputs UNSPENT) ⟹ failed + coins released, else TASK-4914 returns
		// pending IMMEDIATELY (no on-demand poll — central+M2 own it).
		// The user retries manually with a FRESH quote — this wallet never
		// re-uses the old quote id.)
		{
			const completeResult = await completeMelt(
				mintUrl,
				reqResult.quote,
				reqResult.selectedProofs,
				invoice,
				amount,
				reqResult.feeReserve,
				txId  // pass pending tx ID — completeMelt will update it to 'confirmed'
			);

			if (completeResult.success) {
				// On success: completeMelt already updated the pending tx to 'confirmed'
				return {
					success: true,
					change: completeResult.change,
					preimage: completeResult.preimage,
					spentAmount: completeResult.spentAmount,
					feeReserve: completeResult.feeReserve,
					inputFeePpk: reqResult.inputFeePpk,
					calculatedFee: reqResult.calculatedFee,
					actualFee: completeResult.actualFee  // TASK-FIX-320: propagate for Send.svelte
				};
			}

			// Proven non-payment (nothing was submitted — e.g. counter guard,
			// deterministic mint reject) → fail immediately, no reconcile.
			// TASK-4906: the coins never left — release them to the pool.
			if (!completeResult.unknownOutcome) {
				try { await clearReserved(reservedIds); } catch { /* best-effort */ }
				await failTx();
				return {
					success: false,
					change: [],
					spentAmount: 0,
					inputFeePpk: reqResult.inputFeePpk,
					calculatedFee: reqResult.calculatedFee,
					error: completeResult.error
				};
			}

			// Unknown outcome (a POST left this wallet) → reconcile first.
			const reconciled = await reconcileMeltAttempt(
				mintUrl,
				reqResult.quote,
				reqResult.selectedProofs,
				invoice
			);

			if (reconciled.outcome === 'paid') {
				// The mint DID pay (response was lost). Confirm the tx — the
				// user's intent (pay the invoice) is achieved. Change proofs
				// were never unblinded/stored; the advanced counter keeps B_
				// fresh and NUT-9 restore recovers any change later.
				// TASK-4906: the inputs are consumed at the mint — mark them
				// spent (clears the reservation; no stuck lock).
				try { await markSpent(reservedIds); } catch { /* best-effort */ }
				try { await updateTransaction(txId, { status: 'confirmed' }); } catch { /* best-effort */ }
				console.warn(`[melt] reconcile: quote ${reqResult.quote} is PAID — confirmed without change (recover via restore): ${reconciled.detail}`);
				return {
					success: true,
					change: [],
					spentAmount: amount + reqResult.feeReserve,
					feeReserve: reqResult.feeReserve,
					inputFeePpk: reqResult.inputFeePpk,
					calculatedFee: reqResult.calculatedFee,
					actualFee: reqResult.feeReserve,
					error: undefined
				};
			}

			if (reconciled.outcome === 'failed') {
				// Proven non-payment — TWO shapes, one verdict (TASK-4913):
				// (a) mint-declared FAILED state (TASK-4911: no expiry step
				// anymore), or (b) quote UNPAID/PENDING + ALL inputs UNSPENT
				// (the POST never took effect). Fail NOW + release the coins
				// to the pool (History shows failed; the user starts over
				// manually with a FRESH quote — never reuse this quote id).
				try { await clearReserved(reservedIds); } catch { /* best-effort */ }
				await failTx();
				return {
					success: false,
					change: [],
					spentAmount: 0,
					inputFeePpk: reqResult.inputFeePpk,
					calculatedFee: reqResult.calculatedFee,
					error: `${completeResult.error} (reconcile: ${reconciled.detail})`
				};
			}

			// TASK-4914 (INTENT-049, BLUEPRINT-049 v4 + Commander ORDER rev59):
			// on-demand poll CUT - no second poller competes with central+M2.
			// reconcile=>unknown returns pending IMMEDIATELY: the tx stays
			// pending (reservation KEPT), and the central 15s poll + M2 resolver
			// own it from here. NEVER failed on uncertainty.
			console.warn(`[melt] unknown outcome - handoff-to-central: quote ${reqResult.quote} kept pending for central+M2 (reconcile: ${reconciled.detail})`);
			return {
				success: false,
				change: [],
				spentAmount: 0,
				inputFeePpk: reqResult.inputFeePpk,
				calculatedFee: reqResult.calculatedFee,
				pending: true,
				error: `${completeResult.error} (payment status unknown — kept pending, auto-reconcile will settle it; quote ${reqResult.quote})`
			};
		}
	} catch (error) {
		// Unexpected error AFTER a quote exists: the outcome may be unknown —
		// leave pending for M1/M2 instead of failing blind (pillar 3).
		// (Phase-1 failures return earlier and never reach here.)
		const msg = humanErrorMessage(error);
		if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('unreachable')) {
			return {
				success: false,
				change: [],
				spentAmount: 0,
				inputFeePpk: 0,
				calculatedFee: 0,
				pending: true,
				error: `Mint unreachable: ${mintUrl} (kept pending, auto-reconcile will settle it)`
			};
		}
		return {
			success: false,
			change: [],
			spentAmount: 0,
			inputFeePpk: 0,
			calculatedFee: 0,
			pending: true,
			error: `${msg} (kept pending, auto-reconcile will settle it)`
		};
	}
}
