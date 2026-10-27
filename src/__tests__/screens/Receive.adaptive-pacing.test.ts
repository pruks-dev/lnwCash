/**
 * TASK-4401 (INTENT-044 BLUEPRINT-044 v3) RECEIVE-ADAPTIVE-PACING — unit tests.
 *
 * Covers the pure pacing helpers exported from Receive.svelte module scope:
 *   1. backoff-sequence  — 3s → x2 exponential, capped at 30s
 *   2. Retry-After-honor — server delay honored as floor (clamped to cap),
 *      jitter never drops below it
 *   3. reset — success path returns to the 3s base
 * plus wiring assertions (429 branch, adaptive chain, 60-cap intact,
 * completeMintAfterPayment untouched by pacing) and one behavioral test:
 * a 429 mid-poll does not kill polling; later PAID still mints.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Receive, {
	RECEIVE_POLL_BASE_MS,
	RECEIVE_POLL_MAX_MS,
	applyPollJitter,
	nextRateLimitDelay,
	resetPollDelay
} from '../../screens/Receive.svelte';

const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';

// Deterministic rand: 0.5 → jitter factor exactly 1.0 (no-op).
const NO_JITTER = 0.5;

// ─── Mocks (same surface as Receive.deterministic-mint.test.ts) ───
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
		init() {},
		register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn(),
	getCurrentScreen: () => 'receive',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

vi.mock('$lib/wallet/store', () => ({
	getMintConfig: vi.fn(() => ({ name: 'Test Mint', url: MINT_URL })),
	getActiveMintUrl: () => MINT_URL,
	setActiveMintUrl: vi.fn(),
	activeMintStore: { subscribe: vi.fn(() => () => {}), set: vi.fn() }
}));

const mockCompleteMint = vi.fn();
vi.mock('$lib/wallet/mint', () => ({
	completeMint: (...args: unknown[]) => mockCompleteMint(...args)
}));

vi.mock('$lib/wallet/autolock', () => ({
	withTransactionGuard: (fn: () => unknown) => (fn() as unknown)
}));

vi.mock('$lib/wallet/state', () => ({
	getPrivateKey: vi.fn(() => '0xdeadbeef'),
	storeSessionPin: vi.fn(),
	unlockWallet: vi.fn()
}));

vi.mock('$lib/wallet/errors', () => ({
	WalletLockedError: class WalletLockedError extends Error {
		constructor() {
			super('Wallet is locked — call unlockWallet() first');
			this.name = 'WalletLockedError';
		}
	}
}));

const mockFetchAndCacheKeysets = vi.fn();
vi.mock('$lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: (...args: unknown[]) => mockFetchAndCacheKeysets(...args)
}));

const mockAddTransaction = vi.fn(async (..._args: unknown[]) => 'tx-id');
const mockUpdateTransaction = vi.fn(async (..._args: unknown[]) => {});
const mockGetTransactionById = vi.fn(async (..._args: unknown[]) => null);
vi.mock('$lib/storage/db', () => ({
	addTransaction: (...a: unknown[]) => mockAddTransaction(...a),
	getTransactionById: (...a: unknown[]) => mockGetTransactionById(...a),
	updateTransaction: (...a: unknown[]) => mockUpdateTransaction(...a)
}));

vi.mock('$lib/wallet/balance', () => ({
	getBalance: vi.fn(async () => ({ total: 1, byMint: {}, proofCount: 1, lastUpdated: Date.now() }))
}));

vi.mock('$lib/wallet/tokenStore', () => ({
	receiveTokens: vi.fn()
}));

vi.mock('$lib/cashu/token', () => ({
	isCashuToken: vi.fn(() => false),
	getTokenAmount: vi.fn(() => 0),
	decodeToken: vi.fn(() => ({ proofs: [], mint: '', memo: '' }))
}));

vi.mock('$lib/stores/scannedQR', () => ({
	scannedQRValue: { subscribe: vi.fn(() => () => {}), set: vi.fn() }
}));

vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: vi.fn()
}));

vi.mock('qrcode', () => ({
	default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,AAAA')) }
}));

// NOTE: $lib/cashu/client is intentionally NOT mocked here — the pacing
// wrapper must pair with the real TASK-4400 RateLimitedError/parseRetryAfterMs.

describe('Receive adaptive pacing (TASK-4401) — pure helpers', () => {
	it('exposes base 3000ms and 30s cap constants', () => {
		expect(RECEIVE_POLL_BASE_MS).toBe(3000);
		expect(RECEIVE_POLL_MAX_MS).toBe(30_000);
	});

	it('backoff-sequence: 3s → x2 exponential → cap 30s', () => {
		let d = RECEIVE_POLL_BASE_MS;
		const seq: number[] = [];
		for (let i = 0; i < 6; i++) {
			d = nextRateLimitDelay(d, undefined, NO_JITTER);
			seq.push(d);
		}
		expect(seq).toEqual([6000, 12_000, 24_000, 30_000, 30_000, 30_000]);
	});

	it('backoff stays capped at 30s even from a large current delay', () => {
		expect(nextRateLimitDelay(60_000, undefined, NO_JITTER)).toBe(30_000);
		expect(nextRateLimitDelay(30_000, undefined, 0.99)).toBeLessThanOrEqual(30_000);
	});

	it('Retry-After-honor: server delay wins as floor when above grown backoff', () => {
		// grown = 3s*2 = 6s; Retry-After 10s → floor 10s → 10s (no jitter at 0.5).
		expect(nextRateLimitDelay(3000, 10_000, NO_JITTER)).toBe(10_000);
	});

	it('Retry-After-honor: grown backoff wins when above the server delay', () => {
		// grown = 12s*2 = 24s; Retry-After 2s → 24s.
		expect(nextRateLimitDelay(12_000, 2000, NO_JITTER)).toBe(24_000);
	});

	it('Retry-After-honor: server delay clamped to the 30s cap', () => {
		expect(nextRateLimitDelay(3000, 120_000, NO_JITTER)).toBe(30_000);
	});

	it('Retry-After-honor: jitter never drops below the honored floor', () => {
		// rand = 0 → jitter factor 0.8 would give 8s; floor 10s must hold.
		expect(nextRateLimitDelay(3000, 10_000, 0)).toBe(10_000);
	});

	it('jitter stays within ±20% of target without Retry-After', () => {
		// target = 6000 → band [4800, 7200].
		expect(applyPollJitter(6000, 0)).toBe(4800);
		expect(applyPollJitter(6000, 1)).toBeCloseTo(7200, 9);
		expect(nextRateLimitDelay(3000, undefined, 0)).toBe(4800);
		expect(nextRateLimitDelay(3000, undefined, 1)).toBeCloseTo(7200, 9);
	});

	it('reset: success path returns pacing to the 3s base', () => {
		expect(resetPollDelay()).toBe(3000);
		expect(resetPollDelay()).toBe(RECEIVE_POLL_BASE_MS);
	});
});

describe('Receive adaptive pacing (TASK-4401) — wiring', () => {
	it('poll zone wires RateLimitedError + Retry-After + adaptive chain + 60-cap', () => {
		const src = readFileSync(resolve('src/screens/Receive.svelte'), 'utf-8');
		// wrapper 429-branch
		expect(src).toContain('res.status === 429');
		expect(src).toContain('parseRetryAfterMs');
		expect(src).toContain("res.headers?.get?.('Retry-After')");
		expect(src).toContain('new RateLimitedError(');
		// adaptive chain (no fixed 3s setInterval anymore)
		expect(src).toContain('nextRateLimitDelay');
		expect(src).toContain('resetPollDelay');
		expect(src).toContain('setTimeout(tick, pollBackoffMs)');
		expect(src).not.toContain('setInterval(');
		expect(src).not.toContain('setInterval(async');
		expect(src).toContain('rateLimitHits');
		// 60-cap + PAID/EXPIRED/timeout + flag paths intact
		expect(src).toContain('pollCount >= 60');
		expect(src).toContain("state === 'PAID'");
		expect(src).toContain("state === 'EXPIRED'");
		expect(src).toContain('error_payment_timeout');
		expect(src).toContain('receiveInvoiceOpen.set(false)');
	});

	it('completeMintAfterPayment is untouched by pacing (no pacing identifiers inside)', () => {
		const src = readFileSync(resolve('src/screens/Receive.svelte'), 'utf-8');
		const start = src.indexOf('async function completeMintAfterPayment');
		const end = src.indexOf('function animateBalance', start);
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const body = src.slice(start, end);
		expect(body).not.toContain('pollBackoffMs');
		expect(body).not.toContain('nextRateLimitDelay');
		expect(body).not.toContain('RateLimited');
		expect(body).not.toContain('jitter');
		// mint delegation itself intact
		expect(body).toContain('completeMint(');
		expect(body).toContain('withTransactionGuard(');
	});
});

describe('Receive adaptive pacing (TASK-4401) — behavior', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		mockCompleteMint.mockResolvedValue({
			success: true,
			proofs: [{ id: KEYSET_ID, amount: 1, secret: 'secret', C: 'C' }],
			quote: 'quote-xyz',
			amount: 1
		});
		mockFetchAndCacheKeysets.mockResolvedValue([
			{
				id: KEYSET_ID,
				unit: 'sat',
				active: true,
				input_fee_ppk: 0,
				keys: { '1': '02' + 'ff'.repeat(32) },
				last_updated: Date.now()
			}
		]);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('a 429 mid-poll does not kill polling; later PAID still completes the mint', async () => {
		// POST (quote creation) → UNPAID quote; GET polls: 429 once, then PAID.
		let getCalls = 0;
		const realHeaders = (v: string | null) => ({ get: (_k: string) => v });
		globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
			const method = init?.method ?? 'GET';
			if (method === 'POST') {
				return {
					ok: true,
					status: 200,
					headers: realHeaders(null),
					json: async () => ({ quote: 'quote-xyz', request: 'lnbc1...', state: 'UNPAID' })
				} as unknown as Response;
			}
			getCalls++;
			if (getCalls === 1) {
				return {
					ok: false,
					status: 429,
					headers: realHeaders('1'),
					json: async () => ({})
				} as unknown as Response;
			}
			return {
				ok: true,
				status: 200,
				headers: realHeaders(null),
				json: async () => ({ state: 'PAID' })
			} as unknown as Response;
		}) as unknown as typeof fetch;

		render(Receive, { defaultMintUrl: MINT_URL });
		await fireEvent.click(screen.getByRole('button', { name: '1' }));
		await fireEvent.click(screen.getByText('screen.receive.create_invoice'));

		// First tick (3s base) hits the 429 → backoff (2s Retry-After honored
		// vs 6s grown → ~6s ± jitter) → second tick sees PAID → mint.
		await waitFor(() => expect(mockCompleteMint).toHaveBeenCalled(), { timeout: 25000 });
		expect(getCalls).toBeGreaterThanOrEqual(2);
		expect(mockCompleteMint).toHaveBeenCalledWith(MINT_URL, 'quote-xyz', 1, KEYSET_ID, true);
	}, 30000);
});
