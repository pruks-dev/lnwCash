/**
 * TASK-4406 (INTENT-044) — RESOLVER-LNBC-EXPIRY, amended by TASK-4407
 * RESOLVER-EXPIRY-CHECK-ONCE (COMMANDER_ORDER fix-forward rev8),
 * SUPERSEDED in the 4 legacy-fallback cases by TASK-4912 (INTENT-049,
 * failed-policy ใหม่ — SUPERSEDED-BY-4911 disposition).
 *
 * Per-invoice LNBC expiry is the fail criterion, BUT an expired invoice is
 * NEVER failed without one final mint check (boss edge: app closed + paid
 * before expiry + reopened after expiry → PAID must be found, not killed):
 *  1. expired-lnbc + mint PAID → pending (check runs, collector owns it)
 *  2. expired-lnbc + mint EXPIRED → failed (proven unpaid — only then)
 *  3. expired-lnbc + network error → pending (never kill on uncertainty)
 *  4. fresh-lnbc + network error (429) → pending (wall-clock old must NOT fail)
 *  5. fresh-lnbc mint PAID → pending for central collector (no confirm here)
 *  6. legacy no-invoice + wall-clock OLD + UNPAID → pending (TASK-4912:
 *     30-min fallback GONE — no invoice read, no wall-clock, mint IS checked)
 *  7. legacy no-invoice melt PAID → confirmed (TASK-4912: verdict from quote
 *     state, no legacy-fallback log)
 *  8. decode-invalid invoice + wall-clock OLD + UNPAID → pending (TASK-4912:
 *     invoice NEVER decoded for a verdict, mint IS checked)
 *  9. decode-invalid invoice + mint-EXPIRED → failed (TASK-4912:
 *     mint-declared proven non-payment, no legacy-fallback log)
 *
 * decodeBolt11 is partially mocked: sentinel invoices return controlled
 * timestamp/expiry; every other input delegates to the REAL decoder
 * (so the V1 spec-vector test below exercises the true offline path).
 * Under TASK-4911 the resolver never consults the decoder for verdicts —
 * the sentinels now only prove the "expired/fresh invoice" premise.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Sentinels ───────────────────────────────────────────────────

const FRESH_INVOICE = 'lnbc-fresh-sentinel-invoice';
const EXPIRED_SENTINEL = 'lnbc-expired-sentinel-invoice';

// Real BOLT-11 spec vector (zero-amount, timestamp 1496314658, default
// expiry 3600 → long expired). Decoded by the REAL decodeBolt11.
const V1 =
	'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w';

// ── Mocks ───────────────────────────────────────────────────────

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

vi.mock('../bolt11', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../bolt11')>();
	return {
		...actual,
		decodeBolt11: (invoice: string) => {
			const nowSec = Math.floor(Date.now() / 1000);
			if (invoice === FRESH_INVOICE) {
				return {
					network: 'mainnet',
					amountSat: 1000,
					paymentHash: 'aa'.repeat(32),
					description: 'fresh sentinel',
					expiry: 3600,
					timestamp: nowSec - 60, // issued 1 min ago → expires in ~59 min
					hrp: 'lnbc10u',
					tags: new Map(),
				};
			}
			if (invoice === EXPIRED_SENTINEL) {
				return {
					network: 'mainnet',
					amountSat: 1000,
					paymentHash: 'bb'.repeat(32),
					description: 'expired sentinel',
					expiry: 60,
					timestamp: nowSec - 3600, // issued 1h ago, 60s expiry → expired
					hrp: 'lnbc10u',
					tags: new Map(),
				};
			}
			return actual.decodeBolt11(invoice);
		},
	};
});

import { resolvePendingTransactions } from '../pending-tx-resolver';
import type { Transaction } from '../../types';

// ── Helpers ─────────────────────────────────────────────────────

const MINT_URL = 'https://mint.example.com';

function tx(overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'type'>): Transaction {
	return {
		amount: 1000,
		mint_url: MINT_URL,
		timestamp: Date.now() - 60_000, // 1 min ago (wall-clock fresh)
		token_hash: null,
		status: 'pending',
		...overrides,
	};
}

// ── Tests ───────────────────────────────────────────────────────

describe('TASK-4406 — per-invoice LNBC expiry', () => {
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	it('expired-lnbc mint + mint-PAID → stays pending (final check finds payment, never killed)', async () => {
		// Wall-clock FRESH (1 min) — old 30-min rule would keep it pending.
		// BOSS EDGE: paid before expiry, app reopened after expiry → the one
		// final check must see PAID and leave it for the central collector.
		const expiredTx = tx({ id: 'mint-expiredpaid', type: 'mint', invoice: EXPIRED_SENTINEL });
		mockGetTransactions.mockResolvedValue([expiredTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'PAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'expiredpaid');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('expired-lnbc mint + mint-EXPIRED → failed (proven unpaid — only then)', async () => {
		const expiredTx = tx({ id: 'mint-expiredunpaid', type: 'mint', invoice: EXPIRED_SENTINEL });
		mockGetTransactions.mockResolvedValue([expiredTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'EXPIRED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'expiredunpaid');
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-expiredunpaid', { status: 'failed' });
	});

	it('expired-lnbc + network error → stays pending (never kill on uncertainty)', async () => {
		const expiredTx = tx({ id: 'mint-expirederr', type: 'mint', invoice: EXPIRED_SENTINEL });
		mockGetTransactions.mockResolvedValue([expiredTx]);
		mockCheckMintQuote.mockRejectedValue(new Error('Network down'));

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'expirederr');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('expired-lnbc melt (REAL bolt11 spec vector V1) + melt-EXPIRED → failed after final check', async () => {
		// End-to-end: real decodeBolt11(V1) → timestamp 1496314658 + 3600s.
		// Expired → one final melt check runs; EXPIRED proves unpaid → fail.
		const expiredTx = tx({ id: 'melt-realexpired', type: 'melt', invoice: V1 });
		mockGetTransactions.mockResolvedValue([expiredTx]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'EXPIRED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockCheckMeltQuote).toHaveBeenCalledWith(MINT_URL, 'realexpired');
		expect(mockUpdateTransaction).toHaveBeenCalledWith('melt-realexpired', { status: 'failed' });
	});

	it('expired-lnbc melt + melt-PAID → confirmed (handling เดิม)', async () => {
		const expiredTx = tx({ id: 'melt-expiredpaid', type: 'melt', invoice: EXPIRED_SENTINEL });
		mockGetTransactions.mockResolvedValue([expiredTx]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'PAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockCheckMeltQuote).toHaveBeenCalledWith(MINT_URL, 'expiredpaid');
		expect(mockUpdateTransaction).toHaveBeenCalledWith('melt-expiredpaid', {
			status: 'confirmed',
		});
	});

	it('fresh-lnbc + network 429 → stays pending (wall-clock OLD tx must NOT fail)', async () => {
		// Wall-clock OLD (2h) — old 30-min rule would auto-fail.
		// Invoice still fresh → must hit network, and on 429 stay pending.
		const freshTx = tx({
			id: 'melt-fresh429',
			type: 'melt',
			timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2h ago
			invoice: FRESH_INVOICE,
		});
		mockGetTransactions.mockResolvedValue([freshTx]);
		const err = new Error('Request failed with status 429');
		mockCheckMeltQuote.mockRejectedValue(err);

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMeltQuote).toHaveBeenCalledWith(MINT_URL, 'fresh429');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('fresh-lnbc mint PAID → stays pending for central collector (no confirm here)', async () => {
		const freshTx = tx({ id: 'mint-freshpaid', type: 'mint', invoice: FRESH_INVOICE });
		mockGetTransactions.mockResolvedValue([freshTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'PAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'freshpaid');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
	});

	it('legacy no-invoice + wall-clock OLD + mint-UNPAID → stays pending (no wall-clock fail, invoice never read — TASK-4912)', async () => {
		// TASK-4912 (SUPERSEDED-BY-4911): the 30-min legacy fallback is gone —
		// no invoice read, no wall-clock in any verdict. A 31-min-old tx with
		// quote UNPAID stays pending and IS checked against the mint.
		const legacyTx = tx({
			id: 'mint-legacyold',
			type: 'mint',
			timestamp: Date.now() - 31 * 60 * 1000, // 31 min ago — irrelevant now
			// no invoice field at all
		});
		mockGetTransactions.mockResolvedValue([legacyTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'UNPAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'legacyold');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('legacy-fallback'));
	});

	it('legacy no-invoice melt PAID → confirmed (verdict from quote state, no legacy-fallback log — TASK-4912)', async () => {
		const legacyTx = tx({ id: 'melt-legacyfresh', type: 'melt' }); // 1 min ago, no invoice
		mockGetTransactions.mockResolvedValue([legacyTx]);
		mockCheckMeltQuote.mockResolvedValue({ state: 'PAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockCheckMeltQuote).toHaveBeenCalledWith(MINT_URL, 'legacyfresh');
		expect(mockUpdateTransaction).toHaveBeenCalledWith('melt-legacyfresh', {
			status: 'confirmed',
		});
		expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('legacy-fallback'));
	});

	it('decode-invalid invoice + wall-clock OLD + mint-UNPAID → stays pending (invoice never decoded — TASK-4912)', async () => {
		// TASK-4912: the invoice is never even decoded for a verdict — a
		// garbage invoice with quote UNPAID stays pending and IS checked.
		const badTx = tx({
			id: 'mint-badinv',
			type: 'mint',
			timestamp: Date.now() - 45 * 60 * 1000, // 45 min ago — irrelevant now
			invoice: 'not-an-invoice', // never decoded under the new policy
		});
		mockGetTransactions.mockResolvedValue([badTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'UNPAID' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(0);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'badinv');
		expect(mockUpdateTransaction).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('legacy-fallback'));
	});

	it('decode-invalid invoice + mint-EXPIRED → failed (mint-declared — TASK-4912)', async () => {
		// TASK-4912: mint-EXPIRED = proven non-payment regardless of invoice
		// content — the invoice is never decoded, the quote decides.
		const badTx = tx({ id: 'mint-badinvfresh', type: 'mint', invoice: 'lnbc1abc' });
		mockGetTransactions.mockResolvedValue([badTx]);
		mockCheckMintQuote.mockResolvedValue({ state: 'EXPIRED' });

		const result = await resolvePendingTransactions();

		expect(result).toBe(1);
		expect(mockCheckMintQuote).toHaveBeenCalledWith(MINT_URL, 'badinvfresh');
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-badinvfresh', { status: 'failed' });
		expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('legacy-fallback'));
	});
});
