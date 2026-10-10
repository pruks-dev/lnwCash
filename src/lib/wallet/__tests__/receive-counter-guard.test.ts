/**
 * TASK-1304 (INTENT-013) — integration: online swap receive:
 *   S = sum(decoded.proofs) → outputs = completeSet(S)
 *   counter_k advance = outputs.length (จุดเสี่ยง 2 HIGH — NOT decoded.length)
 *   + TASK-313-style alignment guard on the swap response.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn()
}));

vi.mock('../../cashu/client', () => ({
	checkState: vi.fn(),
	swapProofs: vi.fn(),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([]),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(() => null),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import * as client from '../../cashu/client';
import { decodeToken } from '../../cashu/token';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, getAllProofs } from '../proofsDb';
import { receiveTokens } from '../tokenStore';
import { setActiveSeed, clearActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeSet } from '../completeSet';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function setDecoded(proofAmounts: number[]): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: proofAmounts.map((amount, i) => ({
			id: KEYSET_ID,
			amount,
			secret: `olds${i}`,
			C: 'C-old' + i
		}))
	} as never);
}

/** Faithful mock mint: signs EXACTLY the submitted outputs (echo). */
function echoSwap(): void {
	vi.mocked(client.swapProofs).mockImplementation(
		async (_url: string, _inputs: unknown, outputs?: Array<{ id: string; amount: number; B_: string }>) => ({
			signatures: (outputs ?? []).map((o) => ({ id: o.id, amount: o.amount, C_: '02' + 'a1'.repeat(32) }))
		})
	);
}

describe('TASK-1304: online receive → completeSet(S), counter = outputs.length', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);

		// Fresh decode default: TWO input proofs [3, 2] → S = 5 →
		// completeSet(5) = [1,1,2,1] — FOUR outputs (≠ decoded.proofs.length).
		setDecoded([3, 2]);
		echoSwap();
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('counter_k advances by completeSet(S).length — NOT decoded.proofs.length (2)', async () => {
		const result = await receiveTokens('cashuAdummy');

		// S = 5 → outputs = completeSet(5) = [1,1,2,1] (4 outputs).
		const target = completeSet(5);
		expect(getCounterK(KEYSET_ID)).toBe(target.length); // 4 — not 2

		// The mint was asked to sign the complete-set denominations:
		const swapCall = vi.mocked(client.swapProofs).mock.calls[0];
		const submittedOutputs = swapCall[2] as Array<{ amount: number; id: string }>;
		expect(submittedOutputs.map((o) => o.amount).sort((a, b) => a - b))
			.toEqual([...target].sort((a, b) => a - b));

		// Stored pile == the complete set (sum 5, denominations [1,1,2,1]).
		const stored = await getAllProofs();
		expect(stored).toHaveLength(target.length);
		expect(stored.map((p) => p.amount).sort((a, b) => a - b))
			.toEqual([...target].sort((a, b) => a - b));
		expect(stored.reduce((s, p) => s + p.amount, 0)).toBe(5);
		// Derivation band consumed = outputs.length → secrets are counters 0..3:
		expect(stored.map((p) => p.secret).sort()).toEqual(
			target.map((_, i) => deriveSecret(seed, KEYSET_ID, i)).sort()
		);

		expect(result.proofCount).toBe(target.length);
		expect(result.amount).toBe(5);
	});

	it('counter continues across successive receives (no band reuse)', async () => {
		echoSwap();
		await receiveTokens('cashuAdummy');
		await receiveTokens('cashuAdummy');

		const target = completeSet(5);
		const all = (await getAllProofs()).map((p) => p.secret).sort();
		const expected = [
			...target.map((_, i) => deriveSecret(seed, KEYSET_ID, i)),
			...target.map((_, i) => deriveSecret(seed, KEYSET_ID, target.length + i))
		].sort();
		expect(all).toEqual(expected);
		// Two receives × outputs.length (never reusing the first band):
		expect(getCounterK(KEYSET_ID)).toBe(target.length * 2);
	});

	it('guard (sign > derive) rejects BEFORE counter advance — no proof stored', async () => {
		echoSwap(); // base echo
		vi.mocked(client.swapProofs).mockImplementation(
			async (_url: string, _inputs: unknown, outputs?: Array<{ amount: number }>) => ({
				signatures: [
					...(outputs ?? []).map((o) => ({ id: KEYSET_ID, amount: o.amount, C_: '02' + 'a1'.repeat(32) })),
					// mint "created" an output the wallet never derived:
					{ id: KEYSET_ID, amount: 1, C_: '02' + 'bb'.repeat(32) }
				]
			})
		);

		await expect(receiveTokens('cashuAdummy'))
			.rejects
			.toThrow(/Mint anomaly[\s\S]*counter_k desync/);
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect((await getAllProofs())).toHaveLength(0);
	});

	it('guard (sign < derive) refuses misaligned mapping — counter intact', async () => {
		echoSwap();
		vi.mocked(client.swapProofs).mockImplementation(
			async (_url: string, _inputs: unknown, outputs?: Array<{ amount: number }>) => ({
				signatures: (outputs ?? []).slice(0, (outputs ?? []).length - 1).map((o) => ({
					id: KEYSET_ID,
					amount: o.amount,
					C_: '02' + 'a1'.repeat(32)
				}))
			})
		);

		await expect(receiveTokens('cashuAdummy'))
			.rejects
			.toThrow(/Mint anomaly[\s\S]*misaligned/);
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect((await getAllProofs())).toHaveLength(0);
	});
});
