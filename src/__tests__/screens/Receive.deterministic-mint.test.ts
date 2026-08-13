/**
 * Test: Receive.svelte — TASK-217 deterministic mint routing.
 *
 * Verifies that `completeMintAfterPayment()` now delegates output creation to
 * `completeMint()` (mint.ts deterministic NUT-13 path) instead of inline
 * `crypto.getRandomValues` blinded outputs, and that the call is wrapped in
 * `withTransactionGuard()` (F-027-004 mint half).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Receive from '../../screens/Receive.svelte';

const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';
const MINT_URL = 'https://mint.example.com';

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

// ─── Mock router ─────────────────────────────────────────────
vi.mock('$lib/router', () => ({
	navigateTo: vi.fn(),
	getCurrentScreen: () => 'receive',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

// ─── Mock wallet/store ───────────────────────────────────────
vi.mock('$lib/wallet/store', () => ({
	getMintConfig: vi.fn(() => ({ name: 'Test Mint', url: MINT_URL })),
	getActiveMintUrl: () => MINT_URL,
	setActiveMintUrl: vi.fn(),
	activeMintStore: {
		subscribe: vi.fn(() => () => {}),
		set: vi.fn()
	}
}));

// ─── Mock wallet/mint — capture completeMint ─────────────────
const mockCompleteMint = vi.fn();
vi.mock('$lib/wallet/mint', () => ({
	completeMint: (...args: unknown[]) => mockCompleteMint(...args)
}));

// ─── Mock wallet/autolock — capture withTransactionGuard ─────
const mockWithTransactionGuard = vi.fn((fn: () => unknown) => fn());
vi.mock('$lib/wallet/autolock', () => ({
	withTransactionGuard: (fn: () => unknown) => mockWithTransactionGuard(fn)
}));

// ─── Mock wallet/state ───────────────────────────────────────
vi.mock('$lib/wallet/state', () => ({
	getPrivateKey: vi.fn(() => '0xdeadbeef'),
	storeSessionPin: vi.fn(),
	unlockWallet: vi.fn()
}));

// ─── Mock wallet/errors ──────────────────────────────────────
vi.mock('$lib/wallet/errors', () => ({
	WalletLockedError: class WalletLockedError extends Error {
		constructor() {
			super('Wallet is locked — call unlockWallet() first');
			this.name = 'WalletLockedError';
		}
	}
}));

// ─── Mock cashu/client ───────────────────────────────────────
vi.mock('$lib/cashu/client', () => ({
	CashuError: class CashuError extends Error {}
}));

// ─── Mock cashu/keyset ───────────────────────────────────────
const mockFetchAndCacheKeysets = vi.fn();
vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: (...args: unknown[]) => mockFetchAndCacheKeysets(...args)
}));

// ─── Mock storage/db ─────────────────────────────────────────
const mockAddTransaction = vi.fn(async (..._args: unknown[]) => 'tx-id');
const mockUpdateTransaction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('$lib/storage/db', () => ({
	addTransaction: (...a: unknown[]) => mockAddTransaction(...a),
	updateTransaction: (...a: unknown[]) => mockUpdateTransaction(...a)
}));

// ─── Mock wallet/balance ─────────────────────────────────────
vi.mock('$lib/wallet/balance', () => ({
	getBalance: vi.fn(async () => ({
		total: 1,
		byMint: {},
		proofCount: 1,
		lastUpdated: Date.now()
	}))
}));

// ─── Mock wallet/tokenStore ──────────────────────────────────
vi.mock('$lib/wallet/tokenStore', () => ({
	receiveTokens: vi.fn()
}));

// ─── Mock cashu/token ────────────────────────────────────────
vi.mock('$lib/cashu/token', () => ({
	isCashuToken: vi.fn(() => false),
	getTokenAmount: vi.fn(() => 0),
	decodeToken: vi.fn(() => ({ proofs: [], mint: '', memo: '' }))
}));

// ─── Mock stores/scannedQR ───────────────────────────────────
vi.mock('$lib/stores/scannedQR', () => ({
	scannedQRValue: { subscribe: vi.fn(() => () => {}), set: vi.fn() }
}));

// ─── Mock stores/mint-events ─────────────────────────────────
const mockNotifyMintConfirmed = vi.fn();
vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: (...a: unknown[]) => mockNotifyMintConfirmed(...a)
}));

// ─── Mock qrcode (jsdom has no canvas) ───────────────────────
vi.mock('qrcode', () => ({
	default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,AAAA')) }
}));

// ─── fetch mock: POST = quote creation, GET = quote state ────
function installFetchMock() {
	globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
		const method = init?.method ?? 'GET';
		const data = method === 'POST'
			? { quote: 'quote-xyz', request: 'lnbc1...', state: 'UNPAID' }
			: { state: 'PAID' };
		return { ok: true, status: 200, json: async () => data } as Response;
	}) as unknown as typeof fetch;
}

describe('Receive (TASK-217) — deterministic mint routing', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		installFetchMock();
		mockCompleteMint.mockResolvedValue({
			success: true,
			proofs: [{ id: KEYSET_ID, amount: 1, secret: 'secret', C: 'C' }],
			quote: 'quote-xyz',
			amount: 1
		});
		mockFetchAndCacheKeysets.mockResolvedValue([
			{ id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0, keys: { '1': '02' + 'ff'.repeat(32) }, last_updated: Date.now() }
		]);
	});

	afterEach(() => {
		cleanup();
	});

	it('delegates to completeMint() with correct args after quote is PAID', async () => {
		render(Receive, { defaultMintUrl: MINT_URL });

		// Enter amount "1"
		await fireEvent.click(screen.getByRole('button', { name: '1' }));
		// Create invoice → starts polling
		await fireEvent.click(screen.getByText('screen.receive.create_invoice'));

		// Poll fires at ~3s → completeMintAfterPayment → completeMint
		await waitFor(() => expect(mockCompleteMint).toHaveBeenCalled(), { timeout: 8000 });

		expect(mockCompleteMint).toHaveBeenCalledWith(MINT_URL, 'quote-xyz', 1, KEYSET_ID, true);
	});

	it('wraps the mint in withTransactionGuard() (auto-lock suspended)', async () => {
		render(Receive, { defaultMintUrl: MINT_URL });

		await fireEvent.click(screen.getByRole('button', { name: '1' }));
		await fireEvent.click(screen.getByText('screen.receive.create_invoice'));

		await waitFor(() => expect(mockWithTransactionGuard).toHaveBeenCalled(), { timeout: 8000 });
		expect(mockCompleteMint).toHaveBeenCalled();
	});

	it('confirms the pending transaction and fires notifyMintConfirmed on success', async () => {
		render(Receive, { defaultMintUrl: MINT_URL });

		await fireEvent.click(screen.getByRole('button', { name: '1' }));
		await fireEvent.click(screen.getByText('screen.receive.create_invoice'));

		await waitFor(() => expect(mockUpdateTransaction).toHaveBeenCalled(), { timeout: 8000 });
		expect(mockUpdateTransaction).toHaveBeenCalledWith('mint-quote-xyz', { status: 'confirmed' });
		expect(mockNotifyMintConfirmed).toHaveBeenCalledWith(1);
	});

	it('contains no inline crypto.getRandomValues (deterministic path only)', async () => {
		const src = readFileSync(resolve('src/screens/Receive.svelte'), 'utf-8');
		expect(src).not.toContain('crypto.getRandomValues');
		expect(src).toContain('completeMint(');
	});
});
