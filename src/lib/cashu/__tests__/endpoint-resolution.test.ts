/**
 * TASK-047 — Endpoint Resolution Integration Tests
 * Tests resolveEndpointPath with 3+ mint configurations.
 *
 * Covers: C19-02, F-021, F-022, F-023
 */
import { describe, it, expect } from 'vitest';
import { resolveEndpointPath } from '../client';
import type { MintInfo } from '../../types';

// ─── Mint Configs ──────────────────────────────────────────────

/** Config 1: Standard NUT mint — no NUT-19 cached_endpoints */
const standardMint: MintInfo = {
	name: 'Standard Mint',
	pubkey: 'abc123',
	version: 'Nutshell/0.15',
	nuts: {
		'4': { methods: [{ method: 'bolt11', unit: 'sat' }], disabled: false },
		'5': { methods: [{ method: 'bolt11', unit: 'sat' }], disabled: false },
	}
};

/** Config 2: mint.lnw.cash — real NUT-19 structure */
const lnwCashMint: MintInfo = {
	name: 'LNWCASH',
	pubkey: '03d0e4cda0f937bde65b9d160b58febe04bd229243ea45e390ce80252504e1176e',
	version: 'Nutshell/0.20.1',
	time: 1785554043,
	nuts: {
		'4': {
			methods: [{ method: 'bolt11', unit: 'sat', options: { description: true } }],
			disabled: false
		},
		'5': {
			methods: [{ method: 'bolt11', unit: 'sat' }],
			disabled: false
		},
		'19': {
			cached_endpoints: [
				{ method: 'POST', path: '/v1/mint/bolt11' },
				{ method: 'POST', path: '/v1/melt/bolt11' },
				{ method: 'POST', path: '/v1/swap' },
			],
			ttl: 604800
		}
	}
};

/** Config 3: Custom non-standard mint — different paths + different methods */
const customMint: MintInfo = {
	name: 'Custom Mint',
	pubkey: 'deadbeef',
	version: 'CustomMint/1.0',
	icon_url: 'https://custom.example/icon.png',
	urls: ['https://custom.example'],
	time: 1750000000,
	tos_url: 'https://custom.example/tos',
	nuts: {
		'4': {
			methods: [{ method: 'lightning', unit: 'sat' }],
			disabled: false
		},
		'5': {
			methods: [{ method: 'lightning', unit: 'sat' }],
			disabled: false
		},
		'19': {
			cached_endpoints: [
				{ method: 'POST', path: '/api/v2/mint' },
				{ method: 'POST', path: '/api/v2/burn' },
				{ method: 'POST', path: '/api/v2/swap' },
			],
			ttl: 3600
		}
	}
};

/** Config 4: Empty cached_endpoints */
const emptyMint: MintInfo = {
	name: 'Empty',
	pubkey: 'empty',
	version: '1.0',
	nuts: {
		'4': { methods: [{ method: 'bolt11', unit: 'sat' }] },
		'19': { cached_endpoints: [], ttl: 300 }
	}
};

// ─── Tests ─────────────────────────────────────────────────────

describe('TASK-047: Endpoint Path Resolution (C19-02, F-021, F-022)', () => {

	// ── Fallback (no mintInfo) ─────────────────────────────

	describe('Fallback: undefined mintInfo → standard NUT paths', () => {
		it('mint_operation → /v1/mint/bolt11', () => {
			expect(resolveEndpointPath(undefined, 'mint_operation')).toBe('/v1/mint/bolt11');
		});
		it('mint_quote → /v1/mint/quote/bolt11', () => {
			expect(resolveEndpointPath(undefined, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});
		it('melt_operation → /v1/melt/bolt11', () => {
			expect(resolveEndpointPath(undefined, 'melt_operation')).toBe('/v1/melt/bolt11');
		});
		it('melt_quote → /v1/melt/quote/bolt11', () => {
			expect(resolveEndpointPath(undefined, 'melt_quote')).toBe('/v1/melt/quote/bolt11');
		});
		it('swap → /v1/swap', () => {
			expect(resolveEndpointPath(undefined, 'swap')).toBe('/v1/swap');
		});
	});

	// ── Config 1: Standard (no NUT-19) ─────────────────────

	describe('Config 1: Standard NUT mint (no cached_endpoints)', () => {
		it('all operations fall back to standard paths', () => {
			expect(resolveEndpointPath(standardMint, 'mint_operation')).toBe('/v1/mint/bolt11');
			expect(resolveEndpointPath(standardMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
			expect(resolveEndpointPath(standardMint, 'melt_operation')).toBe('/v1/melt/bolt11');
			expect(resolveEndpointPath(standardMint, 'melt_quote')).toBe('/v1/melt/quote/bolt11');
			expect(resolveEndpointPath(standardMint, 'swap')).toBe('/v1/swap');
		});
	});

	// ── Config 2: mint.lnw.cash (NUT-19 present) ───────────

	describe('Config 2: mint.lnw.cash (NUT-19 with bolt11)', () => {
		it('F-021: mint_operation from cached_endpoints', () => {
			expect(resolveEndpointPath(lnwCashMint, 'mint_operation')).toBe('/v1/mint/bolt11');
		});
		it('F-021: melt_operation from cached_endpoints', () => {
			expect(resolveEndpointPath(lnwCashMint, 'melt_operation')).toBe('/v1/melt/bolt11');
		});
		it('F-021: swap from cached_endpoints', () => {
			expect(resolveEndpointPath(lnwCashMint, 'swap')).toBe('/v1/swap');
		});
		it('F-022: mint_quote constructed from NUT-04 bolt11 method', () => {
			expect(resolveEndpointPath(lnwCashMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});
		it('F-022: melt_quote constructed from NUT-05 bolt11 method', () => {
			expect(resolveEndpointPath(lnwCashMint, 'melt_quote')).toBe('/v1/melt/quote/bolt11');
		});
	});

	// ── Config 3: Custom non-standard ──────────────────────

	describe('Config 3: Custom non-standard mint (F-022 two-phase)', () => {
		it('mint_operation from /api/v2/mint (custom cached_endpoints)', () => {
			expect(resolveEndpointPath(customMint, 'mint_operation')).toBe('/api/v2/mint');
		});
		it('melt_operation from /api/v2/burn (custom cached_endpoints)', () => {
			expect(resolveEndpointPath(customMint, 'melt_operation')).toBe('/api/v2/burn');
		});
		it('F-022: mint_quote constructed from lightning method → /v1/mint/quote/lightning', () => {
			expect(resolveEndpointPath(customMint, 'mint_quote')).toBe('/v1/mint/quote/lightning');
		});
		it('F-022: melt_quote constructed from lightning method → /v1/melt/quote/lightning', () => {
			expect(resolveEndpointPath(customMint, 'melt_quote')).toBe('/v1/melt/quote/lightning');
		});
		it('swap from cached_endpoints → /api/v2/swap', () => {
			expect(resolveEndpointPath(customMint, 'swap')).toBe('/api/v2/swap');
		});
		it('F-022: two-phase — quote ≠ operation (different endpoints)', () => {
			expect(resolveEndpointPath(customMint, 'mint_quote')).not.toBe(
				resolveEndpointPath(customMint, 'mint_operation')
			);
			expect(resolveEndpointPath(customMint, 'melt_quote')).not.toBe(
				resolveEndpointPath(customMint, 'melt_operation')
			);
		});
	});

	// ── Config 4: Empty cached_endpoints ───────────────────

	describe('Config 4: Empty cached_endpoints → fallback', () => {
		it('mint_operation falls back to standard', () => {
			expect(resolveEndpointPath(emptyMint, 'mint_operation')).toBe('/v1/mint/bolt11');
		});
		it('mint_quote falls back to constructed standard', () => {
			expect(resolveEndpointPath(emptyMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});
	});

	// ── Edge Cases ──────────────────────────────────────────

	describe('Edge cases', () => {
		it('mint with no nuts at all → fallback', () => {
			const bare: MintInfo = { name: 'X', pubkey: 'x', version: '1' };
			expect(resolveEndpointPath(bare, 'mint_operation')).toBe('/v1/mint/bolt11');
			expect(resolveEndpointPath(bare, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});

		it('mint with supported:true (bool nut, no methods) → fallback quote', () => {
			const boolMint: MintInfo = {
				name: 'Bool', pubkey: 'y', version: '1',
				nuts: { '4': { supported: true }, '5': { supported: true } }
			};
			expect(resolveEndpointPath(boolMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});

		it('F-023: customMint has icon_url, urls, time, tos_url', () => {
			expect(customMint.icon_url).toBe('https://custom.example/icon.png');
			expect(customMint.urls).toEqual(['https://custom.example']);
			expect(customMint.time).toBe(1750000000);
			expect(customMint.tos_url).toBe('https://custom.example/tos');
		});
	});
});
