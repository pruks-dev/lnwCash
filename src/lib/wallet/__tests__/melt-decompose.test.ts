/**
 * TASK-MELT-DECOMPOSE: melt change must be decomposed into standard Cashu
 * denominations, one blinded output per denomination, with the counter advanced
 * by the number of outputs.
 *
 * Regresses the Commander live-test fund-loss bug:
 *   proofs [32,32]=64 → pay 32 + fee_reserve 2 = 34 → change 30
 *   OLD: single change output of amount 30 → mint truncates to 16 → 14 sats lost.
 *   NEW: decompose 30 → [16, 8, 4, 2] → 4 outputs, sum 30, nothing lost.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn(),
	getKeysets: vi.fn().mockResolvedValue([
		{ id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0 }
	]),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	requestMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 32,
		fee_reserve: 2,
		paid: false,
		expiry: 9999999999
	}),
	meltTokens: vi.fn().mockResolvedValue({
		paid: true,
		payment_preimage: 'preimage-abc',
		change: [
			{ id: KEYSET_ID, amount: 16, C_: '02' + 'a1'.repeat(32) },
			{ id: KEYSET_ID, amount: 8, C_: '02' + 'a1'.repeat(32) },
			{ id: KEYSET_ID, amount: 4, C_: '02' + 'a1'.repeat(32) },
			{ id: KEYSET_ID, amount: 2, C_: '02' + 'a1'.repeat(32) }
		]
	}),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockResolvedValue({ states: [] }),
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 32,
		fee_reserve: 2,
		paid: false,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockReturnValue({
		B_: '02' + 'b1'.repeat(32),
		blindingFactor: 'Zm9vYmFyYmF6'
	}),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'ff'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getKeysetById: vi.fn().mockReturnValue({ id: KEYSET_ID }),
	getAllKeysets: vi.fn().mockReturnValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'ff'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(() => '02' + 'ff'.repeat(32)),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import * as client from '../../cashu/client';
import { blindMessage, unblindSignature } from '../../cashu/blind';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs } from '../proofsDb';
import { meltFlow } from '../melt';
import { setActiveSeed, clearActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('TASK-MELT-DECOMPOSE: change decomposed into denominations', () => {
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

		// Commander live-test setup: proofs [32,32] = 64 sats.
		// Melt 32 + fee_reserve 2 = 34 → change = 64 - 34 = 30.
		await addProofs([makeProof('p1', 32), makeProof('p2', 32)], MINT_URL, KEYSET_ID);

		// 2 proofs were "already minted" → counter starts at 2 (avoids the
		// counter-0 guard), change derives at counters 2, 3, 4, 5.
		setCounterK(KEYSET_ID, 2);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('melt 64 → pay 34 (32 + fee 2) → change 30 decomposed to [16,8,4,2] (4 outputs, sum 30)', async () => {
		const result = await meltFlow(MINT_URL, 'lnbc...', 32);

		expect(result.success).toBe(true);

		// The mint must receive 4 output bodies whose amounts are the
		// denominations [16,8,4,2] — NOT a single off-denomination 30.
		const meltTokensMock = client.meltTokens as ReturnType<typeof vi.fn>;
		expect(meltTokensMock).toHaveBeenCalledTimes(1);
		const outputBodies = meltTokensMock.mock.calls[0][3] as Array<{ amount: number }>;
		expect(outputBodies.map((o) => o.amount)).toEqual([16, 8, 4, 2]);
		expect(outputBodies.reduce((sum, o) => sum + o.amount, 0)).toBe(30); // nothing lost

		// 4 change proofs, one per denomination, sum 30 (the 14 sats are NOT lost).
		expect(result.change.length).toBe(4);
		expect(result.change.map((p) => p.amount)).toEqual([16, 8, 4, 2]);
		expect(result.change.reduce((sum, p) => sum + p.amount, 0)).toBe(30);
	});

	it('counter_k advances by changeAmounts.length (4), not by 1', async () => {
		expect(getCounterK(KEYSET_ID)).toBe(2);

		const result = await meltFlow(MINT_URL, 'lnbc...', 32);

		expect(result.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(2 + 4); // 2 → 6 (advance = 4 outputs)
	});

	it('each denomination derives its own deterministic secret and is unblinded', async () => {
		const result = await meltFlow(MINT_URL, 'lnbc...', 32);

		expect(result.success).toBe(true);
		expect(result.change.length).toBe(4);

		// Secrets follow NUT-13 counters 2..5 (startCounter=2 + i), one per output.
		const expectedAmounts = [16, 8, 4, 2];
		result.change.forEach((proof, i) => {
			expect(proof.amount).toBe(expectedAmounts[i]);
			expect(proof.secret).toBe(deriveSecret(seed, KEYSET_ID, 2 + i));
		});

		// Unblinding ran once per denomination.
		expect(unblindSignature).toHaveBeenCalledTimes(4);
		expect(blindMessage).toHaveBeenCalledTimes(4);
	});
});
