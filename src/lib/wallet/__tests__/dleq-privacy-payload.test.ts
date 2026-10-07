/**
 * TASK-1314 — PRIVACY (NUT-12) payload pinning — REAL client boundary.
 *
 * NUT-12: "The entire dleq field SHOULD be removed before sending a Proof to
 * the mint as an input." Boundaries proven here:
 *   - /v1/swap (client.ts swapProofs): the SINGLE serialize point for swap
 *     inputs — internals rebuild inputs field-wise ({secret, C, amount, id});
 *     dleq CANNOT leak even from dleq-carrying callers (pinned here against
 *     the REAL client with a stubbed global fetch).
 *   - /v1/mint (client.ts mintTokens): outputs never carry dleq (pinned).
 *   - dleq SURVIVES the V4 token encode/decode roundtrip (Carol-forward
 *     chain intact between users — the strip is for MINT-bound payloads only).
 *   - /v1/melt input bodies: melt.ts builds field-wise inputBodies (no dleq)
 *     — pinned at the WALLET level in dleq-wiring-capture.test.ts (B6
 *     asserts the postMelt CALL ARGUMENTS dleq-gone). Same for the P2-locked
 *     online receive: its swap payload is wiped structurally at the same
 *     client serialize point that P-1 pins.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encodeToken, decodeToken } from '../../cashu/token';
import { swapProofs, mintTokens } from '../../cashu/client';
import { createTestMint, buildCarolChainFromKeys } from './dleq-harness';
import type { TokenProof } from '../../types';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

const MINT_URL = 'https://mint.dleqprivacy.test';
const mint = createTestMint('privacy');

function jsonResponse(code: number, data: unknown) {
	return { ok: code >= 200 && code < 300, status: code, json: () => Promise.resolve(data) };
}

beforeEach(() => {
	fetchMock.mockReset();
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('TASK-1314: privacy — mint-bound payloads carry NO dleq', () => {
	it('P-1) /v1/swap body: inputs {secret, C, amount, id} — dleq dropped even from dleq-carrying callers', async () => {
		const chain = buildCarolChainFromKeys(mint.privateKey, mint.A, 4, 'kset-priv', 'swap-in');
		// caller passes the proof WITH its dleq attached (worst case):
		const inputs = [chain.proof];
		fetchMock.mockResolvedValueOnce(jsonResponse(200, {
			signatures: [{ id: 'kset-priv', amount: 4, C_: '02' + '55'.repeat(32) }]
		}));

		await swapProofs(MINT_URL, inputs, [{ amount: 4, id: 'kset-priv', B_: chain.B_ }]);

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(fetchMock.mock.calls[0][0]).toBe(`${MINT_URL}/v1/swap`);
		expect(body.inputs).toHaveLength(1);
		// the ONLY keys present on the wire input:
		expect(Object.keys(body.inputs[0]).sort()).toEqual(['C', 'amount', 'id', 'secret']);
		// deep sweep: the word dleq appears NOWHERE in the serialized body
		expect(JSON.stringify(body).includes('dleq')).toBe(false);
	}, 15000);

	it('P-3) /v1/mint body: outputs {amount, id, B_} — no dleq by construction', async () => {
		const chain = buildCarolChainFromKeys(mint.privateKey, mint.A, 1, 'kset-priv', 'mint-out');
		fetchMock.mockResolvedValueOnce(jsonResponse(200, { signatures: [] }));

		await mintTokens(MINT_URL, 'q-mint', [{ amount: 1, id: 'kset-priv', B_: chain.B_ }]);

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(fetchMock.mock.calls[0][0]).toBe(`${MINT_URL}/v1/mint/bolt11`);
		expect(Object.keys(body.outputs[0]).sort()).toEqual(['B_', 'amount', 'id']);
		expect(JSON.stringify(body).includes('dleq')).toBe(false);
	}, 15000);

	it('P-4) V4 token roundtrip KEEPS dleq (Carol-forward intact — strip is mint-bound only)', async () => {
		const chains = [
			buildCarolChainFromKeys(mint.privateKey, mint.A, 2, 'kset-priv', 'tok-a'),
			buildCarolChainFromKeys(mint.privateKey, mint.A, 1, 'kset-priv', 'tok-b')
		];
		const tokenProofs: TokenProof[] = chains.map((c) => c.proof);
		const token = encodeToken(tokenProofs, MINT_URL, 'sat', 'keep-dleq');
		expect(token.startsWith('cashu')).toBe(true);

		const decoded = decodeToken(token);
		expect(decoded.proofs).toHaveLength(2);
		for (let i = 0; i < 2; i++) {
			expect(decoded.proofs[i].dleq).toBeDefined();
			expect(decoded.proofs[i].dleq!.e).toBe(chains[i].proof.dleq!.e);
			expect(decoded.proofs[i].dleq!.s).toBe(chains[i].proof.dleq!.s);
			expect(decoded.proofs[i].dleq!.r).toBe(chains[i].proof.dleq!.r);
		}
	}, 15000);
});
