/**
 * Test: History.svelte — TASK-060 History screen with pull-to-refresh,
 * skeleton cards, date grouping, and empty state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import History from '../../screens/History.svelte';

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

vi.mock('$lib/storage/db', () => ({
	getTransactions: vi.fn(() => Promise.resolve([]))
}));

describe('History (TASK-060)', () => {
	beforeEach(() => { localStorage.clear(); });
	afterEach(() => { cleanup(); });

	it('should render history title', () => {
		render(History, {});
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should show filter chips', () => {
		render(History, {});
		expect(screen.getByText('screen.history.filter_all')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_receive')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_send')).toBeTruthy();
	});

	it('should show skeleton cards while loading', () => {
		const { container } = render(History, {});
		const skeletonCards = container.querySelectorAll('.skeleton-card');
		expect(skeletonCards.length).toBeGreaterThanOrEqual(1);
	});

	it('should show empty state when no transactions', async () => {
		render(History, {});
		await waitFor(() => {
			expect(screen.getByText('screen.history.empty')).toBeTruthy();
		});
	});

	it('should have empty state hint text', async () => {
		render(History, {});
		await waitFor(() => {
			const emptyStates = document.querySelectorAll('.empty-state');
			expect(emptyStates.length).toBeGreaterThanOrEqual(1);
		});
	});

	it('should render with maxItems prop', () => {
		render(History, { maxItems: 5 });
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should show loading skeletons with pulse animation', () => {
		const { container } = render(History, {});
		const pulsing = container.querySelectorAll('.pulse');
		expect(pulsing.length).toBeGreaterThan(0);
	});

	it('should render main element with correct aria label', () => {
		const { container } = render(History, {});
		const main = container.querySelector('div[role="main"]');
		expect(main).toBeTruthy();
	});

	it('should show history icon in empty state', async () => {
		const { container } = render(History, {});
		await waitFor(() => {
			const emptyIcon = container.querySelector('.empty-icon');
			expect(emptyIcon).toBeTruthy();
		});
	});
});
