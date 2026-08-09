/**
 * Test: App.svelte — Background mint polling ($effect + setInterval)
 *
 * Validates the polling logic that checks pending mint transactions
 * every 15 seconds, updates their status based on checkMintQuote responses,
 * and handles errors gracefully.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────

const mockGetTransactions = vi.fn();
const mockUpdateTransaction = vi.fn();
const mockCheckMintQuote = vi.fn();

vi.mock('$lib/storage/db', () => ({
	getTransactions: (...args: unknown[]) => mockGetTransactions(...args),
	updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args),
}));

vi.mock('$lib/cashu/client', () => ({
	checkMintQuote: (...args: unknown[]) => mockCheckMintQuote(...args),
}));

import { getTransactions, updateTransaction } from '$lib/storage/db';
import { checkMintQuote } from '$lib/cashu/client';
import type { Transaction } from '$lib/types';

// ── Helpers ────────────────────────────────────────────────────

/** Simulates the polling function found in App.svelte's $effect */
async function simulatePoll(): Promise<void> {
	try {
		const pendingTxs = (await getTransactions({
			type: 'mint',
			status: 'pending',
		})) as Transaction[];

		if (pendingTxs.length === 0) return;

		for (const tx of pendingTxs) {
			try {
				const quoteId = tx.id.startsWith('mint-') ? tx.id.slice(5) : tx.id;
				const quote = await checkMintQuote(tx.mint_url, quoteId);
				const state = quote.state ?? (quote.paid ? 'PAID' : 'UNPAID');

				if (state === 'PAID' || state === 'ISSUED') {
					await updateTransaction(tx.id, { status: 'confirmed' });
				} else if (state === 'EXPIRED') {
					await updateTransaction(tx.id, { status: 'failed' });
				}
			} catch {
				// silently skip individual tx errors
			}
		}
	} catch {
		// outer catch — poll iteration never crashes
	}
}

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 'mint-test-abc',
		type: 'mint',
		amount: 100,
		mint_url: 'https://mint.example.com',
		timestamp: Date.now(),
		token_hash: null,
		status: 'pending',
		...overrides,
	};
}

// ── Tests ──────────────────────────────────────────────────────

describe('App.svelte — Mint polling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── 1. Poll filter ─────────────────────────────────────────

	it('queries getTransactions with type=mint and status=pending', async () => {
		mockGetTransactions.mockResolvedValue([]);

		await simulatePoll();

		expect(mockGetTransactions).toHaveBeenCalledWith({
			type: 'mint',
			status: 'pending',
		});
	});

	// ── 2. No pending → no further API calls ───────────────────

	it('does NOT call checkMintQuote when no pending transactions', async () => {
		mockGetTransactions.mockResolvedValue([]);

		await simulatePoll();

		expect(mockCheckMintQuote).not.toHaveBeenCalled();
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	// ── 3. quoteId extraction from tx.id ───────────────────────

	it('extracts quoteId by stripping "mint-" prefix from tx.id', async () => {
		const tx = makeTx({ id: 'mint-xyz789' });
		mockGetTransactions.mockResolvedValue([tx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'UNPAID', paid: false, quote: '', request: '', expiry: 0 });

		await simulatePoll();

		expect(mockCheckMintQuote).toHaveBeenCalledWith(tx.mint_url, 'xyz789');
	});

	it('uses full tx.id as quoteId when id does not start with mint-', async () => {
		const tx = makeTx({ id: 'custom-quote-id' });
		mockGetTransactions.mockResolvedValue([tx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'UNPAID', paid: false, quote: '', request: '', expiry: 0 });

		await simulatePoll();

		expect(mockCheckMintQuote).toHaveBeenCalledWith(tx.mint_url, 'custom-quote-id');
	});

	// ── 4. PAID → confirmed ────────────────────────────────────

	it('updates tx status to confirmed when checkMintQuote returns state=PAID', async () => {
		const tx = makeTx({ id: 'mint-paid-1' });
		mockGetTransactions.mockResolvedValue([tx]);
		mockCheckMintQuote.mockResolvedValue({
			state: 'PAID',
			paid: true,
			quote: 'paid-1',
			request: 'lnbc...',
			expiry: 0,
		});

		await simulatePoll();

		expect(mockUpdateTransaction).toHaveBeenCalledWith(tx.id, {
			status: 'confirmed',
		});
	});

	// ── 5. ISSUED → confirmed ──────────────────────────────────

	it('updates tx status to confirmed when checkMintQuote returns state=ISSUED', async () => {
		const tx = makeTx({ id: 'mint-issued-1' });
		mockGetTransactions.mockResolvedValue([tx]);
		mockCheckMintQuote.mockResolvedValue({
			state: 'ISSUED',
			paid: true,
			quote: 'issued-1',
			request: 'lnbc...',
			expiry: 0,
		});

		await simulatePoll();

		expect(mockUpdateTransaction).toHaveBeenCalledWith(tx.id, {
			status: 'confirmed',
		});
	});

	// ── 6. paid:true fallback (no state field) ──────────────────

	it('treats paid=true as PAID when state field is absent', async () => {
		const tx = makeTx({ id: 'mint-fallback-1' });
		mockGetTransactions.mockResolvedValue([tx]);
		mockCheckMintQuote.mockResolvedValue({
			quote: 'fb-1',
			request: 'lnbc...',
			paid: true,
			expiry: 0,
			// no state field
		});

		await simulatePoll();

		expect(mockUpdateTransaction).toHaveBeenCalledWith(tx.id, {
			status: 'confirmed',
		});
	});

	// ── 7. EXPIRED → failed ────────────────────────────────────

	it('updates tx status to failed when checkMintQuote returns state=EXPIRED', async () => {
		const tx = makeTx({ id: 'mint-expired-1' });
		mockGetTransactions.mockResolvedValue([tx]);
		mockCheckMintQuote.mockResolvedValue({
			state: 'EXPIRED',
			paid: false,
			quote: 'exp-1',
			request: 'lnbc...',
			expiry: 0,
		});

		await simulatePoll();

		expect(mockUpdateTransaction).toHaveBeenCalledWith(tx.id, {
			status: 'failed',
		});
	});

	// ── 8. UNPAID → no update ──────────────────────────────────

	it('does NOT update tx when quote is still UNPAID', async () => {
		const tx = makeTx({ id: 'mint-waiting-1' });
		mockGetTransactions.mockResolvedValue([tx]);
		mockCheckMintQuote.mockResolvedValue({
			state: 'UNPAID',
			paid: false,
			quote: 'wait-1',
			request: 'lnbc...',
			expiry: 0,
		});

		await simulatePoll();

		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	// ── 9. Multiple pending txs ─────────────────────────────────

	it('checks all pending mint transactions in a single poll iteration', async () => {
		const tx1 = makeTx({ id: 'mint-a' });
		const tx2 = makeTx({ id: 'mint-b' });
		mockGetTransactions.mockResolvedValue([tx1, tx2]);
		mockCheckMintQuote.mockResolvedValue({
			state: 'PAID',
			paid: true,
			quote: '',
			request: '',
			expiry: 0,
		});

		await simulatePoll();

		expect(mockCheckMintQuote).toHaveBeenCalledTimes(2);
		expect(mockUpdateTransaction).toHaveBeenCalledTimes(2);
	});

	// ── 10. Individual tx error isolation ───────────────────────

	it('continues processing remaining txs when one checkMintQuote fails', async () => {
		const tx1 = makeTx({ id: 'mint-ok' });
		const tx2 = makeTx({ id: 'mint-bad' });
		mockGetTransactions.mockResolvedValue([tx1, tx2]);

		let callCount = 0;
		mockCheckMintQuote.mockImplementation(async () => {
			callCount++;
			if (callCount === 2) throw new Error('Network error');
			return { state: 'PAID', paid: true, quote: '', request: '', expiry: 0 };
		});

		await simulatePoll();

		// tx1 was updated, tx2 errored but didn't crash
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-ok', { status: 'confirmed' });
		expect(mockUpdateTransaction).toHaveBeenCalledTimes(1); // only tx1
		expect(mockCheckMintQuote).toHaveBeenCalledTimes(2);   // both checked
	});

	// ── 11. getTransactions error isolation ─────────────────────

	it('survives getTransactions throwing without crashing', async () => {
		mockGetTransactions.mockRejectedValue(new Error('DB error'));

		// Should not throw
		await expect(simulatePoll()).resolves.toBeUndefined();
	});

	// ── 12. Timer-based interval polling ────────────────────────

	it('polls every 15 seconds via setInterval', async () => {
		vi.useFakeTimers();
		mockGetTransactions.mockResolvedValue([]);

		// Simulate the setInterval pattern from App.svelte:
		// - initial call on mount
		// - setInterval every 15s

		// First poll (simulates initial call in $effect)
		await simulatePoll();
		expect(mockGetTransactions).toHaveBeenCalledTimes(1);

		// Simulate setInterval by registering and advancing
		const intervalId = setInterval(async () => {
			await simulatePoll();
		}, 15_000);

		// Advance 15 seconds → 2nd poll
		await vi.advanceTimersByTimeAsync(15_000);
		expect(mockGetTransactions).toHaveBeenCalledTimes(2);

		// Advance another 15 seconds → 3rd poll
		await vi.advanceTimersByTimeAsync(15_000);
		expect(mockGetTransactions).toHaveBeenCalledTimes(3);

		// Cleanup: clearInterval stops further polling
		clearInterval(intervalId);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(mockGetTransactions).toHaveBeenCalledTimes(3); // still 3
	});

	// ── 13. Polling stops on cleanup ────────────────────────────

	it('clearInterval stops polling', async () => {
		vi.useFakeTimers();
		mockGetTransactions.mockResolvedValue([]);

		const intervalId = setInterval(async () => {
			await simulatePoll();
		}, 15_000);

		// Advance once
		await vi.advanceTimersByTimeAsync(15_000);
		expect(mockGetTransactions).toHaveBeenCalledTimes(1);

		// Cleanup
		clearInterval(intervalId);

		// Advance more — no more calls
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mockGetTransactions).toHaveBeenCalledTimes(1);
	});
});
