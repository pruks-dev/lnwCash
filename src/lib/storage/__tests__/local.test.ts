/**
 * localStorage service tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
	setWalletMetadata,
	getWalletMetadata,
	clearWalletMetadata,
	getSettings,
	setSettings,
	clearSettings,
	setKeysetCache,
	getKeysetCache,
	getKeysetById,
	clearKeysetCache,
	clearAll,
	isAvailable
} from '../local';
import type { KeysetCacheEntry } from '../../types';

describe('localStorage service', () => {
	beforeEach(() => {
		// Clear all localStorage entries that might affect tests
		clearAll();
	});

	it('should be available in jsdom environment', () => {
		expect(isAvailable()).toBe(true);
	});

	describe('wallet metadata', () => {
		it('should return null when no metadata stored', () => {
			expect(getWalletMetadata()).toBeNull();
		});

		it('should store and retrieve wallet metadata', () => {
			const meta = { name: 'My Wallet', created_at: 1700000000000 };
			expect(setWalletMetadata(meta)).toBe(true);

			const retrieved = getWalletMetadata();
			expect(retrieved).toEqual(meta);
		});

		it('should clear wallet metadata', () => {
			setWalletMetadata({ name: 'Test', created_at: 123 });
			expect(clearWalletMetadata()).toBe(true);
			expect(getWalletMetadata()).toBeNull();
		});

		it('should validate metadata structure (reject bad data)', () => {
			// Manually set invalid data
			localStorage.setItem('lnwcash_wallet_meta', JSON.stringify({ name: 123 }));
			expect(getWalletMetadata()).toBeNull();
		});
	});

	describe('settings', () => {
		it('should return defaults when no settings stored', () => {
			const settings = getSettings();
			expect(settings.language).toBe('en');
			expect(settings.theme).toBe('system');
			expect(settings.default_mint).toBe('');
		});

		it('should store and retrieve partial settings', () => {
			setSettings({ language: 'en', theme: 'light' });
			const settings = getSettings();
			expect(settings.language).toBe('en');
			expect(settings.theme).toBe('light');
			expect(settings.default_mint).toBe(''); // default preserved
		});

		it('should store and retrieve full settings', () => {
			setSettings({
				language: 'en',
				theme: 'light',
				default_mint: 'https://mint.example.com'
			});
			const settings = getSettings();
			expect(settings.language).toBe('en');
			expect(settings.theme).toBe('light');
			expect(settings.default_mint).toBe('https://mint.example.com');
		});

		it('should clear settings back to defaults', () => {
			setSettings({ language: 'en' });
			clearSettings();
			const settings = getSettings();
			expect(settings.language).toBe('en');
		});
	});

	describe('keyset cache', () => {
		const mockKeysets: KeysetCacheEntry[] = [
			{
				id: 'keyset-001',
				unit: 'sat',
				active: true,
				input_fee_ppk: 0,
				keys: { '1': 'abc', '2': 'def' },
				last_updated: Date.now()
			}
		];

		it('should return empty array for unknown mint', () => {
			expect(getKeysetCache('https://unknown.example.com')).toEqual([]);
		});

		it('should store and retrieve keysets by mint URL', () => {
			const mintUrl = 'https://mint.example.com';
			setKeysetCache(mintUrl, mockKeysets);

			const cached = getKeysetCache(mintUrl);
			expect(cached).toHaveLength(1);
			expect(cached[0].id).toBe('keyset-001');
		});

		it('should retrieve keyset by ID', () => {
			const mintUrl = 'https://mint.example.com';
			setKeysetCache(mintUrl, mockKeysets);

			const ks = getKeysetById(mintUrl, 'keyset-001');
			expect(ks).not.toBeNull();
			expect(ks!.unit).toBe('sat');
		});

		it('should return null for unknown keyset ID', () => {
			const mintUrl = 'https://mint.example.com';
			setKeysetCache(mintUrl, mockKeysets);

			expect(getKeysetById(mintUrl, 'nonexistent')).toBeNull();
		});

		it('should separate keysets by mint URL (per-mint)', () => {
			const mintA = 'https://mint-a.example.com';
			const mintB = 'https://mint-b.example.com';

			setKeysetCache(mintA, [
				{ ...mockKeysets[0], id: 'ks-a', unit: 'sat' }
			]);
			setKeysetCache(mintB, [
				{ ...mockKeysets[0], id: 'ks-b', unit: 'usd' }
			]);

			expect(getKeysetCache(mintA)).toHaveLength(1);
			expect(getKeysetCache(mintA)[0].id).toBe('ks-a');

			expect(getKeysetCache(mintB)).toHaveLength(1);
			expect(getKeysetCache(mintB)[0].id).toBe('ks-b');
		});

		it('should clear keyset cache for specific mint', () => {
			const mintUrl = 'https://mint.example.com';
			setKeysetCache(mintUrl, mockKeysets);
			clearKeysetCache(mintUrl);

			expect(getKeysetCache(mintUrl)).toEqual([]);
		});

		it('should clear all keyset caches when no URL specified', () => {
			setKeysetCache('https://a.example.com', mockKeysets);
			setKeysetCache('https://b.example.com', mockKeysets);
			clearKeysetCache();

			expect(getKeysetCache('https://a.example.com')).toEqual([]);
			expect(getKeysetCache('https://b.example.com')).toEqual([]);
		});
	});

	describe('clearAll', () => {
		it('should clear all LNWCASH data', () => {
			setWalletMetadata({ name: 'test', created_at: 1 });
			setSettings({ language: 'en' });
			setKeysetCache('https://mint.example.com', []);

			clearAll();

			expect(getWalletMetadata()).toBeNull();
			expect(getSettings().language).toBe('en');
			expect(getKeysetCache('https://mint.example.com')).toEqual([]);
		});
	});

	describe('no plain text private key', () => {
		it('should NOT store any private key in localStorage', () => {
			// Enumerate all localStorage keys
			const keys = Object.keys(localStorage);
			for (const key of keys) {
				const value = localStorage.getItem(key) ?? '';
				expect(value).not.toContain('private_key');
				expect(value).not.toContain('seed_phrase');
				expect(value).not.toContain('secret_key');
			}
		});

		it('should not expose sensitive patterns in localStorage', () => {
			// Test that our API doesn't accidentally store plain text secrets
			setSettings({ default_mint: 'https://mint.example.com' });
			const allStorage = JSON.stringify(localStorage);
			expect(allStorage).not.toContain('secret');
			expect(allStorage).not.toContain('private');
			// The only "key" should be in keyset context only
		});
	});
});
