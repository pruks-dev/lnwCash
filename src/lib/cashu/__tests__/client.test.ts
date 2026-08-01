/**
 * Cashu mint HTTP client tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	getMintInfo,
	getKeysets,
	getKeys,
	requestMintQuote,
	mintTokens,
	requestMeltQuote,
	meltTokens,
	checkState,
	CashuError,
	MintUnreachableError,
	NetworkError
} from '../client';

const MINT_A = 'https://mint-a.example.com';
const MINT_B = 'https://mint-b.example.com';

// Mock fetch globally
const mockFetch = vi.fn();
let originalFetch: typeof fetch;

describe('Cashu mint HTTP client', () => {
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch;
		mockFetch.mockReset();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	// ─── getMintInfo ──────────────────────────────────────────

	describe('getMintInfo', () => {
		it('should fetch mint info successfully', async () => {
			const mockInfo = {
				name: 'Test Mint',
				pubkey: 'abc123',
				version: 'Nutshell/0.15',
				nuts: { '4': { supported: true }, '5': { supported: true } }
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockInfo)
			});

			const info = await getMintInfo(MINT_A);
			expect(info.name).toBe('Test Mint');
			expect(info.pubkey).toBe('abc123');
			expect(mockFetch).toHaveBeenCalledWith(
				`${MINT_A}/v1/info`,
				expect.objectContaining({ method: 'GET' })
			);
		});

		it('should support multi-mint: different URLs produce different calls', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ name: 'Mint A', pubkey: 'a', version: '1.0' })
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve({ name: 'Mint B', pubkey: 'b', version: '1.0' })
				});

			const infoA = await getMintInfo(MINT_A);
			const infoB = await getMintInfo(MINT_B);

			expect(infoA.name).toBe('Mint A');
			expect(infoB.name).toBe('Mint B');
			expect(mockFetch).toHaveBeenNthCalledWith(1, `${MINT_A}/v1/info`, expect.anything());
			expect(mockFetch).toHaveBeenNthCalledWith(2, `${MINT_B}/v1/info`, expect.anything());
		});

		it('should throw MintUnreachableError when fetch fails', async () => {
			const error = new TypeError('Failed to fetch');
			mockFetch.mockRejectedValueOnce(error);

			await expect(getMintInfo('https://offline.example.com')).rejects.toThrow(
				MintUnreachableError
			);
		});

		it('should throw CashuError on non-200 response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				json: () => Promise.resolve({ detail: 'Server down' })
			});

			try {
				await getMintInfo(MINT_A);
				expect.fail('Should have thrown');
			} catch (e) {
				expect(e).toBeInstanceOf(CashuError);
				if (e instanceof CashuError) {
					expect(e.status).toBe(500);
				}
			}
		});
	});

	// ─── getKeysets ───────────────────────────────────────────

	describe('getKeysets', () => {
		it('should fetch keysets array', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						keysets: [
							{ id: 'ks-001', unit: 'sat', active: true },
							{ id: 'ks-002', unit: 'usd', active: false }
						]
					})
			});

			const keysets = await getKeysets(MINT_A);
			expect(keysets).toHaveLength(2);
			expect(keysets[0].id).toBe('ks-001');
			expect(keysets[1].unit).toBe('usd');
		});

		it('should handle keysets returned as string array', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						keysets: ['ks-001', 'ks-002']
					})
			});

			const keysets = await getKeysets(MINT_A);
			expect(keysets).toHaveLength(2);
			expect(keysets[0].id).toBe('ks-001');
			expect(keysets[0].unit).toBe('sat'); // default unit
		});
	});

	// ─── getKeys ──────────────────────────────────────────────

	describe('getKeys', () => {
		it('should fetch keys for a specific keyset', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						keysets: [
							{
								id: 'ks-001',
								keys: { '1': 'pubkey1', '2': 'pubkey2', '4': 'pubkey3' }
							}
						]
					})
			});

			const keys = await getKeys(MINT_A, 'ks-001');
			expect(keys).toHaveProperty('1');
			expect(keys[1]).toBe('pubkey1');
		});

		it('should URL-encode keyset ID in path', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ keysets: [{ id: 'ks/001', keys: {} }] })
			});

			await getKeys(MINT_A, 'ks/001');
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/v1/keys/'),
				expect.anything()
			);
			// Check the URL was properly encoded
			const url = mockFetch.mock.calls[0][0] as string;
			expect(url).not.toContain('/v1/keys/ks/001'); // raw slash should be encoded
		});
	});

	// ─── requestMintQuote ─────────────────────────────────────

	describe('requestMintQuote', () => {
		it('should request a mint quote', async () => {
			const mockQuote = {
				quote: 'quote-abc',
				request: 'lnbc...',
				paid: false,
				expiry: Date.now() + 3600000
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockQuote)
			});

			const quote = await requestMintQuote(MINT_A, 1000);
			expect(quote.quote).toBe('quote-abc');
			expect(mockFetch).toHaveBeenCalledWith(
				`${MINT_A}/v1/mint/quote/bolt11`,
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ amount: 1000 })
				})
			);
		});
	});

	// ─── mintTokens ───────────────────────────────────────────

	describe('mintTokens', () => {
		it('should submit outputs for blind signatures', async () => {
			const mockResponse = {
				signatures: [
					{ id: 'ks-001', amount: 64, C_: 'blind-sig-1' },
					{ id: 'ks-001', amount: 32, C_: 'blind-sig-2' }
				]
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			});

			const outputs = [{ id: 'ks-001', amount: 64, B_: 'blind-1' }];
			const response = await mintTokens(MINT_A, 'quote-abc', outputs);

			expect(response.signatures).toHaveLength(2);
			expect(response.signatures[0].C_).toBe('blind-sig-1');
		});
	});

	// ─── requestMeltQuote ─────────────────────────────────────

	describe('requestMeltQuote', () => {
		it('should request a melt quote with invoice', async () => {
			const mockQuote = {
				quote: 'melt-quote-001',
				amount: 1000,
				fee_reserve: 10,
				paid: false,
				expiry: Date.now() + 3600000
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockQuote)
			});

			const quote = await requestMeltQuote(MINT_A, 'lnbc...invoice');
			expect(quote.quote).toBe('melt-quote-001');
			expect(mockFetch).toHaveBeenCalledWith(
				`${MINT_A}/v1/melt/quote/bolt11`,
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ request: 'lnbc...invoice' })
				})
			);
		});

		it('should optionally include amount in melt quote', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						quote: 'q',
						amount: 500,
						fee_reserve: 5,
						paid: false,
						expiry: 1
					})
			});

			await requestMeltQuote(MINT_A, 'lnbc...', 500);
			expect(mockFetch).toHaveBeenCalledWith(
				`${MINT_A}/v1/melt/quote/bolt11`,
				expect.objectContaining({
					body: JSON.stringify({ request: 'lnbc...', amount: 500 })
				})
			);
		});
	});

	// ─── meltTokens ───────────────────────────────────────────

	describe('meltTokens', () => {
		it('should melt tokens and receive change', async () => {
			const mockResponse = {
				paid: true,
				preimage: 'preimage-123',
				change: [{ id: 'ks-001', amount: 100, C_: 'change-sig' }]
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			});

			const inputs = [{ id: 'ks-001', amount: 500, C: 'proof' }];
			const outputs = [{ id: 'ks-001', amount: 100, B_: 'blind-change' }];
			const response = await meltTokens(MINT_A, 'melt-quote', inputs, outputs);

			expect(response.paid).toBe(true);
			expect(response.preimage).toBe('preimage-123');
			expect(response.change).toHaveLength(1);
		});

		it('should handle melt without outputs', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ paid: true })
			});

			const inputs = [{ id: 'ks-001', amount: 500, C: 'proof' }];
			const response = await meltTokens(MINT_A, 'quote', inputs);

			expect(response.paid).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				`${MINT_A}/v1/melt/bolt11`,
				expect.objectContaining({
					body: JSON.stringify({ quote: 'quote', inputs })
				})
			);
		});
	});

	// ─── checkState (NUT-07) ───────────────────────────────────

	describe('checkState', () => {
		it('C07-01: should check state of a single proof', async () => {
			const mockResponse = {
				states: [
					{ secret: 'proof-secret-1', state: 'UNSPENT', witness: null }
				]
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			});

			const response = await checkState(MINT_A, [
				{ secret: 'proof-secret-1', C: 'sig-1' }
			]);

			expect(response.states).toHaveLength(1);
			expect(response.states[0].secret).toBe('proof-secret-1');
			expect(response.states[0].state).toBe('UNSPENT');
			expect(mockFetch).toHaveBeenCalledWith(
				`${MINT_A}/v1/checkstate`,
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({
						proofs: [{ secret: 'proof-secret-1', C: 'sig-1' }]
					})
				})
			);
		});

		it('C07-01: should check state of multiple proofs', async () => {
			const mockResponse = {
				states: [
					{ secret: 's1', state: 'UNSPENT', witness: null },
					{ secret: 's2', state: 'SPENT', witness: null }
				]
			};

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse)
			});

			const response = await checkState(MINT_A, [
				{ secret: 's1' },
				{ secret: 's2' }
			]);

			expect(response.states).toHaveLength(2);
			expect(response.states[0].state).toBe('UNSPENT');
			expect(response.states[1].state).toBe('SPENT');
		});

		it('C07-01: should handle empty proof list', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ states: [] })
			});

			const response = await checkState(MINT_A, []);
			expect(response.states).toHaveLength(0);
		});
	});

	// ─── Error handling ───────────────────────────────────────

	describe('error handling', () => {
		it('should throw NetworkError on timeout', async () => {
			mockFetch.mockImplementationOnce(() => {
				return new Promise((_, reject) => {
					const error = new DOMException('The operation was aborted', 'AbortError');
					reject(error);
				});
			});

			await expect(getMintInfo(MINT_A)).rejects.toThrow(NetworkError);
		});

		it('should handle non-JSON response gracefully', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 502,
				statusText: 'Bad Gateway',
				json: () => Promise.reject(new Error('Invalid JSON'))
			});

			await expect(getMintInfo(MINT_A)).rejects.toThrow(CashuError);
		});

		it('should normalize mint URL (strip trailing slashes)', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ name: 'test', pubkey: 'x', version: '1' })
			});

			await getMintInfo('https://mint.example.com///');
			expect(mockFetch).toHaveBeenCalledWith(
				'https://mint.example.com/v1/info',
				expect.anything()
			);
		});
	});
});
