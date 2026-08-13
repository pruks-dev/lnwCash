/**
 * Test: Settings.svelte — TASK-220 PIN keypad shuffle toggle.
 *
 * Covers:
 *   - toggle defaults to OFF when settings.pin_shuffle is false/missing.
 *   - toggling ON persists via setSettings({ pin_shuffle: true }).
 *   - toggling OFF persists via setSettings({ pin_shuffle: false }).
 *   - toggle reflects a persisted `true` value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import Settings from '../../screens/Settings.svelte';
import { getSettings, setSettings } from '$lib/storage/local';

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

vi.mock('$lib/storage/local', () => ({
	getSettings: vi.fn(() => ({ language: 'en', theme: 'light', default_mint: '', pin_shuffle: false })),
	setSettings: vi.fn()
}));

vi.mock('$lib/wallet/autolock', () => ({
	getAutolockTimeout: vi.fn(() => 5),
	setAutolockTimeout: vi.fn(),
	startAutoLock: vi.fn(),
	lockNow: vi.fn(),
	AUTOLOCK_OPTIONS: [1, 5, 15, 30, 60, 0]
}));

const getToggle = () => screen.getByRole('checkbox', { name: 'settings.pin_shuffle.title' }) as HTMLInputElement;

describe('Settings PIN shuffle toggle (TASK-220)', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});
	afterEach(() => { cleanup(); });

	it('defaults to OFF when settings.pin_shuffle is false', () => {
		vi.mocked(getSettings).mockReturnValue({ language: 'en', theme: 'light', default_mint: '', pin_shuffle: false });
		render(Settings, {});
		expect(getToggle().checked).toBe(false);
	});

	it('defaults to OFF when settings.pin_shuffle is missing (legacy settings)', () => {
		vi.mocked(getSettings).mockReturnValue({ language: 'en', theme: 'light', default_mint: '' } as any);
		render(Settings, {});
		expect(getToggle().checked).toBe(false);
	});

	it('reflects a persisted ON value', () => {
		vi.mocked(getSettings).mockReturnValue({ language: 'en', theme: 'light', default_mint: '', pin_shuffle: true });
		render(Settings, {});
		expect(getToggle().checked).toBe(true);
	});

	it('persists ON via setSettings when toggled', async () => {
		vi.mocked(getSettings).mockReturnValue({ language: 'en', theme: 'light', default_mint: '', pin_shuffle: false });
		render(Settings, {});
		const toggle = getToggle();
		await fireEvent.click(toggle);
		expect(setSettings).toHaveBeenCalledWith({ pin_shuffle: true });
	});

	it('persists OFF via setSettings when toggled off', async () => {
		vi.mocked(getSettings).mockReturnValue({ language: 'en', theme: 'light', default_mint: '', pin_shuffle: true });
		render(Settings, {});
		const toggle = getToggle();
		await fireEvent.click(toggle);
		expect(setSettings).toHaveBeenCalledWith({ pin_shuffle: false });
	});
});
