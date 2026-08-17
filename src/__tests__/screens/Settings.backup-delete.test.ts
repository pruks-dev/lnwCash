/**
 * Test: Settings.svelte — TASK-265 Backup / Delete Wallet Data.
 *
 * Covers:
 *   - "View recovery phrase" opens a PIN-verify modal; the seed grid is ONLY
 *     shown after the correct PIN (exportSeed resolves) — never before.
 *   - wrong PIN shows an error and does NOT reveal the seed.
 *   - "Delete wallet data" requires PIN verify + explicit confirm; on confirm it
 *     calls deleteWallet() and redirects to the setup welcome.
 *   - delete does NOT run without the confirm step.
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
const deleteWalletMock = vi.fn();
vi.mock('$lib/wallet/state', () => ({
	changePin: (...args: unknown[]) => changePinMock(...args),
	deleteWallet: (...args: unknown[]) => deleteWalletMock(...args)
}));

const exportSeedMock = vi.fn();
vi.mock('$lib/wallet/seed', () => ({
	exportSeed: (...args: unknown[]) => exportSeedMock(...args)
}));

vi.mock('$lib/stores/toast', () => ({
	showToast: vi.fn(),
	toastMessage: { subscribe: () => () => {} },
	toastType: { subscribe: () => () => {} }
}));

const navigateToMock = vi.fn();
vi.mock('$lib/router', () => ({
	navigateTo: (...args: unknown[]) => navigateToMock(...args)
}));

const SEED_12 = 'abandon ability able about above absent absorb abstract absurd abuse access accident';

async function tapDigits(digits: string) {
	for (const d of digits) {
		await fireEvent.click(screen.getByRole('button', { name: d }));
	}
}

async function openBackupModal() {
	render(Settings, {});
	await fireEvent.click(screen.getByText('settings.backup.show_seed'));
}

describe('Settings Backup (TASK-265)', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});
	afterEach(() => { cleanup(); });

	it('renders a Backup section with a view-seed item', () => {
		render(Settings, {});
		expect(screen.getByText('settings.backup.title')).toBeTruthy();
		expect(screen.getByText('settings.backup.show_seed')).toBeTruthy();
		// No "Restore" item — recovery is only reachable via Delete → recover flow.
		expect(screen.queryByText('settings.backup.restore')).toBeNull();
	});

	it('does NOT show the seed before PIN verification', async () => {
		await openBackupModal();
		// PIN phase — no SeedGrid, no recovery phrase words on screen.
		expect(screen.getByText('settings.backup.verify_prompt')).toBeTruthy();
		expect(screen.queryByRole('list', { name: 'Recovery phrase' })).toBeNull();
		expect(screen.queryByText('abandon')).toBeNull();
	});

	it('shows the 12-word seed grid only after the correct PIN', async () => {
		exportSeedMock.mockResolvedValue(SEED_12);
		await openBackupModal();
		await tapDigits('1234');

		await waitFor(() => {
			const grid = screen.getByRole('list', { name: 'Recovery phrase' });
			expect(within(grid).getAllByRole('listitem')).toHaveLength(12);
		});
		expect(exportSeedMock).toHaveBeenCalledWith('1234');
		// paper-only / no-screenshot warnings are shown alongside the seed
		expect(screen.getByText('recovery.warning.title')).toBeTruthy();
		expect(screen.getByText('recovery.warning.no_screenshot')).toBeTruthy();
	});

	it('shows an error and keeps the seed hidden on wrong PIN', async () => {
		exportSeedMock.mockRejectedValue(new InvalidPinError());
		await openBackupModal();
		await tapDigits('0000');

		await waitFor(() => expect(screen.getByText('settings.backup.wrong_pin')).toBeTruthy());
		expect(screen.queryByRole('list', { name: 'Recovery phrase' })).toBeNull();
		expect(screen.queryByText('abandon')).toBeNull();
	});
});

describe('Settings Delete Wallet Data (TASK-265)', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});
	afterEach(() => { cleanup(); });

	it('renders a Delete Wallet Data danger button', () => {
		render(Settings, {});
		expect(screen.getByRole('button', { name: 'settings.delete.button' })).toBeTruthy();
	});

	it('requires PIN verify before showing the confirm dialog', async () => {
		exportSeedMock.mockResolvedValue(SEED_12);
		render(Settings, {});
		await fireEvent.click(screen.getByRole('button', { name: 'settings.delete.button' }));

		// PIN phase — no confirm warning yet.
		expect(screen.getByText('settings.delete.verify_prompt')).toBeTruthy();
		expect(screen.queryByText('settings.delete.confirm_title')).toBeNull();

		await tapDigits('1234');
		await waitFor(() => expect(screen.getByText('settings.delete.confirm_title')).toBeTruthy());
		expect(screen.getByText('settings.delete.warning')).toBeTruthy();
		// Not deleted yet — only the confirm dialog is shown.
		expect(deleteWalletMock).not.toHaveBeenCalled();
	});

	it('wrong PIN on delete shows an error and does not reach confirm', async () => {
		exportSeedMock.mockRejectedValue(new InvalidPinError());
		render(Settings, {});
		await fireEvent.click(screen.getByRole('button', { name: 'settings.delete.button' }));
		await tapDigits('0000');

		await waitFor(() => expect(screen.getByText('settings.delete.wrong_pin')).toBeTruthy());
		expect(screen.queryByText('settings.delete.confirm_title')).toBeNull();
		expect(deleteWalletMock).not.toHaveBeenCalled();
	});

	it('confirm deletes the wallet and redirects to setup welcome', async () => {
		exportSeedMock.mockResolvedValue(SEED_12);
		deleteWalletMock.mockResolvedValue(undefined);
		render(Settings, {});
		await fireEvent.click(screen.getByRole('button', { name: 'settings.delete.button' }));
		await tapDigits('1234');

		await waitFor(() => expect(screen.getByText('settings.delete.confirm_title')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'settings.delete.confirm_button' }));

		await waitFor(() => expect(deleteWalletMock).toHaveBeenCalledOnce());
		expect(navigateToMock).toHaveBeenCalledWith('setup');
	});

	it('cancel on confirm dialog does not delete', async () => {
		exportSeedMock.mockResolvedValue(SEED_12);
		render(Settings, {});
		await fireEvent.click(screen.getByRole('button', { name: 'settings.delete.button' }));
		await tapDigits('1234');
		await waitFor(() => expect(screen.getByText('settings.delete.confirm_title')).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
		expect(deleteWalletMock).not.toHaveBeenCalled();
	});
});
