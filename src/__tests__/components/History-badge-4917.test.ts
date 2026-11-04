/**
 * TASK-4917 (INTENT-049, BLUEPRINT-049 v5 + Commander ORDER rev62 fix-forward).
 *
 * History badge display-only pending-like: transient claim state 'checking'
 * + legacy 'minting' rows render as pending (orange pulse, pending-text) —
 * STORED STATUS NEVER CHANGES here (no verdict logic in this file; the
 * 4916 boot reclaim owns the stored flip). confirmed/failed render unchanged.
 *
 * TransactionDetailSheet: same badge rule + check-payment button appears for
 * mint rows with checking status (mint completion path stays reachable while
 * a claim is in flight).
 *
 * Scope: UI display only — backend 4913/4914/4916 untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import History from '../../screens/History.svelte';
import TransactionDetailSheet from '../../lib/components/TransactionDetailSheet.svelte';
import {
	addTransaction,
	clearTransactions,
	getTransactionById
} from '$lib/storage/db';
import type { Transaction } from '$lib/types';

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

// Confirmed-online subscribers — partial mock: keep every real export,
// capture only callbacks (same pattern as History-badge-1407.test.ts).
const onlineConfirmedCbs: Array<() => void> = [];
vi.mock('$lib/offline-indicator', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/offline-indicator')>();
	return {
		...actual,
		onOnlineConfirmed: (cb: () => void) => {
			onlineConfirmedCbs.push(cb);
			return () => {};
		}
	};
});

// Break the transitive History → DetailSheet → wallet/mint →
// normalizeWiring import (which calls onOnlineConfirmed at module top
// level): same pattern as History-badge-1407.test.ts. Never invoked here
// (no online-confirmed event fires in these tests).
vi.mock('$lib/wallet/normalizeWiring', () => ({
	runFlushDrain: async () => null
}));

function mintTx(id: string, status: string): Transaction {
	return {
		id,
		type: 'mint',
		amount: 100,
		mint_url: 'https://mint.4917.test',
		timestamp: Date.now(),
		token_hash: null,
		// Transient claim states live OUTSIDE TransactionStatus (same cast
		// pattern as boot-reclaim-4916.test.ts) — display reads them as-is.
		status: status as Transaction['status'],
		fee: 0
	};
}

describe('TASK-4917 — History badge pending-like (display-only)', () => {
	beforeEach(async () => {
		onlineConfirmedCbs.length = 0;
		await clearTransactions();
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await clearTransactions();
	});

	it("checking renders as pending (orange pulse indicator + pending-text) — stored status stays 'checking'", async () => {
		await addTransaction(mintTx('mint-4917-check', 'checking'));
		const { container } = render(History);

		await vi.waitFor(() => {
			expect(container.querySelector('.tx-pending-indicator')).not.toBeNull();
		});

		const ind = container.querySelector('.tx-pending-indicator');
		expect(ind?.querySelector('.pending-text')?.textContent).toContain(
			'screen.history.pending_text'
		);
		// No confirmed/failed pill for this row.
		expect(container.querySelector('.tx-status-badge')).toBeNull();
		// Display-only: the stored row is still 'checking' (no verdict flip here).
		expect((await getTransactionById('mint-4917-check'))?.status as string).toBe(
			'checking'
		);
	});

	it("legacy 'minting' renders as pending too — stored status stays 'minting'", async () => {
		await addTransaction(mintTx('mint-4917-legacy', 'minting'));
		const { container } = render(History);

		await vi.waitFor(() => {
			expect(container.querySelector('.tx-pending-indicator')).not.toBeNull();
		});

		const ind = container.querySelector('.tx-pending-indicator');
		expect(ind?.querySelector('.pending-text')?.textContent).toContain(
			'screen.history.pending_text'
		);
		expect(container.querySelector('.tx-status-badge')).toBeNull();
		expect((await getTransactionById('mint-4917-legacy'))?.status as string).toBe(
			'minting'
		);
	});

	it('confirmed unchanged (green pill, no indicator)', async () => {
		await addTransaction(mintTx('mint-4917-conf', 'confirmed'));
		const { container } = render(History);

		await vi.waitFor(() => {
			expect(
				container.querySelector('.tx-status-badge.status-confirmed')
			).not.toBeNull();
		});

		const badge = container.querySelector('.tx-status-badge.status-confirmed');
		expect(badge?.textContent).toContain('screen.history.status_confirmed');
		expect(container.querySelector('.tx-pending-indicator')).toBeNull();
	});

	it('failed unchanged (red pill, no indicator)', async () => {
		await addTransaction(mintTx('mint-4917-fail', 'failed'));
		const { container } = render(History);

		await vi.waitFor(() => {
			expect(
				container.querySelector('.tx-status-badge.status-failed')
			).not.toBeNull();
		});

		const badge = container.querySelector('.tx-status-badge.status-failed');
		expect(badge?.textContent).toContain('screen.history.status_failed');
		expect(container.querySelector('.tx-pending-indicator')).toBeNull();
	});
});

describe('TASK-4917 — TransactionDetailSheet badge + check-payment (display-only)', () => {
	afterEach(() => {
		cleanup();
	});

	it('checking mint shows pending indicator + check-payment button', () => {
		const { container } = render(TransactionDetailSheet, {
			tx: mintTx('mint-4917-sheet-check', 'checking')
		});

		const indicator = container.querySelector('.status-pending-indicator');
		expect(indicator).not.toBeNull();
		expect(indicator?.querySelector('.pending-text')?.textContent).toContain(
			'screen.history.status_pending'
		);
		expect(container.querySelector('.status-badge')).toBeNull();
		// check-payment reachable while a claim is in flight.
		expect(container.querySelector('.check-btn')).not.toBeNull();
	});

	it('pending mint still shows pending indicator + check-payment button (regression)', () => {
		const { container } = render(TransactionDetailSheet, {
			tx: mintTx('mint-4917-sheet-pend', 'pending')
		});

		expect(container.querySelector('.status-pending-indicator')).not.toBeNull();
		expect(container.querySelector('.check-btn')).not.toBeNull();
	});

	it('confirmed melt unchanged (badge, no indicator, no check-payment)', () => {
		const { container } = render(TransactionDetailSheet, {
			tx: {
				...mintTx('melt-4917-conf', 'confirmed'),
				type: 'melt' as const,
				protocol: 'lightning' as const,
				invoice: 'lnbc100n1...'
			}
		});

		const badge = container.querySelector('.status-badge.status-confirmed');
		expect(badge).not.toBeNull();
		expect(container.querySelector('.status-pending-indicator')).toBeNull();
		expect(container.querySelector('.check-btn')).toBeNull();
	});
});
