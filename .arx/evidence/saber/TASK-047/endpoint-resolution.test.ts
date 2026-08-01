/**
 * TASK-047 — Endpoint Resolution Tests (3+ mint configs)
 *
 * Validates: C19-02, F-021, F-022, F-023
 *
 * This file is NOT run by vitest — it documents the test scenarios.
 * The actual endpoint resolution unit tests are in:
 *   src/lib/cashu/__tests__/endpoint-resolution.test.ts
 */

import { describe, it, expect } from 'vitest';
import { resolveEndpointPath } from '../../client';
import type { MintInfo } from '../../../types';

// ─── Mint Config 1: Standard NUT mint (no NUT-19) ──────────────

const standardMint: MintInfo = {
	name: 'Standard Mint',
	pubkey: 'abc123',
	version: 'Nutshell/0.15',
	nuts: {
		'4': { methods: [{ method: 'bolt11', unit: 'sat' }], disabled: false },
		'5': { methods: [{ method: 'bolt11', unit: 'sat' }], disabled: false },
		'7': { supported: true },
	}
};

// ─── Mint Config 2: Real mint.lnw.cash (NUT-19 with bolt11) ────

const lnwCashMint: MintInfo = {
	name: '"LnwCash mint"',
	pubkey: '03d0e4cda0f937bde65b9d160b58febe04bd229243ea45e390ce80252504e1176e',
	version: 'Nutshell/0.20.1',
	contact: [],
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
		'7': { supported: true },
		'8': { supported: true },
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

// ─── Mint Config 3: Custom non-standard mint ────────────────────

const customMint: MintInfo = {
	name: 'Custom Mint (non-standard paths)',
	pubkey: 'deadbeef',
	version: 'CustomMint/1.0',
	time: 1750000000,
	icon_url: 'https://custom.example/icon.png',
	urls: ['https://custom.example'],
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

// ─── Mint Config 4: Empty cached_endpoints ─────────────────────

const emptyCachedMint: MintInfo = {
	name: 'Empty Cache Mint',
	pubkey: 'empty123',
	version: 'Nutshell/0.20',
	nuts: {
		'4': { methods: [{ method: 'bolt11', unit: 'sat' }] },
		'5': { methods: [{ method: 'bolt11', unit: 'sat' }] },
		'19': { cached_endpoints: [], ttl: 300 }
	}
};

// ─── Tests ─────────────────────────────────────────────────────

describe('TASK-047: Endpoint Resolution (C19-02, F-021, F-022, F-023)', () => {

	// ── C19-02 / F-021: Fallback ─────────────────────────────

	describe('Fallback: standard NUT paths (no mintInfo)', () => {
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

	// ── Mint Config 1: Standard NUT mint (no NUT-19) ────────

	describe('Mint Config 1: Standard NUT mint (no cached_endpoints)', () => {
		it('falls back to standard mint_operation', () => {
			expect(resolveEndpointPath(standardMint, 'mint_operation')).toBe('/v1/mint/bolt11');
		});

		it('falls back to standard mint_quote', () => {
			expect(resolveEndpointPath(standardMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});

		it('falls back to standard melt_operation', () => {
			expect(resolveEndpointPath(standardMint, 'melt_operation')).toBe('/v1/melt/bolt11');
		});

		it('falls back to standard melt_quote', () => {
			expect(resolveEndpointPath(standardMint, 'melt_quote')).toBe('/v1/melt/quote/bolt11');
		});

		it('falls back to standard swap', () => {
			expect(resolveEndpointPath(standardMint, 'swap')).toBe('/v1/swap');
		});
	});

	// ── Mint Config 2: mint.lnw.cash (NUT-19 + bolt11) ─────

	describe('Mint Config 2: mint.lnw.cash (NUT-19 present, bolt11 methods)', () => {
		it('mint_operation via cached_endpoints → /v1/mint/bolt11', () => {
			expect(resolveEndpointPath(lnwCashMint, 'mint_operation')).toBe('/v1/mint/bolt11');
		});

		it('melt_operation via cached_endpoints → /v1/melt/bolt11', () => {
			expect(resolveEndpointPath(lnwCashMint, 'melt_operation')).toBe('/v1/melt/bolt11');
		});

		it('swap via cached_endpoints → /v1/swap', () => {
			expect(resolveEndpointPath(lnwCashMint, 'swap')).toBe('/v1/swap');
		});

		it('mint_quote constructed from NUT-04 method → /v1/mint/quote/bolt11', () => {
			expect(resolveEndpointPath(lnwCashMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});

		it('melt_quote constructed from NUT-05 method → /v1/melt/quote/bolt11', () => {
			expect(resolveEndpointPath(lnwCashMint, 'melt_quote')).toBe('/v1/melt/quote/bolt11');
		});

		it('F-023: MintInfo has NUT-19 fields (ttl, cached_endpoints)', () => {
			const nut19 = lnwCashMint.nuts?.['19'] as { ttl?: number; cached_endpoints?: Array<{ method: string; path: string }> };
			expect(nut19?.ttl).toBe(604800);
			expect(nut19?.cached_endpoints).toHaveLength(3);
		});
	});

	// ── Mint Config 3: Custom non-standard mint ─────────────

	describe('Mint Config 3: Custom non-standard mint (F-022 two-phase)', () => {
		it('mint_operation resolves from custom cached_endpoints → /api/v2/mint', () => {
			expect(resolveEndpointPath(customMint, 'mint_operation')).toBe('/api/v2/mint');
		});

		it('melt_operation resolves from custom cached_endpoints → /api/v2/burn', () => {
			expect(resolveEndpointPath(customMint, 'melt_operation')).toBe('/api/v2/burn');
		});

		it('mint_quote constructed from NUT-04 lightning method → /v1/mint/quote/lightning', () => {
			expect(resolveEndpointPath(customMint, 'mint_quote')).toBe('/v1/mint/quote/lightning');
		});

		it('melt_quote constructed from NUT-05 lightning method → /v1/melt/quote/lightning', () => {
			expect(resolveEndpointPath(customMint, 'melt_quote')).toBe('/v1/melt/quote/lightning');
		});

		it('swap resolves from cached_endpoints → /api/v2/swap', () => {
			expect(resolveEndpointPath(customMint, 'swap')).toBe('/api/v2/swap');
		});

		it('F-023: MintInfo has icon_url, urls, time, tos_url', () => {
			expect(customMint.icon_url).toBe('https://custom.example/icon.png');
			expect(customMint.urls).toEqual(['https://custom.example']);
			expect(customMint.time).toBe(1750000000);
			expect(customMint.tos_url).toBe('https://custom.example/tos');
		});
	});

	// ── Mint Config 4: Empty cached_endpoints ───────────────

	describe('Mint Config 4: Empty cached_endpoints (fallback behavior)', () => {
		it('mint_operation falls back when cached_endpoints empty', () => {
			expect(resolveEndpointPath(emptyCachedMint, 'mint_operation')).toBe('/v1/mint/bolt11');
		});

		it('mint_quote falls back to constructed path', () => {
			expect(resolveEndpointPath(emptyCachedMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});
	});

	// ── Edge Cases ──────────────────────────────────────────

	describe('Edge cases', () => {
		it('mint with no nuts at all → fallback', () => {
			const bareMint: MintInfo = {
				name: 'Bare',
				pubkey: 'x',
				version: '1'
			};
			expect(resolveEndpointPath(bareMint, 'mint_operation')).toBe('/v1/mint/bolt11');
			expect(resolveEndpointPath(bareMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
		});

		it('mint with NUT-04 supported:true (no methods) → fallback quote path', () => {
			const boolMint: MintInfo = {
				name: 'Bool Mint',
				pubkey: 'y',
				version: '1',
				nuts: {
					'4': { supported: true },
					'5': { supported: true },
				}
			};
			// No methods to extract → fallback
			expect(resolveEndpointPath(boolMint, 'mint_quote')).toBe('/v1/mint/quote/bolt11');
			expect(resolveEndpointPath(boolMint, 'melt_quote')).toBe('/v1/melt/quote/bolt11');
		});

		it('two-phase: quote and operation paths are different for custom mint', () => {
			const mintQuote = resolveEndpointPath(customMint, 'mint_quote');
			const mintOp = resolveEndpointPath(customMint, 'mint_operation');
			const meltQuote = resolveEndpointPath(customMint, 'melt_quote');
			const meltOp = resolveEndpointPath(customMint, 'melt_operation');

			// Quote paths follow /v1/mint/quote/{method} pattern
			expect(mintQuote).toBe('/v1/mint/quote/lightning');
			expect(meltQuote).toBe('/v1/melt/quote/lightning');

			// Operation paths come from cached_endpoints
			expect(mintOp).toBe('/api/v2/mint');
			expect(meltOp).toBe('/api/v2/burn');

			// Quote ≠ Operation (two-phase architecture)
			expect(mintQuote).not.toBe(mintOp);
			expect(meltQuote).not.toBe(meltOp);
		});
	});
});
