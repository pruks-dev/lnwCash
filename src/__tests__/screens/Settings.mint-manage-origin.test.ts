/**
 * TASK-4101 (INTENT-041, BLUEPRINT-041 v1) — Settings origin-aware Mint Manage.
 *
 * Contract (locked with TASK-4100): hash params mint=manage&origin=home.
 *   - mint=manage → auto-open Mint Manage (full-screen MintSettings, unchanged)
 *   - back with origin=home → navigateTo('home') + clearHashParams (never parks on list)
 *   - back with origin=setting / no param (ListItem entry) → settings list (unchanged)
 *
 * SCOPED file-only (L-P033): real $lib/router (no mock — proves the true
 * hash contract), MintSettings rendered for real (discover/add/balance
 * untouched — open/close flow only).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
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

vi.mock('$lib/wallet/autolock', () => ({
	getAutolockTimeout: vi.fn(() => 5),
	setAutolockTimeout: vi.fn(),
	startAutoLock: vi.fn(),
	lockNow: vi.fn(),
	AUTOLOCK_OPTIONS: [1, 5, 15, 30, 60, 0]
}));

vi.mock('$lib/wallet/state', () => ({
	changePin: vi.fn(),
	deleteWallet: vi.fn()
}));

vi.mock('$lib/wallet/seed', () => ({
	exportSeed: vi.fn()
}));

const LIST_TITLE = 'screen.settings.title';
const MANAGE_KEY = 'screen.settings.mint_manage';
const BACK_LABEL = 'common.back';

const isManageOpen = (container: HTMLElement) =>
	container.querySelector('.mint-manage-header') !== null;

const backBtn = () => screen.getByRole('button', { name: BACK_LABEL });

describe('Settings Mint Manage origin-aware back (TASK-4101)', () => {
	beforeEach(() => {
		localStorage.clear();
		window.location.hash = '#/settings';
	});

	afterEach(() => {
		cleanup();
		window.location.hash = '';
	});

	it('auto-opens Mint Manage on mount when hash has mint=manage&origin=home', async () => {
		window.location.hash = '#/settings?mint=manage&origin=home';
		const { container } = render(Settings, {});
		await tick();

		expect(isManageOpen(container)).toBe(true);
		// Settings list is hidden while the sub-view is open.
		expect(screen.queryByText(LIST_TITLE)).toBeNull();
	});

	it('back from home origin navigates home and clears params (never parks on list)', async () => {
		window.location.hash = '#/settings?mint=manage&origin=home';
		const { container } = render(Settings, {});
		await tick();
		expect(isManageOpen(container)).toBe(true);

		await fireEvent.click(backBtn());
		await tick();

		// Params consumed — browser back can no longer re-trigger auto-open.
		expect(window.location.hash.includes('?')).toBe(false);
		expect(window.location.hash.includes('mint=manage')).toBe(false);
		// Home route (navigateTo('home') → empty hash), not the settings list.
		expect(window.location.hash === '' || window.location.hash === '#/').toBe(true);
		expect(isManageOpen(container)).toBe(false);
	});

	it('ListItem entry (no param) still opens, back returns to settings list (regression)', async () => {
		window.location.hash = '#/settings';
		const { container } = render(Settings, {});
		await tick();
		expect(isManageOpen(container)).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: new RegExp(MANAGE_KEY) }));
		await tick();
		expect(isManageOpen(container)).toBe(true);

		const hashBeforeBack = window.location.hash;
		await fireEvent.click(backBtn());
		await tick();

		// Back to the settings list — hash untouched (no navigation away).
		expect(isManageOpen(container)).toBe(false);
		expect(screen.getByText(LIST_TITLE)).toBeTruthy();
		expect(window.location.hash).toBe(hashBeforeBack);
	});

	it('explicit origin=setting auto-opens, back returns to list and clears params', async () => {
		window.location.hash = '#/settings?mint=manage&origin=setting';
		const { container } = render(Settings, {});
		await tick();
		expect(isManageOpen(container)).toBe(true);

		await fireEvent.click(backBtn());
		await tick();

		expect(isManageOpen(container)).toBe(false);
		expect(screen.getByText(LIST_TITLE)).toBeTruthy();
		expect(window.location.hash.includes('?')).toBe(false);
		expect(window.location.hash.includes('settings')).toBe(true);
	});

	it('opens on hashchange to mint=manage (route-change path, not only mount)', async () => {
		window.location.hash = '#/settings';
		const { container } = render(Settings, {});
		await tick();
		expect(isManageOpen(container)).toBe(false);

		window.location.hash = '#/settings?mint=manage&origin=home';
		// jsdom fires hashchange asynchronously.
		await new Promise((r) => setTimeout(r, 0));
		await tick();

		expect(isManageOpen(container)).toBe(true);
	});
});
