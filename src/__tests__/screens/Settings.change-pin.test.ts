/**
 * Test: Settings.svelte — TASK-220 Change PIN flow.
 *
 * Covers:
 *   - "Change PIN" ListItem opens a modal with current/new/confirm inputs.
 *   - verify → set new PIN ×2 → changePin(current, new) is called with the
 *     correct args, a success toast fires, and the modal closes.
 *   - wrong current PIN (InvalidPinError) shows the wrong-PIN error.
 *   - new PIN mismatch is rejected before calling changePin.
 *   - "forgot PIN" link navigates to the setup (seed recovery) route.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
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

async function fillPinForm(current = '1234', next = '5678', confirm = '5678') {
	await fireEvent.input(screen.getByLabelText('settings.change_pin.current_pin'), { target: { value: current } });
	await fireEvent.input(screen.getByLabelText('settings.change_pin.new_pin'), { target: { value: next } });
	await fireEvent.input(screen.getByLabelText('settings.change_pin.confirm_new_pin'), { target: { value: confirm } });
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

	it('opens a modal with current/new/confirm PIN inputs', async () => {
		await openChangePinModal();
		expect(screen.getByLabelText('settings.change_pin.current_pin')).toBeTruthy();
		expect(screen.getByLabelText('settings.change_pin.new_pin')).toBeTruthy();
		expect(screen.getByLabelText('settings.change_pin.confirm_new_pin')).toBeTruthy();
	});

	it('verify → set → confirm calls changePin with the correct args, toasts, and closes', async () => {
		await openChangePinModal();
		await fillPinForm('1234', '5678', '5678');
		await fireEvent.click(screen.getByText('common.confirm'));

		await waitFor(() => expect(changePinMock).toHaveBeenCalledWith('1234', '5678'));
		expect(changePinMock).toHaveBeenCalledOnce();
		await waitFor(() => expect(showToastMock).toHaveBeenCalledWith('settings.change_pin.success', 'success'));
		// Modal closes after success
		expect(screen.queryByLabelText('settings.change_pin.new_pin')).toBeNull();
	});

	it('shows wrong-PIN error when current PIN is invalid (InvalidPinError)', async () => {
		changePinMock.mockRejectedValue(new InvalidPinError());
		await openChangePinModal();
		await fillPinForm('0000', '5678', '5678');
		await fireEvent.click(screen.getByText('common.confirm'));

		await waitFor(() => expect(screen.getByText('settings.change_pin.wrong_pin')).toBeTruthy());
		expect(showToastMock).not.toHaveBeenCalled();
		// Modal stays open
		expect(screen.getByLabelText('settings.change_pin.new_pin')).toBeTruthy();
	});

	it('rejects a mismatched new PIN without calling changePin', async () => {
		await openChangePinModal();
		await fillPinForm('1234', '5678', '9999');
		await fireEvent.click(screen.getByText('common.confirm'));

		await waitFor(() => expect(screen.getByText('screen.register.error_mismatch')).toBeTruthy());
		expect(changePinMock).not.toHaveBeenCalled();
	});

	it('"forgot PIN" link navigates to the setup (seed recovery) route', async () => {
		await openChangePinModal();
		await fireEvent.click(screen.getByText('settings.change_pin.forgot_pin'));
		expect(navigateToMock).toHaveBeenCalledWith('setup');
	});
});
