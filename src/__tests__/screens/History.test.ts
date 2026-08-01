/**
 * Test: History.svelte — TASK-051 History screen with date grouping
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

describe('History (TASK-051)', () => {
	beforeEach(() => { localStorage.clear(); });
	afterEach(() => { cleanup(); });

	it('should render history title', () => {
		render(History, {});
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should show filter chips', () => {
		render(History, {});
		expect(screen.getByText('screen.history.filter_all')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_mint')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_melt')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_transfer')).toBeTruthy();
	});

	it('should show empty state initially', async () => {
		render(History, {});
		await waitFor(() => {
			expect(screen.getByText('screen.history.empty')).toBeTruthy();
		});
	});

	it('should render with maxItems prop', () => {
		render(History, { maxItems: 5 });
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});
});
