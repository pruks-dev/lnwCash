/**
 * Test: TransactionDetailSheet.svelte — TASK-243 MINT-400-LATENT guard.
 *
 * Covers the second call site `checkPayment` which invokes `completeMint(waitForPayment=false)`:
 *   1. Double-submit guard (mintCompleting) — re-entrant clicks must not re-submit.
 *   2. Benign 400 "outputs already signed" (11003) → treat as already-minted → confirmed, no retry loop.
 *   3. Benign 400 "quote already issued" (20002, double-submit) → confirmed.
 *   4. Real error ("outputs mismatch") → NOT confirmed, stays pending.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import TransactionDetailSheet from '../../lib/components/TransactionDetailSheet.svelte';
import type { MintCompleteResult } from '../../lib/wallet/mint';

// ─── Mock svelte-i18n ────────────────────────────────────────
vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: { subscribe(fn: (val: string) => void) { fn('en'); return () => {}; }, set() {} },
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

// ─── Mock cashu/client — capture checkMintQuote ──────────────
const mockCheckMintQuote = vi.fn();
vi.mock('$lib/cashu/client', () => ({
	checkMintQuote: (...args: unknown[]) => mockCheckMintQuote(...args)
}));

// ─── Mock wallet/mint — capture completeMint ─────────────────
const mockCompleteMint = vi.fn();
vi.mock('$lib/wallet/mint', () => ({
	completeMint: (...args: unknown[]) => mockCompleteMint(...args)
}));

// ─── Mock cashu/keyset ───────────────────────────────────────
const mockFetchAndCacheKeysets = vi.fn();
vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: (...args: unknown[]) => mockFetchAndCacheKeysets(...args)
}));

// ─── Mock storage/db ─────────────────────────────────────────
const mockUpdateTransaction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('$lib/storage/db', () => ({
	updateTransaction: (...args: unknown[]) => mockUpdateTransaction(...args)
}));

// ─── Mock stores/mint-events ─────────────────────────────────
const mockNotifyMintConfirmed = vi.fn();
vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: (...args: unknown[]) => mockNotifyMintConfirmed(...args)
}));

const MINT_URL = 'https://mint.example.com';
const ACTIVE_KEYSET = { id: 'keyset-1', unit: 'sat', active: true };

/** A pending Lightning mint tx — shows the "check payment" button. */
const mintPendingTx = {
	id: 'mint-quote-abc',
	type: 'mint' as const,
	amount: 5000,
	mint_url: MINT_URL,
	timestamp: 1734500000000,
	token_hash: null,
	invoice: null,
	status: 'pending' as const,
	protocol: 'lightning' as const,
};

function installPaidQuoteMocks() {
	mockCheckMintQuote.mockResolvedValue({
		quote: 'quote-abc',
		request: 'lnbc1...',
		paid: true,
		expiry: 0,
		state: 'PAID'
	});
	mockFetchAndCacheKeysets.mockResolvedValue([ACTIVE_KEYSET]);
}

describe('TransactionDetailSheet (TASK-243) — mint 400 latent guard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installPaidQuoteMocks();
	});

	afterEach(() => {
		cleanup();
	});

	// ─── 1. Double-submit guard ────────────────────────────

	it('calls completeMint once even when the check button is double-clicked in-flight', async () => {
		let resolveComplete!: (v: MintCompleteResult) => void;
		mockCompleteMint.mockImplementation(
			() => new Promise<MintCompleteResult>((resolve) => { resolveComplete = resolve; })
		);

		const { container } = render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = container.querySelector('.check-btn') as HTMLElement;
		expect(btn).toBeTruthy();

		// First click starts checkPayment (sets checking=true synchronously).
		await fireEvent.click(btn);
		// Second click while the first is still in-flight must be a no-op.
		await fireEvent.click(btn);

		await waitFor(() => expect(mockCheckMintQuote).toHaveBeenCalledTimes(1));

		// Resolve the in-flight mint.
		resolveComplete({ success: true, proofs: [], quote: 'quote-abc', amount: 5000 });

		await waitFor(() => expect(mockCompleteMint).toHaveBeenCalledTimes(1));
		// The re-entrant click must not have triggered a second quote check or mint submit.
		expect(mockCheckMintQuote).toHaveBeenCalledTimes(1);
		expect(mockCompleteMint).toHaveBeenCalledTimes(1);
	});

	it('does not call completeMint when checkPayment is already running (checking guard)', async () => {
		let resolveCheck!: (v: unknown) => void;
		mockCheckMintQuote.mockImplementation(
			() => new Promise((resolve) => { resolveCheck = resolve; })
		);

		const { container } = render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = container.querySelector('.check-btn') as HTMLElement;

		await fireEvent.click(btn); // starts, blocks on checkMintQuote
		await fireEvent.click(btn); // must bail on `checking`

		await waitFor(() => expect(mockCheckMintQuote).toHaveBeenCalledTimes(1));

		resolveCheck({ quote: 'quote-abc', request: 'lnbc1...', paid: true, expiry: 0, state: 'PAID' });
		await waitFor(() => expect(mockCompleteMint).toHaveBeenCalledTimes(1));
	});

	// ─── 2. Benign 400 "outputs already signed" (11003) ────

	it('treats "outputs already signed" (11003) as confirmed — no retry loop', async () => {
		mockCompleteMint.mockResolvedValue({
			success: false,
			proofs: [],
			quote: '',
			amount: 0,
			error: 'HTTP 400: outputs already signed'
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		await waitFor(() =>
			expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' })
		);
		expect(mockNotifyMintConfirmed).toHaveBeenCalledWith(5000);
		// No retry: completeMint submitted exactly once.
		expect(mockCompleteMint).toHaveBeenCalledTimes(1);
	});

	it('treats code 11003 in the error message as confirmed (post-TASK-241 format)', async () => {
		mockCompleteMint.mockResolvedValue({
			success: false,
			proofs: [],
			quote: '',
			amount: 0,
			error: 'HTTP 400 (11003): outputs already signed'
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		await waitFor(() =>
			expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' })
		);
		expect(mockNotifyMintConfirmed).toHaveBeenCalledWith(5000);
		expect(mockCompleteMint).toHaveBeenCalledTimes(1);
	});

	// ─── 3. Benign 400 "quote already issued" (20002) ──────

	it('treats "quote already issued" (20002 double-submit) as confirmed', async () => {
		mockCompleteMint.mockResolvedValue({
			success: false,
			proofs: [],
			quote: '',
			amount: 0,
			error: 'HTTP 400 (20002): quote already issued'
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		await waitFor(() =>
			expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' })
		);
		expect(mockNotifyMintConfirmed).toHaveBeenCalledWith(5000);
		expect(mockCompleteMint).toHaveBeenCalledTimes(1);
	});

	// ─── 4. Real error ("outputs mismatch") ────────────────

	it('does NOT mark confirmed on a real error (outputs mismatch)', async () => {
		mockCompleteMint.mockResolvedValue({
			success: false,
			proofs: [],
			quote: '',
			amount: 0,
			error: 'HTTP 400: outputs mismatch'
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		// Give the async flow a chance to settle, then assert no confirmation.
		await new Promise((r) => setTimeout(r, 0));
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' });
		expect(mockNotifyMintConfirmed).not.toHaveBeenCalled();
	});

	it('does NOT mark confirmed on an unknown 400 error string', async () => {
		mockCompleteMint.mockResolvedValue({
			success: false,
			proofs: [],
			quote: '',
			amount: 0,
			error: 'HTTP 400: something else broke'
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		await new Promise((r) => setTimeout(r, 0));
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' });
		expect(mockNotifyMintConfirmed).not.toHaveBeenCalled();
	});

	it('does NOT mark confirmed on a client-side error that merely quotes "outputs already signed"/11003', async () => {
		// TASK-240 counter-reuse guard throws a client-side Error whose message
		// *mentions* "outputs already signed" and 11003 but is NOT a mint 400.
		mockCompleteMint.mockResolvedValue({
			success: false,
			proofs: [],
			quote: '',
			amount: 0,
			error:
				'NUT-13 counter_k is 0 for keyset keyset-1 but existing proofs are stored in IndexedDB — ' +
				'the counter was likely lost. Restore the wallet before minting ' +
				'to avoid reusing counter 0 ("outputs already signed" / 11003).'
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		await new Promise((r) => setTimeout(r, 0));
		expect(mockUpdateTransaction).not.toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' });
		expect(mockNotifyMintConfirmed).not.toHaveBeenCalled();
	});

	// ─── 5. ISSUED state (already minted) ───────────────────

	it('marks confirmed without calling completeMint when the quote is already ISSUED', async () => {
		mockCheckMintQuote.mockResolvedValue({
			quote: 'quote-abc',
			request: 'lnbc1...',
			paid: true,
			expiry: 0,
			state: 'ISSUED'
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		await waitFor(() =>
			expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' })
		);
		expect(mockNotifyMintConfirmed).toHaveBeenCalledWith(5000);
		// No re-submit: completeMint must NOT be invoked for an already-issued quote.
		expect(mockCompleteMint).not.toHaveBeenCalled();
	});

	// ─── 6. Success path regression ────────────────────────

	it('still marks confirmed on a successful completeMint', async () => {
		mockCompleteMint.mockResolvedValue({
			success: true,
			proofs: [],
			quote: 'quote-abc',
			amount: 5000
		});

		render(TransactionDetailSheet, { tx: mintPendingTx });
		const btn = document.querySelector('.check-btn') as HTMLElement;
		await fireEvent.click(btn);

		await waitFor(() =>
			expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-quote-abc', { status: 'confirmed' })
		);
		expect(mockNotifyMintConfirmed).toHaveBeenCalledWith(5000);
	});
});
