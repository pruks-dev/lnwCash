/**
 * Test: SplashScreen.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import SplashScreen from '../../components/SplashScreen.svelte';

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

describe('SplashScreen', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render app name', () => {
		render(SplashScreen, { show: true });
		expect(screen.getByText('app.name')).toBeTruthy();
	});

	it('should render tagline', () => {
		render(SplashScreen, { show: true });
		expect(screen.getByText('app.tagline')).toBeTruthy();
	});

	it('should render logo element', () => {
		render(SplashScreen, { show: true });
		const logo = document.querySelector('.splash-logo');
		expect(logo).toBeTruthy();
	});

	it('should render loader dots', () => {
		render(SplashScreen, { show: true });
		const loader = document.querySelector('.splash-loader');
		expect(loader).toBeTruthy();
	});

	it('should hide when show is false', () => {
		render(SplashScreen, { show: false });
		const splash = document.querySelector('.splash-screen');
		expect(splash).toBeNull();
	});

	it('should show by default (show=true)', () => {
		render(SplashScreen, {});
		const splash = document.querySelector('.splash-screen');
		expect(splash).toBeTruthy();
	});
});
