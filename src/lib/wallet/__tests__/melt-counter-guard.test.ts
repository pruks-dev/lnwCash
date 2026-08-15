/**
 * TASK-250 (RC-3): melt counter-0 guard.
 *
 * When `counter_k === 0` for a keyset but proofs for that keyset already exist
 * in IndexedDB, the counter was lost (e.g. localStorage cleared while IndexedDB
 * survived). Melting would derive change at counter 0 and reuse a secret the
 * mint already signed → "outputs already signed" (11003). The melt flow must
 * refuse and force NUT-9 restore instead.
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
		amount: 50,
		fee_reserve: 1,
		paid: false,
		expiry: 9999999999
	}),
	meltTokens: vi.fn().mockResolvedValue({
		paid: true,
		payment_preimage: 'preimage-abc',
		change: [{ id: KEYSET_ID, amount: 13, C_: '02' + 'a1'.repeat(32) }]
	}),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockResolvedValue({ states: [] }),
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 50,
		fee_reserve: 1,
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
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs } from '../proofsDb';
import { meltFlow } from '../melt';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('TASK-250 RC-3: melt counter-0 guard', () => {
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

		// 64 sats → melt 50 + fee_reserve 1 → change 13 (would derive at counter 0).
		// counter_k intentionally left at 0 to simulate localStorage loss.
		await addProofs([makeProof('p1', 64)], MINT_URL, KEYSET_ID);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('counter_k=0 + existing proofs → forced NUT-9 restore, meltTokens NOT called', async () => {
		expect(getCounterK(KEYSET_ID)).toBe(0);

		const result = await meltFlow(MINT_URL, 'lnbc...', 50);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/NUT-9|restore/i);
		// The melt must NOT reach the mint — no change output submitted.
		expect(client.meltTokens).not.toHaveBeenCalled();
		// Counter stays 0 until a real restore runs.
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});
});
