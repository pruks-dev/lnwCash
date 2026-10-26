/**
 * Test: Receive.svelte — TASK-4202 (INTENT-042 BLUEPRINT-042 v2)
 * Cashu offline+new-mint human error message.
 *
 * Acceptance:
 * 1. Gate-2 error (message contains 'no denomination key in the keyset cache')
 *    → cashuError shows i18n key screen.receive.error_new_mint_offline
 *    (human TH=EN pair, no hardcoded text) + console keeps technical message.
 * 2. Other errors keep e.message unchanged.
 * 3. Broad decoys ('cache' / 'offline' alone) do NOT map — narrow gate only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
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

// Known mint (has config) — receive path mint is irrelevant to the mapper,
// but preview badge logic calls getMintConfig, so keep it defined.
const KNOWN_MINT = 'https://known.mint';
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

const mockReceiveTokens = vi.fn();
vi.mock('$lib/wallet/tokenStore', () => ({
	receiveTokens: (...args: unknown[]) => mockReceiveTokens(...args)
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

async function openPreviewAndReceive(mint: string) {
	render(Receive, {});
	const cashuTab = screen.getByRole('tab', { name: /screen.receive.tab_cashu/ });
	await fireEvent.click(cashuTab);
	const textarea = screen.getByLabelText('screen.receive.paste_token');
	await fireEvent.input(textarea, { target: { value: makeToken(mint) } });
	await fireEvent.click(screen.getByText('screen.receive.validate_token'));
	// preview → press Receive
	const receiveBtn = await screen.findByText('screen.receive.receive_token');
	await fireEvent.click(receiveBtn);
}

describe('Receive cashu offline+new-mint error (TASK-4202 / INTENT-042)', () => {
	beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	it('maps gate-2 error to human key + keeps technical message in console', async () => {
		const technical = 'receive failed: no denomination key in the keyset cache for id 0091c8508c21f241';
		mockReceiveTokens.mockRejectedValueOnce(new Error(technical));
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await openPreviewAndReceive(KNOWN_MINT);
		await waitFor(() => {
			expect(screen.getAllByText('screen.receive.error_new_mint_offline').length).toBeGreaterThanOrEqual(1);
		});
		// technical term preserved in log with full original message
		expect(warnSpy).toHaveBeenCalled();
		const logged = warnSpy.mock.calls.flat().join(' ');
		expect(logged).toContain('no denomination key in the keyset cache');
		warnSpy.mockRestore();
	});

	it('keeps other errors as e.message unchanged', async () => {
		mockReceiveTokens.mockRejectedValueOnce(new Error('mint exploded boom-4202'));
		await openPreviewAndReceive(KNOWN_MINT);
		await waitFor(() => {
			expect(screen.getAllByText('mint exploded boom-4202').length).toBeGreaterThanOrEqual(1);
		});
		expect(screen.queryByText('screen.receive.error_new_mint_offline')).toBeNull();
	});

	it('does NOT map broad cache/offline decoys', async () => {
		mockReceiveTokens.mockRejectedValueOnce(new Error('cache miss while offline, try again'));
		await openPreviewAndReceive(KNOWN_MINT);
		await waitFor(() => {
			expect(screen.getAllByText('cache miss while offline, try again').length).toBeGreaterThanOrEqual(1);
		});
		expect(screen.queryByText('screen.receive.error_new_mint_offline')).toBeNull();
	});
});
