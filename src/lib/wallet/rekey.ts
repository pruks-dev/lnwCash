/**
 * TASK-259 (BLUEPRINT-003 v1.6.0 rev8, INTENT-003): Re-key — atomic re-seed → swap.
 *
 * Re-key is an AUTOMATIC step in the SETUP WIZARD after NUT-9 restore
 * (Setup.svelte recover flow), not a Settings feature. It moves the wallet off
 * its (possibly compromised) OLD seed onto a fresh 12-word BIP39 seed:
 *
 *   1. The wizard generates a NEW 12-word mnemonic, shows it (SeedGrid + paper
 *      ack + verify quiz — identical to the TASK-208 create flow), then calls
 *      `rekeyWallet(newMnemonic, pin, options)`.
 *   2. Swap ALL unspent proofs (NUT-03) for new proofs whose secrets are
 *      deterministically derived from the NEW seed.
 *   3. counter_k init = number of swapped outputs (NOT 0), so future
 *      deterministic mints never re-derive an output the mint already signed.
 *   4. NUT-29 batching: ≤ 1000 inputs/outputs per single swap request.
 *   5. Crash-safe atomicity (per-group commit): the NEW encrypted mnemonic +
 *      NEW private key are persisted + the NEW seed activated BEFORE any swap
 *      (the recovery anchor), and a "pending rekey" journal is written. Each
 *      (mint, keyset) group is committed IMMEDIATELY after its swap succeeds
 *      (`addProofs(new)` + `removeProofs(old of that group)`), so a later
 *      group's failure can never lose already-swapped funds. A failure BEFORE
 *      any group succeeds rolls back to the pre-rekey state (old proofs, old
 *      seed, old mnemonic + old key intact — no fund loss); a failure AFTER a
 *      group succeeded KEEPS the new mnemonic + journal so the wallet can be
 *      recovered via NUT-13 restore from the new seed.
 *   6. Swap only mints that actually hold unspent proofs (grouped by
 *      `proof.mint_url`), optionally restricted to the mints the user selected
 *      in the recover wizard (`options.mints`).
 *
 * ⚠️ MANDATE-029 — USER-CONFIRMED: this module NEVER auto-rekeys. The Setup
 * wizard must obtain explicit user confirmation (SeedGrid + paper ack + verify
 * quiz) before calling `rekeyWallet()`. Skipping is a UI decision that carries a
 * strong "seed compromised" warning; the core has no silent-skip path.
 *
 * ⚠️ No crypto primitives changed — this reuses `keys.ts` (BIP39),
 * `nut13.ts` (deriveSecretAndR), `encrypt.ts` (encryptKey) and `blind.ts`
 * exactly as the previous wallet flow did.
 */
import { mnemonicToSeed, mnemonicToPrivateKey } from './keys';
import {
	deriveSecretAndR,
	getActiveSeed,
	setActiveSeed,
	clearActiveSeed
} from './nut13';
import { setCounterK, clearAllCounters } from './counterK';
import {
	getUnspentProofs,
	addProofs,
	removeProofs,
	type StoredProof
} from './proofsDb';
import { swapProofs, checkState } from '../cashu/client';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { fetchAndCacheKeysets, getMintPubkey, resolveKeysetId } from '../cashu/keyset';
import { encryptKey } from '../crypto/encrypt';
import {
	getEncryptedMnemonic,
	setEncryptedMnemonic,
	clearEncryptedMnemonic,
	getEncryptedKey,
	setEncryptedKey,
	clearEncryptedKey
} from './storage';
import { getPrivateKey, refreshUnlockedPrivateKey } from './state';
import type { TokenProof, EncryptedKey } from '../types';

// ─── Constants ───────────────────────────────────────────────

/** NUT-29: maximum inputs/outputs per single NUT-03 swap request. */
export const NUT29_MAX_BATCH_SIZE = 1000;

// ─── Types ───────────────────────────────────────────────────

export interface RekeyResult {
	success: boolean;
	/** Number of old proofs swapped (burned at the mint). */
	swappedCount: number;
	/** Number of new deterministic proofs received. */
	receivedCount: number;
	/** Number of NUT-03 swap requests issued (batches). */
	batches: number;
}

export interface RekeyOptions {
	/**
	 * Restrict the swap to these mint URLs (normalized, no trailing slash).
	 * Defaults to every mint that holds unspent proofs — which already means
	 * "only mints with unspent proofs" since the swap groups by `proof.mint_url`.
	 */
	mints?: string[];
}

interface GroupPlan {
	mintUrl: string;
	keysetId: string;
	inputs: StoredProof[];
}

// ─── Rekey journal (crash-safe atomicity) ────────────────────
//
// A NUT-03 swap SPENDS (burns) the OLD proofs at the mint before the client
// receives the NEW proofs. To keep `rekeyWallet()` recoverable at every crash
// checkpoint, the encrypted NEW mnemonic is persisted to real storage AND a
// "pending rekey" journal is written to localStorage BEFORE any swap is issued.
// The mnemonic is the recovery anchor; the journal marks that a re-key was
// interrupted so the UI can re-offer it (resume) or recover via NUT-13 restore.
//
//   - crash before swap  → real mnemonic persisted, journal present, old proofs
//                          still valid → the swap can be re-attempted.
//   - crash after swap   → mnemonic persisted → swapped proofs recoverable via
//                          NUT-13 restore (restore.ts) from the new mnemonic.
//   - crash after commit → journal cleared → clean.

export const REKEY_JOURNAL_KEY = 'lnwcash_rekey_journal';

export interface RekeyJournal {
	status: 'pending';
	/** The encrypted NEW mnemonic (recovery anchor), encrypted under the PIN. */
	encryptedNewMnemonic: EncryptedKey;
	/** Timestamp when the re-key started (diagnostics only). */
	startedAt: number;
}

/** Read the pending-rekey journal, or null when no re-key is pending. */
export function getRekeyJournal(): RekeyJournal | null {
	try {
		const raw = localStorage.getItem(REKEY_JOURNAL_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as RekeyJournal | null;
		if (
			parsed &&
			parsed.status === 'pending' &&
			parsed.encryptedNewMnemonic &&
			typeof parsed.encryptedNewMnemonic === 'object'
		) {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

function setRekeyJournal(journal: RekeyJournal): void {
	try {
		localStorage.setItem(REKEY_JOURNAL_KEY, JSON.stringify(journal));
	} catch {
		// localStorage unavailable — best-effort; the in-memory seed still
		// guards the in-process commit path.
	}
}

export function clearRekeyJournal(): void {
	try {
		localStorage.removeItem(REKEY_JOURNAL_KEY);
	} catch {
		/* ignore */
	}
}

// ─── Swap orchestration (network only, no writes) ────────────

/**
 * Swap ONE NUT-03 batch (≤ NUT29_MAX_BATCH_SIZE) of old proofs for new
 * deterministic proofs derived from the NEW seed.
 *
 * Outputs are 1:1 with inputs (same amounts), so each batch stays
 * amount-balanced (sum(inputs) === sum(outputs)) — a NUT-03 requirement.
 *
 * This function performs NO local persistence: it only hits the network and
 * returns the unblinded new proofs. The caller commits each successful batch
 * immediately (per-batch commit) so a later batch's failure never discards
 * already-swapped proofs (no fund loss).
 *
 * @param startCounter The derivation counter to start from for this batch
 *                     (continuous across the batches of a single keyset group).
 */
async function swapBatchForNewSeed(
	mintUrl: string,
	fullId: string,
	batch: StoredProof[],
	seed: Uint8Array,
	startCounter: number
): Promise<TokenProof[]> {
	// Deterministic outputs from the NEW seed (counter space startCounter..N-1).
	const blindPairs: Array<{ secret: string; blindingFactor: string }> = [];
	const outputs: Array<{ amount: number; id: string; B_: string }> = [];
	let counter = startCounter;
	for (const input of batch) {
		const { secret, r } = deriveSecretAndR(seed, fullId, counter);
		counter++;
		const { B_, blindingFactor } = blindMessage(secret, r);
		blindPairs.push({ secret, blindingFactor });
		outputs.push({ amount: input.amount, id: fullId, B_ });
	}

	const swapInputs = batch.map((p) => ({
		secret: p.secret,
		C: p.C,
		amount: p.amount,
		id: fullId
	}));

	const result = await swapProofs(mintUrl, swapInputs, outputs);

	const newProofs: TokenProof[] = [];
	result.signatures.forEach((sig, i) => {
		const bp = blindPairs[i];
		if (!bp) return; // defensive: signature/output count mismatch
		const pubkey = getMintPubkey(mintUrl, fullId, sig.amount);
		const C = pubkey ? unblindSignature(sig.C_, bp.blindingFactor, pubkey) : sig.C_;
		const proof: TokenProof = {
			id: sig.id || fullId,
			amount: sig.amount,
			secret: bp.secret,
			C
		};
		if (sig.dleq) {
			proof.dleq = {
				e: sig.dleq.e,
				s: sig.dleq.s,
				r: blindingFactorToHex(bp.blindingFactor)
			};
		}
		newProofs.push(proof);
	});

	return newProofs;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * R5 (TASK-266): verify via NUT-07 checkState whether ANY old proof was
 * actually burned (SPENT/PENDING) at its mint. This guards the zero-success
 * rollback against the "swap succeeded server-side but the response was lost"
 * race: `swapProofs` can throw (e.g. a timeout after the mint committed) while
 * `swappedAny` is still false — rolling back in that case would orphan the
 * already-swapped funds.
 *
 * @returns true when at least one old proof is SPENT/PENDING (a swap went
 *          through → do NOT roll back); false when every old proof is still
 *          UNSPENT, or when checkState is unreachable (the same mint
 *          unreachability that caused the swap to fail → assume nothing was
 *          burned and roll back).
 */
async function anyOldProofBurned(proofs: StoredProof[]): Promise<boolean> {
	const byMint = new Map<string, StoredProof[]>();
	for (const p of proofs) {
		const list = byMint.get(p.mint_url) ?? [];
		list.push(p);
		byMint.set(p.mint_url, list);
	}
	for (const [mintUrl, mintProofs] of byMint) {
		try {
			const res = await checkState(
				mintUrl,
				mintProofs.map((p) => ({ secret: p.secret, C: p.C }))
			);
			if (res.states.some((s) => s.state === 'SPENT' || s.state === 'PENDING')) {
				return true;
			}
		} catch {
			// checkState unreachable — assume nothing was burned (see docs above).
		}
	}
	return false;
}

/**
 * Re-key the wallet: swap all unspent proofs for proofs derived from a NEW seed.
 *
 * 1. Derive the 64-byte seed from the (already shown + verified) new mnemonic.
 * 2. Group unspent proofs by (mint_url, keyset_id) — restricting to
 *    `options.mints` when provided. Mints with no unspent proofs are skipped
 *    automatically (no group → no swap).
 * 3. Persist the NEW encrypted mnemonic + NEW private key + activate the NEW
 *    seed BEFORE any swap (the recovery anchor), and write the "pending rekey"
 *    journal. The private key rotates at the SAME anchor so the wallet invariant
 *    `seedToPrivateKey(exportSeed(pin)) === stored private key` holds after a
 *    re-key.
 * 4. Swap each group (NUT-03, batched per NUT-29) and commit it IMMEDIATELY
 *    after success (addProofs(new) + removeProofs(old)). A failure BEFORE any
 *    group succeeds rolls back to the pre-rekey state (no fund loss); a failure
 *    AFTER a group succeeded keeps the new mnemonic/seed/key + journal and
 *    throws a "resume via restore" error.
 * 5. Finalize (only after ALL groups swapped): clear ALL old counters →
 *    counter_k := swap count per keyset → clear the journal.
 *
 * The wallet is assumed to already be unlocked (the Setup recover flow has just
 * created + unlocked it), so no PIN re-verification is performed here — `pin`
 * is used only to encrypt the new mnemonic + new private key. User confirmation
 * is enforced by the wizard (SeedGrid + paper ack + verify quiz) before this is
 * called.
 *
 * @param newMnemonic 12-word BIP39 mnemonic for the NEW seed.
 * @param pin The wallet PIN (encrypts the new mnemonic + new private key).
 * @param options Optional mint restriction.
 * @throws Error (propagated) on zero-success failure (state rolled back); a
 *         distinct "resume via restore" error on partial success (anchor kept).
 */
export async function rekeyWallet(
	newMnemonic: string,
	pin: string,
	options: RekeyOptions = {}
): Promise<RekeyResult> {
	// New mnemonic → 64-byte seed (the new deterministic root).
	const newSeed = mnemonicToSeed(newMnemonic);

	// Gather unspent proofs (spent proofs are already burned; orphaned excluded).
	const allProofs = await getUnspentProofs();

	// Optional mint restriction (normalized URLs, no trailing slash).
	const mintsFilter = options.mints
		? new Set(options.mints.map((u) => u.replace(/\/+$/, '')))
		: null;

	const proofs = mintsFilter
		? allProofs.filter((p) => mintsFilter.has(p.mint_url))
		: allProofs;

	// Group proofs by (mint_url, keyset_id). Only mints with unspent proofs
	// appear here — a mint with no unspent proofs is never swapped.
	const groups = new Map<string, GroupPlan>();
	for (const p of proofs) {
		const key = `${p.mint_url}\u0000${p.keyset_id}`;
		let group = groups.get(key);
		if (!group) {
			group = { mintUrl: p.mint_url, keysetId: p.keyset_id, inputs: [] };
			groups.set(key, group);
		}
		group.inputs.push(p);
	}

	// ── Recovery anchor ────────────────────────────────────────
	// Persist the NEW encrypted mnemonic + NEW private key + activate the NEW
	// seed BEFORE any swap. Once this is durable, a crash at ANY later point
	// (including after the mint has burned the old proofs) can be recovered from
	// the new mnemonic via NUT-13 restore. Capture the pre-rekey state so a
	// zero-success failure can roll back cleanly.
	const prevMnemonic = getEncryptedMnemonic();
	const prevSeed = getActiveSeed();
	const prevEncryptedKey = getEncryptedKey();
	// TASK-273 (fix 6c): capture the current in-memory unlocked key so a
	// zero-success rollback can restore it (key/seed consistency must survive a
	// failed re-key, not just the persisted blobs).
	let prevPrivateKey: string | null = null;
	try {
		prevPrivateKey = getPrivateKey();
	} catch {
		// Wallet not unlocked (e.g. tests calling rekeyWallet directly) — there is
		// no in-memory key to preserve; rollback will restore null.
		prevPrivateKey = null;
	}

	const encryptedNewMnemonic = await encryptKey(newMnemonic, pin);
	// A2: rotate the secp256k1 private key at the SAME anchor as the mnemonic,
	// so `seedToPrivateKey(exportSeed(pin)) === stored private key` holds after
	// a re-key (the invariant). Persisted before any swap → crash-safe.
	const newPrivateKey = mnemonicToPrivateKey(newMnemonic);
	const encryptedNewKey = await encryptKey(newPrivateKey, pin);

	setEncryptedMnemonic(encryptedNewMnemonic);
	setEncryptedKey(encryptedNewKey);
	setActiveSeed(newSeed);
	// TASK-273 (fix 6c): rotate the in-memory unlocked key to the NEW key at the
	// same anchor, so getPrivateKey() (used by mint/melt/swap) never diverges
	// from the NEW seed's derived key after a no-skip re-key.
	refreshUnlockedPrivateKey(newPrivateKey);
	setRekeyJournal({ status: 'pending', encryptedNewMnemonic, startedAt: Date.now() });

	// Phase A — swap (network) + per-batch commit. Each NUT-03 batch is the
	// atomic unit of "funds burned at the mint", so each successful batch is
	// committed IMMEDIATELY (addProofs(new) + removeProofs(old)) before the next
	// batch is issued. A later batch's failure must never roll the anchor back —
	// the already-committed batches stay recoverable via the NEW mnemonic.
	const counters = new Map<string, number>();
	let batchCount = 0;
	let swappedAny = false;
	try {
		for (const group of groups.values()) {
			await fetchAndCacheKeysets(group.mintUrl);
			const fullId = resolveKeysetId(group.mintUrl, group.keysetId) || group.keysetId;

			let counter = 0;
			for (let start = 0; start < group.inputs.length; start += NUT29_MAX_BATCH_SIZE) {
				const batch = group.inputs.slice(start, start + NUT29_MAX_BATCH_SIZE);
				batchCount++;

				const newProofs = await swapBatchForNewSeed(
					group.mintUrl,
					fullId,
					batch,
					newSeed,
					counter
				);
				// The mint has burned this batch's OLD proofs at this point — the
				// new mnemonic/seed/key must remain anchored no matter what happens
				// next (including a local IndexedDB write failure below).
				swappedAny = true;

				counter += batch.length;

				// Per-batch commit: the old proofs are already burned at the mint,
				// so persist the new proofs + remove the old ones IMMEDIATELY (no
				// waiting for later batches/groups → no fund-loss window).
				if (newProofs.length > 0) {
					await addProofs(newProofs, group.mintUrl, fullId);
				}
				await removeProofs(batch.map((p) => p.local_id));
			}

			counters.set(fullId, counter);
		}
	} catch (err) {
		if (!swappedAny) {
			// R5 (TASK-266): confirm via NUT-07 that the mint did NOT actually
			// burn any old proof before rolling back (see anyOldProofBurned).
			// If a swap went through server-side but the response was lost, we
			// must NOT roll back — the swapped funds would be orphaned.
			const burned = await anyOldProofBurned(proofs);
			if (!burned) {
				// Zero-success: NOTHING was burned at the mint → safe to restore
				// the pre-rekey wallet state (mnemonic, key, seed, journal)
				// atomically.
				if (prevMnemonic) setEncryptedMnemonic(prevMnemonic);
				else clearEncryptedMnemonic();
				if (prevEncryptedKey) setEncryptedKey(prevEncryptedKey);
				else clearEncryptedKey();
				if (prevSeed) setActiveSeed(prevSeed);
				else clearActiveSeed();
				// TASK-273 (fix 6c): restore the in-memory key too (atomicity).
				refreshUnlockedPrivateKey(prevPrivateKey);
				clearRekeyJournal();
				throw err;
			}
			// A swap actually burned old proofs → fall through to the
			// partial-success handling below (keep the anchor + journal).
		}
		// Partial success: some batches were already swapped + committed. The NEW
		// mnemonic/seed/key + journal are the recovery anchor for those proofs and
		// MUST be kept. The UI surfaces this error as "re-key not complete —
		// resume via restore".
		throw new Error(
			're-key not complete — some proofs were swapped; resume via restore (NUT-13) from the NEW seed'
		);
	}

	// Phase B — finalize (only reached after ALL swaps succeeded).
	// The OLD seed's counters are now meaningless (the derivation root changed):
	// wipe them, then seed the NEW counters from the per-group swap counts.
	clearAllCounters();
	for (const [keysetId, value] of counters) {
		setCounterK(keysetId, value);
	}

	clearRekeyJournal();

	return {
		success: true,
		swappedCount: proofs.length,
		receivedCount: [...counters.values()].reduce((a, b) => a + b, 0),
		batches: batchCount
	};
}
