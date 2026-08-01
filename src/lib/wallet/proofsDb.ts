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
	return all.filter(p => !p.spent);
}

export async function getProofsByMint(mintUrl: string): Promise<StoredProof[]> {
	const db = await getDB();
	const idx = db.transaction(STORE_NAME, 'readonly').store.index('mint_url');
	return idx.getAll(mintUrl);
}

export async function getUnspentProofsByMint(mintUrl: string): Promise<StoredProof[]> {
	const proofs = await getProofsByMint(mintUrl);
	return proofs.filter(p => !p.spent);
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
 * Only counts unspent proofs.
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
