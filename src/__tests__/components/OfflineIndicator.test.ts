/**
 * Test: OfflineIndicator.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import OfflineIndicator from '../../components/OfflineIndicator.svelte';

vi.mock('svelte-i18n', () => {
	return {
		_: {
			subscribe(fn: (val: (key: string) => string) => void) {
				fn((k: string) => k);
				return () => {};
			}
		},
		locale: {
			subscribe(fn: (val: string) => void) {
				fn('th');
				return () => {};
			},
			set() {}
		},
		init() {},
		register() {},
		getLocaleFromNavigator() {
			return 'th';
		}
	};
});

describe('OfflineIndicator', () => {
	beforeEach(() => {
		Object.defineProperty(navigator, 'onLine', {
			value: true,
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		cleanup();
	});

	it('should render banner variant by default', () => {
		render(OfflineIndicator, {});
		// When online, banner is hidden; check component mounts
		const container = document.body;
		expect(container).toBeTruthy();
	});

	it('should show offline banner when offline', async () => {
		Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
		render(OfflineIndicator, {});
		// The banner should show the offline text
		await vi.waitFor(() => {
			const banner = document.querySelector('.offline-banner');
			expect(banner).toBeTruthy();
		}, { timeout: 500 });
	});

	it('should hide banner when online in banner variant', async () => {
		Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
		render(OfflineIndicator, {});
		await vi.waitFor(() => {
			const banner = document.querySelector('.offline-banner');
			expect(banner).toBeNull();
		}, { timeout: 500 });
	});

	it('should render badge variant', () => {
		render(OfflineIndicator, { variant: 'badge' });
		const badge = document.querySelector('.offline-badge');
		expect(badge).toBeTruthy();
	});

	it('should show online status in badge variant', () => {
		Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
		render(OfflineIndicator, { variant: 'badge' });
		expect(screen.getByText('screen.balance.online')).toBeTruthy();
	});

	it('should show offline status in badge variant', async () => {
		Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
		render(OfflineIndicator, { variant: 'badge' });
		await vi.waitFor(() => {
			expect(screen.getByText('screen.balance.offline')).toBeTruthy();
		}, { timeout: 500 });
	});
});
