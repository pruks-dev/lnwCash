/**
 * IndexedDB storage service for transactions.
 * Uses the `idb` library for a modern promise-based API.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Transaction, TransactionFilter } from '../types';

const DB_NAME = 'lnw-cash';
const DB_VERSION = 1;
const STORE_NAME = 'transactions';

let dbPromise: Promise<IDBPDatabase> | null = null;
let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
	if (dbInstance) return dbInstance;
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
					store.createIndex('type', 'type');
					store.createIndex('mint_url', 'mint_url');
					store.createIndex('timestamp', 'timestamp');
					store.createIndex('status', 'status');
				}
			}
		});
	}
	dbInstance = await dbPromise;
	return dbInstance;
}

/**
 * Reset the DB connection (useful for testing)
 */
export function resetDB(): void {
	dbInstance = null;
	dbPromise = null;
}

/**
 * Delete the entire database (for test teardown)
 */
export async function deleteDatabase(): Promise<void> {
	// Close existing connection first
	if (dbInstance) {
		dbInstance.close();
		dbInstance = null;
	}
	dbPromise = null;

	await new Promise<void>((resolve, reject) => {
		const req = indexedDB.deleteDatabase(DB_NAME);
		req.onsuccess = () => resolve();
		req.onerror = () => {
			console.warn('[db] Database deletion error:', req.error);
			resolve(); // Don't fail the test on delete error
		};
		req.onblocked = () => {
			console.warn('[db] Database deletion blocked');
			resolve();
		};
	});
}

/**
 * Add a new transaction
 */
export async function addTransaction(tx: Transaction): Promise<string> {
	const db = await getDB();
	await db.add(STORE_NAME, tx);
	return tx.id;
}

/**
 * Get all transactions, optionally filtered
 */
export async function getTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
	const db = await getDB();
	let txs: Transaction[];

	if (filter?.type) {
		const idx = db.transaction(STORE_NAME, 'readonly').store.index('type');
		txs = await idx.getAll(filter.type);
	} else if (filter?.mint_url) {
		const idx = db.transaction(STORE_NAME, 'readonly').store.index('mint_url');
		txs = await idx.getAll(filter.mint_url);
	} else if (filter?.status) {
		const idx = db.transaction(STORE_NAME, 'readonly').store.index('status');
		txs = await idx.getAll(filter.status);
	} else {
		txs = await db.getAll(STORE_NAME);
	}

	// Additional manual filtering for combined filters
	if (filter) {
		txs = txs.filter(tx => {
			if (filter.type && tx.type !== filter.type) return false;
			if (filter.mint_url && tx.mint_url !== filter.mint_url) return false;
			if (filter.status && tx.status !== filter.status) return false;
			return true;
		});
	}

	// Sort by timestamp descending
	txs.sort((a, b) => b.timestamp - a.timestamp);

	return txs;
}

/**
 * Get a single transaction by ID
 */
export async function getTransactionById(id: string): Promise<Transaction | undefined> {
	const db = await getDB();
	return db.get(STORE_NAME, id);
}

/**
 * Update an existing transaction
 */
export async function updateTransaction(tx: Transaction): Promise<void> {
	const db = await getDB();
	await db.put(STORE_NAME, tx);
}

/**
 * Delete a transaction by ID
 */
export async function deleteTransaction(id: string): Promise<void> {
	const db = await getDB();
	await db.delete(STORE_NAME, id);
}

/**
 * Delete all transactions
 */
export async function clearTransactions(): Promise<void> {
	const db = await getDB();
	await db.clear(STORE_NAME);
}

/**
 * Get transaction count
 */
export async function getTransactionCount(): Promise<number> {
	const db = await getDB();
	return db.count(STORE_NAME);
}
