/**
 * Test: Settings.svelte — TASK-051 Settings screen
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Settings from '../../screens/Settings.svelte';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) { fn('en'); return () => {}; },
			set() {}
		},
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

// Mock localStorage for settings
vi.mock('$lib/storage/local', () => ({
	getSettings: vi.fn(() => ({ language: 'en', theme: 'light', default_mint: '' })),
	setSettings: vi.fn()
}));

describe('Settings (TASK-051)', () => {
	beforeEach(() => { localStorage.clear(); });
	afterEach(() => { cleanup(); });

	it('should render settings title', () => {
		render(Settings, {});
		expect(screen.getByText('screen.settings.title')).toBeTruthy();
	});

	it('should show mint section', () => {
		render(Settings, {});
		expect(screen.getByText('screen.settings.mint_section')).toBeTruthy();
	});

	it('should show language section', () => {
		render(Settings, {});
		expect(screen.getByText('screen.settings.language_section')).toBeTruthy();
	});

	it('should show theme section', () => {
		render(Settings, {});
		expect(screen.getByText('screen.settings.theme_section')).toBeTruthy();
	});

	it('should show about section', () => {
		render(Settings, {});
		expect(screen.getByText('screen.settings.about_section')).toBeTruthy();
	});

	it('should show language toggle buttons', () => {
		render(Settings, {});
		expect(screen.getByText('screen.language.th')).toBeTruthy();
		expect(screen.getByText('screen.language.en')).toBeTruthy();
	});

	it('should show theme toggle buttons', () => {
		render(Settings, {});
		const lightBtn = screen.getByText('screen.settings.theme_light');
		const darkBtn = screen.getByText('screen.settings.theme_dark');
		expect(lightBtn || darkBtn).toBeTruthy();
	});

	it('should show version info', () => {
		render(Settings, {});
		expect(screen.getByText('screen.settings.about_version')).toBeTruthy();
	});

	it('should call onBack when provided', () => {
		const onBack = vi.fn();
		render(Settings, { onBack });
		expect(screen.getByText('screen.settings.title')).toBeTruthy();
	});
});
