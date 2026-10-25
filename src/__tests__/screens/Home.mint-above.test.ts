/**
 * TASK-4001 (INTENT-040, BLUEPRINT-040 v1) — Home.svelte badge zone:
 * Mint: line ABOVE badge (above — not inside/below), reactive via
 * activeMintStore, display name (name || short host fallback) + full URL
 * in title, i18n key screen.home.active_mint (TH=EN, no hardcode),
 * fiat centered + 8/16/4 spacing (mockup R5 APPROVE).
 *
 * SCOPED file-only (L-P033): touches NOTHING outside TASK-4001 slice —
 * balance logic (INTENT-015), discover/add/remove/switch logic (INTENT-038),
 * NUT-13/09/restore/DLEQ/send/selectProofs are mocked-or-untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Home from '../../screens/Home.svelte';
import enJson from '../../locales/en.json';
import thJson from '../../locales/th.json';
import {
	setMintConfig,
	setActiveMintUrl,
	getActiveMintUrl
} from '$lib/wallet/store';

// ─── Mocks (display-only; source logic untouched) ───

// hoisted (vitest executes mock factories before module init —
// top-level bindings are NOT visible inside factories)
const mocks = vi.hoisted(() => {
	return { navigateTo: vi.fn() };
});

// svelte-i18n _: echo the KEY (repo precedent). Rendered output therefore
// contains 'screen.home.active_mint' itself — proof the label comes from
// i18n (no hardcoded "Mint:" in Home.svelte). The key's real TH=EN value
// ("Mint:") is asserted separately against the JSON files below.
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

// Router — navigation spy only.
vi.mock('$lib/router', () => ({
	navigateTo: (screen: string) => mocks.navigateTo(screen),
	getCurrentScreen: () => 'home',
	onRouteChange: () => () => {}
}));

// Balance — fixed active-mint balance (INTENT-015 logic NOT touched,
// only the async boundary is stubbed).
vi.mock('$lib/wallet/balance', () => ({
	getBalanceByMint: async (_mintUrl: string) => 8200
}));

// Connectivity — online, no flips.
vi.mock('$lib/wallet/offline', () => ({
	isOnline: () => true,
	onConnectivityChange: (_cb: (online: boolean) => void) => () => {}
}));

// NOTE: '$lib/wallet/store' is the REAL module — reactivity proof
// (setActiveMintUrl → Mint: line updates) goes through production code.

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

const MINT_B = {
	url: 'https://testnut.example:3338',
	name: '', // no name → short host fallback
	pubkey: '03'.padEnd(66, '0'),
	version: 'Nutshell/0.20.1',
	supported_nuts: ['04'],
	cached_endpoints: [],
	ttl: 0,
	last_info_fetch: 0
};

function seedMints(activeUrl: string) {
	setMintConfig({ ...MINT_A });
	setMintConfig({ ...MINT_B });
	setActiveMintUrl(activeUrl);
}

describe('TASK-4001 — Home Mint: line above badge', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		sessionStorage.clear();
		// Defensive: jsdom has no rAF; first-load path must not animate.
		vi.stubGlobal(
			'requestAnimationFrame',
			(cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number
		);
		vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it('i18n key screen.home.active_mint exists with TH=EN "Mint:"', () => {
		const th = thJson as unknown as Record<string, string>;
		const en = enJson as unknown as Record<string, string>;
		expect(th['screen.home.active_mint']).toBe('Mint:');
		expect(en['screen.home.active_mint']).toBe('Mint:');
	});

	it('renders Mint: line ABOVE the badge (layout ยอด → Mint: → badge)', async () => {
		seedMints(MINT_A.url);
		render(Home, {});
		await vi.waitFor(
			() => {
				expect(document.querySelector('.mint-above')).toBeTruthy();
			},
			{ timeout: 3000 }
		);
		const mintAbove = document.querySelector('.mint-above') as HTMLElement;
		const status = document.querySelector('.balance-status') as HTMLElement;
		expect(status).toBeTruthy();
		// above = same parent, mint line precedes badge in DOM order
		expect(mintAbove.parentElement).toBe(status.parentElement);
		expect(
			// eslint-disable-next-line no-bitwise
			Boolean(mintAbove.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING)
		).toBe(true);
		// badge itself holds ONLY online/offline — Mint: is NOT inside it
		expect(status.textContent).not.toContain('Mint:');
	});

	it('shows i18n label + mint NAME (not url) with full url in title', async () => {
		seedMints(MINT_A.url);
		expect(getActiveMintUrl()).toBe(MINT_A.url);
		render(Home, {});
		await vi.waitFor(
			() => {
				expect(document.querySelector('.mint-above .mint-name')?.textContent).toBe(MINT_A.name);
			},
			{ timeout: 3000 }
		);
		const line = document.querySelector('.mint-above') as HTMLElement;
		// key-echo i18n mock: rendered label IS the key → proves no hardcoded "Mint:"
		expect(line.textContent).toContain('screen.home.active_mint');
		expect(line.textContent).not.toContain(MINT_A.url);
		const strong = document.querySelector('.mint-above .mint-name') as HTMLElement;
		expect(strong.getAttribute('title')).toBe(MINT_A.url);
	});

	it('falls back to short host when mint has no name', async () => {
		seedMints(MINT_B.url);
		render(Home, {});
		await vi.waitFor(
			() => {
				expect(document.querySelector('.mint-above .mint-name')?.textContent).toBe(
					'testnut.example:3338'
				);
			},
			{ timeout: 3000 }
		);
		const strong = document.querySelector('.mint-above .mint-name') as HTMLElement;
		expect(strong.getAttribute('title')).toBe(MINT_B.url);
	});

	it('switch active mint → Mint: line updates reactively', async () => {
		seedMints(MINT_A.url);
		render(Home, {});
		await vi.waitFor(
			() => {
				expect(document.querySelector('.mint-above .mint-name')?.textContent).toBe(MINT_A.name);
			},
			{ timeout: 3000 }
		);
		// production switch path (same call the Settings page uses)
		setActiveMintUrl(MINT_B.url);
		await vi.waitFor(
			() => {
				const strong = document.querySelector('.mint-above .mint-name') as HTMLElement;
				expect(strong?.textContent).toBe('testnut.example:3338');
				expect(strong?.getAttribute('title')).toBe(MINT_B.url);
			},
			{ timeout: 3000 }
		);
	});
});
