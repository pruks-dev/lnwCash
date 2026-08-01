/**
 * Test: F008-History.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import F008History from '../../screens/F008-History.svelte';

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

describe('F008-History', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render history title', () => {
		render(F008History, {});
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});

	it('should render filter buttons', () => {
		render(F008History, {});
		expect(screen.getByText('screen.history.filter_all')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_mint')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_melt')).toBeTruthy();
		expect(screen.getByText('screen.history.filter_transfer')).toBeTruthy();
	});

	it('should render component without crashing', () => {
		const { container } = render(F008History, {});
		// Component should render its structure
		expect(container.querySelector('.history-screen')).toBeTruthy();
		expect(container.querySelector('.filters')).toBeTruthy();
	});

	it('should have refresh button', () => {
		render(F008History, {});
		expect(screen.getByText('screen.balance.refresh')).toBeTruthy();
	});

	it('should accept maxItems prop', () => {
		render(F008History, { maxItems: 10 });
		expect(screen.getByText('screen.history.title')).toBeTruthy();
	});
});
