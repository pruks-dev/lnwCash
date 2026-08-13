/**
 * Test: Settings.svelte Auto-lock section — TASK-210 Auto-lock timeout picker.
 *
 * NOTE: The raw native <select> was replaced (Approach A redesign) by a
 * ListItem that opens a bottom-sheet Modal picker. DOM queries here target
 * the new UI; the LOGIC assertions are unchanged:
 *   - startAutoLock() armed on mount
 *   - selecting a timeout calls setAutolockTimeout(value)
 *   - "Never" (0) calls setAutolockTimeout(0) and shows the warning
 *   - warning hidden for normal timeouts
 *   - manual "lock now" calls lockNow()
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

// The Auto-lock ListItem is a role=button whose accessible name contains the
// section key (title) + the current value (trailing).
const openPicker = async () => {
	await fireEvent.click(screen.getByRole('button', { name: /autolock_section/ }));
};

describe('Settings Auto-lock section (TASK-210)', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});
	afterEach(() => { cleanup(); });

	it('renders the auto-lock timeout control (list item)', () => {
		render(Settings, {});
		expect(screen.getByRole('button', { name: /autolock_section/ })).toBeTruthy();
	});

	it('arms the auto-lock timer on mount', () => {
		render(Settings, {});
		expect(startAutoLockMock).toHaveBeenCalled();
	});

	it('opens the picker and offers options 1/5/15/30/60/Never', async () => {
		render(Settings, {});
		await openPicker();
		for (const minutes of ['1', '5', '15', '30', '60']) {
			expect(
				screen.getByRole('button', { name: `${minutes} settings.autolock.minutes` })
			).toBeTruthy();
		}
		expect(screen.getByRole('button', { name: 'settings.autolock.never' })).toBeTruthy();
	});

	it('selecting a timeout calls setAutolockTimeout', async () => {
		render(Settings, {});
		await openPicker();
		await fireEvent.click(screen.getByRole('button', { name: '15 settings.autolock.minutes' }));
		expect(setAutolockTimeoutMock).toHaveBeenCalledWith(15);
	});

	it('shows the "Never" warning when Never is selected', async () => {
		render(Settings, {});
		await openPicker();
		await fireEvent.click(screen.getByRole('button', { name: 'settings.autolock.never' }));
		expect(setAutolockTimeoutMock).toHaveBeenCalledWith(0);
		expect(screen.getByText('settings.autolock.warning')).toBeTruthy();
	});

	it('does not show the "Never" warning for a normal timeout', () => {
		render(Settings, {});
		expect(screen.queryByText('settings.autolock.warning')).toBeNull();
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
