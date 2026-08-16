/**
 * NUT-13 wallet restore flow — recover ecash proofs from the wallet seed.
 *
 * Flow (per NUT-13 "Restore from seed phrase"):
 *   1. For each counter_k, derive `secret` and `r` deterministically.
 *   2. Re-generate the `BlindedMessage` (B_) from `secret` + `r`.
 *   3. Ask the mint to re-issue the `BlindSignature` (POST /v1/restore, NUT-09).
 *   4. Unblind the signature → `C`.
 *   5. Restore `Proof = (secret, C, amount)`.
 *   6. Check spent state (NUT-07) and keep only UNSPENT proofs.
 *
 * The wallet replays counters in batches (default 100) until three
 * consecutive batches come back empty, then records the final counter_k.
 */
import { deriveSecretAndR } from './nut13';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import {
	restoreOutputs,
	checkState,
	type RestoreBlindedMessage
} from '../cashu/client';
import { getMintPubkey } from '../cashu/keyset';
import { addProofs } from './proofsDb';
import { setCounterK } from './counterK';
import type { TokenProof } from '../types';

// ─── Types ───────────────────────────────────────────────────

export interface RestoreBatchOutput {
	amount: number;
	id: string;
	B_: string;
	/** base64url blinding factor (needed to unblind the returned signature) */
	blindingFactor: string;
	/** the deterministic secret for this output */
	secret: string;
}

export interface RestoreBatchResult {
	/** Unblinded proofs for the counters the mint re-issued. */
	proofs: TokenProof[];
	/** Number of signatures the mint returned (before spent filtering). */
	signaturesCount: number;
	/**
	 * Highest counter (startCounter + offset) that the mint actually signed in
	 * this batch, or -1 when the mint returned no signatures. Tracked from the
	 * B_ match so it survives gaps (a FILTERED response may skip counters the
	 * mint never signed). Used to advance counter_k as `highestSigned + 1`.
	 */
	highestSignedCounter: number;
}

export interface RestoreResult {
	success: boolean;
	/** Unspent proofs recovered (not stored when `persist` is false). */
	proofs: TokenProof[];
	/** The final counter_k recorded for this keyset. */
	counter: number;
	error?: string;
}

export interface RestoreOptions {
	/** Outputs per restore request (NUT-13 recommends 100). */
	batchSize?: number;
	/** Stop after this many consecutive empty batches (NUT-13 recommends 3). */
	emptyBatchLimit?: number;
	/** Persist recovered proofs to IndexedDB (default true). */
	persist?: boolean;
}

// ─── Core: restore one batch ─────────────────────────────────

/**
 * Normalize a blinded-message hex string to a canonical form for exact-string
 * matching: lowercase, no `0x` prefix, no leading-zero padding beyond the
 * 33-byte compressed-point encoding (66 hex chars).
 *
 * F-V30-003: a mint may echo B_ back in a different format (uppercase, an `0x`
 * prefix, or extra leading zeros). Comparing raw strings would miss the match
 * and fall back to index alignment — the very bug F-V29-003 fixed. Normalizing
 * both the map key and the lookup key keeps B_-based alignment robust against
 * format drift, without touching the counter/highest+1 logic.
 */
function normalizeB(B_: string): string {
	let b = B_.replace(/^0x/i, '');
	b = b.toLowerCase();
	// Strip leading-zero padding beyond the canonical 66 hex chars. The
	// compressed point's own 02/03 prefix byte sits inside the final 66 chars,
	// so this only ever removes extra padding, never the point prefix.
	while (b.length > 66 && b[0] === '0') b = b.slice(1);
	return b;
}

/**
 * Regenerate `batchSize` blinded outputs starting at `startCounter`, POST them
 * to the mint's restore endpoint, and unblind any returned signatures.
 *
 * @returns the unblinded proofs (spent-state NOT yet filtered).
 */
export async function restoreBatch(
	mintUrl: string,
	seed: Uint8Array,
	keysetId: string,
	startCounter: number,
	batchSize: number
): Promise<RestoreBatchResult> {
	const prepared: RestoreBatchOutput[] = [];

	for (let i = 0; i < batchSize; i++) {
		const counter = startCounter + i;
		const { secret, r } = deriveSecretAndR(seed, keysetId, counter);
		const { B_, blindingFactor } = blindMessage(secret, r);
		prepared.push({
			amount: 0, // amount unknown at restore time — mint returns it in the signature
			id: keysetId,
			B_,
			blindingFactor,
			secret
		});
	}

	const requestOutputs: RestoreBlindedMessage[] = prepared.map((o) => ({
		amount: o.amount,
		id: o.id,
		B_: o.B_
	}));

	// Index the prepared entries by their blinded message B_, so we can align
	// the mint's signatures with the correct blinding factor even when the mint
	// returns a FILTERED list (Nutshell /v1/restore returns only the outputs it
	// actually signed). F-V29-003: mapping by index assumed a 1:1 echo, which
	// unblinds with the wrong factor and produces garbage proofs.
	const byB = new Map<string, { entry: RestoreBatchOutput; offset: number }>();
	prepared.forEach((entry, offset) => byB.set(normalizeB(entry.B_), { entry, offset }));

	const response = await restoreOutputs(mintUrl, requestOutputs);

	let highestSignedCounter = -1;

	const proofs: TokenProof[] = response.signatures.map((sig, i) => {
		// Prefer the mint's echoed `outputs` (FILTERED to signed outputs only);
		// fall back to request order when `outputs` is absent (compat mints that
		// return signatures aligned 1:1 with the request).
		const echoedB = response.outputs?.[i]?.B_;
		const matched = echoedB !== undefined ? byB.get(normalizeB(echoedB)) : undefined;
		const output = matched ? matched.entry : prepared[i];
		const offset = matched ? matched.offset : i;

		const counter = startCounter + offset;
		if (counter > highestSignedCounter) highestSignedCounter = counter;

		const pubkey = getMintPubkey(mintUrl, keysetId, sig.amount);
		const C = unblindSignature(sig.C_, output.blindingFactor, pubkey);
		const proof: TokenProof = {
			id: sig.id,
			amount: sig.amount,
			secret: output.secret,
			C
		};
		if (sig.dleq) {
			proof.dleq = {
				e: sig.dleq.e,
				s: sig.dleq.s,
				r: blindingFactorToHex(output.blindingFactor)
			};
		}
		return proof;
	});

	return {
		proofs,
		signaturesCount: response.signatures.length,
		highestSignedCounter
	};
}

// ─── Full restore flow ───────────────────────────────────────

/**
 * Restore the wallet's proofs for a single keyset by replaying counters in
 * batches until three consecutive batches return empty (NUT-13 recommended
 * stopping condition).
 *
 * @param seed 64-byte BIP39 seed (the wallet's deterministic seed)
 * @param keysetId Keyset to restore proofs for
 */
export async function restoreWallet(
	mintUrl: string,
	seed: Uint8Array,
	keysetId: string,
	options: RestoreOptions = {}
): Promise<RestoreResult> {
	const batchSize = options.batchSize ?? 100;
	const emptyBatchLimit = options.emptyBatchLimit ?? 3;
	const persist = options.persist ?? true;

	try {
		let counter = 0;
		let emptyBatches = 0;
		let lastNonEmptyCounter = 0;
		const recovered: TokenProof[] = [];

		while (true) {
			const { proofs, signaturesCount, highestSignedCounter } = await restoreBatch(
				mintUrl,
				seed,
				keysetId,
				counter,
				batchSize
			);

			if (signaturesCount === 0) {
				emptyBatches++;
				if (emptyBatches >= emptyBatchLimit) break;
			} else {
				emptyBatches = 0;

				// NUT-07: drop proofs the mint reports as SPENT.
				const states = await checkState(
					mintUrl,
					proofs.map((p) => ({ secret: p.secret, C: p.C }))
				);
				const unspent = proofs.filter(
					(_p, i) => states.states[i]?.state === 'UNSPENT'
				);
				recovered.push(...unspent);

				// F-V29-004: advance to highest SIGNED counter + 1 (not signature
				// count). When the mint's response has gaps (e.g. counter 0 was
				// never signed but 1 and 2 were), `counter + proofs.length` would
				// undercount and let a later restore re-derive/re-mint the wrong
				// counters.
				if (highestSignedCounter >= 0) {
					lastNonEmptyCounter = highestSignedCounter + 1;
				}
			}

			counter += batchSize;
		}

		// Record the counter_k for future deterministic mints.
		setCounterK(keysetId, lastNonEmptyCounter);

		if (persist && recovered.length > 0) {
			await addProofs(recovered, mintUrl, keysetId);
		}

		return {
			success: true,
			proofs: recovered,
			counter: lastNonEmptyCounter
		};
	} catch (error) {
		return {
			success: false,
			proofs: [],
			counter: 0,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
