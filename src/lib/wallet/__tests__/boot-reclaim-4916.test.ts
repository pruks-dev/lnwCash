/**
 * TASK-4916 (INTENT-049): boot reclaim — stale transient claims back to pending.
 *
 * A crash/restart between claim and release can leave a tx stuck in the
 * transient claim state ('checking', or legacy 'minting' rows written before
 * the 4916 rename). Such rows are invisible to every pending filter, so the
 * resolver must reclaim them to pending FIRST at boot (migration accepts
 * BOTH names), after which the normal verdict paths / the central 5s poll
 * own them again (PAID mint quotes still get minted for real — resolver
 * never confirms here, TASK-4301).
 *
 * Covers (real IndexedDB via fake-indexeddb, mocked mint client only):
 *   1. stuck 'checking' → pending (+ resolver loop picks it up via checkMintQuote)
 *   2. legacy stuck 'minting' → pending (migration accepts both names)
 *   3. central can claim after reclaim (CAS pending→checking wins once)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCheckMintQuote = vi.fn();
const mockCheckMeltQuote = vi.fn();

vi.mock('../../cashu/client', () => ({
	checkMintQuote: (...args: unknown[]) => mockCheckMintQuote(...args),
	checkMeltQuote: (...args: unknown[]) => mockCheckMeltQuote(...args),
	checkState: vi.fn()
}));

import {
	resetDB,
	deleteDatabase,
	addTransaction,
	getTransactionById,
	getTransactions,
	compareAndSetTransactionStatus
} from '../../storage/db';
import { resolvePendingTransactions } from '../pending-tx-resolver';
import type { Transaction } from '../../types';

const MINT_URL = 'https://mint.example.com';

function stuckMintTx(id: string, stuck: string): Transaction {
	return {
		id,
		type: 'mint',
		amount: 21,
		mint_url: MINT_URL,
		timestamp: Date.now(),
		token_hash: null,
		// Legacy/raw IDB row: pre-4916 rows carry 'minting', post-rename rows
		// carry 'checking' — both live OUTSIDE TransactionStatus (transient only).
		status: stuck as Transaction['status'],
		fee: 0
	};
}

describe('boot reclaim (TASK-4916)', () => {
	beforeEach(async () => {
		await deleteDatabase();
		resetDB();
		vi.clearAllMocks();
		mockCheckMintQuote.mockResolvedValue({ state: 'UNPAID' });
	});

	it("reclaims stuck 'checking' → pending and the resolver loop picks it up", async () => {
		await addTransaction(stuckMintTx('mint-reclaim-check', 'checking'));
		// Sanity: a stuck claim is invisible to the central pending filter.
		expect(await getTransactions({ status: 'pending' })).toHaveLength(0);

		const resolved = await resolvePendingTransactions();

		// UNPAID → stays pending (may still be paid), never failed on boot.
		expect(resolved).toBe(0);
		expect((await getTransactionById('mint-reclaim-check'))!.status).toBe('pending');
		// The reclaimed row re-entered the normal path: quote was re-checked.
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'reclaim-check');
		expect(await getTransactions({ status: 'pending' })).toHaveLength(1);
	});

	it("reclaims legacy stuck 'minting' → pending (migration accepts both names)", async () => {
		await addTransaction(stuckMintTx('mint-reclaim-legacy', 'minting'));
		expect(await getTransactions({ status: 'pending' })).toHaveLength(0);

		const resolved = await resolvePendingTransactions();

		expect(resolved).toBe(0);
		expect((await getTransactionById('mint-reclaim-legacy'))!.status).toBe('pending');
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'reclaim-legacy');
	});

	it('central can claim after reclaim (CAS pending→checking wins exactly once)', async () => {
		await addTransaction(stuckMintTx('mint-reclaim-central', 'checking'));

		await resolvePendingTransactions();
		expect((await getTransactionById('mint-reclaim-central'))!.status).toBe('pending');

		// Central 5s poll claim path: first claimant wins…
		expect(
			await compareAndSetTransactionStatus('mint-reclaim-central', 'pending', 'checking')
		).toBe(true);
		// …loser retreats silently, and the claimed row leaves the pending filter.
		expect(
			await compareAndSetTransactionStatus('mint-reclaim-central', 'pending', 'checking')
		).toBe(false);
		expect(await getTransactions({ status: 'pending' })).toHaveLength(0);
	});
});
