/**
 * IndexedDB storage for Cashu proofs — separate from transactions DB.
 * Each proof is stored with mint_url and keyset info for multi-mint balance tracking.
 *
 * Database: lnw-cash-proofs, object store: proofs
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { TokenProof } from '../types';

// ─── Types ───────────────────────────────────────────────────

export interface StoredProof extends TokenProof {
	/** Primary key: {id}:{secret_truncated} */
	local_id: string;
	mint_url: string;
	keyset_id: string;
	stored_at: number;
	/** Whether the proof is still available (not spent) */
	spent: boolean;
	/**
	 * TASK-101 (F-072): Orphaned flag — true when the proof's keyset_id
	 * does not match any known keyset at any registered mint.
	 * Orphaned proofs are excluded from melt/spend operations and must be
	 * manually reviewed or deleted.
	 */
	orphaned?: boolean;
}

// ─── DB Setup ────────────────────────────────────────────────

const DB_NAME = 'lnw-cash-proofs';
const DB_VERSION = 1;
const STORE_NAME = 'proofs';

let dbPromise: Promise<IDBPDatabase> | null = null;
let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
	if (dbInstance) return dbInstance;
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: 'local_id' });
					store.createIndex('mint_url', 'mint_url');
					store.createIndex('keyset_id', 'keyset_id');
					store.createIndex('spent', 'spent');
					store.createIndex('stored_at', 'stored_at');
					store.createIndex('amount', 'amount');
				}
			}
		});
	}
	dbInstance = await dbPromise;
	return dbInstance;
}

// ─── Reset / Delete ──────────────────────────────────────────

export function resetProofDB(): void {
	dbInstance = null;
	dbPromise = null;
}

export async function deleteProofDB(): Promise<void> {
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
	dbPromise = null;

	try {
		const { deleteDB } = await import('idb');
		await deleteDB(DB_NAME);
	} catch {
		// Silently handle cleanup errors in test environments
	}
}

// ─── Generate local_id ───────────────────────────────────────

function makeLocalId(proof: TokenProof): string {
	// Use a hash approach to avoid collisions from truncated secrets
	// Combine proof id + first 8 and last 8 chars of secret for uniqueness
	const secretStart = proof.secret.substring(0, 8);
	const secretEnd = proof.secret.length > 8 ? proof.secret.substring(proof.secret.length - 8) : secretStart;
	return `${proof.id}:${secretStart}:${secretEnd}`;
}

// ─── CRUD Operations ─────────────────────────────────────────

export async function addProofs(
	newProofs: TokenProof[],
	mintUrl: string,
	keysetId: string
): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');

	for (const proof of newProofs) {
		const stored: StoredProof = {
			...proof,
			local_id: makeLocalId(proof),
			mint_url: mintUrl,
			keyset_id: keysetId,
			stored_at: Date.now(),
			spent: false
		};
		await tx.store.put(stored);
	}

	await tx.done;
}

export async function getAllProofs(): Promise<StoredProof[]> {
	const db = await getDB();
	return db.getAll(STORE_NAME);
}

export async function getUnspentProofs(): Promise<StoredProof[]> {
	const db = await getDB();
	const all = await db.getAll(STORE_NAME);
	return all.filter(p => !p.spent && !p.orphaned);
}

export async function getProofsByMint(mintUrl: string): Promise<StoredProof[]> {
	const db = await getDB();
	const idx = db.transaction(STORE_NAME, 'readonly').store.index('mint_url');
	return idx.getAll(mintUrl);
}

export async function getUnspentProofsByMint(mintUrl: string): Promise<StoredProof[]> {
	const proofs = await getProofsByMint(mintUrl);
	return proofs.filter(p => !p.spent && !p.orphaned);
}

export async function getProofById(localId: string): Promise<StoredProof | undefined> {
	const db = await getDB();
	return db.get(STORE_NAME, localId);
}

export async function removeProofs(localIds: string[]): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	for (const id of localIds) {
		await tx.store.delete(id);
	}
	await tx.done;
}

/**
 * Mark proofs as spent (instead of deleting, for audit trail).
 */
export async function markSpent(localIds: string[]): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');

	for (const id of localIds) {
		const proof = await tx.store.get(id);
		if (proof) {
			proof.spent = true;
			await tx.store.put(proof);
		}
	}

	await tx.done;
}

export async function clearProofs(): Promise<void> {
	const db = await getDB();
	await db.clear(STORE_NAME);
}

export async function getProofCount(): Promise<number> {
	const db = await getDB();
	return db.count(STORE_NAME);
}

/**
 * Get total balance across all stored proofs.
 * Only counts unspent, non-orphaned proofs.
 */
export async function getTotalBalance(): Promise<number> {
	const unspent = await getUnspentProofs();
	return unspent.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Get balance breakdown by mint.
 */
export async function getBalanceByMint(): Promise<Record<string, number>> {
	const unspent = await getUnspentProofs();
	const breakdown: Record<string, number> = {};

	for (const p of unspent) {
		breakdown[p.mint_url] = (breakdown[p.mint_url] ?? 0) + p.amount;
	}

	return breakdown;
}

// ─── TASK-101 (F-072): Proof Re-tagging ───────────────────────

/**
 * Information about a known mint for proof re-tagging.
 * Used to cross-check proofs' keyset_id against registered mints.
 */
export interface KnownMintInfo {
	/** Normalized mint URL (no trailing slash) */
	url: string;
	/** All known keyset IDs for this mint (active + inactive) */
	keysetIds: string[];
}

/**
 * Re-tagging result — counts of what happened during re-tagging.
 */
export interface RetaggingResult {
	/** Proofs that were already correctly tagged */
	unchanged: number;
	/** Proofs re-tagged (mint_url updated) to correct mint */
	retagged: number;
	/** Proofs flagged as orphaned (keyset doesn't match any known mint) */
	orphaned: number;
	/** Total proofs scanned */
	total: number;
}

/**
 * TASK-101 (F-072): Update a proof's mint_url field.
 *
 * Used during proof re-tagging when a proof's keyset_id matches a different
 * mint than its stored mint_url — re-tags the proof so it appears under
 * the correct mint's unspent balance.
 */
export async function updateProofMintUrl(
	localId: string,
	newMintUrl: string
): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const stored = await tx.store.get(localId);
	if (stored) {
		stored.mint_url = newMintUrl;
		await tx.store.put(stored);
	}
	await tx.done;
}

/**
 * TASK-101 (F-072): Mark a proof as orphaned (keyset doesn't match any known mint).
 *
 * Orphaned proofs are excluded from melt/spend operations.
 * They remain in the database for manual review rather than being deleted.
 */
export async function markOrphaned(localId: string): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const stored = await tx.store.get(localId);
	if (stored) {
		stored.orphaned = true;
		await tx.store.put(stored);
	}
	await tx.done;
}

/**
 * TASK-101 (F-072): Scan all proofs and re-tag based on known mint keysets.
 *
 * For each proof in the database:
 *  1. Look up its keyset_id against all known mints' keysets
 *  2. If keyset matches a different mint than stored mint_url → re-tag (update mint_url)
 *  3. If keyset doesn't match ANY known mint → flag as orphaned
 *  4. If keyset matches the stored mint_url → leave unchanged
 *
 * Call this once on app load (in App.svelte onMount) to clean up proofs
 * that were stored with incorrect mint_url due to mint URL changes or
 * copy-paste errors.
 *
 * @param knownMints - Array of registered mints with their known keyset IDs
 * @param dryRun - If true, only reports what would change without applying changes
 * @returns RetaggingResult with counts
 */
export async function retagProofs(
	knownMints: KnownMintInfo[],
	dryRun: boolean = false
): Promise<RetaggingResult> {
	const result: RetaggingResult = {
		unchanged: 0,
		retagged: 0,
		orphaned: 0,
		total: 0
	};

	// Build lookup: keyset_id → mint_url
	const keysetToMint = new Map<string, string>();
	for (const mint of knownMints) {
		for (const ksId of mint.keysetIds) {
			// If a keyset appears in multiple mints, skip — ambiguous
			if (keysetToMint.has(ksId)) {
				keysetToMint.set(ksId, '__AMBIGUOUS__');
			} else {
				keysetToMint.set(ksId, mint.url);
			}
		}
	}

	const db = await getDB();
	const allProofs = await db.getAll(STORE_NAME);
	result.total = allProofs.length;

	for (const proof of allProofs) {
		// Skip already-spent proofs
		if (proof.spent) {
			result.unchanged++;
			continue;
		}

		const matchedMint = keysetToMint.get(proof.keyset_id);

		if (!matchedMint) {
			// Keyset not found in any known mint → orphaned
			result.orphaned++;
			if (!dryRun) {
				await markOrphaned(proof.local_id);
				console.warn(
					`[proofsDb] F-072: Orphaned proof ${proof.local_id} — ` +
					`keyset ${proof.keyset_id} not found in any known mint.`
				);
			}
		} else if (matchedMint === '__AMBIGUOUS__') {
			// Keyset appears in multiple mints — can't determine owner
			result.orphaned++;
			if (!dryRun) {
				await markOrphaned(proof.local_id);
				console.warn(
					`[proofsDb] F-072: Ambiguous proof ${proof.local_id} — ` +
					`keyset ${proof.keyset_id} found in multiple mints. Flagged as orphaned.`
				);
			}
		} else if (matchedMint !== proof.mint_url) {
			// Keyset matches a different mint → re-tag
			result.retagged++;
			if (!dryRun) {
				await updateProofMintUrl(proof.local_id, matchedMint);
				console.info(
					`[proofsDb] F-072: Re-tagged proof ${proof.local_id}: ` +
					`${proof.mint_url} → ${matchedMint} (keyset match)`
				);
			}
		} else {
			// Already correct
			result.unchanged++;
		}
	}

	return result;
}

/**
 * TASK-101 (F-072): Get all orphaned proofs (for UI display/manual review).
 */
export async function getOrphanedProofs(): Promise<StoredProof[]> {
	const db = await getDB();
	const all = await db.getAll(STORE_NAME);
	return all.filter(p => p.orphaned === true && !p.spent);
}

/**
 * TASK-101 (F-072): Remove the orphaned flag from a proof (un-orphan).
 * Used when user confirms a proof is valid or when keyset is later discovered.
 */
export async function clearOrphaned(localId: string): Promise<void> {
	const db = await getDB();
	const tx = db.transaction(STORE_NAME, 'readwrite');
	const stored = await tx.store.get(localId);
	if (stored) {
		stored.orphaned = false;
		await tx.store.put(stored);
	}
	await tx.done;
}

/**
 * TASK-101 (F-072): Check if re-tagging is needed (any proofs with mismatch exist).
 * Quick check before running full re-tagging — returns true if re-tagging needed.
 */
export async function needsRetagging(knownMints: KnownMintInfo[]): Promise<boolean> {
	const dryRunResult = await retagProofs(knownMints, true);
	return dryRunResult.retagged > 0 || dryRunResult.orphaned > 0;
}
