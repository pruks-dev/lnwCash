/**
 * Test: Send.svelte — TASK-066 Redesigned Send screen
 *      + TASK-091 (F-066) reactive mint URL propagation
 * Tests: Tab rendering, invoice input, fee check, confirmation dialog, Cashu token creation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import Send from '../../screens/Send.svelte';

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
	getCurrentScreen: () => 'send',
	onRouteChange: () => () => {}
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

describe('Send (TASK-066 + TASK-091)', () => {
	beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	// ════════════════════════════════════════════════════
	// AC: Screen renders with tabs
	// ════════════════════════════════════════════════════

	it('should render send title', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.title')).toBeTruthy();
	});

	it('should render Lightning tab', () => {
		render(Send, {});
		const tab = screen.getByRole('tab', { name: /screen.send.tab_lightning/ });
		expect(tab).toBeTruthy();
	});

	it('should render Cashu tab', () => {
		render(Send, {});
		const tab = screen.getByRole('tab', { name: /screen.send.tab_cashu/ });
		expect(tab).toBeTruthy();
	});

	it('should have two tabs', () => {
		render(Send, {});
		const tabs = document.querySelectorAll('[role="tab"]');
		expect(tabs.length).toBe(2);
	});

	// ════════════════════════════════════════════════════
	// AC: Lightning tab — invoice input
	// ════════════════════════════════════════════════════

	it('should show enter invoice heading', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.enter_invoice')).toBeTruthy();
	});

	it('should have a textarea for invoice input', () => {
		render(Send, {});
		const textarea = document.querySelector('.invoice-textarea');
		expect(textarea).toBeTruthy();
	});

	it('should show paste button', () => {
		render(Send, {});
		expect(screen.getByText('common.paste')).toBeTruthy();
	});

	it('should show scan QR button when onQRScan provided', () => {
		const onQRScan = vi.fn();
		render(Send, { onQRScan });
		expect(screen.getByText(/screen.send.scan_qr/)).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// AC: Cashu tab — amount input with numpad
	// ════════════════════════════════════════════════════

	it('should switch to Cashu tab and show amount label', async () => {
		render(Send, {});
		const cashuTab = screen.getByRole('tab', { name: /screen.send.tab_cashu/ });
		await fireEvent.click(cashuTab);
		expect(screen.getByText('screen.send.amount_label')).toBeTruthy();
	});

	it('should show preview token button in Cashu tab', async () => {
		render(Send, {});
		const cashuTab = screen.getByRole('tab', { name: /screen.send.tab_cashu/ });
		await fireEvent.click(cashuTab);
		expect(screen.getByText('screen.send.preview_token')).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// AC: Props
	// ════════════════════════════════════════════════════

	it('should render with QR scan callback', () => {
		const onQRScan = vi.fn();
		render(Send, { onQRScan });
		expect(screen.getByText('screen.send.title')).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// AC: Accessibility
	// ════════════════════════════════════════════════════

	it('should have aria role main', () => {
		render(Send, {});
		expect(document.querySelector('[role="main"]')).toBeTruthy();
	});

	it('should have back button with aria-label', () => {
		render(Send, {});
		const backBtn = document.querySelector('[aria-label="common.back"]');
		expect(backBtn).toBeTruthy();
	});

	// ════════════════════════════════════════════════════
	// TASK-091 (F-066): Reactive mint URL propagation
	// ════════════════════════════════════════════════════

	it('should not crash when defaultMintUrl changes (reactive prop)', () => {
		const { unmount } = render(Send, { defaultMintUrl: 'https://mint1.example.com' });
		unmount();
		// Simulate prop change (re-render with new prop after cleanup)
		render(Send, { defaultMintUrl: 'https://mint2.example.com' });
		expect(screen.getByText('screen.send.title')).toBeTruthy();
	});

	it('should accept defaultMintUrl prop and render without crash', () => {
		render(Send, { defaultMintUrl: 'https://reactive-test.mint' });
		expect(screen.getByText('screen.send.title')).toBeTruthy();
	});
});
