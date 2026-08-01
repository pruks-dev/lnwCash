/**
 * Test: Navigation.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Navigation from '../../screens/Navigation.svelte';

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

describe('Navigation', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render all nav items', () => {
		render(Navigation, { active: 'balance', onNavigate: vi.fn() });
		expect(screen.getByText('nav.balance')).toBeTruthy();
		expect(screen.getByText('nav.receive')).toBeTruthy();
		expect(screen.getByText('nav.pay')).toBeTruthy();
		expect(screen.getByText('nav.transfer')).toBeTruthy();
		expect(screen.getByText('nav.history')).toBeTruthy();
	});

	it('should call onNavigate when nav item clicked', async () => {
		const onNavigate = vi.fn();
		render(Navigation, { active: 'balance', onNavigate });
		const receiveBtn = screen.getByText('nav.receive');
		receiveBtn.click();
		expect(onNavigate).toHaveBeenCalledWith('receive');
	});

	it('should highlight active nav item', () => {
		render(Navigation, { active: 'balance', onNavigate: vi.fn() });
		const balanceBtn = screen.getByText('nav.balance').closest('button');
		expect(balanceBtn?.classList.contains('active')).toBe(true);
	});

	it('should navigate to pay screen', async () => {
		const onNavigate = vi.fn();
		render(Navigation, { active: 'balance', onNavigate });
		const payBtn = screen.getByText('nav.pay');
		payBtn.click();
		expect(onNavigate).toHaveBeenCalledWith('pay');
	});
});
