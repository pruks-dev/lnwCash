/**
 * TASK-259 (BLUEPRINT-003 v1.6.0 rev8): Re-key — atomic re-seed → swap.
 *
 * Verifies the re-key core module (rekey.ts):
 *   1. Round-trip: restored proofs → new deterministic proofs bound to the NEW seed.
 *   2. counter_k init = swap count (NOT 0).
 *   3. NUT-29 batch handling (> 1000 proofs → batched swaps).
 *   4. Mint selection: swap only mints that hold unspent proofs (proof.mint_url),
 *      optionally restricted to `options.mints`.
 *   5. Atomicity: swap failure → old proofs / seed / mnemonic untouched.
 *   6. Pending-rekey journal written before swap, cleared after commit.
 *   7. clearAllCounters: stale old-seed counters wiped on commit.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_A, MINT_B, KEYSET_ID, NEW_MNEMONIC, OLD_MNEMONIC } = vi.hoisted(() => ({
	MINT_A: 'https://mint-a.example.com',
	MINT_B: 'https://mint-b.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	NEW_MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	OLD_MNEMONIC: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
}));

vi.mock('../../cashu/client', () => ({
	swapProofs: vi.fn(),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([]),
	// getMintPubkey → null so rekey falls back to C = sig.C_ (no curve parse)
	getMintPubkey: vi.fn(() => null),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

// Mock blinding only (fast); the proof *secret* determinism still flows through
// the real NUT-13 deriveSecretAndR in nut13.ts.
vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockReturnValue({
		B_: '02' + 'bb'.repeat(32),
		blindingFactor: 'Zm9vYmFyYmF6'
	}),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

import {
	rekeyWallet,
	NUT29_MAX_BATCH_SIZE,
	getRekeyJournal,
	clearRekeyJournal,
	REKEY_JOURNAL_KEY
} from '../rekey';
import {
	deleteProofDB,
	resetProofDB,
	getAllProofs,
	addProofs,
	removeProofs
} from '../proofsDb';
import { setActiveSeed, clearActiveSeed, getActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { clearAllWalletData, getEncryptedMnemonic } from '../storage';
import { swapProofs } from '../../cashu/client';
import { decryptKey } from '../../crypto/encrypt';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';

const mockSwapProofs = vi.mocked(swapProofs);

/** A restored proof whose secret is arbitrary (NOT derivable from the new seed). */
function makeProof(i: number, mintUrl: string): TokenProof {
	return { id: KEYSET_ID, amount: 1, secret: `secret-${mintUrl}-${i}`, C: `C-${i}` };
}

/** Default swap mock: 1:1 signatures mirroring inputs (amount-balanced batches). */
function defaultSwapImpl() {
	mockSwapProofs.mockImplementation(async (_url, inputs, outputs) => ({
		signatures: (inputs as Array<{ id: string; amount: number }>).map((inp, i) => ({
			id: (outputs?.[i] as { id?: string } | undefined)?.id ?? inp.id,
			amount: inp.amount,
			C_: '02' + 'cc'.repeat(32)
		}))
	}));
}

describe('Re-key (rekey.ts — atomic re-seed → swap)', () => {
	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		clearRekeyJournal();
		vi.clearAllMocks();
		defaultSwapImpl();
		clearActiveSeed();
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		clearRekeyJournal();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('round-trip: restored proofs → new deterministic proofs bound to the new seed', async () => {
		await addProofs([makeProof(0, MINT_A), makeProof(1, MINT_A)], MINT_A, KEYSET_ID);
		// Simulate the restore that ran before re-key: old seed is active.
		setActiveSeed(mnemonicToSeed(OLD_MNEMONIC));

		const result = await rekeyWallet(NEW_MNEMONIC, TEST_PIN);

		expect(result.success).toBe(true);
		expect(result.swappedCount).toBe(2);
		expect(result.receivedCount).toBe(2);
		expect(result.batches).toBe(1);

		const stored = await getAllProofs();
		expect(stored.length).toBe(2);
		// old secrets are gone
		expect(
			stored.every(
				(p) => p.secret !== `secret-${MINT_A}-0` && p.secret !== `secret-${MINT_A}-1`
			)
		).toBe(true);

		// new proofs are deterministic w.r.t. the NEW active seed
		const newSeed = getActiveSeed();
		expect(newSeed).not.toBeNull();
		const expected = [
			deriveSecret(newSeed!, KEYSET_ID, 0),
			deriveSecret(newSeed!, KEYSET_ID, 1)
		].sort();
		expect(stored.map((p) => p.secret).sort()).toEqual(expected);

		// new mnemonic persisted and decrypts back to NEW_MNEMONIC
		const encrypted = getEncryptedMnemonic();
		expect(encrypted).not.toBeNull();
		expect(await decryptKey(encrypted!, TEST_PIN)).toBe(NEW_MNEMONIC);
	});

	it('sets counter_k = swap count (NOT 0)', async () => {
		await addProofs(
			[makeProof(0, MINT_A), makeProof(1, MINT_A), makeProof(2, MINT_A)],
			MINT_A,
			KEYSET_ID
		);
		expect(getCounterK(KEYSET_ID)).toBe(0);

		await rekeyWallet(NEW_MNEMONIC, TEST_PIN);

		expect(getCounterK(KEYSET_ID)).toBe(3);
	});

	it('batches swaps per NUT-29 (≤ 1000 per request) for > 1000 proofs', { timeout: 30000 }, async () => {
		expect(NUT29_MAX_BATCH_SIZE).toBe(1000);
		const proofs = Array.from({ length: 1001 }, (_, i) => makeProof(i, MINT_A));
		await addProofs(proofs, MINT_A, KEYSET_ID);

		await rekeyWallet(NEW_MNEMONIC, TEST_PIN);

		expect(mockSwapProofs).toHaveBeenCalledTimes(2);
		for (const call of mockSwapProofs.mock.calls) {
			const outputs = call[2] as Array<{ amount: number; id: string; B_: string }> | undefined;
			expect(outputs).toBeDefined();
			expect(outputs!.length).toBeLessThanOrEqual(1000);
		}

		expect(getCounterK(KEYSET_ID)).toBe(1001);
		expect((await getAllProofs()).length).toBe(1001);
	});

	it('swaps only mints that hold unspent proofs (proof.mint_url)', async () => {
		// MINT_A has one proof; MINT_B has none → only MINT_A is swapped.
		await addProofs([makeProof(0, MINT_A)], MINT_A, KEYSET_ID);

		await rekeyWallet(NEW_MNEMONIC, TEST_PIN);

		expect(mockSwapProofs).toHaveBeenCalledTimes(1);
		expect(mockSwapProofs).toHaveBeenCalledWith(MINT_A, expect.anything(), expect.anything());
	});

	it('restricts the swap to the selected mints (options.mints)', async () => {
		await addProofs([makeProof(0, MINT_A)], MINT_A, KEYSET_ID);
		await addProofs([makeProof(1, MINT_B)], MINT_B, KEYSET_ID);

		await rekeyWallet(NEW_MNEMONIC, TEST_PIN, { mints: [MINT_A] });

		expect(mockSwapProofs).toHaveBeenCalledTimes(1);
		expect(mockSwapProofs).toHaveBeenCalledWith(MINT_A, expect.anything(), expect.anything());
		// MINT_B's proof is NOT swapped (still present with its original secret)
		const stored = await getAllProofs();
		expect(stored.some((p) => p.secret === `secret-${MINT_B}-1`)).toBe(true);
	});

	it('atomic: swap failure leaves old proofs, seed and mnemonic untouched', async () => {
		await addProofs([makeProof(0, MINT_A), makeProof(1, MINT_A)], MINT_A, KEYSET_ID);
		const oldSeed = mnemonicToSeed(OLD_MNEMONIC);
		setActiveSeed(oldSeed);
		mockSwapProofs.mockRejectedValue(new Error('mint unreachable'));

		await expect(rekeyWallet(NEW_MNEMONIC, TEST_PIN)).rejects.toThrow(/mint unreachable/);

		const stored = await getAllProofs();
		expect(stored.map((p) => p.secret).sort()).toEqual(
			[`secret-${MINT_A}-0`, `secret-${MINT_A}-1`].sort()
		);

		// no new mnemonic, active seed restored, counter untouched, journal rolled back
		expect(getEncryptedMnemonic()).toBeNull();
		expect(getActiveSeed()).not.toBeNull();
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect(getRekeyJournal()).toBeNull();
	});

	it('writes the pending journal BEFORE swap and clears it after commit', async () => {
		await addProofs([makeProof(0, MINT_A)], MINT_A, KEYSET_ID);

		let journalDuringSwap: ReturnType<typeof getRekeyJournal> = null;
		mockSwapProofs.mockImplementation(async (_url, inputs, outputs) => {
			journalDuringSwap = getRekeyJournal();
			return {
				signatures: (inputs as Array<{ id: string; amount: number }>).map((inp, i) => ({
					id: (outputs?.[i] as { id?: string } | undefined)?.id ?? inp.id,
					amount: inp.amount,
					C_: '02' + 'cc'.repeat(32)
				}))
			};
		});

		await rekeyWallet(NEW_MNEMONIC, TEST_PIN);

		expect(journalDuringSwap).not.toBeNull();
		expect(journalDuringSwap!.status).toBe('pending');
		expect(journalDuringSwap!.encryptedNewMnemonic).toBeDefined();
		expect(getRekeyJournal()).toBeNull();
	});

	it('clears stale old-seed counters on commit (clearAllCounters)', async () => {
		setCounterK('stale-keyset', 42);
		await addProofs([makeProof(0, MINT_A)], MINT_A, KEYSET_ID);

		await rekeyWallet(NEW_MNEMONIC, TEST_PIN);

		expect(getCounterK('stale-keyset')).toBe(0);
		expect(getCounterK(KEYSET_ID)).toBe(1);
	});

	it('re-keys even with zero unspent proofs (still switches seed)', async () => {
		// No proofs at all → swap is a no-op, but the new seed is still adopted.
		const result = await rekeyWallet(NEW_MNEMONIC, TEST_PIN);

		expect(result.success).toBe(true);
		expect(result.swappedCount).toBe(0);
		expect(result.receivedCount).toBe(0);
		expect(mockSwapProofs).not.toHaveBeenCalled();

		const encrypted = getEncryptedMnemonic();
		expect(encrypted).not.toBeNull();
		expect(await decryptKey(encrypted!, TEST_PIN)).toBe(NEW_MNEMONIC);
		// new seed active
		const newSeed = getActiveSeed();
		expect(newSeed).not.toBeNull();
		expect(getRekeyJournal()).toBeNull();
	});
});
