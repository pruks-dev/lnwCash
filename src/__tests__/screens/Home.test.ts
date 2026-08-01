/**
 * Test: Home.svelte — TASK-051 Home Dashboard
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Home from '../../screens/Home.svelte';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => {
				// Return i18n key as-is for testing
				if (k.includes('{amount}')) return k;
				return k;
			});
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) {
				fn('en');
				return () => {};
			},
			set() {}
		},
		init() {},
		register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

describe('Home (TASK-051)', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render the home dashboard title', () => {
		render(Home, {});
		// screen.home.title is used as aria-label on the main element
		const main = document.querySelector('[aria-label="screen.home.title"]');
		expect(main).toBeTruthy();
	});

	it('should show total balance heading', () => {
		render(Home, {});
		expect(screen.getByText('screen.home.total_balance')).toBeTruthy();
	});

	it('should show quick actions heading', () => {
		render(Home, {});
		expect(screen.getByText('screen.home.quick_actions')).toBeTruthy();
	});

	it('should show receive button in quick actions', () => {
		render(Home, {});
		const receiveBtn = screen.getByText('wallet.receive');
		expect(receiveBtn).toBeTruthy();
	});

	it('should show send button in quick actions', () => {
		render(Home, {});
		const sendBtn = screen.getByText('wallet.send');
		expect(sendBtn).toBeTruthy();
	});

	it('should show scan qr button in quick actions', () => {
		render(Home, {});
		const scanBtn = screen.getByText('screen.receive.scan_qr');
		expect(scanBtn).toBeTruthy();
	});

	it('should show recent transactions heading', () => {
		render(Home, {});
		expect(screen.getByText('screen.home.recent_tx')).toBeTruthy();
	});

	it('should show view all link', () => {
		render(Home, {});
		expect(screen.getByText('screen.home.view_all')).toBeTruthy();
	});

	it('should show no transactions empty state', () => {
		render(Home, {});
		expect(screen.getByText('screen.home.no_tx')).toBeTruthy();
	});

	it('should show online/offline status badge', () => {
		render(Home, {});
		const onlineText = screen.getByText('screen.balance.online');
		const offlineText = screen.queryByText('screen.balance.offline');
		expect(onlineText || offlineText).toBeTruthy();
	});

	it('should render without crashing with onQRScan prop', () => {
		const onQRScan = vi.fn();
		render(Home, { onQRScan });
		const main = document.querySelector('[aria-label="screen.home.title"]');
		expect(main).toBeTruthy();
	});
});
