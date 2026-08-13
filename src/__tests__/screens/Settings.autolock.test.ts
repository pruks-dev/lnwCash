/**
 * Test: Settings.svelte Security section — TASK-210 Auto-lock dropdown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
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

vi.mock('$lib/storage/local', () => ({
	getSettings: vi.fn(() => ({ language: 'en', theme: 'light', default_mint: '' })),
	setSettings: vi.fn()
}));

const setAutolockTimeoutMock = vi.fn();
const startAutoLockMock = vi.fn();
const lockNowMock = vi.fn();

vi.mock('$lib/wallet/autolock', () => ({
	getAutolockTimeout: vi.fn(() => 5),
	setAutolockTimeout: (...args: unknown[]) => setAutolockTimeoutMock(...args),
	startAutoLock: (...args: unknown[]) => startAutoLockMock(...args),
	lockNow: (...args: unknown[]) => lockNowMock(...args),
	AUTOLOCK_OPTIONS: [1, 5, 15, 30, 60, 0]
}));

describe('Settings Security section (TASK-210)', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});
	afterEach(() => { cleanup(); });

	it('renders the auto-lock dropdown', () => {
		render(Settings, {});
		const select = screen.getByRole('combobox', { name: 'Auto-lock timeout' });
		expect(select).toBeTruthy();
	});

	it('offers options 1/5/15/30/60/Never', () => {
		render(Settings, {});
		const select = screen.getByRole('combobox', { name: 'Auto-lock timeout' }) as HTMLSelectElement;
		const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent?.trim());
		expect(options).toEqual(['1 min', '5 min', '15 min', '30 min', '60 min', 'Never']);
	});

	it('arms the auto-lock timer on mount', () => {
		render(Settings, {});
		expect(startAutoLockMock).toHaveBeenCalled();
	});

	it('selecting a timeout calls setAutolockTimeout', async () => {
		render(Settings, {});
		const select = screen.getByRole('combobox', { name: 'Auto-lock timeout' });
		await fireEvent.change(select, { target: { value: '15' } });
		expect(setAutolockTimeoutMock).toHaveBeenCalledWith(15);
	});

	it('shows the "Never" warning when Never is selected', async () => {
		render(Settings, {});
		const select = screen.getByRole('combobox', { name: 'Auto-lock timeout' });
		await fireEvent.change(select, { target: { value: '0' } });
		expect(setAutolockTimeoutMock).toHaveBeenCalledWith(0);
		expect(screen.getByText(/keeps your wallet unlocked/i)).toBeTruthy();
	});

	it('does not show the "Never" warning for a normal timeout', () => {
		render(Settings, {});
		expect(screen.queryByText(/keeps your wallet unlocked/i)).toBeNull();
	});

	// ── TASK-218: Manual "lock now" button ────────────────────

	it('renders a manual "lock now" button', () => {
		render(Settings, {});
		const btn = screen.getByRole('button', { name: 'settings.lock_now' });
		expect(btn).toBeTruthy();
	});

	it('clicking "lock now" calls lockNow (which locks + redirects)', async () => {
		render(Settings, {});
		const btn = screen.getByRole('button', { name: 'settings.lock_now' });
		await fireEvent.click(btn);
		expect(lockNowMock).toHaveBeenCalled();
	});
});
