/**
 * Test: Settings.svelte — TASK-220 Change PIN flow (3-step numpad).
 *
 * Covers:
 *   - "Change PIN" ListItem opens a modal with a numpad (step 1 = current PIN).
 *   - the 3-step flow auto-advances current → new → confirm, and on confirm
 *     changePin(current, new) is called with the correct args, a success toast
 *     fires, and the modal closes.
 *   - wrong current PIN (InvalidPinError) resets to step 1 and shows the error.
 *   - new PIN mismatch resets to step 2 and is rejected before calling changePin.
 *   - the "←" step-back button returns to the previous step.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import Settings from '../../screens/Settings.svelte';
import { InvalidPinError } from '$lib/wallet/errors';

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

const changePinMock = vi.fn();
vi.mock('$lib/wallet/state', () => ({
	changePin: (...args: unknown[]) => changePinMock(...args)
}));

const showToastMock = vi.fn();
vi.mock('$lib/stores/toast', () => ({
	showToast: (...args: unknown[]) => showToastMock(...args),
	toastMessage: { subscribe: () => () => {} },
	toastType: { subscribe: () => () => {} }
}));

const navigateToMock = vi.fn();
vi.mock('$lib/router', () => ({
	navigateTo: (...args: unknown[]) => navigateToMock(...args)
}));

async function openChangePinModal() {
	render(Settings, {});
	await fireEvent.click(screen.getByText('settings.change_pin.title'));
}

// Tap each digit on the (unshuffled) numpad in sequence.
async function tapDigits(digits: string) {
	for (const d of digits) {
		await fireEvent.click(screen.getByRole('button', { name: d }));
	}
}

describe('Settings Change PIN (TASK-220)', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		changePinMock.mockResolvedValue(undefined);
	});
	afterEach(() => { cleanup(); });

	it('renders a "Change PIN" item in the Security section', () => {
		render(Settings, {});
		expect(screen.getByText('settings.change_pin.title')).toBeTruthy();
	});

	it('opens a modal with a current-PIN step and numpad', async () => {
		await openChangePinModal();
		// Step 1 title + numpad (PinDots progressbar + digit keypad)
		expect(screen.getByText('settings.change_pin.current_pin')).toBeTruthy();
		expect(screen.getByRole('group', { name: 'PIN keypad' })).toBeTruthy();
		expect(screen.getByRole('progressbar')).toBeTruthy();
	});

	it('auto-advances through current → new → confirm and calls changePin with correct args', async () => {
		await openChangePinModal();
		await tapDigits('1234'); // step 1 → advances to step 2
		expect(screen.getByText('settings.change_pin.new_pin')).toBeTruthy();
		await tapDigits('5678'); // step 2 → advances to step 3
		expect(screen.getByText('settings.change_pin.confirm_new_pin')).toBeTruthy();
		await tapDigits('5678'); // step 3 → auto-submit

		await waitFor(() => expect(changePinMock).toHaveBeenCalledWith('1234', '5678'));
		expect(changePinMock).toHaveBeenCalledOnce();
		await waitFor(() => expect(showToastMock).toHaveBeenCalledWith('settings.change_pin.success', 'success'));
		// Modal closes after success
		expect(screen.queryByText('settings.change_pin.new_pin')).toBeNull();
	});

	it('shows wrong-PIN error and resets to step 1 when current PIN is invalid', async () => {
		changePinMock.mockRejectedValue(new InvalidPinError());
		await openChangePinModal();
		await tapDigits('0000');
		await tapDigits('5678');
		await tapDigits('5678');

		await waitFor(() => expect(screen.getByText('settings.change_pin.wrong_pin')).toBeTruthy());
		expect(showToastMock).not.toHaveBeenCalled();
		// Reset back to step 1 (current PIN) — modal stays open
		expect(screen.getByText('settings.change_pin.current_pin')).toBeTruthy();
	});

	it('rejects a mismatched new PIN without calling changePin and resets to step 2', async () => {
		await openChangePinModal();
		await tapDigits('1234');
		await tapDigits('5678');
		await tapDigits('9999'); // mismatch → rejected before changePin

		await waitFor(() => expect(screen.getByText('screen.register.error_mismatch')).toBeTruthy());
		expect(changePinMock).not.toHaveBeenCalled();
		// Reset back to step 2 (new PIN)
		expect(screen.getByText('settings.change_pin.new_pin')).toBeTruthy();
	});

	it('lets the user step back with the "←" back button', async () => {
		await openChangePinModal();
		await tapDigits('1234'); // now on step 2
		const modal = screen.getByRole('dialog');
		await fireEvent.click(within(modal).getByRole('button', { name: 'common.back' }));
		expect(screen.getByText('settings.change_pin.current_pin')).toBeTruthy();
	});

	it('does NOT show a "forgot PIN" link (recovery is only via Delete → recover)', async () => {
		await openChangePinModal();
		expect(screen.queryByText('settings.change_pin.forgot_pin')).toBeNull();
	});
});
