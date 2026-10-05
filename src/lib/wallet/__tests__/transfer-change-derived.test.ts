/**
 * TASK-F2-CHANGE-DERIVED: transfer.ts P2P send — CHANGE portion must be NUT-13
 * deterministic (recoverable from the seed); SEND portion stays random.
 *
 * The F2 bug (Thorne TASK-254) created random secrets for BOTH the send and the
 * change outputs of the internal NUT-03 swap, so change left in the wallet was
 * unrecoverable on restore (fund loss). SEND proofs go to the recipient (random
 * is correct); CHANGE proofs stay in our wallet (must be derived from the seed).
 *
 * `deriveSecretAndR` (nut13.ts) is NOT mocked — determinism flows through the
 * real NUT-13 derivation. Only the cashu client / blind / keyset modules are.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';
const MNEMONIC = 'half depart obvious quality work element tank gorilla view sugar picture humble';

vi.mock('../../cashu/client', () => ({
	swapProofs: vi.fn().mockImplementation(
		(_url: string, _proofs: unknown[], outputs: Array<{ amount: number; id: string }>) => ({
			signatures: outputs.map((o) => ({ id: o.id, amount: o.amount, C_: '02' + 'a1'.repeat(32) }))
		})
	),
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
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([]),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	// getMintPubkey returns null so unblind falls back to C = sig.C_ (no curve parsing)
	getMintPubkey: vi.fn(() => null),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs, getAllProofs } from '../proofsDb';
import { sendTokens } from '../transfer';
import { decodeToken } from '../../cashu/token';
import { setActiveSeed, clearActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeSet } from '../completeSet';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

describe('TASK-F2-CHANGE-DERIVED: transfer change deterministic, send random', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed); // known seed for deterministic assertions
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('derives change secrets deterministically and advances counter_k by change count', async () => {
		// single 32-sat proof → send 10 → change 22.
		// TASK-1305: change = completeSet(22) = [1,1,2,4,8] ⊕ decompose(6)
		// = [1,1,2,4,8,1,1,2,1,1] — 10 coins (INTENT-013 complete-set change;
		// dev DEV-1305-1: value expectations follow the mandated completeSet —
		// the DETERMINISM + counter-advance = change-count contract is unchanged)
		await addProofs([makeProof('p1', 32)], MINT_URL, KEYSET_ID);

		const result = await sendTokens(10, MINT_URL);

		// send portion is exactly the requested amount (8 + 2)
		expect(result.amount).toBe(10);

		// change portion is stored back into the wallet (unspent) — completeSet(22), 10 coins
		const change = (await getAllProofs()).filter((p) => !p.spent);
		expect(change.map((p) => p.amount).sort((a, b) => b - a)).toEqual([8, 4, 2, 2, 1, 1, 1, 1, 1, 1]);
		expect(change).toHaveLength(completeSet(22).length);

		// change secrets are the NUT-13 derivation for counters 0..9 (NOT random)
		expect(change.map((p) => p.secret).sort()).toEqual(
			completeSet(22).map((_, i) => deriveSecret(seed, KEYSET_ID, i)).sort()
		);

		// counter advanced by exactly the number of change outputs (completeSet(22).length = 10)
		expect(getCounterK(KEYSET_ID)).toBe(10);
	});

	it('same seed → same change secrets across independent runs (recoverable)', async () => {
		await addProofs([makeProof('p1', 32)], MINT_URL, KEYSET_ID);
		await sendTokens(10, MINT_URL);
		const firstChange = (await getAllProofs()).filter((p) => !p.spent).map((p) => p.secret).sort();

		// reset wallet state (counter + proofs) and re-run with the same seed
		localStorage.removeItem(STORAGE_KEY);
		await deleteProofDB();
		resetProofDB();
		await addProofs([makeProof('p1', 32)], MINT_URL, KEYSET_ID);
		await sendTokens(10, MINT_URL);
		const secondChange = (await getAllProofs()).filter((p) => !p.spent).map((p) => p.secret).sort();

		expect(secondChange).toEqual(firstChange);
		expect(firstChange).toEqual(
			completeSet(22).map((_, i) => deriveSecret(seed, KEYSET_ID, i)).sort()
		);
	});

	it('send portion stays random (not derivable from the seed)', async () => {
		await addProofs([makeProof('p1', 32)], MINT_URL, KEYSET_ID);
		const first = await sendTokens(10, MINT_URL);
		const firstSendSecrets = decodeToken(first.token).proofs.map((p) => p.secret);

		// reset and re-run with the same seed
		localStorage.removeItem(STORAGE_KEY);
		await deleteProofDB();
		resetProofDB();
		await addProofs([makeProof('p1', 32)], MINT_URL, KEYSET_ID);
		const second = await sendTokens(10, MINT_URL);
		const secondSendSecrets = decodeToken(second.token).proofs.map((p) => p.secret);

		// send = 2 outputs (8 + 2) and their secrets are random → differ across runs
		expect(firstSendSecrets.length).toBe(2);
		expect(secondSendSecrets).not.toEqual(firstSendSecrets);

		// send secrets must NOT be derivable from the seed at any counter
		for (let c = 0; c < 10; c++) {
			const derived = deriveSecret(seed, KEYSET_ID, c);
			expect(firstSendSecrets).not.toContain(derived);
			expect(secondSendSecrets).not.toContain(derived);
		}
	});

	it('legacy wallet (no active seed) → clear re-key/recover error, NOT random fallback', async () => {
		await addProofs([makeProof('p1', 32)], MINT_URL, KEYSET_ID);
		clearActiveSeed(); // simulate a legacy wallet with no mnemonic

		await expect(sendTokens(10, MINT_URL)).rejects.toThrow(/seed|re-key|recover/i);
		// counter must remain untouched (no random change fallback)
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});
});
