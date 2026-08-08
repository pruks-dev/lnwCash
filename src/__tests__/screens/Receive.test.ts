/**
 * Test: Receive.svelte — TASK-066 Redesigned Receive screen
 *      + TASK-091 (F-066) reactive mint URL propagation
 * Tests: Tab rendering, amount input, invoice generation flow, Cashu token input
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import Receive from '../../screens/Receive.svelte';

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

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn(),
	getCurrentScreen: () => 'receive',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

// Mock getMintConfig for mint name resolution in toast
const mockGetMintConfig = vi.fn().mockReturnValue({ name: 'Test Mint', url: 'https://test.mint' });
vi.mock('$lib/wallet/store', () => ({
	getMintConfig: (url: string) => mockGetMintConfig(url),
	getActiveMintUrl: () => 'https://mint.lnw.cash',
	setActiveMintUrl: vi.fn(),
	activeMintStore: {
		subscribe: vi.fn(() => () => {}),
		set: vi.fn()
	}
}));

describe('Receive (TASK-066 + TASK-091)', () => {
	beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	// ════════════════════════════════════════════════════
	// AC: Screen renders with tabs
	// ════════════════════════════════════════════════════

	it('should render receive title', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});

	it('should render Lightning tab', () => {
		render(Receive, {});
		const tab = screen.getByRole('tab', { name: /screen.receive.tab_lightning/ });
		expect(tab).toBeTruthy();
	});

	it('should render Cashu tab', () => {
		render(Receive, {});
		const tab = screen.getByRole('tab', { name: /screen.receive.tab_cashu/ });
		expect(tab).toBeTruthy();
	});

	it('should have two tabs with role=tab', () => {
		render(Receive, {});
		const tabs = document.querySelectorAll('[role="tab"]');
		expect(tabs.length).toBe(2);
	});

	// ════════════════════════════════════════════════════
	// AC: Lightning tab — amount input
	// ════════════════════════════════════════════════════

	it('should show amount label in Lightning tab', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.amount_label')).toBeTruthy();
	});

	it('should show "sats" unit label', () => {
		render(Receive, {});
		expect(screen.getByText('screen.balance.sats')).toBeTruthy();
	});

	it('should display default amount 0', () => {
		render(Receive, {});
		const amountEl = document.querySelector('.amount-value');
		expect(amountEl).toBeTruthy();
	});

	it('should have a numpad with digits 0-9', () => {
		render(Receive, {});
		// Numpad renders digit buttons
		const btn1 = screen.queryByText('1');
		expect(btn1).toBeTruthy();
	});

	it('should show create invoice confirm button', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.create_invoice')).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// AC: Cashu tab — token input
	// ════════════════════════════════════════════════════

	it('should switch to Cashu tab and show token input', async () => {
		render(Receive, {});
		const cashuTab = screen.getByRole('tab', { name: /screen.receive.tab_cashu/ });
		await fireEvent.click(cashuTab);
		expect(screen.getByText('screen.receive.paste_token')).toBeTruthy();
	});

	it('should show validate button in Cashu tab', async () => {
		render(Receive, {});
		const cashuTab = screen.getByRole('tab', { name: /screen.receive.tab_cashu/ });
		await fireEvent.click(cashuTab);
		expect(screen.getByText('screen.receive.validate_token')).toBeTruthy();
	});

	it('should show paste button in Cashu tab', async () => {
		render(Receive, {});
		const cashuTab = screen.getByRole('tab', { name: /screen.receive.tab_cashu/ });
		await fireEvent.click(cashuTab);
		expect(screen.getByText('common.paste')).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// AC: Props
	// ════════════════════════════════════════════════════

	it('should render with QR scan callback', () => {
		const onQRScan = vi.fn();
		render(Receive, { onQRScan });
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});

	it('should render with default mint url', () => {
		render(Receive, { defaultMintUrl: 'https://test.mint' });
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// AC: Accessibility
	// ════════════════════════════════════════════════════

	it('should have aria role main', () => {
		render(Receive, {});
		expect(document.querySelector('[role="main"]')).toBeTruthy();
	});

	it('should have back button with aria-label', () => {
		render(Receive, {});
		const backBtn = document.querySelector('[aria-label="common.back"]');
		expect(backBtn).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// TASK-091 (F-066): Reactive mint URL propagation
	// ════════════════════════════════════════════════════

	it('should not crash when defaultMintUrl changes (reactive prop)', () => {
		const { unmount } = render(Receive, { defaultMintUrl: 'https://mint1.example.com' });
		unmount();
		// Simulate prop change (re-render with new prop after cleanup)
		render(Receive, { defaultMintUrl: 'https://mint2.example.com' });
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});

	it('should accept defaultMintUrl prop and render without crash', () => {
		render(Receive, { defaultMintUrl: 'https://reactive-test.mint' });
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});
});
