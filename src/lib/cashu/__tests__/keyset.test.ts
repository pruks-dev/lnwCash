/**
 * Keyset management tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	fetchAndCacheKeysets,
	getKeysetById,
	getAllKeysets,
	rotateKeysets,
	isCacheStale,
	clearCache
} from '../keyset';
import { clearKeysetCache } from '../../storage/local';

// Mock the HTTP client
vi.mock('../client', () => ({
	getKeysets: vi.fn()
}));

import { getKeysets as mockGetKeysets } from '../client';

describe('Keyset management', () => {
	const mintUrl = 'https://mint.example.com';

	const mockMintKeysets = [
		{ id: 'ks-001', unit: 'sat', active: true, input_fee_ppk: 0 },
		{ id: 'ks-002', unit: 'usd', active: false, input_fee_ppk: 10 }
	];

	beforeEach(() => {
		vi.clearAllMocks();
		clearCache(mintUrl);
		clearCache();
	});

	describe('fetchAndCacheKeysets', () => {
		it('should fetch keysets from mint and cache them', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);

			const result = await fetchAndCacheKeysets(mintUrl);

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('ks-001');
			expect(result[0].last_updated).toBeGreaterThan(0);
			expect(mockGetKeysets).toHaveBeenCalledWith(mintUrl);
		});

		it('should cache keysets in localStorage per mint', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);

			await fetchAndCacheKeysets(mintUrl);

			const cached = getAllKeysets(mintUrl);
			expect(cached).toHaveLength(2);
			expect(cached[0].id).toBe('ks-001');
		});
	});

	describe('getKeysetById', () => {
		it('should retrieve a keyset by ID from cache', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);

			const ks = getKeysetById(mintUrl, 'ks-001');
			expect(ks).not.toBeNull();
			expect(ks!.id).toBe('ks-001');
		});

		it('should return null for unknown keyset ID', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);

			expect(getKeysetById(mintUrl, 'nonexistent')).toBeNull();
		});

		it('should return null when no cache exists', () => {
			expect(getKeysetById(mintUrl, 'any')).toBeNull();
		});
	});

	describe('getAllKeysets', () => {
		it('should return empty array when no cache', () => {
			expect(getAllKeysets(mintUrl)).toEqual([]);
		});

		it('should return all cached keysets', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);

			const all = getAllKeysets(mintUrl);
			expect(all).toHaveLength(2);
		});
	});

	describe('rotateKeysets', () => {
		it('should clear old cache and fetch new keysets', async () => {
			// First cache
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);

			// New data on rotation
			const newKeysets = [
				{ id: 'ks-003', unit: 'sat', active: true, input_fee_ppk: 0 }
			];
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(newKeysets);

			const rotated = await rotateKeysets(mintUrl);

			expect(rotated).toHaveLength(1);
			expect(rotated[0].id).toBe('ks-003');
			expect(getAllKeysets(mintUrl)).toHaveLength(1);
			expect(getKeysetById(mintUrl, 'ks-001')).toBeNull(); // old removed
		});
	});

	describe('isCacheStale', () => {
		it('should return true when cache is empty', () => {
			expect(isCacheStale(mintUrl)).toBe(true);
		});

		it('should return false for recently cached keysets', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);

			// Default maxAge is 1 hour
			expect(isCacheStale(mintUrl)).toBe(false);
		});

		it('should return true when cache is older than maxAge', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);

			// Wait a few ms to ensure staleness
			await new Promise(resolve => setTimeout(resolve, 10));

			// Set maxAge to 1ms to force stale
			expect(isCacheStale(mintUrl, 1)).toBe(true);
		});
	});

	describe('clearCache', () => {
		it('should clear cache for specific mint', async () => {
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);

			clearCache(mintUrl);
			expect(getAllKeysets(mintUrl)).toEqual([]);
		});

		it('should clear all caches when no URL specified', async () => {
			const mintB = 'https://mint-b.example.com';
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintUrl);
			vi.mocked(mockGetKeysets).mockResolvedValueOnce(mockMintKeysets);
			await fetchAndCacheKeysets(mintB);

			clearCache();
			expect(getAllKeysets(mintUrl)).toEqual([]);
			expect(getAllKeysets(mintB)).toEqual([]);
		});
	});

	describe('per-mint separation', () => {
		it('should keep keysets separated by mint URL', async () => {
			const mintA = 'https://mint-a.example.com';
			const mintB = 'https://mint-b.example.com';

			vi.mocked(mockGetKeysets).mockResolvedValueOnce([
				{ id: 'ks-a', unit: 'sat', active: true }
			]);
			await fetchAndCacheKeysets(mintA);

			vi.mocked(mockGetKeysets).mockResolvedValueOnce([
				{ id: 'ks-b', unit: 'usd', active: true }
			]);
			await fetchAndCacheKeysets(mintB);

			expect(getAllKeysets(mintA)).toHaveLength(1);
			expect(getAllKeysets(mintA)[0].id).toBe('ks-a');
			expect(getAllKeysets(mintB)).toHaveLength(1);
			expect(getAllKeysets(mintB)[0].id).toBe('ks-b');
		});
	});
});
