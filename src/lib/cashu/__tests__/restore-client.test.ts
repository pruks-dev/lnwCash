/**
 * NUT-09 restore client tests — POST /v1/restore endpoint + resolution.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { restoreOutputs, resolveEndpointPath, CashuError } from '../client';
import type { MintInfo } from '../../types';

const MINT_A = 'https://mint-a.example.com';

const mockFetch = vi.fn();
let originalFetch: typeof fetch;

describe('NUT-09 restore client', () => {
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch;
		mockFetch.mockReset();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('should POST regenerated outputs to /v1/restore', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					outputs: [{ amount: 0, id: 'ks', B_: 'B1' }],
					signatures: [{ id: 'ks', amount: 64, C_: 'C1' }]
				})
		});

		const outputs = [{ amount: 0, id: 'ks', B_: 'B1' }];
		const response = await restoreOutputs(MINT_A, outputs);

		expect(response.signatures).toHaveLength(1);
		expect(response.signatures[0].C_).toBe('C1');
		expect(mockFetch).toHaveBeenCalledWith(
			`${MINT_A}/v1/restore`,
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ outputs })
			})
		);
	});

	it('should throw CashuError on non-200 restore response', async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 400,
			statusText: 'Bad Request',
			json: () => Promise.resolve({ detail: 'Blinded message not found' })
		});

		await expect(restoreOutputs(MINT_A, [])).rejects.toThrow(CashuError);
	});

	it('resolveEndpointPath should fall back to /v1/restore without mint info', () => {
		expect(resolveEndpointPath(undefined, 'restore')).toBe('/v1/restore');
	});

	it('resolveEndpointPath should resolve restore from NUT-19 cached_endpoints', () => {
		const mintInfo: MintInfo = {
			name: 'Mint',
			pubkey: 'k',
			version: '1.0',
			nuts: {
				'19': {
					cached_endpoints: [
						{ method: 'POST', path: '/custom/restore' },
						{ method: 'POST', path: '/v1/mint/bolt11' }
					]
				}
			}
		};
		expect(resolveEndpointPath(mintInfo, 'restore')).toBe('/custom/restore');
	});

	it('resolveEndpointPath should fall back when no matching cached endpoint', () => {
		const mintInfo: MintInfo = {
			name: 'Mint',
			pubkey: 'k',
			version: '1.0',
			nuts: {
				'19': {
					cached_endpoints: [{ method: 'GET', path: '/v1/info' }]
				}
			}
		};
		expect(resolveEndpointPath(mintInfo, 'restore')).toBe('/v1/restore');
	});
});
