/**
 * IndexedDB storage tests
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
	resetDB,
	deleteDatabase,
	addTransaction,
	getTransactions,
	getTransactionById,
	updateTransaction,
	deleteTransaction,
	clearTransactions,
	getTransactionCount
} from '../db';
import type { Transaction } from '../../types';

function makeTx(overrides?: Partial<Transaction>): Transaction {
	return {
		id: overrides?.id ?? `tx-${Math.random().toString(36).slice(2, 10)}`,
		type: overrides?.type ?? 'mint',
		amount: overrides?.amount ?? 1000,
		mint_url: overrides?.mint_url ?? 'https://mint.example.com',
		timestamp: overrides?.timestamp ?? Date.now(),
		token_hash: overrides?.token_hash ?? null,
		status: overrides?.status ?? 'confirmed',
		fee: overrides?.fee
	};
}

describe('IndexedDB storage', () => {
	beforeEach(async () => {
		await deleteDatabase();
		resetDB();
	});

	it('should add and retrieve a transaction', async () => {
		const tx = makeTx({ id: 'tx-001' });
		await addTransaction(tx);

		const retrieved = await getTransactionById('tx-001');
		expect(retrieved).toBeDefined();
		expect(retrieved!.id).toBe('tx-001');
		expect(retrieved!.type).toBe('mint');
	});

	it('should return undefined for non-existent transaction', async () => {
		const result = await getTransactionById('nonexistent');
		expect(result).toBeUndefined();
	});

	it('should get all transactions', async () => {
		await addTransaction(makeTx({ id: 'tx-1', type: 'mint' }));
		await addTransaction(makeTx({ id: 'tx-2', type: 'melt' }));
		await addTransaction(makeTx({ id: 'tx-3', type: 'transfer' }));

		const all = await getTransactions();
		expect(all).toHaveLength(3);
		// Sorted by timestamp descending
		expect(all[0].timestamp).toBeGreaterThanOrEqual(all[1].timestamp);
	});

	it('should filter transactions by type', async () => {
		await addTransaction(makeTx({ id: 'tx-1', type: 'mint' }));
		await addTransaction(makeTx({ id: 'tx-2', type: 'melt' }));
		await addTransaction(makeTx({ id: 'tx-3', type: 'mint' }));

		const mintTxs = await getTransactions({ type: 'mint' });
		expect(mintTxs).toHaveLength(2);
		expect(mintTxs.every(t => t.type === 'mint')).toBe(true);
	});

	it('should filter transactions by mint_url', async () => {
		const mintA = 'https://mint-a.example.com';
		const mintB = 'https://mint-b.example.com';

		await addTransaction(makeTx({ id: 'tx-1', mint_url: mintA }));
		await addTransaction(makeTx({ id: 'tx-2', mint_url: mintB }));
		await addTransaction(makeTx({ id: 'tx-3', mint_url: mintA }));

		const fromA = await getTransactions({ mint_url: mintA });
		expect(fromA).toHaveLength(2);
		expect(fromA.every(t => t.mint_url === mintA)).toBe(true);
	});

	it('should filter transactions by status', async () => {
		await addTransaction(makeTx({ id: 'tx-1', status: 'confirmed' }));
		await addTransaction(makeTx({ id: 'tx-2', status: 'pending' }));
		await addTransaction(makeTx({ id: 'tx-3', status: 'failed' }));

		const pending = await getTransactions({ status: 'pending' });
		expect(pending).toHaveLength(1);
		expect(pending[0].status).toBe('pending');
	});

	it('should update a transaction', async () => {
		const tx = makeTx({ id: 'tx-update', status: 'pending', fee: 10 });
		await addTransaction(tx);

		await updateTransaction('tx-update', { status: 'confirmed' });

		const retrieved = await getTransactionById('tx-update');
		expect(retrieved!.status).toBe('confirmed');
		// Verify other fields are preserved (partial patch)
		expect(retrieved!.fee).toBe(10);
	});

	it('should no-op when updating non-existent transaction', async () => {
		// Should not throw
		await updateTransaction('nonexistent', { status: 'confirmed' });

		const retrieved = await getTransactionById('nonexistent');
		expect(retrieved).toBeUndefined();
	});

	it('should delete a transaction', async () => {
		await addTransaction(makeTx({ id: 'tx-del' }));
		await deleteTransaction('tx-del');

		const retrieved = await getTransactionById('tx-del');
		expect(retrieved).toBeUndefined();
	});

	it('should clear all transactions', async () => {
		await addTransaction(makeTx());
		await addTransaction(makeTx());
		expect(await getTransactionCount()).toBe(2);

		await clearTransactions();
		expect(await getTransactionCount()).toBe(0);
	});

	it('should return correct transaction count', async () => {
		expect(await getTransactionCount()).toBe(0);
		await addTransaction(makeTx());
		expect(await getTransactionCount()).toBe(1);
		await addTransaction(makeTx());
		expect(await getTransactionCount()).toBe(2);
	});
});
