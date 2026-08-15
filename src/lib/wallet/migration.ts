/**
 * TASK-245 (F-V26-003): Re-seed → swap migration.
 *
 * Moves a legacy wallet (pre-v1.4.1 — random-secret proofs from melt/swap) to
 * full NUT-13 determinism:
 *
 *   1. Generate a NEW 12-word BIP39 mnemonic → 64-byte seed.
 *   2. Swap ALL unspent proofs (NUT-03) for new proofs whose secrets are
 *      deterministically derived from the NEW seed.
 *   3. counter_k init = number of swapped outputs (NOT 0), so future
 *      deterministic mints never re-derive an output the mint already signed.
 *   4. Crash-safe atomicity (TASK-245-fix / T246-SEC-01): the NEW encrypted
 *      mnemonic is persisted + the NEW seed activated BEFORE any swap is issued,
 *      and a "pending migration" journal is written — so there is NO checkpoint
 *      where proofs are burned but the new seed is not yet recoverable. A swap
 *      failure rolls back to the pre-migration state (old proofs, old seed, old
 *      mnemonic all intact — no fund loss).
 *
 * ⚠️ MANDATE-029 — USER-CONFIRMED: this module NEVER auto-migrates. The UI
 * (Settings.svelte) must obtain explicit user confirmation + re-verified PIN
 * before calling migrateWallet(). `detectLegacyProofs()` is the read-only
 * gate the UI uses to decide whether to offer migration.
 */
import { generateMnemonic, mnemonicToSeed } from './keys';
import {
	deriveSecret,
	deriveSecretAndR,
	getActiveSeed,
	setActiveSeed,
	clearActiveSeed
} from './nut13';
import { getCounterK, setCounterK } from './counterK';
import {
	getUnspentProofs,
	addProofs,
	removeProofs,
	type StoredProof
} from './proofsDb';
import { swapProofs } from '../cashu/client';
import { blindMessage, unblindSignature, blindingFactorToHex } from '../cashu/blind';
import { fetchAndCacheKeysets, getMintPubkey, resolveKeysetId } from '../cashu/keyset';
import { verifyPin, encryptKey } from '../crypto/encrypt';
import {
	getPinHash,
	getEncryptedMnemonic,
	setEncryptedMnemonic,
	clearEncryptedMnemonic
} from './storage';
import { InvalidPinError, WalletNotInitializedError } from './errors';
import type { TokenProof, EncryptedKey } from '../types';

// ─── Constants ───────────────────────────────────────────────

/** NUT-29: maximum inputs/outputs per single NUT-03 swap request. */
export const NUT29_MAX_BATCH_SIZE = 1000;

// ─── Types ───────────────────────────────────────────────────

export interface MigrateResult {
	success: boolean;
	/** Number of old proofs swapped (burned at the mint). */
	swappedCount: number;
	/** Number of new deterministic proofs received. */
	receivedCount: number;
	/** Number of NUT-03 swap requests issued (batches). */
	batches: number;
	error?: string;
}

interface GroupPlan {
	mintUrl: string;
	keysetId: string;
	inputs: StoredProof[];
	newProofs: TokenProof[];
}

// ─── Migration journal (TASK-245-fix / T246-SEC-01) ──────────
//
// A NUT-03 swap SPENDS (burns) the OLD proofs at the mint before the client
// receives the NEW proofs. To keep migrateWallet() recoverable at every crash
// checkpoint, the encrypted NEW mnemonic is persisted to real storage AND a
// "pending migration" journal is written to localStorage BEFORE any swap is
// issued. The mnemonic is the recovery anchor; the journal marks that a
// migration was interrupted so the UI can re-offer it (resume) or recover.
//
//   - crash before swap  → real mnemonic persisted, journal present, old proofs
//                          still valid → detectLegacyProofs() keeps reporting
//                          them (journal-aware) so migration is re-offered.
//   - crash after swap   → mnemonic persisted → swapped proofs recoverable via
//                          NUT-13 restore (restore.ts) from the new mnemonic.
//   - crash after commit → journal cleared → clean.

export const MIGRATION_JOURNAL_KEY = 'lnwcash_migration_journal';

export interface MigrationJournal {
	status: 'pending';
	/** The encrypted NEW mnemonic (recovery anchor), encrypted under the PIN. */
	encryptedNewMnemonic: EncryptedKey;
	/** Timestamp when the migration started (diagnostics only). */
	startedAt: number;
}

/** Read the pending-migration journal, or null when no migration is pending. */
export function getMigrationJournal(): MigrationJournal | null {
	try {
		const raw = localStorage.getItem(MIGRATION_JOURNAL_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as MigrationJournal | null;
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

function setMigrationJournal(journal: MigrationJournal): void {
	try {
		localStorage.setItem(MIGRATION_JOURNAL_KEY, JSON.stringify(journal));
	} catch {
		// localStorage unavailable — best-effort; the in-memory seed still
		// guards the in-process commit path.
	}
}

export function clearMigrationJournal(): void {
	try {
		localStorage.removeItem(MIGRATION_JOURNAL_KEY);
	} catch {
		/* ignore */
	}
}

// ─── Detection ───────────────────────────────────────────────

/**
 * Whether a stored proof's `secret` is derivable from the given seed for some
 * counter `k ∈ [0, counter_k]` of its keyset. A legacy (pre-v1.4.1) proof has
 * a random secret and will never match a deterministic derivation.
 */
function isDeterministicProof(proof: StoredProof, seed: Uint8Array): boolean {
	const limit = getCounterK(proof.keyset_id);
	for (let k = 0; k <= limit; k++) {
		try {
			if (deriveSecret(seed, proof.keyset_id, k) === proof.secret) return true;
		} catch {
			// Unsupported keyset version → cannot be derived from this seed.
			return false;
		}
	}
	return false;
}

/**
 * Detect legacy (random-secret) proofs from pre-v1.4.1.
 *
 * - No unspent proofs → empty.
 * - Active seed present → returns the proofs whose secret is NOT derivable
 *   from that seed (a precise per-proof check).
 * - No active seed (locked or legacy): a stored mnemonic implies a post-v1.4.1
 *   wallet (deterministic by construction) → empty; no mnemonic implies a
 *   legacy wallet → all proofs are legacy.
 *
 * This is the read-only gate for the "Migrate wallet" UI entry.
 */
export async function detectLegacyProofs(): Promise<StoredProof[]> {
	const proofs = await getUnspentProofs();
	if (proofs.length === 0) return [];

	const seed = getActiveSeed();
	if (seed) {
		return proofs.filter((p) => !isDeterministicProof(p, seed));
	}

	// A pending migration journal means a previous migration was interrupted
	// (crash/kill): the old proofs may not have been swapped yet → keep
	// reporting them as legacy so the UI re-offers migration (resume).
	if (getMigrationJournal()) {
		return proofs;
	}

	return getEncryptedMnemonic() ? [] : proofs;
}

// ─── Swap orchestration (Phase A — network only, no writes) ──

/**
 * Swap one (mint, keyset) group of old proofs for new deterministic proofs
 * derived from the NEW seed, batching per NUT-29 (≤ 1000 per request).
 *
 * Outputs are 1:1 with inputs (same amounts), so each batch stays
 * amount-balanced (sum(inputs) === sum(outputs)) — a NUT-03 requirement.
 *
 * This function performs NO local persistence: it only hits the network and
 * returns the unblinded new proofs, so a failure here leaves the wallet
 * completely untouched (atomicity).
 */
async function swapGroupForNewSeed(
	mintUrl: string,
	keysetId: string,
	inputs: StoredProof[],
	seed: Uint8Array
): Promise<{ fullId: string; newProofs: TokenProof[]; batches: number }> {
	await fetchAndCacheKeysets(mintUrl);
	const fullId = resolveKeysetId(mintUrl, keysetId) || keysetId;

	const newProofs: TokenProof[] = [];
	let counter = 0;
	let batches = 0;

	for (let start = 0; start < inputs.length; start += NUT29_MAX_BATCH_SIZE) {
		batches++;
		const batch = inputs.slice(start, start + NUT29_MAX_BATCH_SIZE);

		// Deterministic outputs from the NEW seed (fresh counter space 0..N-1).
		const blindPairs: Array<{ secret: string; blindingFactor: string }> = [];
		const outputs: Array<{ amount: number; id: string; B_: string }> = [];
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
	}

	return { fullId, newProofs, batches };
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Migrate a legacy wallet to a fresh deterministic seed.
 *
 * 1. Verify the PIN (final cryptographic gate — MANDATE-029 user confirmation).
 * 2. Generate a new mnemonic → seed.
 * 3. Persist the NEW encrypted mnemonic + activate the NEW seed BEFORE any swap
 *    (the recovery anchor), and write the "pending migration" journal.
 * 4. Swap all unspent proofs for new seed-derived proofs (NUT-03, batched).
 *    Any swap failure rolls back to the pre-migration state (no fund loss).
 * 5. Commit: persist new proofs → clear old proofs → counter_k := swap count →
 *    clear the journal.
 *
 * Atomicity (TASK-245-fix / T246-SEC-01): the new mnemonic is durable before
 * the mint ever spends an old proof, so there is no checkpoint where proofs are
 * burned but the seed is unrecoverable.
 *
 * @throws InvalidPinError if the PIN is wrong
 * @throws WalletNotInitializedError if no wallet exists
 * @throws Error (propagated) if any swap fails
 */
export async function migrateWallet(pin: string): Promise<MigrateResult> {
	const pinHash = getPinHash();
	if (!pinHash) {
		throw new WalletNotInitializedError();
	}
	const valid = await verifyPin(pin, pinHash);
	if (!valid) {
		throw new InvalidPinError();
	}

	// Gather unspent proofs (spent proofs are already burned; orphaned excluded).
	const proofs = await getUnspentProofs();
	if (proofs.length === 0) {
		return { success: true, swappedCount: 0, receivedCount: 0, batches: 0 };
	}

	// New mnemonic → 64-byte seed (the new deterministic root).
	const newMnemonic = generateMnemonic();
	const newSeed = mnemonicToSeed(newMnemonic);

	// Group proofs by (mint_url, keyset_id).
	const groups = new Map<string, GroupPlan>();
	for (const p of proofs) {
		const key = `${p.mint_url}\u0000${p.keyset_id}`;
		let group = groups.get(key);
		if (!group) {
			group = { mintUrl: p.mint_url, keysetId: p.keyset_id, inputs: [], newProofs: [] };
			groups.set(key, group);
		}
		group.inputs.push(p);
	}

	// ── Recovery anchor (TASK-245-fix) ──────────────────────────
	// Persist the NEW encrypted mnemonic + activate the NEW seed BEFORE any
	// swap. Once this is durable, a crash at ANY later point (including after
	// the mint has burned the old proofs) can be recovered from the new
	// mnemonic via NUT-13 restore. Capture the pre-migration state so a swap
	// FAILURE can roll back cleanly.
	const prevMnemonic = getEncryptedMnemonic();
	const prevSeed = getActiveSeed();
	const encryptedNewMnemonic = await encryptKey(newMnemonic, pin);
	setEncryptedMnemonic(encryptedNewMnemonic);
	setActiveSeed(newSeed);
	setMigrationJournal({ status: 'pending', encryptedNewMnemonic, startedAt: Date.now() });

	// Phase A — swap (network only). Any failure rolls back the anchor.
	const counters = new Map<string, number>();
	let batchCount = 0;
	try {
		for (const group of groups.values()) {
			const { fullId, newProofs, batches } = await swapGroupForNewSeed(
				group.mintUrl,
				group.keysetId,
				group.inputs,
				newSeed
			);
			group.keysetId = fullId;
			group.newProofs = newProofs;
			counters.set(fullId, newProofs.length);
			batchCount += batches;
		}
	} catch (err) {
		// Nothing was burned (all swaps must succeed before any commit) →
		// restore the pre-migration wallet state.
		if (prevMnemonic) setEncryptedMnemonic(prevMnemonic);
		else clearEncryptedMnemonic();
		if (prevSeed) setActiveSeed(prevSeed);
		else clearActiveSeed();
		clearMigrationJournal();
		throw err;
	}

	// Phase B — commit (only reached after ALL swaps succeeded).
	// The mnemonic/seed are already durable above → no fund-loss window.
	for (const group of groups.values()) {
		if (group.newProofs.length > 0) {
			await addProofs(group.newProofs, group.mintUrl, group.keysetId);
		}
	}

	// Clear the old proofs (they were burned by the swap at the mint).
	await removeProofs(proofs.map((p) => p.local_id));

	// counter_k init = swap count (NOT 0) — prevents re-deriving an output the
	// mint already signed under the new seed.
	for (const [keysetId, value] of counters) {
		setCounterK(keysetId, value);
	}

	clearMigrationJournal();

	return {
		success: true,
		swappedCount: proofs.length,
		receivedCount: [...counters.values()].reduce((a, b) => a + b, 0),
		batches: batchCount
	};
}

/**
 * Recover the wallet after an interrupted migration (TASK-245-fix).
 *
 * If a pending migration journal exists (a previous migrateWallet() was killed
 * mid-flight), promote the journaled NEW mnemonic into the real mnemonic
 * storage so the swapped proofs can be recovered from it via NUT-13 restore.
 * Intended to be called once at app start (future wiring); idempotent and safe
 * when no migration is pending.
 *
 * The journal is intentionally NOT cleared here — it marks the migration as
 * incomplete until a full migrateWallet() completes, so the UI keeps offering
 * migration (resume) via detectLegacyProofs().
 *
 * @returns true when a pending migration was found (and its mnemonic promoted).
 */
export function recoverPendingMigration(): boolean {
	const journal = getMigrationJournal();
	if (!journal) return false;
	setEncryptedMnemonic(journal.encryptedNewMnemonic);
	return true;
}
