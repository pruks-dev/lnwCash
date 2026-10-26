/**
 * TASK-4301 (INTENT-043): central-pause + real-mint claim helper tests.
 *
 * Covers ONLY the compare-and-set transition helper in ../db (pure
 * IndexedDB, no network, no mint logic). The central poll contract:
 *   pending --(claim win)--> minting --(success)--> confirmed (+notify)
 *                                  \--(lock/fail)--> pending (retry, never failed/float)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
	resetDB,
	deleteDatabase,
	addTransaction,
	getTransactions,
	getTransactionById,
	compareAndSetTransactionStatus
} from '../db';
import type { Transaction } from '../../types';

function makeTx(overrides?: Partial<Transaction>): Transaction {
	return {
		id: overrides?.id ?? `mint-q-${Math.random().toString(36).slice(2, 10)}`,
		type: overrides?.type ?? 'mint',
		amount: overrides?.amount ?? 21,
		mint_url: overrides?.mint_url ?? 'https://mint.example.com',
		timestamp: overrides?.timestamp ?? Date.now(),
		token_hash: overrides?.token_hash ?? null,
		status: overrides?.status ?? 'pending',
		fee: overrides?.fee ?? 0
	};
}

describe('compareAndSetTransactionStatus (TASK-4301 claim)', () => {
	beforeEach(async () => {
		await deleteDatabase();
		resetDB();
	});

	it('winner claims pending → minting', async () => {
		await addTransaction(makeTx({ id: 'mint-q1' }));
		const won = await compareAndSetTransactionStatus('mint-q1', 'pending', 'minting');
		expect(won).toBe(true);
		expect((await getTransactionById('mint-q1'))!.status).toBe('minting');
	});

	it('loser (already claimed) retreats silently — returns false, status untouched', async () => {
		await addTransaction(makeTx({ id: 'mint-q2' }));
		expect(await compareAndSetTransactionStatus('mint-q2', 'pending', 'minting')).toBe(true);
		// Second contender (e.g. Receive tab racing the central poll):
		const lost = await compareAndSetTransactionStatus('mint-q2', 'pending', 'minting');
		expect(lost).toBe(false);
		expect((await getTransactionById('mint-q2'))!.status).toBe('minting');
	});

	it('wrong expected status returns false', async () => {
		await addTransaction(makeTx({ id: 'mint-q3', status: 'confirmed' }));
		const ok = await compareAndSetTransactionStatus('mint-q3', 'pending', 'minting');
		expect(ok).toBe(false);
		expect((await getTransactionById('mint-q3'))!.status).toBe('confirmed');
	});

	it('missing id returns false', async () => {
		await expect(
			compareAndSetTransactionStatus('mint-nope', 'pending', 'minting')
		).resolves.toBe(false);
	});

	it('lock path: minting → pending (retry, never failed)', async () => {
		await addTransaction(makeTx({ id: 'mint-q4' }));
		expect(await compareAndSetTransactionStatus('mint-q4', 'pending', 'minting')).toBe(true);
		expect(await compareAndSetTransactionStatus('mint-q4', 'minting', 'pending')).toBe(true);
		expect((await getTransactionById('mint-q4'))!.status).toBe('pending');
	});

	it('success path: minting → confirmed', async () => {
		await addTransaction(makeTx({ id: 'mint-q5' }));
		expect(await compareAndSetTransactionStatus('mint-q5', 'pending', 'minting')).toBe(true);
		expect(await compareAndSetTransactionStatus('mint-q5', 'minting', 'confirmed')).toBe(true);
		expect((await getTransactionById('mint-q5'))!.status).toBe('confirmed');
	});

	it('claimed tx is invisible to the central pending filter', async () => {
		await addTransaction(makeTx({ id: 'mint-q6' }));
		expect(await compareAndSetTransactionStatus('mint-q6', 'pending', 'minting')).toBe(true);
		const pending = await getTransactions({ status: 'pending' });
		expect(pending.find((t) => t.id === 'mint-q6')).toBeUndefined();
	});
});
