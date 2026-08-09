/**
 * Tests for pending-tx-resolver.ts — TASK-XXX
 *
 * Covers:
 *  1. Empty list → returns 0
 *  2. Timed-out transactions (>30 min) → auto-failed
 *  3. Mint quote PAID → confirmed
 *  4. Mint quote EXPIRED → skipped (not resolved)
 *  5. Melt quote PAID → confirmed
 *  6. Melt quote PENDING → skipped (not resolved)
 *  7. Network error → leaves as pending
 *  8. No extractable quoteId → skipped
 *  9. Mixed batch: some resolved, some skipped
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────

const mockGetTransactions = vi.fn();
const mockUpdateTransaction = vi.fn().mockResolvedValue(undefined);
const mockCheckMintQuote = vi.fn();
const mockCheckMeltQuote = vi.fn();

vi.mock('../../storage/db', () => ({
	getTransactions: (...args: unknown[]) => mockGetTransactions(...args),
	updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
}));

vi.mock('../../cashu/client', () => ({
	checkMintQuote: (...args: unknown[]) => mockCheckMintQuote(...args),
	checkMeltQuote: (...args: unknown[]) => mockCheckMeltQuote(...args),
}));

import { resolvePendingTransactions } from '../pending-tx-resolver';
import type { Transaction } from '../../../types';

// ── Helpers ───────────────────────────────────────────────────

const MINT_URL = 'https://mint.example.com';
const NOW = Date.now();

function tx(overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type'>): Transaction {
	return {
		amount: 1000,
		mint_url: MINT_URL,
		timestamp: NOW - 60_000, // 1 min ago
		token_hash: null,
		status: 'pending',
		...overrides,
	};
}

// ── Tests ─────────────────────────────────────────────────────

describe('resolvePendingTransactions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── AC-1: empty list ──────────────────────────────────

	it('returns 0 for empty pending list', async () => {
		mockGetTransactions.mockResolvedValue([]);
		const result = await resolvePendingTransactions();
		expect(result).toBe(0);
		expect(mockGetTransactions).toHaveBeenCalledWith({ type: undefined, status: 'pending' });
	});

	// ── AC-2: timeout (>30 min) ───────────────────────────

	it('auto-fails transactions older than 30 minutes', async () => {
		const oldTx = tx({
			id: 'mint-old-quote',
			type: 'mint',
			timestamp: NOW - 31 * 60 * 1000, // 31 min ago
		});
		mockGetTransactions.mockResolvedValue([oldTx]);

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-old-quote', { status: 'failed' });
		expect(mockCheckMintQuote).not.toHaveBeenCalled();
	});

	it('does not check API for timed-out melt transactions', async () => {
		const oldMelt = tx({
			id: 'melt-old-quote',
			type: 'melt',
			timestamp: NOW - 45 * 60 * 1000,
		});
		mockGetTransactions.mockResolvedValue([oldMelt]);

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockUpdateTransaction).toHaveBeenCalledWith('melt-old-quote', { status: 'failed' });
		expect(mockCheckMeltQuote).not.toHaveBeenCalled();
	});

	// ── AC-3: mint quote PAID → confirmed ─────────────────

	it('confirms mint when quote state is PAID', async () => {
		const mintTx = tx({ id: 'mint-abc123', type: 'mint' });
		mockGetTransactions.mockResolvedValue([mintTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'PAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'abc123');
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-abc123', { status: 'confirmed' });
	});

	// ── AC-4: mint quote EXPIRED → skipped ────────────────

	it('skips mint when quote state is EXPIRED', async () => {
		const mintTx = tx({ id: 'mint-exp123', type: 'mint' });
		mockGetTransactions.mockResolvedValue([mintTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'EXPIRED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('skips mint when quote state is ISSUED', async () => {
		const mintTx = tx({ id: 'mint-iss456', type: 'mint' });
		mockGetTransactions.mockResolvedValue([mintTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'ISSUED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('skips mint when quote state is UNPAID', async () => {
		const mintTx = tx({ id: 'mint-unp789', type: 'mint' });
		mockGetTransactions.mockResolvedValue([mintTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'UNPAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	// ── AC-5: melt quote PAID → confirmed ─────────────────

	it('confirms melt when quote state is PAID', async () => {
		const meltTx = tx({ id: 'melt-def456', type: 'melt' });
		mockGetTransactions.mockResolvedValue([meltTx]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'PAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockCheckMeltQuote).toHaveBeenCalledWith(MINT_URL, 'def456');
		expect(mockUpdateTransaction).toHaveBeenCalledWith('melt-def456', { status: 'confirmed' });
	});

	// ── AC-6: melt quote PENDING → skipped ────────────────

	it('skips melt when quote state is PENDING', async () => {
		const meltTx = tx({ id: 'melt-pen789', type: 'melt' });
		mockGetTransactions.mockResolvedValue([meltTx]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'PENDING' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('skips melt when quote state is EXPIRED', async () => {
		const meltTx = tx({ id: 'melt-exp000', type: 'melt' });
		mockGetTransactions.mockResolvedValue([meltTx]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'EXPIRED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	// ── AC-7: network error → leave as pending ────────────

	it('leaves as pending when mint API throws', async () => {
		const mintTx = tx({ id: 'mint-err111', type: 'mint' });
		mockGetTransactions.mockResolvedValue([mintTx]);
		mockCheckMintQuote.mockRejectedValue(new Error('Network down'));

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('leaves as pending when melt API throws', async () => {
		const meltTx = tx({ id: 'melt-err222', type: 'melt' });
		mockGetTransactions.mockResolvedValue([meltTx]);
		mockCheckMeltQuote.mockRejectedValue(new Error('Timeout'));

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	// ── AC-8: no extractable quoteId → skipped ────────────

	it('skips transaction without extractable quoteId', async () => {
		// id has no dash → extractQuoteId returns null
		const badTx = tx({ id: 'noquoteid', type: 'mint' });
		mockGetTransactions.mockResolvedValue([badTx]);

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).not.toHaveBeenCalled();
	});

	// ── AC-9: mixed batch ─────────────────────────────────

	it('resolves only applicable transactions in mixed batch', async () => {
		const oldTx = tx({
			id: 'mint-old',
			type: 'mint',
			timestamp: NOW - 40 * 60 * 1000, // timed out
		});
		const paidTx = tx({ id: 'mint-paid', type: 'mint' });
		const expiredTx = tx({ id: 'mint-expired', type: 'mint' });
		const errorTx = tx({ id: 'melt-error', type: 'melt' });

		mockGetTransactions.mockResolvedValue([oldTx, paidTx, expiredTx, errorTx]);
		mockCheckMintQuote
			.mockResolvedValueOnce({ state: 'PAID' })   // for paidTx (second in list)
			.mockResolvedValueOnce({ state: 'EXPIRED' }); // for expiredTx (third)
		mockCheckMeltQuote.mockRejectedValue(new Error('offline'));

		const result = await resolvePendingTransactions();

		// oldTx → failed (1), paidTx → confirmed (1), expiredTx → skipped, errorTx → skipped
		expect(result).toBe(2);

		// oldTx was auto-failed
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-old', { status: 'failed' });
		// paidTx was confirmed
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-paid', { status: 'confirmed' });
		// expiredTx and errorTx were not updated
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('mint-expired', expect.anything());
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('melt-error', expect.anything());
	});

	// ── Edge: updateTransaction failure does not throw ────

	it('survives updateTransaction rejection (graceful degradation)', async () => {
		const oldTx = tx({
			id: 'mint-robust',
			type: 'mint',
			timestamp: NOW - 40 * 60 * 1000,
		});
		mockGetTransactions.mockResolvedValue([oldTx]);
		mockUpdateTransaction.mockRejectedValueOnce(new Error('DB error'));

		// Should not throw
		const result = await resolvePendingTransactions();
		expect(result).toBe(1); // Still counted as resolved
	});

	// ── Edge: non-mint/melt types skipped ─────────────────

	it('skips transfer-type transactions', async () => {
		const transferTx = tx({ id: 'transfer-abc', type: 'transfer' });
		mockGetTransactions.mockResolvedValue([transferTx]);

		const result = await resolvePendingTransactions();
		expect(result).toBe(0);
		expect(mockCheckMintQuote).not.toHaveBeenCalled();
		expect(mockCheckMeltQuote).not.toHaveBeenCalled();
	});

	it('skips cashu_send transactions', async () => {
		const sendTx = tx({ id: 'cashu_send-abc', type: 'cashu_send' });
		mockGetTransactions.mockResolvedValue([sendTx]);

		const result = await resolvePendingTransactions();
		expect(result).toBe(0);
	});
});
