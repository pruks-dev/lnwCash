/**
 * Tests for pending-tx-resolver.ts — TASK-XXX, rewritten by TASK-4912
 * (INTENT-049, SUPERSEDED-BY-4911 disposition).
 *
 * Policy is Unpaid-driven (TASK-4911): wall-clock age and invoice expiry
 * play NO role in any verdict — failed ⟺ proven non-payment via mint
 * quote states (+ checkState for melt-UNPAID). Covers:
 *  1. Empty list → returns 0
 *  2. Wall-clock-old mint + UNPAID → pending (no time-based fail)
 *  3. Wall-clock-old melt + PENDING → pending (checked, not failed)
 *  4. Mint quote PAID → pending (central collector owns it)
 *  5. Mint quote EXPIRED (mint-declared) → failed
 *  6. Melt quote PAID → confirmed
 *  7. Melt quote PENDING → skipped (not resolved)
 *  8. Melt quote EXPIRED (mint-declared) → failed
 *  9. Network error → leaves as pending
 *  10. No extractable quoteId → skipped
 *  11. Mixed batch: some resolved, some skipped
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
import type { Transaction } from '../../types';

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

	// ── AC-2: wall-clock age is NOT a verdict (TASK-4912) ──

	it('leaves wall-clock-old mint pending on UNPAID (no time-based fail — TASK-4912)', async () => {
		// TASK-4912 (SUPERSEDED-BY-4911): wall-clock age NEVER fails —
		// verdicts come from mint quote states only. A 31-min-old mint tx
		// with quote UNPAID stays pending (may still be paid).
		const oldTx = tx({
			id: 'mint-old-quote',
			type: 'mint',
			timestamp: NOW - 31 * 60 * 1000, // 31 min ago — irrelevant now
		});
		mockGetTransactions.mockResolvedValue([oldTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'UNPAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'old-quote');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('checks API for wall-clock-old melt and leaves PENDING pending (no time-based fail — TASK-4912)', async () => {
		// TASK-4912: expired+PENDING → pending. The 45-min age changes
		// nothing; the PENDING quote keeps it pending.
		const oldMelt = tx({
			id: 'melt-old-quote',
			type: 'melt',
			timestamp: NOW - 45 * 60 * 1000,
		});
		mockGetTransactions.mockResolvedValue([oldMelt]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'PENDING' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMeltQuote).toHaveBeenCalledWith(MINT_URL, 'old-quote');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	// ── AC-3: mint quote PAID → confirmed ─────────────────

	it('skips mint when quote state is PAID (owned by central poll collector)', async () => {
		// TASK-4301 (INTENT-043): mint PAID → continue/skip (leave pending).
		// The central 5s poll in App.svelte owns PAID mint quotes and mints
		// them for real via completeMint — resolver must NOT confirm here.
		// Precedent: DEV-1303-1.
		const mintTx = tx({ id: 'mint-abc123', type: 'mint' });
		mockGetTransactions.mockResolvedValue([mintTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'PAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'abc123');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	// ── AC-4: mint quote EXPIRED (mint-declared) → failed ─

	it('fails mint when quote state is EXPIRED (mint-declared — TASK-4912)', async () => {
		// TASK-4912 (SUPERSEDED-BY-4911): mint-EXPIRED = the mint guarantees
		// this quote can never be paid → proven non-payment → failed.
		const mintTx = tx({ id: 'mint-exp123', type: 'mint' });
		mockGetTransactions.mockResolvedValue([mintTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'EXPIRED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-exp123', { status: 'failed' });
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

	it('fails melt when quote state is EXPIRED (mint-declared — TASK-4912)', async () => {
		// TASK-4912 (SUPERSEDED-BY-4911): melt-EXPIRED = mint-declared
		// terminal non-payment → failed NOW (no proofIds bound here, so the
		// reservation release is a no-op).
		const meltTx = tx({ id: 'melt-exp000', type: 'melt' });
		mockGetTransactions.mockResolvedValue([meltTx]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'EXPIRED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockUpdateTransaction).toHaveBeenCalledWith('melt-exp000', { status: 'failed' });
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

	it('resolves only applicable transactions in mixed batch (Unpaid-driven — TASK-4912)', async () => {
		const oldTx = tx({
			id: 'mint-old',
			type: 'mint',
			timestamp: NOW - 40 * 60 * 1000, // wall-clock old — no longer fails
		});
		const paidTx = tx({ id: 'mint-paid', type: 'mint' });
		const expiredTx = tx({ id: 'mint-expired', type: 'mint' });
		const errorTx = tx({ id: 'melt-error', type: 'melt' });

		mockGetTransactions.mockResolvedValue([oldTx, paidTx, expiredTx, errorTx]);
		mockCheckMintQuote
			.mockResolvedValueOnce({ state: 'UNPAID' })   // oldTx: old but payable → pending
			.mockResolvedValueOnce({ state: 'PAID' })     // paidTx: central collector owns → pending
			.mockResolvedValueOnce({ state: 'EXPIRED' }); // expiredTx: mint-declared dead → failed
		mockCheckMeltQuote.mockRejectedValue(new Error('offline'));

		const result = await resolvePendingTransactions();

		// Only expiredTx resolves (1): oldTx → pending (no time-based fail),
		// paidTx → pending for the collector (TASK-4301), errorTx → pending.
		expect(result).toBe(1);

		// expiredTx was failed (mint-declared proven non-payment)
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-expired', { status: 'failed' });
		// oldTx was checked against the mint, not failed on age
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'old');
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('mint-old', expect.anything());
		// paidTx was left pending for the collector (TASK-4301 continue/skip)
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('mint-paid', expect.anything());
		// errorTx was not updated
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('melt-error', expect.anything());
	});

	// ── Edge: updateTransaction failure does not throw ────

	it('survives updateTransaction rejection on the fail path (graceful degradation — TASK-4912)', async () => {
		// TASK-4912: the fail path is now mint-declared (EXPIRED), not the
		// wall-clock — the DB rejection still must not throw and still counts.
		const doomedTx = tx({
			id: 'mint-robust',
			type: 'mint',
			timestamp: NOW - 40 * 60 * 1000,
		});
		mockGetTransactions.mockResolvedValue([doomedTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'EXPIRED' });
		mockUpdateTransaction.mockRejectedValueOnce(new Error('DB error'));

		// Should not throw
		const result = await resolvePendingTransactions();
		expect(result).toBe(1); // Still counted as resolved
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-robust', { status: 'failed' });
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
