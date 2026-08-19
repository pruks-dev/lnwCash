/**
 * TASK-FIX-321: Fee return indicator — '+X sats return' badge UI tests (always-ON).
 *
 * TASK-FIX-321 removed the Settings toggle. Badge is now ALWAYS shown when:
 *   tx.type === 'melt' && fee_return > 0 (actual_fee < fee)
 *
 * Verifies the badge's display gating at the UI layer:
 *   (a) fee_return > 0 + melt + actual_fee < fee         → badge SHOWS
 *   (b) fee_return === 0 (actual_fee == fee)             → NO badge
 *   (c) Non-melt tx (send/receive) + fee_return > 0      → NO badge
 *   (d) No setting required — badge shown by default    → badge SHOWS
 *
 * The helper logic (computeFeeReturn) is unit-tested in
 * src/lib/wallet/__tests__/fee-return.test.ts. These tests verify that the
 * Svelte `{#if}` gate correctly suppresses the badge when any of the
 * preconditions fail.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TransactionDetailSheet from '../TransactionDetailSheet.svelte';

// ─── Mocks ──────────────────────────────────────────────────────

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string, opts?: { values?: Record<string, unknown> }) => string) => void) {
			fn((k: string, opts?: { values?: Record<string, unknown> }) => {
				if (k === 'history.fee_return' && opts?.values) {
					return `+${opts.values.amount} sats return`;
				}
				return k;
			});
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

// TASK-FIX-321: getSettings mock removed — badge no longer reads any setting.

// Mock other deps that TransactionDetailSheet touches to keep this test focused.
vi.mock('$lib/cashu/client', () => ({
	checkMintQuote: vi.fn()
}));

vi.mock('$lib/storage/db', () => ({
	updateTransaction: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: vi.fn()
}));

vi.mock('$lib/wallet/mint', () => ({
	completeMint: vi.fn()
}));

vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([])
}));

// ─── Fixtures ───────────────────────────────────────────────────

function makeMeltTx(opts: {
	actualFee?: number;
	fee?: number;
}): {
	id: string;
	type: 'melt';
	amount: number;
	mint_url: string;
	timestamp: number;
	token_hash: null;
	invoice: string;
	status: 'confirmed';
	protocol: 'lightning';
	fee?: number;
	actual_fee?: number;
} {
	return {
		id: 'melt-test-1',
		type: 'melt' as const,
		amount: 1000,
		mint_url: 'https://mint.example.com',
		timestamp: 1734567890000,
		token_hash: null,
		invoice: 'lnbc1000n1...',
		status: 'confirmed' as const,
		protocol: 'lightning' as const,
		fee: opts.fee,
		actual_fee: opts.actualFee
	};
}

function makeSendTx(opts: {
	actualFee?: number;
	fee?: number;
}): {
	id: string;
	type: 'cashu_send';
	amount: number;
	mint_url: string;
	timestamp: number;
	token_hash: string;
	status: 'confirmed';
	protocol: 'cashu';
	fee?: number;
	actual_fee?: number;
} {
	return {
		id: 'send-test-1',
		type: 'cashu_send' as const,
		amount: 500,
		mint_url: 'https://mint.example.com',
		timestamp: 1734567890000,
		token_hash: 'cashuA...',
		status: 'confirmed' as const,
		protocol: 'cashu' as const,
		fee: opts.fee,
		actual_fee: opts.actualFee
	};
}

// ─── Test suite ─────────────────────────────────────────────────

describe('TASK-FIX-321: fee return indicator badge UI (always ON)', () => {
	afterEach(() => cleanup());

	it('a) melt + fee_return > 0 (actual_fee < fee) → badge shows with correct text', () => {
		const tx = makeMeltTx({ fee: 10, actualFee: 5 }); // fee_return = 5

		const { container } = render(TransactionDetailSheet, { tx });

		const badge = container.querySelector('.badge.badge-success');
		expect(badge).toBeTruthy();
		// text via mocked svelte-i18n: '+{amount} sats return' → '+5 sats return'
		expect(badge?.textContent?.trim()).toBe('+5 sats return');
	});

	it('b) melt + fee_return === 0 (actual_fee == fee) → no badge (legacy tx)', () => {
		const tx = makeMeltTx({ fee: 10, actualFee: 10 }); // fee_return = 0

		const { container } = render(TransactionDetailSheet, { tx });

		const badge = container.querySelector('.badge.badge-success');
		expect(badge).toBeNull();
	});

	it('c) non-melt tx (cashu_send) → no badge even if fee fields present', () => {
		// Sanity: a send tx with fee fields should NOT show fee-return badge
		// (only melt operations can have NUT-08 fee_return).
		const tx = makeSendTx({ fee: 10, actualFee: 5 });

		const { container } = render(TransactionDetailSheet, { tx });

		const badge = container.querySelector('.badge.badge-success');
		expect(badge).toBeNull();
	});

	it('d) badge shown by default — no setting required (always-ON)', () => {
		// TASK-FIX-321: setting removed. Badge always ON when fee_return > 0.
		// This test verifies the same scenario as (a) without any prior setup —
		// there is no "off" state to consider. If the gate regresses to require
		// a setting, this will fail.
		const tx = makeMeltTx({ fee: 20, actualFee: 7 }); // fee_return = 13

		const { container } = render(TransactionDetailSheet, { tx });

		const badge = container.querySelector('.badge.badge-success');
		expect(badge).toBeTruthy();
		expect(badge?.textContent?.trim()).toBe('+13 sats return');
	});
});
