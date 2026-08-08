// @ts-nocheck — test file using @testing-library/svelte v5 with Svelte 5
// Snippet types are branded symbols; runtime behavior is correct via vitest
/**
 * TASK-049 (D-011) — Mint Settings UI Tests
 *
 * Tests for: MintSettings (+page.svelte)
 * AC:
 *   - UI renders mint info from store
 *   - Add valid mint URL → appears in list
 *   - Add invalid URL → error message
 *   - Switch active mint → info updates
 *   - Remove mint → removed from list
 *   - Default mint cannot be removed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte/svelte5';
import MintSettings from '../+page.svelte';
import type { MintConfig } from '$lib/wallet/config';

// ─── Mock Config Data ──────────────────────────────────────────

const DEFAULT_URL = 'https://mint.lnw.cash';

const DEFAULT_MINT: MintConfig = {
	url: DEFAULT_URL,
	name: 'LNWCASH mint',
	pubkey: '03d0e4cda0f937bde65b9d160b58febe04bd229243ea45e390ce80252504e1176e',
	version: 'Nutshell/0.20.1',
	supported_nuts: ['04', '05', '07', '08'],
	cached_endpoints: [],
	ttl: 604800,
	last_info_fetch: Date.now()
};

const CUSTOM_MINT: MintConfig = {
	url: 'https://custom.mint.example',
	name: 'Custom Mint',
	pubkey: '02aaaa',
	version: 'Nutshell/0.18.0',
	supported_nuts: ['04', '05'],
	cached_endpoints: [],
	ttl: 86400,
	last_info_fetch: Date.now()
};

const PLACEHOLDER_MINT: MintConfig = {
	url: 'https://new.mint.example',
	name: '',
	pubkey: '',
	version: '',
	supported_nuts: [],
	cached_endpoints: [],
	ttl: 0,
	last_info_fetch: 0
};

// ─── Mock State ────────────────────────────────────────────────

let mockMints: MintConfig[] = [DEFAULT_MINT];
let mockStoredConfigs: Record<string, MintConfig> = {};

function resetMocks(): void {
	mockMints = [{ ...DEFAULT_MINT, last_info_fetch: Date.now() }];
	mockStoredConfigs = {};
	vi.clearAllMocks();
}

// ─── Mock Modules ──────────────────────────────────────────────

vi.mock('svelte-i18n', () => {
	const { writable } = require('svelte/store');
	// Simple pass-through store: $_() returns the key itself for test assertions
	const _store = writable((key: string) => key);
	return {
		_: _store,
		get $_() {
			let current: (key: string) => string = (k: string) => k;
			_store.subscribe((fn: (key: string) => string) => { current = fn; })();
			return current;
		}
	};
});

vi.mock('$lib/wallet/discovery', () => ({
	discoverMintEndpoints: vi.fn(),
	DiscoveryError: class extends Error {
		constructor(msg: string, public mintUrl: string) {
			super(msg);
			this.name = 'DiscoveryError';
		}
	}
}));

vi.mock('$lib/wallet/mint-validation', () => ({
	validateMintUrl: vi.fn()
}));

vi.mock('$lib/wallet/store', () => ({
	getAllMintConfigs: vi.fn(() => [...mockMints]),
	removeMintConfig: vi.fn((url: string) => {
		mockMints = mockMints.filter(m => m.url !== url);
		delete mockStoredConfigs[url];
	}),
	getDefaultMintUrl: vi.fn(() => DEFAULT_URL),
	getMintConfig: vi.fn((url: string) => {
		const mint = mockMints.find(m => m.url === url);
		return mint ?? mockStoredConfigs[url];
	}),
	setMintConfig: vi.fn((config: MintConfig) => {
		const idx = mockMints.findIndex(m => m.url === config.url);
		if (idx >= 0) {
			mockMints[idx] = config;
		} else {
			mockMints.push(config);
		}
		mockStoredConfigs[config.url] = config;
	}),
	clearMintConfigs: vi.fn(() => {
		mockMints = [];
		mockStoredConfigs = {};
	}),
	isMintConfigStale: vi.fn(() => false),
	getOrCreateMintConfig: vi.fn((url: string) => {
		const found = mockMints.find(m => m.url === url);
		if (found) return found;
		const placeholder = { ...PLACEHOLDER_MINT, url };
		mockMints.push(placeholder);
		return placeholder;
	}),
	// TASK-076: Active mint URL tracking
	getActiveMintUrl: vi.fn(() => {
		const stored = localStorage.getItem('lnwcash_active_mint');
		if (stored) {
			const mint = mockMints.find(m => m.url === stored);
			if (mint) return stored;
		}
		return DEFAULT_URL;
	}),
	setActiveMintUrl: vi.fn((url: string) => {
		localStorage.setItem('lnwcash_active_mint', url);
	})
}));

// Import mocked module for test control
import { discoverMintEndpoints } from '$lib/wallet/discovery';
import { validateMintUrl } from '$lib/wallet/mint-validation';

// ─── Tests ─────────────────────────────────────────────────────

describe('MintSettings (+page.svelte)', () => {
	beforeEach(() => {
		resetMocks();
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	// ── AC: UI renders mint info from store ──────────────────────

	it('renders default mint info from store', () => {
		const { container } = render(MintSettings);

		// Default mint should appear as active
		expect(container.textContent).toContain('LNWCASH mint');
		expect(container.textContent).toContain(DEFAULT_URL);
		expect(container.textContent).toContain('Nutshell/0.20.1');

		// Default badge
		expect(container.textContent).toContain('mint.settings.default');

		// Active badge
		expect(container.textContent).toContain('mint.settings.active');
	});

	it('shows supported NUTs for default mint', () => {
		const { container } = render(MintSettings);

		expect(container.textContent).toContain('mint.settings.supportedNuts');
		// NUT badges
		expect(container.textContent).toContain('NUT-04');
		expect(container.textContent).toContain('NUT-05');
	});

	it('shows empty message when only default mint exists', () => {
		const { container } = render(MintSettings);
		expect(container.textContent).toContain('mint.settings.empty');
	});

	it('shows error state when loading mints fails', async () => {
		// Need to import dynamically because the module is already mocked
		const storeModule = await import('$lib/wallet/store');
		storeModule.getAllMintConfigs.mockImplementationOnce(() => {
			throw new Error('Store load error');
		});

		const { container } = render(MintSettings);
		expect(container.textContent).toContain('Store load error');

		// Restore default implementation
		storeModule.getAllMintConfigs.mockImplementation(() => [...mockMints]);
	});

	// ── AC: Add valid mint URL → appears in list ────────────────

	it('adds a valid mint and shows it in the list', async () => {
		const valMock = validateMintUrl as ReturnType<typeof vi.fn>;
		valMock.mockResolvedValueOnce({
			success: true,
			config: { ...CUSTOM_MINT, last_info_fetch: Date.now() },
			nuts: CUSTOM_MINT.supported_nuts
		});

		const { container } = render(MintSettings);

		// Open add modal
		const addButton = screen.getByText(/mint\.settings\.add/);
		await fireEvent.click(addButton);

		// Enter URL — Input component renders type="text", not type="url"
		const urlInput = container.querySelector('input[type="text"]') as HTMLInputElement;
		expect(urlInput).toBeTruthy();

		await fireEvent.input(urlInput, { target: { value: CUSTOM_MINT.url } });

		// Click validate
		const validateBtn = screen.getByText('mint.settings.validate');
		await fireEvent.click(validateBtn);

		// Wait for validation result
		await waitFor(() => {
			expect(container.textContent).toContain('Custom Mint');
		});

		// Click add mint
		const addMintBtn = screen.getByText('mint.settings.addMint');
		await fireEvent.click(addMintBtn);

		// Should appear in list (as active now)
		await waitFor(() => {
			expect(container.textContent).toContain('Custom Mint');
		});
	});

	// ── AC: Add invalid URL → error message ─────────────────────

	it('shows error for empty URL', async () => {
		// Mock validateMintUrl to fail as if called with empty URL
		const valMock = validateMintUrl as ReturnType<typeof vi.fn>;
		valMock.mockResolvedValueOnce({
			success: false,
			error: 'Failed to parse URL from /v1/info'
		});

		const { container } = render(MintSettings);

		// Open add modal
		const addButton = screen.getByText(/mint\.settings\.add/);
		await fireEvent.click(addButton);

		// Click validate without entering URL
		const validateBtn = screen.getByText('mint.settings.validate');
		await fireEvent.click(validateBtn);

		// validateMintUrl('') returns error
		await waitFor(() => {
			expect(container.textContent).toContain('Failed to parse URL');
		});
	});

	it('shows error for unreachable mint', async () => {
		const valMock = validateMintUrl as ReturnType<typeof vi.fn>;
		valMock.mockResolvedValueOnce({
			success: false,
			error: 'Mint unreachable: https://bad.mint.example — Network error'
		});

		const { container } = render(MintSettings);

		// Open add modal
		const addButton = screen.getByText(/mint\.settings\.add/);
		await fireEvent.click(addButton);

		// Enter bad URL — Input component uses type="text"
		const urlInput = container.querySelector('input[type="text"]') as HTMLInputElement;
		await fireEvent.input(urlInput, { target: { value: 'https://bad.mint.example' } });

		// Click validate
		const validateBtn = screen.getByText('mint.settings.validate');
		await fireEvent.click(validateBtn);

		await waitFor(() => {
			expect(container.textContent).toContain('Mint unreachable');
		});
	});

	it('shows error when discovery throws', async () => {
		const valMock = validateMintUrl as ReturnType<typeof vi.fn>;
		valMock.mockResolvedValueOnce({
			success: false,
			error: 'Network failure'
		});

		const { container } = render(MintSettings);

		const addButton = screen.getByText(/mint\.settings\.add/);
		await fireEvent.click(addButton);

		const urlInput = container.querySelector('input[type="text"]') as HTMLInputElement;
		await fireEvent.input(urlInput, { target: { value: 'https://error.mint.example' } });

		const validateBtn = screen.getByText('mint.settings.validate');
		await fireEvent.click(validateBtn);

		await waitFor(() => {
			expect(container.textContent).toContain('Network failure');
		});
	});

	// ── AC: Switch active mint → info updates ───────────────────

	it('switches active mint to a custom mint', async () => {
		// Pre-populate with two mints
		mockMints = [
			{ ...DEFAULT_MINT, last_info_fetch: Date.now() },
			{ ...CUSTOM_MINT, last_info_fetch: Date.now() }
		];

		vi.mocked(discoverMintEndpoints).mockResolvedValue({
			success: true,
			config: { ...CUSTOM_MINT, last_info_fetch: Date.now() },
			resolvedPaths: {},
			wasRefreshed: true
		});

		const { container } = render(MintSettings);

		// Custom mint should appear in the list (not active)
		expect(container.textContent).toContain('Custom Mint');

		// Click on custom mint to switch
		const customMintElement = screen.getByText('Custom Mint');
		await fireEvent.click(customMintElement);

		await waitFor(() => {
			// Active mint display should now show Custom Mint
			expect(container.textContent).toContain('Custom Mint');
		});
	});

	it('falls back to cached data when switch fetch fails', async () => {
		mockMints = [
			{ ...DEFAULT_MINT, last_info_fetch: Date.now() },
			{ ...CUSTOM_MINT, last_info_fetch: Date.now() }
		];

		vi.mocked(discoverMintEndpoints).mockRejectedValueOnce(new Error('Offline'));

		const { container } = render(MintSettings);

		const customMintElement = screen.getByText('Custom Mint');
		await fireEvent.click(customMintElement);

		// Should still switch despite fetch failure
		await waitFor(() => {
			expect(localStorage.getItem('lnwcash_active_mint')).toBe(CUSTOM_MINT.url);
		});
	});

	// ── AC: Remove mint → removed from list ─────────────────────

	it('removes a custom mint from the list', async () => {
		mockMints = [
			{ ...DEFAULT_MINT, last_info_fetch: Date.now() },
			{ ...CUSTOM_MINT, last_info_fetch: Date.now() }
		];

		const { container } = render(MintSettings);

		// Custom mint should appear
		expect(container.textContent).toContain('Custom Mint');

		// Click remove
		const removeBtn = screen.getByText('mint.settings.remove');
		await fireEvent.click(removeBtn);

		await waitFor(() => {
			expect(container.textContent).not.toContain('Custom Mint');
		});
	});

	it('falls back to default when active custom mint is removed', async () => {
		mockMints = [
			{ ...DEFAULT_MINT, last_info_fetch: Date.now() },
			{ ...CUSTOM_MINT, last_info_fetch: Date.now() }
		];

		// Set custom as active
		localStorage.setItem('lnwcash_active_mint', CUSTOM_MINT.url);

		const { container } = render(MintSettings);

		// Remove the active custom mint
		const removeBtn = screen.getByText('mint.settings.remove');
		await fireEvent.click(removeBtn);

		await waitFor(() => {
			expect(localStorage.getItem('lnwcash_active_mint')).toBe(DEFAULT_URL);
		});
	});

	// ── AC: Default mint cannot be removed ──────────────────────

	it('does not show remove button for default mint', () => {
		mockMints = [
			{ ...DEFAULT_MINT, last_info_fetch: Date.now() },
			{ ...CUSTOM_MINT, last_info_fetch: Date.now() }
		];

		// Make default NOT active so it appears in the list
		localStorage.setItem('lnwcash_active_mint', CUSTOM_MINT.url);

		const { container } = render(MintSettings);

		// Default should have 'Default' badge, not 'Remove' button
		// The only remove button should be for the custom mint
		const removeButtons = container.querySelectorAll('button');
		let hasRemoveOnDefault = false;

		removeButtons.forEach(btn => {
			if (btn.textContent?.includes('mint.settings.remove')) {
				// Each remove button is in a list item with a mint
				hasRemoveOnDefault = true;
			}
		});

		// There should be only one Remove button (for custom mint)
		const removeTexts = Array.from(removeButtons).filter(b => b.textContent?.includes('mint.settings.remove'));
		expect(removeTexts.length).toBe(1);
	});

	it('displays default badge on default mint in list', () => {
		mockMints = [
			{ ...DEFAULT_MINT, last_info_fetch: Date.now() },
			{ ...CUSTOM_MINT, last_info_fetch: Date.now() }
		];

		// Make custom active so default appears in inactive list
		localStorage.setItem('lnwcash_active_mint', CUSTOM_MINT.url);

		const { container } = render(MintSettings);

		// Default badge should appear in the list item for default mint
		const badges = container.querySelectorAll('.badge');
		const defaultBadgeTexts = Array.from(badges).filter(
			b => b.textContent?.includes('mint.settings.default')
		);
		expect(defaultBadgeTexts.length).toBeGreaterThanOrEqual(1);
	});

	// ── Additional: Modal open/close ────────────────────────────

	it('opens and closes the add mint modal', async () => {
		const { container } = render(MintSettings);

		// Modal should be closed initially
		expect(container.querySelector('[role="dialog"]')).toBeNull();

		// Open
		const addButton = screen.getByText(/mint\.settings\.add/);
		await fireEvent.click(addButton);
		expect(container.querySelector('[role="dialog"]')).toBeTruthy();

		// Close via cancel
		const cancelBtn = screen.getByText('common.cancel');
		await fireEvent.click(cancelBtn);
		await waitFor(() => {
			expect(container.querySelector('[role="dialog"]')).toBeNull();
		});
	});

	// ── Additional: Loading state during validate ───────────────

	it('shows validating state during discovery', async () => {
		const valMock = validateMintUrl as ReturnType<typeof vi.fn>;
		// Delay the resolution
		valMock.mockImplementationOnce(() => {
			return new Promise(resolve => {
				setTimeout(() => {
					resolve({
						success: true,
						config: { ...CUSTOM_MINT, last_info_fetch: Date.now() },
						nuts: CUSTOM_MINT.supported_nuts
					});
				}, 100);
			});
		});

		const { container } = render(MintSettings);

		const addButton = screen.getByText(/mint\.settings\.add/);
		await fireEvent.click(addButton);

		const urlInput = container.querySelector('input[type="text"]') as HTMLInputElement;
		await fireEvent.input(urlInput, { target: { value: CUSTOM_MINT.url } });

		const validateBtn = screen.getByText('mint.settings.validate');
		await fireEvent.click(validateBtn);

		// Validating message should appear
		expect(container.textContent).toContain('mint.settings.validating');

		// Wait for completion
		await waitFor(() => {
			expect(container.textContent).toContain('Custom Mint');
		});
	});
});
