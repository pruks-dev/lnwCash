/**
 * Test: App.svelte — TASK-272 setup lifecycle state sync.
 *
 * Covers the root-cause fixes for the broken setup flows:
 *   - fix 6a: handleWalletReady(UNLOCKED) clears a stale '/setup' hash and
 *     navigates home (create → "start using" → home, not stuck on setup).
 *   - fix 6b: navigating to /setup (e.g. after deleteWallet) flips appView to
 *     'setup' so the centered setup-container renders.
 *   - fix 6d: handleWalletReady(LOCKED) keeps the app on the setup screen.
 *   - fix 7: <Setup> renders ONLY under appView === 'setup' (no duplicate
 *     inside main-content).
 *
 * All leaf screens/components are stubbed; $lib router is REAL so the
 * hashchange → onRouteChange → appView sync is exercised end-to-end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte/svelte5';
import App from '../App.svelte';

// ── Hoisted test doubles (usable inside hoisted vi.mock factories) ──
const h = vi.hoisted(() => {
	/** Minimal Svelte 5 component stub that renders a testid marker + captures props. */
	const capturedProps: Record<string, Record<string, unknown>> = {};
	function stub(name: string) {
		return function StubComponent(anchor: Node, props: Record<string, unknown>) {
			capturedProps[name] = props;
			const el = document.createElement('div');
			el.setAttribute('data-testid', name);
			el.textContent = name;
			anchor.parentNode?.insertBefore(el, anchor);
			return {
				update() {},
				mount() {},
				destroy() {
					el.remove();
				}
			};
		};
	}
	/** Minimal Svelte store (subscribe/set) — enough for `$store` in templates. */
	function makeStore<T>(initial: T) {
		let value = initial;
		const listeners = new Set<(v: T) => void>();
		return {
			subscribe(fn: (v: T) => void) {
				fn(value);
				listeners.add(fn);
				return () => listeners.delete(fn);
			},
			set(v: T) {
				value = v;
				for (const fn of [...listeners]) fn(v);
			}
		};
	}
	return {
		stub,
		capturedProps,
		makeStore,
		mockGetWalletStatus: vi.fn(),
		mockTryAutoUnlock: vi.fn(),
		mockStartAutoLock: vi.fn()
	};
});

// ── Module mocks (lib layer) ────────────────────────────────────
vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	},
	locale: {
		subscribe(fn: (v: string) => void) {
			fn('en');
			return () => {};
		},
		set() {}
	},
	init() {},
	register() {}
}));

vi.mock('$lib/wallet/state', () => ({
	getWalletStatus: (...a: unknown[]) => h.mockGetWalletStatus(...a),
	tryAutoUnlock: (...a: unknown[]) => h.mockTryAutoUnlock(...a)
}));

vi.mock('$lib/pwa-install', () => ({
	initPwaInstall: vi.fn(() => () => {})
}));

vi.mock('$lib/offline-indicator', () => ({
	trackWasOffline: vi.fn(() => () => {})
}));

vi.mock('$lib/wallet/store', () => ({
	activeMintStore: h.makeStore('https://mint.lnw.cash')
}));

vi.mock('$lib/stores/scannedQR', () => ({
	scannedQRValue: { set: vi.fn(), subscribe: vi.fn(() => () => {}) }
}));

vi.mock('$lib/wallet/autolock', () => ({
	startAutoLock: (...a: unknown[]) => h.mockStartAutoLock(...a),
	walletLockedStore: h.makeStore(false)
}));

vi.mock('$lib/stores/toast', () => ({
	showToast: vi.fn(),
	toastMessage: h.makeStore<string | null>(null),
	toastType: h.makeStore('info')
}));

vi.mock('$lib/design/theme', () => ({
	themeMode: h.makeStore('system'),
	resolveTheme: vi.fn((m: string) => m),
	applyThemeDom: vi.fn()
}));

vi.mock('$lib/storage/db', () => ({
	getTransactions: vi.fn(async () => []),
	updateTransaction: vi.fn(async () => {})
}));

vi.mock('$lib/cashu/client', () => ({
	checkMintQuote: vi.fn(async () => ({ state: 'UNPAID', paid: false }))
}));

vi.mock('$lib/stores/mint-events', () => ({
	notifyMintConfirmed: vi.fn(),
	mintBanner: h.makeStore({ show: false, amount: 0 })
}));

// ── Component stubs (leaf screens/components) ───────────────────
vi.mock('$lib/iconly/Iconly.svelte', () => ({ default: h.stub('iconly-stub') }));
vi.mock('../screens/Home.svelte', () => ({ default: h.stub('home-stub') }));
vi.mock('../screens/Receive.svelte', () => ({ default: h.stub('receive-stub') }));
vi.mock('../screens/Send.svelte', () => ({ default: h.stub('send-stub') }));
vi.mock('../screens/History.svelte', () => ({ default: h.stub('history-stub') }));
vi.mock('../screens/Settings.svelte', () => ({ default: h.stub('settings-stub') }));
vi.mock('../screens/Setup.svelte', () => ({ default: h.stub('setup-stub') }));
vi.mock('../components/BottomNav.svelte', () => ({ default: h.stub('bottomnav-stub') }));
vi.mock('../components/TopAppBar.svelte', () => ({ default: h.stub('topappbar-stub') }));
vi.mock('$lib/components/icons/ArrowLeft.svelte', () => ({ default: h.stub('arrowleft-stub') }));
vi.mock('../screens/F007-QRScan.svelte', () => ({ default: h.stub('qrscan-stub') }));
vi.mock('../components/SplashScreen.svelte', () => ({ default: h.stub('splash-stub') }));
vi.mock('../components/ErrorBoundary.svelte', () => ({ default: h.stub('errorboundary-stub') }));
vi.mock('../components/OfflineIndicator.svelte', () => ({ default: h.stub('offlineindicator-stub') }));
vi.mock('../components/PwaInstallPrompt.svelte', () => ({ default: h.stub('pwainstall-stub') }));

// ── Helpers ────────────────────────────────────────────────────
type WalletStateShape = {
	state: 'UNINITIALIZED' | 'LOCKED' | 'UNLOCKED';
	walletName: string | null;
	createdAt: number | null;
};

function setWallet(state: WalletStateShape) {
	h.mockGetWalletStatus.mockReturnValue(state);
}

function setWalletByState(state: WalletStateShape['state']) {
	setWallet({ state, walletName: state === 'UNINITIALIZED' ? null : 'LNWCASH Wallet', createdAt: state === 'UNINITIALIZED' ? null : 1 });
}

const UNLOCKED: WalletStateShape = { state: 'UNLOCKED', walletName: 'LNWCASH Wallet', createdAt: 1 };

describe('App.svelte — setup lifecycle state sync (TASK-272)', () => {
	beforeEach(() => {
		history.replaceState(null, '', '/');
		vi.clearAllMocks();
		h.mockTryAutoUnlock.mockResolvedValue(false);
	});

	afterEach(() => {
		cleanup();
	});

	// ─── fix 6b / fix 7: setup route → centered setup-container ──
	it('UNINITIALIZED wallet renders the setup-container (create flow), not main-content', async () => {
		setWalletByState('UNINITIALIZED');
		render(App, {});
		await waitFor(() => expect(screen.getByTestId('setup-stub')).toBeTruthy());
		// setup lives in the centered container — main content is NOT rendered.
		expect(document.querySelector('.setup-container')).toBeTruthy();
		expect(screen.queryByTestId('home-stub')).toBeNull();
	});

	it('LOCKED wallet renders the setup-container (unlock flow)', async () => {
		setWalletByState('LOCKED');
		render(App, {});
		await waitFor(() => expect(screen.getByTestId('setup-stub')).toBeTruthy());
		expect(document.querySelector('.setup-container')).toBeTruthy();
		expect(screen.queryByTestId('home-stub')).toBeNull();
	});

	it('UNLOCKED wallet (auto-unlock) renders main-content Home — not setup', async () => {
		setWalletByState('UNLOCKED');
		h.mockTryAutoUnlock.mockResolvedValue(true);
		render(App, {});
		await waitFor(() => expect(screen.getByTestId('home-stub')).toBeTruthy());
		expect(screen.queryByTestId('setup-stub')).toBeNull();
		expect(document.querySelector('.setup-container')).toBeNull();
	});

	it('navigating to /setup flips appView to setup-container (delete → reset)', async () => {
		setWalletByState('UNLOCKED');
		h.mockTryAutoUnlock.mockResolvedValue(true);
		render(App, {});
		await waitFor(() => expect(screen.getByTestId('home-stub')).toBeTruthy());

		// Simulate deleteWallet() success → wallet now UNINITIALIZED, then
		// Settings.confirmDelete navigates to /setup.
		setWalletByState('UNINITIALIZED');
		window.location.hash = '/setup';
		await waitFor(() => expect(screen.getByTestId('setup-stub')).toBeTruthy());

		// The ONLY <Setup> render path is the centered setup-container.
		expect(document.querySelector('.setup-container')).toBeTruthy();
		expect(screen.queryByTestId('home-stub')).toBeNull();
		// fix 7: main-content must NOT contain a duplicate <Setup>.
		const mainContent = document.querySelector('.main-content');
		if (mainContent) {
			expect(mainContent.querySelector('[data-testid="setup-stub"]')).toBeNull();
		}
	});

	// ─── fix 6a: unlock/create → "start using" → home ─────────────
	it('handleWalletReady(UNLOCKED) clears stale /setup hash and navigates home', async () => {
		setWalletByState('LOCKED');
		// Stale hash left from a previous setup/lock navigation.
		window.location.hash = '/setup';
		render(App, {});
		await waitFor(() => expect(screen.getByTestId('setup-stub')).toBeTruthy());

		// Simulate Setup "start using" / successful unlock → onWalletReady(UNLOCKED).
		const setupProps = h.capturedProps['setup-stub'] as
			| { onWalletReady?: (s: WalletStateShape) => void }
			| undefined;
		expect(setupProps?.onWalletReady).toBeTruthy();
		setupProps!.onWalletReady!(UNLOCKED);

		await waitFor(() => expect(screen.getByTestId('home-stub')).toBeTruthy());
		expect(screen.queryByTestId('setup-stub')).toBeNull();
		// The stale '/setup' hash was cleared → route is now home.
		expect(window.location.hash).not.toContain('setup');
	});

	// ─── fix 6d: handleWalletReady(LOCKED) → stay on setup ───────
	it('handleWalletReady(LOCKED) keeps the app on the setup screen', async () => {
		setWalletByState('LOCKED');
		render(App, {});
		await waitFor(() => expect(screen.getByTestId('setup-stub')).toBeTruthy());

		const setupProps = h.capturedProps['setup-stub'] as
			| { onWalletReady?: (s: WalletStateShape) => void }
			| undefined;
		setupProps!.onWalletReady!({ state: 'LOCKED', walletName: 'LNWCASH Wallet', createdAt: 1 });

		await waitFor(() => expect(screen.getByTestId('setup-stub')).toBeTruthy());
		expect(screen.queryByTestId('home-stub')).toBeNull();
		expect(document.querySelector('.setup-container')).toBeTruthy();
	});
});
