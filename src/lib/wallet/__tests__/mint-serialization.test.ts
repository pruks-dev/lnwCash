/**
 * TASK-250 (RC-3): atomic read → derive → advance serialization.
 *
 * NUT-13 derivation reads `counter_k`, derives secrets, then (after network I/O)
 * advances the counter. Two concurrent operations on the same keyset could both
 * read the same counter and derive the same secret → "outputs already signed"
 * (11003). `withKeysetLock` serializes the whole critical section per keyset.
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
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	mintTokens: vi.fn().mockResolvedValue({ signatures: [] }),
	checkMintQuote: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	pollMintQuoteUntil: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	checkState: vi.fn(),
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
	deterministicBlindingFactor: vi.fn().mockReturnValue(12345n),
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
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(() => '02' + 'ff'.repeat(32)),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB } from '../proofsDb';
import { completeMint, decomposeAmount } from '../mint';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY, withKeysetLock } from '../counterK';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('TASK-250 RC-3: atomic derivation serialization', () => {
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
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('withKeysetLock serializes concurrent critical sections (no interleave)', async () => {
		let firstDone = false;

		const first = withKeysetLock('KS-test', async () => {
			await new Promise((r) => setTimeout(r, 20));
			firstDone = true;
		});

		const second = withKeysetLock('KS-test', async () => {
			// Without the lock this runs while `first` is still sleeping → fails.
			expect(firstDone).toBe(true);
		});

		await Promise.all([first, second]);
	});

	it('concurrent mints on the same keyset derive distinct secrets (no duplicate)', async () => {
		const signaturesFor = () =>
			decomposeAmount(3).map((a) => ({ id: KEYSET_ID, amount: a, C_: '02' + 'a1'.repeat(32) }));

		let callCount = 0;
		let releaseFirst!: (v: { signatures: unknown[] }) => void;
		let releaseSecond!: (v: { signatures: unknown[] }) => void;

		(client.mintTokens as ReturnType<typeof vi.fn>).mockImplementation(() => {
			callCount += 1;
			return new Promise((resolve) => {
				if (callCount === 1) releaseFirst = resolve;
				else releaseSecond = resolve;
			});
		});

		const p1 = completeMint(MINT_URL, 'q1', 3, KEYSET_ID, false, seed);
		const p2 = completeMint(MINT_URL, 'q2', 3, KEYSET_ID, false, seed);

		// The first mint must enter the critical section and call mintTokens…
		await vi.waitFor(() => {
			expect(callCount).toBe(1);
		});
		// …while the second mint is still blocked on the per-keyset lock.
		expect(callCount).toBe(1);

		releaseFirst({ signatures: signaturesFor() });
		const r1 = await p1;

		// Once the first mint finishes and advances the counter, the second proceeds.
		await vi.waitFor(() => {
			expect(callCount).toBe(2);
		});
		releaseSecond({ signatures: signaturesFor() });
		const r2 = await p2;

		expect(r1.success).toBe(true);
		expect(r2.success).toBe(true);

		const allSecrets = [...r1.proofs, ...r2.proofs].map((p) => p.secret);
		// 2 outputs each → 4 distinct secrets (counter 0,1 then 2,3 — no overlap).
		expect(new Set(allSecrets).size).toBe(4);
		expect(getCounterK(KEYSET_ID)).toBe(4);
	});
});
