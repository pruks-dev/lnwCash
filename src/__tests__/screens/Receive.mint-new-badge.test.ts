/**
 * Test: Receive.svelte — TASK-4200 (INTENT-042 BLUEPRINT-042 v2)
 * Unknown-mint new badge in Cashu token preview.
 *
 * Acceptance:
 * 1. Preview mint row shows new badge when getMintConfig(decoded.mint) === undefined.
 * 2. Preview mint row shows NO badge when mint has a config.
 * 3. Badge text comes from i18n key screen.receive.mint_new_badge (no hardcoded text).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import Receive from '../../screens/Receive.svelte';
import { encodeToken } from '$lib/cashu/token';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: { subscribe(fn: (val: string) => void) { fn('en'); return () => {}; }, set() {} },
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn(),
	getCurrentScreen: () => 'receive',
	onRouteChange: () => () => {},
	getHashParam: () => null,
	clearHashParams: vi.fn()
}));

// Controllable getMintConfig — same single source the auto-add path uses.
const KNOWN_MINT = 'https://known.mint';
const UNKNOWN_MINT = 'https://brand-new-unknown.mint';
const mockGetMintConfig = vi.fn((url: string) =>
	url === KNOWN_MINT ? { name: 'Known Mint', url: KNOWN_MINT } : undefined
);
vi.mock('$lib/wallet/store', () => ({
	getMintConfig: (url: string) => mockGetMintConfig(url),
	getActiveMintUrl: () => 'https://mint.lnw.cash',
	setActiveMintUrl: vi.fn(),
	activeMintStore: {
		subscribe: vi.fn(() => () => {}),
		set: vi.fn()
	}
}));

function makeToken(mint: string): string {
	return encodeToken(
		[{ id: '0091c8508c21f241', amount: 21, secret: 'test-secret', C: '02test' }],
		mint,
		'sat',
		undefined,
		true // legacy cashuA JSON — deterministic, no CBOR dependency
	);
}

async function openPreview(mint: string) {
	render(Receive, {});
	const cashuTab = screen.getByRole('tab', { name: /screen.receive.tab_cashu/ });
	await fireEvent.click(cashuTab);
	const textarea = screen.getByLabelText('screen.receive.paste_token');
	await fireEvent.input(textarea, { target: { value: makeToken(mint) } });
	await fireEvent.click(screen.getByText('screen.receive.validate_token'));
}

describe('Receive preview new badge (TASK-4200 / INTENT-042 / TASK-4209)', () => {
	beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	it('shows new badge when token mint has no config', async () => {
		await openPreview(UNKNOWN_MINT);
		expect(mockGetMintConfig).toHaveBeenCalledWith(UNKNOWN_MINT);
		const badge = document.querySelector('.mint-new-badge');
		expect(badge).toBeTruthy();
		expect(badge?.textContent).toBe('screen.receive.mint_new_badge');
	});

	it('shows NO badge when token mint has a config', async () => {
		await openPreview(KNOWN_MINT);
		expect(mockGetMintConfig).toHaveBeenCalledWith(KNOWN_MINT);
		expect(document.querySelector('.mint-new-badge')).toBeNull();
		// preview itself still renders (consent = preview only, no extra modal)
		expect(screen.getByText('screen.receive.token_preview')).toBeTruthy();
	});
});
