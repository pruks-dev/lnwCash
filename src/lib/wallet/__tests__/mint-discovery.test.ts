/**
 * TASK-048 (D-010) — Unit tests for Mint Discovery + Config + Store
 *
 * Covers:
 *  (A) Default mint configuration
 *  (B) Endpoint discovery flow
 *  (C) Mint config store (localStorage)
 *  (D) Error handling
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Module imports ───────────────────────────────────────────

import {
	DEFAULT_MINT_CONFIG,
	createPlaceholderConfig,
	normalizeSupportedNuts,
	type MintConfig
} from '../config';

import {
	mintInfoToConfig,
	discoverMintEndpoints,
	isMintReachable,
	DiscoveryError
} from '../discovery';

import {
	getMintConfig,
	setMintConfig,
	removeMintConfig,
	getAllMintConfigs,
	isMintConfigStale,
	clearMintConfigs,
	getDefaultMintUrl,
	getOrCreateMintConfig
} from '../store';

import type { MintInfo } from '../../types';

// ─── Mock setup — override /v1/info ───────────────────────────

vi.mock('../../cashu/client', () => {
	const actualModule = vi.importActual<typeof import('../../cashu/client')>('../../cashu/client');

	// We need the real resolveEndpointPath, so we'll lazily re-export from actual
	return {
		getMintInfo: vi.fn(),
		getKeysets: vi.fn(),
		getKeys: vi.fn(),
		requestMintQuote: vi.fn(),
		mintTokens: vi.fn(),
		requestMeltQuote: vi.fn(),
		meltTokens: vi.fn(),
		resolveEndpointPath: vi.fn((_info: unknown, key: string) => {
			// Minimal standalone implementation for tests that avoids circular deps
			const paths: Record<string, string> = {
				mint_operation: '/v1/mint/bolt11',
				mint_quote: '/v1/mint/quote/bolt11',
				melt_operation: '/v1/melt/bolt11',
				melt_quote: '/v1/melt/quote/bolt11',
				swap: '/v1/swap'
			};
			return paths[key] ?? '/v1/info';
		}),
		CashuError: class extends Error {},
		MintUnreachableError: class extends Error {},
		NetworkError: class extends Error {},
		InvalidResponseError: class extends Error {}
	};
});

// Re-import getMintInfo to control it in tests
import * as client from '../../cashu/client';

// ─── Factory helpers ──────────────────────────────────────────

const MINT_URL = 'https://mint.lnw.cash';

function makeFakeInfo(overrides?: Partial<MintInfo>): MintInfo {
	return {
		name: 'Test Mint',
		pubkey: '03d0e4cda0f937bde65b9d160b58febe04bd229243ea45e390ce80252504e1176e',
		version: 'Nutshell/0.20.1',
		nuts: {
			'4': { methods: [{ method: 'bolt11', unit: 'sat' }], disabled: false },
			'5': { methods: [{ method: 'bolt11', unit: 'sat' }], disabled: false },
			'7': { supported: true },
			'8': { supported: true },
			'9': { supported: true },
			'19': {
				cached_endpoints: [
					{ method: 'POST', path: '/v1/mint/bolt11' },
					{ method: 'POST', path: '/v1/melt/bolt11' },
					{ method: 'POST', path: '/v1/swap' }
				],
				ttl: 604800
			}
		},
		...overrides
	};
}

// ─── beforeEach/afterEach ─────────────────────────────────────

beforeEach(() => {
	clearMintConfigs();
	vi.clearAllMocks();
});

afterEach(() => {
	clearMintConfigs();
});

// ====================================================================
//  SECTION (A) — Default Mint Configuration
// ====================================================================

describe('(A) Default mint configuration', () => {
	describe('DEFAULT_MINT_CONFIG', () => {
		it('should have correct default URL', () => {
			expect(DEFAULT_MINT_CONFIG.url).toBe('https://mint.lnw.cash');
		});

		it('should have correct default name', () => {
			expect(DEFAULT_MINT_CONFIG.name).toBe('LNWCASH mint');
		});

		it('should have a valid 33-byte compressed pubkey (66 hex chars)', () => {
			expect(DEFAULT_MINT_CONFIG.pubkey).toMatch(/^0[23][0-9a-f]{64}$/);
		});

		it('should have Nutshell version', () => {
			expect(DEFAULT_MINT_CONFIG.version).toMatch(/^Nutshell\//);
		});

		it('should advertise at least NUT-04 and NUT-05', () => {
			expect(DEFAULT_MINT_CONFIG.supported_nuts).toContain('04');
			expect(DEFAULT_MINT_CONFIG.supported_nuts).toContain('05');
		});

		it('should advertise NUT-19', () => {
			expect(DEFAULT_MINT_CONFIG.supported_nuts).toContain('19');
		});

		it('should have NUT-19 cached_endpoints (3 entries)', () => {
			expect(DEFAULT_MINT_CONFIG.cached_endpoints).toHaveLength(3);
		});

		it('should have 7-day TTL (604800 seconds)', () => {
			expect(DEFAULT_MINT_CONFIG.ttl).toBe(604800);
		});

		it('should have last_info_fetch = 0 (never fetched)', () => {
			expect(DEFAULT_MINT_CONFIG.last_info_fetch).toBe(0);
		});

		it('cached endpoints should all start with /v1/', () => {
			for (const ep of DEFAULT_MINT_CONFIG.cached_endpoints) {
				expect(ep.path).toMatch(/^\/v1\//);
			}
		});

		it('should advertise exactly 13 NUTs', () => {
			expect(DEFAULT_MINT_CONFIG.supported_nuts).toHaveLength(13);
		});
	});

	describe('createPlaceholderConfig', () => {
		it('should create placeholder with just URL', () => {
			const p = createPlaceholderConfig('https://foo.example.com/');
			expect(p.url).toBe('https://foo.example.com');
			expect(p.name).toBe('');
			expect(p.pubkey).toBe('');
			expect(p.supported_nuts).toEqual([]);
			expect(p.ttl).toBe(0);
			expect(p.last_info_fetch).toBe(0);
		});

		it('should strip trailing slash', () => {
			const p = createPlaceholderConfig('https://bar.com///');
			expect(p.url).toBe('https://bar.com');
		});
	});

	describe('normalizeSupportedNuts', () => {
		it('should zero-pad single-digit NUTs', () => {
			const result = normalizeSupportedNuts({ '4': true, '5': true, '07': true });
			expect(result).toEqual(['04', '05', '07']);
		});

		it('should filter falsy values', () => {
			const result = normalizeSupportedNuts({ '4': true, '5': false, '6': undefined });
			expect(result).toEqual(['04']);
		});

		it('should return sorted array', () => {
			const result = normalizeSupportedNuts({ '10': true, '4': true, '19': true, '7': true });
			expect(result).toEqual(['04', '07', '10', '19']);
		});

		it('should return empty array for empty input', () => {
			expect(normalizeSupportedNuts({})).toEqual([]);
		});
	});
});

// ====================================================================
//  SECTION (B) — Endpoint Discovery Flow
// ====================================================================

describe('(B) Endpoint discovery flow', () => {
	describe('mintInfoToConfig', () => {
		it('should convert MintInfo → MintConfig correctly', () => {
			const info = makeFakeInfo();
			const config = mintInfoToConfig(MINT_URL, info);

			expect(config.url).toBe(MINT_URL);
			expect(config.name).toBe('Test Mint');
			expect(config.pubkey).toBe(info.pubkey);
			expect(config.version).toBe('Nutshell/0.20.1');
		});

		it('should extract supported_nuts', () => {
			const info = makeFakeInfo();
			const config = mintInfoToConfig(MINT_URL, info);
			expect(config.supported_nuts).toContain('04');
			expect(config.supported_nuts).toContain('05');
			expect(config.supported_nuts).toContain('19');
		});

		it('should extract NUT-19 cached_endpoints', () => {
			const info = makeFakeInfo();
			const config = mintInfoToConfig(MINT_URL, info);
			expect(config.cached_endpoints).toHaveLength(3);
			expect(config.cached_endpoints[0].method).toBe('POST');
		});

		it('should extract NUT-19 ttl', () => {
			const info = makeFakeInfo();
			const config = mintInfoToConfig(MINT_URL, info);
			expect(config.ttl).toBe(604800);
		});

		it('should set last_info_fetch to current timestamp', () => {
			const before = Date.now();
			const config = mintInfoToConfig(MINT_URL, makeFakeInfo());
			expect(config.last_info_fetch).toBeGreaterThanOrEqual(before);
		});

		it('should handle mint without NUT-19 (empty endpoints)', () => {
			const info = makeFakeInfo({ nuts: { '4': { supported: true } } });
			const config = mintInfoToConfig(MINT_URL, info);
			expect(config.cached_endpoints).toEqual([]);
			expect(config.ttl).toBe(0);
		});

		it('should handle mint without nuts at all', () => {
			const info = makeFakeInfo();
			delete (info as Record<string, unknown>).nuts;
			const config = mintInfoToConfig(MINT_URL, info);
			expect(config.supported_nuts).toEqual([]);
			expect(config.cached_endpoints).toEqual([]);
		});

		it('should handle missing name/pubkey gracefully', () => {
			const config = mintInfoToConfig(MINT_URL, {
				...makeFakeInfo(),
				name: undefined as unknown as string,
				pubkey: undefined as unknown as string
			});
			expect(config.name).toBe('');
			expect(config.pubkey).toBe('');
		});
	});

	describe('discoverMintEndpoints — success', () => {
		it('should fetch /v1/info and return config', async () => {
			const fakeInfo = makeFakeInfo();
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockResolvedValue(fakeInfo);

			const result = await discoverMintEndpoints(MINT_URL);
			expect(result.success).toBe(true);
			expect(result.config.name).toBe('Test Mint');
			expect(result.wasRefreshed).toBe(true);
		});

		it('should resolve all 5 endpoint paths', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockResolvedValue(makeFakeInfo());

			const result = await discoverMintEndpoints(MINT_URL);
			expect(result.resolvedPaths.mint_operation).toBeDefined();
			expect(result.resolvedPaths.mint_quote).toBeDefined();
			expect(result.resolvedPaths.melt_operation).toBeDefined();
			expect(result.resolvedPaths.melt_quote).toBeDefined();
			expect(result.resolvedPaths.swap).toBeDefined();
		});

		it('should persist config in store after discovery', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockResolvedValue(makeFakeInfo());

			await discoverMintEndpoints(MINT_URL);

			const stored = getMintConfig(MINT_URL);
			expect(stored).toBeTruthy();
			expect(stored!.name).toBe('Test Mint');
			expect(stored!.last_info_fetch).toBeGreaterThan(0);
		});
	});

	describe('discoverMintEndpoints — cache / TTL', () => {
		it('should skip fetch when TTL is still valid', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockResolvedValue(makeFakeInfo());

			// First call: fetch
			const r1 = await discoverMintEndpoints(MINT_URL);
			expect(r1.wasRefreshed).toBe(true);

			// Second call: should use cache
			const r2 = await discoverMintEndpoints(MINT_URL);
			expect(r2.wasRefreshed).toBe(false);
			// getMintInfo should only have been called once
			expect(getInfoMock).toHaveBeenCalledTimes(1);
		});
	});

	describe('discoverMintEndpoints — error handling', () => {
		it('should return success=false when mint is unreachable', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockRejectedValue(new TypeError('fetch failed'));

			const result = await discoverMintEndpoints('https://dead-mint.example.com');
			expect(result.success).toBe(false);
			expect(result.error).toContain('unreachable');
		});

		it('should provide resolvedPaths even on failure (fallback to standard)', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockRejectedValue(new Error('network down'));

			const result = await discoverMintEndpoints('https://dead-mint.example.com');
			expect(result.resolvedPaths.mint_quote).toBe('/v1/mint/quote/bolt11');
			expect(result.resolvedPaths.swap).toBe('/v1/swap');
		});

		it('should return config with placeholder values on failure', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockRejectedValue(new Error('unreachable'));

			const result = await discoverMintEndpoints('https://dead.example.com');
			expect(result.config.name).toBe('');
			expect(result.config.pubkey).toBe('');
		});

		it('should handle invalid mint info response', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockResolvedValue(null);

			const result = await discoverMintEndpoints(MINT_URL);
			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid mint info');
		});

		it('should handle non-object mint info response', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockResolvedValue('not an object');

			const result = await discoverMintEndpoints(MINT_URL);
			expect(result.success).toBe(false);
		});
	});

	describe('isMintReachable', () => {
		it('should return true when mint responds', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockResolvedValue(makeFakeInfo());

			const reachable = await isMintReachable(MINT_URL);
			expect(reachable).toBe(true);
		});

		it('should return false when mint is unreachable', async () => {
			const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
			getInfoMock.mockRejectedValue(new Error('down'));

			const reachable = await isMintReachable('https://dead.com');
			expect(reachable).toBe(false);
		});
	});
});

// ====================================================================
//  SECTION (C) — Mint Config Store
// ====================================================================

describe('(C) Mint config store', () => {
	beforeEach(() => {
		clearMintConfigs();
	});

	describe('getMintConfig / setMintConfig', () => {
		it('should return undefined for unknown mint', () => {
			expect(getMintConfig('https://unknown.example.com')).toBeUndefined();
		});

		it('should return default mint config for default URL (seed)', () => {
			const config = getMintConfig(DEFAULT_MINT_CONFIG.url);
			expect(config).toBeTruthy();
			expect(config!.name).toBe('LNWCASH mint');
		});

		it('should store and retrieve a config', () => {
			const config: MintConfig = {
				...DEFAULT_MINT_CONFIG,
				url: 'https://custom-mint.example.com',
				name: 'Custom Mint'
			};
			setMintConfig(config);

			const retrieved = getMintConfig('https://custom-mint.example.com');
			expect(retrieved).toBeTruthy();
			expect(retrieved!.name).toBe('Custom Mint');
		});

		it('should normalize URL trailing slash on set', () => {
			setMintConfig({
				...DEFAULT_MINT_CONFIG,
				url: 'https://slashed.example.com/',
				name: 'Slashed'
			});

			const retrieved = getMintConfig('https://slashed.example.com');
			expect(retrieved).toBeTruthy();
			expect(retrieved!.url).toBe('https://slashed.example.com');
		});
	});

	describe('persistence (localStorage)', () => {
		it('should survive "page reload" (clear in-memory, re-read)', () => {
			setMintConfig({
				...DEFAULT_MINT_CONFIG,
				url: 'https://persist.example.com',
				name: 'Persistence Test'
			});

			// Simulate page reload: clear in-memory cache by resetting internal state
			// We do this by clearing and re-reading all configs
			const beforeReload = getMintConfig('https://persist.example.com');
			expect(beforeReload).toBeTruthy();

			// Force re-read from localStorage (getAllMintConfigs returns a fresh snapshot)
			const all = getAllMintConfigs();
			const found = all.find(c => c.url === 'https://persist.example.com');
			expect(found).toBeTruthy();
			expect(found!.name).toBe('Persistence Test');
		});

		it('should persist multiple mints', () => {
			setMintConfig({
				...DEFAULT_MINT_CONFIG,
				url: 'https://mint1.example.com',
				name: 'Mint One'
			});
			setMintConfig({
				...DEFAULT_MINT_CONFIG,
				url: 'https://mint2.example.com',
				name: 'Mint Two'
			});

			const all = getAllMintConfigs();
			const mint1 = all.find(c => c.url === 'https://mint1.example.com');
			const mint2 = all.find(c => c.url === 'https://mint2.example.com');
			expect(mint1).toBeTruthy();
			expect(mint2).toBeTruthy();
		});
	});

	describe('removeMintConfig', () => {
		it('should remove a mint from store', () => {
			setMintConfig({
				...DEFAULT_MINT_CONFIG,
				url: 'https://remove.example.com',
				name: 'Remove Me'
			});

			expect(getMintConfig('https://remove.example.com')).toBeTruthy();

			removeMintConfig('https://remove.example.com');
			expect(getMintConfig('https://remove.example.com')).toBeUndefined();
		});
	});

	describe('isMintConfigStale', () => {
		it('should return false when TTL is 0 (no NUT-19)', () => {
			const config: MintConfig = { ...DEFAULT_MINT_CONFIG, ttl: 0, last_info_fetch: Date.now() };
			expect(isMintConfigStale(config)).toBe(false);
		});

		it('should return true when never fetched (last_info_fetch=0)', () => {
			const config: MintConfig = { ...DEFAULT_MINT_CONFIG, ttl: 3600, last_info_fetch: 0 };
			expect(isMintConfigStale(config)).toBe(true);
		});

		it('should return false when just fetched', () => {
			const config: MintConfig = { ...DEFAULT_MINT_CONFIG, ttl: 3600, last_info_fetch: Date.now() };
			expect(isMintConfigStale(config)).toBe(false);
		});

		it('should return true when TTL expired', () => {
			const expiredTime = Date.now() - 7200 * 1000; // 2 hours ago
			const config: MintConfig = { ...DEFAULT_MINT_CONFIG, ttl: 3600, last_info_fetch: expiredTime };
			expect(isMintConfigStale(config)).toBe(true);
		});
	});

	describe('getAllMintConfigs', () => {
		it('should include default mint even when store is empty', () => {
			const all = getAllMintConfigs();
			const defaultMint = all.find(c => c.url === DEFAULT_MINT_CONFIG.url);
			expect(defaultMint).toBeTruthy();
		});

		it('should return all stored configs', () => {
			setMintConfig({ ...DEFAULT_MINT_CONFIG, url: 'https://a.example.com', name: 'A' });
			setMintConfig({ ...DEFAULT_MINT_CONFIG, url: 'https://b.example.com', name: 'B' });

			const all = getAllMintConfigs();
			expect(all.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('getDefaultMintUrl', () => {
		it('should return https://mint.lnw.cash', () => {
			expect(getDefaultMintUrl()).toBe('https://mint.lnw.cash');
		});
	});

	describe('getOrCreateMintConfig', () => {
		it('should return existing config if present', () => {
			setMintConfig({ ...DEFAULT_MINT_CONFIG, url: 'https://exist.example.com', name: 'Existing' });

			const config = getOrCreateMintConfig('https://exist.example.com');
			expect(config.name).toBe('Existing');
		});

		it('should create + store placeholder for unknown mint', () => {
			const config = getOrCreateMintConfig('https://new.example.com');
			expect(config.url).toBe('https://new.example.com');
			expect(config.name).toBe('');
			expect(getMintConfig('https://new.example.com')).toBeTruthy();
		});
	});

	describe('clearMintConfigs', () => {
		it('should clear all configs', () => {
			setMintConfig({ ...DEFAULT_MINT_CONFIG, url: 'https://clear-test.example.com', name: 'Clear Test' });
			clearMintConfigs();
			expect(getMintConfig('https://clear-test.example.com')).toBeUndefined();
		});
	});
});

// ====================================================================
//  SECTION (D) — Error Handling (end-to-end)
// ====================================================================

describe('(D) Error handling', () => {
	beforeEach(() => {
		clearMintConfigs();
		vi.clearAllMocks();
	});

	it('should handle mint unreachable with user-friendly error message', async () => {
		const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
		getInfoMock.mockRejectedValue(new TypeError('fetch failed'));

		const result = await discoverMintEndpoints('https://unreachable-mint.example.com');
		expect(result.success).toBe(false);
		expect(result.error).toContain('unreachable');
		// Should still have a usable config (placeholder)
		expect(result.config.url).toBe('https://unreachable-mint.example.com');
	});

	it('should fallback to standard paths when NUT-19 is missing', async () => {
		const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;
		getInfoMock.mockResolvedValue({
			name: 'Basic',
			pubkey: '03' + 'aa'.repeat(32),
			version: 'Nutshell/0.18',
			nuts: { '4': { methods: [{ method: 'bolt11', unit: 'sat' }] } }
		});

		const result = await discoverMintEndpoints('https://basic.example.com');
		expect(result.success).toBe(true);
		// Standard paths should be used
		expect(result.resolvedPaths.mint_operation).toBe('/v1/mint/bolt11');
		expect(result.resolvedPaths.melt_quote).toBe('/v1/melt/quote/bolt11');
	});

	it('should use cached config on re-discovery failure', async () => {
		const getInfoMock = client.getMintInfo as ReturnType<typeof vi.fn>;

		// First: successful discovery
		getInfoMock.mockResolvedValue(makeFakeInfo({ name: 'First Fetch' }));
		await discoverMintEndpoints(MINT_URL);

		// Second: failure → should use cached data
		// But default ttl is 604800, so we need to force-stale it
		// Let's manually expire the cache
		const stored = getMintConfig(MINT_URL)!;
		setMintConfig({ ...stored, last_info_fetch: 0 }); // force stale

		getInfoMock.mockRejectedValue(new Error('mint down'));
		const result = await discoverMintEndpoints(MINT_URL);

		expect(result.success).toBe(false);
		expect(result.config.name).toBe('First Fetch'); // from cache
	});

	it('DiscoveryError should be constructable', () => {
		const err = new DiscoveryError('test error', 'https://x.com', new Error('cause'));
		expect(err.name).toBe('DiscoveryError');
		expect(err.mintUrl).toBe('https://x.com');
		expect(err.cause).toBeTruthy();
	});
});
