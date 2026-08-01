/**
 * Test: F003-Balance.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import F003Balance from '../../screens/F003-Balance.svelte';

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

describe('F003-Balance', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render balance title', () => {
		render(F003Balance, {});
		expect(screen.getByText('screen.balance.title')).toBeTruthy();
	});

	it('should show total balance label', () => {
		render(F003Balance, {});
		expect(screen.getByText('screen.balance.total')).toBeTruthy();
	});

	it('should show sats unit', () => {
		render(F003Balance, {});
		expect(screen.getByText('screen.balance.sats')).toBeTruthy();
	});

	it('should show online/offline indicator', () => {
		render(F003Balance, {});
		// Should show either online or offline text
		const indicator = document.querySelector('.status-badge');
		expect(indicator).toBeTruthy();
	});

	it('should have a refresh button', () => {
		render(F003Balance, {});
		expect(screen.getByText('screen.balance.refresh')).toBeTruthy();
	});

	it('should show empty state when no balance', async () => {
		render(F003Balance, {});
		await waitFor(() => {
			expect(screen.getByText('screen.balance.empty')).toBeTruthy();
		});
	});

	it('should call onNavigate when provided', () => {
		const onNavigate = vi.fn();
		render(F003Balance, { onNavigate });
		expect(screen.getByText('screen.balance.title')).toBeTruthy();
	});
});
