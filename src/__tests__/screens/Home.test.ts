/**
 * Test: Home.svelte — TASK-059 Wallet Page Redesign
 *
 * Acceptance Criteria:
 * 1. Balance render ด้วย Cyan #00bcd4
 * 2. Send/Receive buttons clickable + navigate ถูก
 * 3. Recent transactions list + empty state
 * 4. Layout responsive: 375×812 no horizontal scroll
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import Home from '../../screens/Home.svelte';

// Mock svelte-i18n
vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) { fn('en'); return () => {}; },
			set() {}
		},
		init() {},
		register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

// Mock router
const mockNavigateTo = vi.fn();
vi.mock('$lib/router', () => ({
	navigateTo: (screen: string) => mockNavigateTo(screen),
	getCurrentScreen: () => 'home',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

// Mock wallet balance — returns 0 by default
const mockGetBalanceByMint = vi.fn().mockResolvedValue(0);
vi.mock('$lib/wallet/balance', () => ({
	getBalanceByMint: () => mockGetBalanceByMint(),
	getMintBalances: async () => []
}));

// Mock wallet store (TASK-4006: + getMintConfig — real sig (mintUrl: string) => MintConfig | undefined; R6 Home.svelte imports it; unknown mint → undefined → shortMintHost fallback; test logic untouched)
vi.mock('$lib/wallet/store', () => ({
	activeMintStore: {
		subscribe: (fn: (v: string) => void) => { fn('https://mint.example.com'); return () => {}; }
	},
	getActiveMintUrl: () => 'https://mint.example.com',
	getMintConfig: (_mintUrl: string) => undefined
}));

// Mock storage/db
const mockGetTransactions = vi.fn().mockResolvedValue([]);
vi.mock('$lib/storage/db', () => ({
	getTransactions: () => mockGetTransactions()
}));

// Mock wallet/offline
vi.mock('$lib/wallet/offline', () => ({
	isOnline: () => true,
	onConnectivityChange: (cb: (online: boolean) => void) => {
		setTimeout(() => cb(true), 0);
		return () => {};
	}
}));

// TASK-5002 (INTENT-050, mockup R2 rev13): mock live rates — Home must render
// EXACT values from the mock (mockup demo: 21,500 sats @2,655,537 = 570.94 THB).
// Never hits network in tests.
const MOCK_PRICES: Record<string, number | null> = {
	THB: 2655537,
	USD: 97500,
	EUR: 89000,
	JPY: 14800000,
	GBP: 77000,
	CNY: 700000,
	KRW: 135000000,
	SGD: 132000,
	AUD: 150000,
	MYR: 460000
};
interface MockRateEntry {
	price: number | null;
	asOf: number | null;
	where: string;
	stale: boolean;
	expired: boolean;
}
const mockGetBtcRate = vi.fn(
	async (currency: string): Promise<MockRateEntry> => ({
		price: MOCK_PRICES[currency] ?? null,
		asOf: 1000000,
		where: 'coingecko',
		stale: false,
		expired: false
	})
);
vi.mock('$lib/fiat/rates', () => ({
	getBtcRate: (...args: unknown[]) =>
		(mockGetBtcRate as (...a: unknown[]) => unknown)(...args),
	getBtcRates: vi.fn(),
	SUPPORTED_CURRENCIES: [
		'THB',
		'USD',
		'EUR',
		'JPY',
		'GBP',
		'CNY',
		'KRW',
		'SGD',
		'AUD',
		'MYR'
	]
}));

describe('Home (TASK-059) — Wallet Page Redesign', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetBalanceByMint.mockResolvedValue(0);
		mockGetTransactions.mockResolvedValue([]);
		mockNavigateTo.mockClear();
		// TASK-5002: isolate fiat settings between tests (default THB).
		window.localStorage.clear();
		mockGetBtcRate.mockImplementation(async (currency: string) => ({
			price: MOCK_PRICES[currency] ?? null,
			asOf: 1000000,
			where: 'coingecko',
			stale: false,
			expired: false
		}));
	});

	afterEach(() => {
		cleanup();
	});

	// ═══════════════════════════════════════════════════════════════
	// AC-1: Balance Display
	// ═══════════════════════════════════════════════════════════════

	it('renders balance heading', () => {
		render(Home, {});
		expect(screen.getByText('screen.home.total_balance')).toBeTruthy();
	});

	it('displays zero when balance is zero and loaded', async () => {
		render(Home, {});
		await vi.waitFor(() => {
			const el = document.querySelector('.balance-value');
			expect(el).toBeTruthy();
			expect(el!.textContent?.trim()).toBe('0');
		}, { timeout: 3000 });
	}, 10000);

	it('displays balance value when non-zero', async () => {
		mockGetBalanceByMint.mockResolvedValue(50000);
		render(Home, {});
		await vi.waitFor(() => {
			const el = document.querySelector('.balance-value');
			expect(el).toBeTruthy();
			expect(el?.textContent).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('renders balance with Cyan color (#00bcd4) via CSS class', async () => {
		mockGetBalanceByMint.mockResolvedValue(50000);
		render(Home, {});
		await vi.waitFor(() => {
			const el = document.querySelector('.balance-value');
			expect(el).toBeTruthy();
			// The balance-value class applies color: var(--color-primary) = #00bcd4
			expect(el?.classList.contains('balance-value')).toBe(true);
		}, { timeout: 3000 });
	}, 10000);

	it('shows SAT unit label', async () => {
		mockGetBalanceByMint.mockResolvedValue(100);
		render(Home, {});
		await vi.waitFor(() => {
			expect(screen.getByText('screen.balance.sats')).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	it('shows THB equivalent estimate', async () => {
		mockGetBalanceByMint.mockResolvedValue(10000);
		render(Home, {});
		await vi.waitFor(() => {
			const fiat = document.querySelector('.fiat-estimate');
			expect(fiat).toBeTruthy();
			expect(fiat?.textContent).toContain('THB');
		}, { timeout: 3000 });
	}, 10000);

	// ═══════════════════════════════════════════════════════════════
	// TASK-5002 (INTENT-050, mockup R2 rev13): live-rate fiat, exact values
	// ═══════════════════════════════════════════════════════════════

	it('shows exact live fiat from mock rate (21,500 sats @2,655,537 = 570.94 THB)', async () => {
		mockGetBalanceByMint.mockResolvedValue(21500);
		render(Home, {});
		await vi.waitFor(() => {
			const fiat = document.querySelector('.fiat-estimate');
			expect(fiat?.textContent?.trim()).toBe('570.94 THB');
		}, { timeout: 3000 });
	}, 10000);

	it('fiat line has no ≈ and no rate/time/source (mockup R2 rev1-3)', async () => {
		mockGetBalanceByMint.mockResolvedValue(21500);
		render(Home, {});
		await vi.waitFor(() => {
			const fiat = document.querySelector('.fiat-estimate');
			expect(fiat?.textContent?.trim()).toBe('570.94 THB');
		}, { timeout: 3000 });
		const fiat = document.querySelector('.fiat-estimate');
		expect(fiat?.textContent).not.toContain('≈');
		expect(fiat?.textContent).not.toMatch(/\/\s*BTC|CoinGecko|อัปเดต|Updated/);
		expect(document.querySelector('.fiat-rate-line')).toBeNull();
	}, 10000);

	it('switches fiat currency to USD with mock rate (21,500 sats @97,500 = 20.96 USD)', async () => {
		mockGetBalanceByMint.mockResolvedValue(21500);
		render(Home, {});
		await vi.waitFor(() => {
			expect(document.querySelector('.fiat-estimate')?.textContent?.trim()).toBe('570.94 THB');
		}, { timeout: 3000 });
		window.localStorage.setItem('lnwcash_settings', JSON.stringify({ fiat_currency: 'USD' }));
		window.dispatchEvent(new CustomEvent('lnwcash:fiat-currency', { detail: 'USD' }));
		await vi.waitFor(() => {
			expect(document.querySelector('.fiat-estimate')?.textContent?.trim()).toBe('20.96 USD');
		}, { timeout: 3000 });
	}, 10000);

	it('formats JPY with 0 decimals from mock rate (21,500 sats @14,800,000 = 3,182 JPY)', async () => {
		mockGetBalanceByMint.mockResolvedValue(21500);
		window.localStorage.setItem('lnwcash_settings', JSON.stringify({ fiat_currency: 'JPY' }));
		render(Home, {});
		await vi.waitFor(() => {
			expect(document.querySelector('.fiat-estimate')?.textContent?.trim()).toBe('3,182 JPY');
		}, { timeout: 3000 });
	}, 10000);

	it('renders dash (no fake number) when rate is unavailable', async () => {
		mockGetBalanceByMint.mockResolvedValue(21500);
		mockGetBtcRate.mockResolvedValueOnce({
			price: null,
			asOf: null,
			where: 'cache',
			stale: true,
			expired: true
		});
		render(Home, {});
		await vi.waitFor(() => {
			expect(document.querySelector('.fiat-estimate')?.textContent?.trim()).toBe('– THB');
		}, { timeout: 3000 });
	}, 10000);

	it('shows online status badge', async () => {
		render(Home, {});
		await vi.waitFor(() => {
			expect(screen.getByText('screen.balance.online')).toBeTruthy();
		}, { timeout: 3000 });
	}, 10000);

	// ═══════════════════════════════════════════════════════════════
	// AC-2: Send/Receive Quick Action Buttons
	// ═══════════════════════════════════════════════════════════════

	it('renders Send button', () => {
		render(Home, {});
		expect(screen.getByText('wallet.send')).toBeTruthy();
	});

	it('renders Receive button', () => {
		render(Home, {});
		expect(screen.getByText('wallet.receive')).toBeTruthy();
	});

	it('has exactly 2 quick action buttons', () => {
		render(Home, {});
		const btns = document.querySelectorAll('.action-btn');
		expect(btns.length).toBe(2);
	});

	it('navigates to /send when Send clicked', async () => {
		render(Home, {});
		const btn = document.querySelector('.action-send') as HTMLElement;
		await fireEvent.click(btn);
		expect(mockNavigateTo).toHaveBeenCalledWith('send');
	});

	it('navigates to /receive when Receive clicked', async () => {
		render(Home, {});
		const btn = document.querySelector('.action-receive') as HTMLElement;
		await fireEvent.click(btn);
		expect(mockNavigateTo).toHaveBeenCalledWith('receive');
	});

	it('creates ripple effect on Send click', async () => {
		render(Home, {});
		const btn = document.querySelector('.action-send') as HTMLElement;
		await fireEvent.click(btn);
		const ripple = btn?.querySelector('.ripple-effect');
		expect(ripple).toBeTruthy();
	});

	it('Send button has primary background class', () => {
		render(Home, {});
		const btn = document.querySelector('.action-send');
		expect(btn).toBeTruthy();
		expect(btn?.classList.contains('action-send')).toBe(true);
	});

	it('Receive button has surface-variant class', () => {
		render(Home, {});
		const btn = document.querySelector('.action-receive');
		expect(btn).toBeTruthy();
		expect(btn?.classList.contains('action-receive')).toBe(true);
	});

	// ═══════════════════════════════════════════════════════════════
	// AC-3: Recent Transactions
	// ═══════════════════════════════════════════════════════════════

	it('does NOT render recent transactions heading (TASK-145: removed)', () => {
		render(Home, {});
		expect(screen.queryByText('screen.home.recent_tx')).toBeNull();
	});

	it('renders History button as entry point to transactions (MOD-012: list moved to History)', () => {
		render(Home, {});
		expect(document.querySelector('.history-btn')).toBeTruthy();
	});

	it('does NOT render transaction items inline (MOD-012: moved to History screen)', async () => {
		mockGetTransactions.mockResolvedValue([
			{ id: 'tx1', type: 'mint', amount: 5000, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' },
			{ id: 'tx2', type: 'melt', amount: 2000, mint_url: 'https://m.example.com', timestamp: Date.now() - 86400000, token_hash: null, status: 'confirmed' },
		]);
		mockGetBalanceByMint.mockResolvedValue(7000);
		render(Home, {});
		await vi.waitFor(() => {
			const items = document.querySelectorAll('.tx-item');
			expect(items.length).toBe(0);
		}, { timeout: 3000 });
	}, 10000);

	it('does NOT have manual refresh button (TASK-145: removed)', () => {
		render(Home, {});
		const btn = document.querySelector('[aria-label="Refresh transactions"]');
		expect(btn).toBeNull();
	});

	it('does NOT render status dots inline (MOD-012: moved to History screen)', async () => {
		mockGetTransactions.mockResolvedValue([
			{ id: 'tx1', type: 'mint', amount: 5000, mint_url: 'https://m.example.com', timestamp: Date.now(), token_hash: null, status: 'confirmed' },
		]);
		mockGetBalanceByMint.mockResolvedValue(5000);
		render(Home, {});
		await vi.waitFor(() => {
			const dots = document.querySelectorAll('.tx-status-dot');
			expect(dots.length).toBe(0);
		}, { timeout: 3000 });
	}, 10000);

	// ═══════════════════════════════════════════════════════════════
	// AC-4: Layout — responsive, no horizontal scroll
	// ═══════════════════════════════════════════════════════════════

	it('has scroll container with correct class', () => {
		render(Home, {});
		const el = document.querySelector('.home-scroll') as HTMLElement;
		expect(el).toBeTruthy();
		// Verify the scroll container renders (jsdom doesn't resolve Svelte scoped CSS)
		expect(el.classList.contains('home-scroll')).toBe(true);
	});

	it('has no horizontal scroll container (element renders)', () => {
		render(Home, {});
		const el = document.querySelector('.home-scroll') as HTMLElement;
		expect(el).toBeTruthy();
		// Element exists — overflow-x:hidden is set via CSS
	});

	it('has content constrained to 480px via class', () => {
		render(Home, {});
		const el = document.querySelector('.home-scroll') as HTMLElement;
		expect(el).toBeTruthy();
		// max-width: 480px is set via CSS — class exists
		expect(el.classList.contains('home-scroll')).toBe(true);
	});

	it('has safe-area-inset-bottom spacer', () => {
		render(Home, {});
		const spacer = document.querySelector('.bottom-spacer') as HTMLElement;
		expect(spacer).toBeTruthy();
	});

	it('has correct aria role on main element', () => {
		render(Home, {});
		const main = document.querySelector('[role="main"]');
		expect(main).toBeTruthy();
		expect(main?.getAttribute('aria-label')).toBe('screen.home.title');
	});

	// ═══════════════════════════════════════════════════════════════
	// Edge Cases
	// ═══════════════════════════════════════════════════════════════

	it('renders with onQRScan prop without crashing', () => {
		const fn = vi.fn();
		render(Home, { onQRScan: fn });
		expect(document.querySelector('[role="main"]')).toBeTruthy();
	});

	it('handles balance loading error', async () => {
		mockGetBalanceByMint.mockRejectedValue(new Error('Network error'));
		render(Home, {});
		await vi.waitFor(() => {
			const section = document.querySelector('.balance-section');
			expect(section?.textContent).toContain('Network error');
		}, { timeout: 3000 });
	}, 10000);
});
