/**
 * TASK-311 — NUT-09 capability check (hasNUT08, isVersionAtLeast, getMintCapability).
 *
 * 4 scenarios:
 *   (a) mint advertises 08 → hasNUT08 returns true
 *   (b) version 0.20.1 no 08 advertised → true (heuristic)
 *   (c) version 0.16.0 no 08 advertised → false
 *   (d) isVersionAtLeast parsing — 3 sub-assertions
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn()
}));

import * as client from '../../cashu/client';
import { getMintCapability, hasNUT08, isVersionAtLeast } from '../capabilities';
import { setMintConfig } from '../store';

describe('TASK-311: NUT-09 capability check', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		// Clear any leftover localStorage state from prior tests
		try {
			localStorage.clear();
		} catch {
			/* ignore */
		}
	});

	it('a) hasNUT08 returns true when mint advertises NUT-08', async () => {
		vi.mocked(client.getMintInfo).mockResolvedValue({
			name: 'mint-eight',
			pubkey: '02' + '11'.repeat(32),
			version: 'Nutshell/0.16.0',
			nuts: { '08': true, '04': true }
		} as any);

		const result = await hasNUT08('https://mint-eight.test');
		expect(result).toBe(true);
		expect(client.getMintInfo).toHaveBeenCalledTimes(1);
	});

	it('b) hasNUT08 returns true via heuristic when version >= 0.17 but no 08 advertised', async () => {
		vi.mocked(client.getMintInfo).mockResolvedValue({
			name: 'mint-twenty',
			pubkey: '02' + '22'.repeat(32),
			version: 'Nutshell/0.20.1',
			nuts: { '04': true }
		} as any);

		const result = await hasNUT08('https://mint-twenty.test');
		expect(result).toBe(true);
		expect(client.getMintInfo).toHaveBeenCalledTimes(1);
	});

	it('c) hasNUT08 returns false when no 08 advertised and version < 0.17', async () => {
		vi.mocked(client.getMintInfo).mockResolvedValue({
			name: 'mint-old',
			pubkey: '02' + '33'.repeat(32),
			version: 'Nutshell/0.16.0',
			nuts: { '04': true }
		} as any);

		const result = await hasNUT08('https://mint-old.test');
		expect(result).toBe(false);
		expect(client.getMintInfo).toHaveBeenCalledTimes(1);
	});

	it('d) isVersionAtLeast parses version strings correctly', () => {
		// 'Nutshell/0.20.1' >= 0.17
		expect(isVersionAtLeast('Nutshell/0.20.1', 0, 17)).toBe(true);
		// '0.16.0' < 0.17
		expect(isVersionAtLeast('0.16.0', 0, 17)).toBe(false);
		// '' (empty) → unparseable → false
		expect(isVersionAtLeast('', 0, 17)).toBe(false);
		// Bonus: 'v0.18.0' ≥ 0.17 (the spec asked for 3, this is a 4th)
		expect(isVersionAtLeast('v0.18.0', 0, 17)).toBe(true);
		// Bonus: exact match '0.17.0' ≥ 0.17
		expect(isVersionAtLeast('0.17.0', 0, 17)).toBe(true);
	});

	it('getMintCapability: caches result for 24h (no second fetch)', async () => {
		// Fresh start: seed a config with capability_checked_at = now so we hit the cache branch
		setMintConfig({
			url: 'https://mint-cached.test',
			name: 'cached',
			pubkey: '',
			version: 'Nutshell/0.20.1',
			supported_nuts: ['04', '08'],
			cached_endpoints: [],
			ttl: 0,
			last_info_fetch: 0,
			capability_checked_at: Date.now() // within TTL
		});

		// No mock needed — should never be called.
		const cap = await getMintCapability('https://mint-cached.test');
		expect(cap.nuts).toContain('08');
		expect(cap.version).toBe('Nutshell/0.20.1');
		expect(client.getMintInfo).not.toHaveBeenCalled();
	});
});
