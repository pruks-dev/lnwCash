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
	prepared.forEach((entry, offset) => byB.set(entry.B_, { entry, offset }));

	const response = await restoreOutputs(mintUrl, requestOutputs);

	let highestSignedCounter = -1;

	const proofs: TokenProof[] = response.signatures.map((sig, i) => {
		// Prefer the mint's echoed `outputs` (FILTERED to signed outputs only);
		// fall back to request order when `outputs` is absent (compat mints that
		// return signatures aligned 1:1 with the request).
		const echoedB = response.outputs?.[i]?.B_;
		const matched = echoedB !== undefined ? byB.get(echoedB) : undefined;
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
