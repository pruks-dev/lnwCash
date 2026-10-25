/**
 * TASK-4100 (INTENT-041, BLUEPRINT-041 v1) — Home Mint: line clickable:
 * <p class="mint-above"> → <button type="button" class="mint-above"> —
 * whole line clickable → Mint Manage (hash mint=manage&origin=home),
 * look unchanged (R14), aria-label reuses existing key (no new key, L-D002).
 *
 * SCOPED file-only (L-P033): touches NOTHING outside TASK-4100 slice —
 * balance/spendable/proofsDb (INTENT-040), discover/add (INTENT-038),
 * Mint Manage internals, router, theme, copy are mocked-or-untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Home from '../../screens/Home.svelte';
import enJson from '../../locales/en.json';
import thJson from '../../locales/th.json';
import { setMintConfig, setActiveMintUrl } from '$lib/wallet/store';

// ─── Mocks (display-only; source logic untouched) ───

const mocks = vi.hoisted(() => {
	return { navigateTo: vi.fn() };
});

// svelte-i18n _: echo the KEY (repo precedent — same as Home.mint-above.test.ts).
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
		init() {},
		register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

// Router — navigation spy only (TASK-4100 writes window.location.hash
// directly — single history entry — so hash is asserted, not the spy).
vi.mock('$lib/router', () => ({
	navigateTo: (screen: string) => mocks.navigateTo(screen),
	getCurrentScreen: () => 'home',
	onRouteChange: () => () => {}
}));

// Balance — fixed active-mint balance (INTENT-015 logic NOT touched).
vi.mock('$lib/wallet/balance', () => ({
	getBalanceByMint: async (_mintUrl: string) => 8200
}));

// Connectivity — online, no flips.
vi.mock('$lib/wallet/offline', () => ({
	isOnline: () => true,
	onConnectivityChange: (_cb: (online: boolean) => void) => () => {}
}));

// ─── Fixtures ───

const MINT_A = {
	url: 'https://mint.nutstash.app',
	name: 'Nutstash Test',
	pubkey: '02'.padEnd(66, '0'),
	version: 'Nutshell/0.20.1',
	supported_nuts: ['04', '07', '08'],
	cached_endpoints: [],
	ttl: 0,
	last_info_fetch: 0
};

function seedMints(activeUrl: string) {
	setMintConfig({ ...MINT_A });
	setActiveMintUrl(activeUrl);
}

async function renderMintLine() {
	seedMints(MINT_A.url);
	render(Home, {});
	await vi.waitFor(
		() => {
			expect(document.querySelector('.mint-above .mint-name')?.textContent).toBe(MINT_A.name);
		},
		{ timeout: 3000 }
	);
	return document.querySelector('.mint-above') as HTMLElement;
}

describe('TASK-4100 — Home Mint: line is a whole-line button to Mint Manage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		sessionStorage.clear();
		window.location.hash = '';
		vi.stubGlobal(
			'requestAnimationFrame',
			(cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number
		);
		vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
	});

	afterEach(() => {
		cleanup();
		window.location.hash = '';
		vi.unstubAllGlobals();
	});

	it('renders .mint-above as <button type="button"> (not <p>)', async () => {
		const line = await renderMintLine();
		expect(line.tagName).toBe('BUTTON');
		expect(line.getAttribute('type')).toBe('button');
		expect(document.querySelector('p.mint-above')).toBeNull();
	});

	it('clicking ANYWHERE on the line navigates with mint=manage&origin=home', async () => {
		const line = await renderMintLine();
		// click the line itself (not the inner <strong>) — whole-line hit area
		await fireEvent.click(line);
		expect(window.location.hash).toContain('/settings');
		expect(window.location.hash).toContain('mint=manage');
		expect(window.location.hash).toContain('origin=home');
	});

	it('clicking the mint NAME also navigates (same button, single target)', async () => {
		const line = await renderMintLine();
		const name = line.querySelector('.mint-name') as HTMLElement;
		expect(name).toBeTruthy();
		await fireEvent.click(name);
		expect(window.location.hash).toContain('mint=manage&origin=home');
	});

	it('is keyboard-operable native button with accessible name (no new i18n key)', async () => {
		const line = await renderMintLine();
		// native <button type="button"> → focusable + Enter/Space activate (no JS key handler needed)
		expect(line.tagName).toBe('BUTTON');
		// key-echo i18n mock: aria-label IS the reused key → proves no hardcoded label
		expect(line.getAttribute('aria-label')).toBe('screen.settings.mint_manage');
	});

	it('reused aria key exists in TH+EN (L-D002 — no new key added)', () => {
		const th = thJson as unknown as Record<string, string>;
		const en = enJson as unknown as Record<string, string>;
		expect(en['screen.settings.mint_manage']).toBe('Manage Mint');
		expect(th['screen.settings.mint_manage']).toBe('จัดการ Mint');
		expect(en['screen.home.active_mint']).toBe('Mint:');
		expect(th['screen.home.active_mint']).toBe('Mint:');
	});

	it('keeps Mint: content — i18n label + name + full url in title (R14 look)', async () => {
		const line = await renderMintLine();
		expect(line.textContent).toContain('screen.home.active_mint');
		const strong = line.querySelector('.mint-name') as HTMLElement;
		expect(strong.textContent).toBe(MINT_A.name);
		expect(strong.getAttribute('title')).toBe(MINT_A.url);
	});
});
