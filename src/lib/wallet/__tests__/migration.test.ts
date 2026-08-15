/**
 * TASK-245 (F-V26-003): Re-seed → swap migration.
 * TASK-245-fix (T246-SEC-01): Phase B commit atomicity — mnemonic/seed persist
 *   BEFORE swap; crash mid-commit remains recoverable from the new mnemonic.
 *
 * Verifies:
 *   1. Round-trip: legacy (random-secret) proofs → new deterministic proofs
 *      bound to the NEW seed.
 *   2. counter_k init = swap count (NOT 0).
 *   3. NUT-29 batch handling (> 1000 proofs → batched swaps).
 *   4. Atomicity: swap failure → old proofs / seed / mnemonic untouched.
 *   5. Phase B crash path: mnemonic persists before removeProofs → recoverable.
 *   6. Pending-migration journal written before swap, cleared after commit.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
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
	// getMintPubkey → null so migration falls back to C = sig.C_ (no curve parse)
	getMintPubkey: vi.fn(() => null),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

// Mock blinding only (fast, avoids per-proof hash_to_curve); the proof *secret*
// determinism still flows through the real NUT-13 deriveSecretAndR in nut13.ts.
vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockReturnValue({
		B_: '02' + 'bb'.repeat(32),
		blindingFactor: 'Zm9vYmFyYmF6'
	}),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

// Wrap proofsDb.removeProofs in a spy so the crash-path test can make it throw
// (simulating a kill mid-commit), while every other function stays real.
vi.mock('../proofsDb', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../proofsDb')>();
	return {
		...actual,
		removeProofs: vi.fn(actual.removeProofs)
	};
});

import { createWallet } from '../state';
import {
	clearAllWalletData,
	clearEncryptedMnemonic,
	getEncryptedMnemonic
} from '../storage';
import { deleteProofDB, resetProofDB, getAllProofs, addProofs, removeProofs } from '../proofsDb';
import { setActiveSeed, clearActiveSeed, getActiveSeed, deriveSecret } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import {
	detectLegacyProofs,
	migrateWallet,
	NUT29_MAX_BATCH_SIZE,
	getMigrationJournal,
	clearMigrationJournal,
	recoverPendingMigration,
	MIGRATION_JOURNAL_KEY
} from '../migration';
import { swapProofs } from '../../cashu/client';
import { decryptKey } from '../../crypto/encrypt';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

const mockSwapProofs = vi.mocked(swapProofs);
const mockRemoveProofs = vi.mocked(removeProofs);

/** A legacy proof whose secret is random (NOT derivable from any seed). */
function makeLegacyProof(i: number): TokenProof {
	return { id: KEYSET_ID, amount: 1, secret: `legacy-secret-${i}`, C: `legacy-C-${i}` };
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

describe('Re-seed → swap migration (TASK-245)', () => {
	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		clearMigrationJournal();
		vi.clearAllMocks();
		defaultSwapImpl();

		await createWallet(TEST_PIN, TEST_NAME);
		// Simulate a pre-v1.4.1 legacy wallet: no mnemonic, no active seed.
		clearEncryptedMnemonic();
		clearActiveSeed();
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		clearMigrationJournal();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('detects legacy proofs when no mnemonic is stored', async () => {
		await addProofs([makeLegacyProof(0), makeLegacyProof(1)], MINT_URL, KEYSET_ID);

		const legacy = await detectLegacyProofs();
		expect(legacy.length).toBe(2);
	});

	it('detects NO legacy proofs when proofs are deterministic under the active seed', async () => {
		const seed = mnemonicToSeed(MNEMONIC);
		setActiveSeed(seed);
		setCounterK(KEYSET_ID, 1); // so counters 0 and 1 are both considered
		const deterministic = [deriveSecret(seed, KEYSET_ID, 0), deriveSecret(seed, KEYSET_ID, 1)];
		await addProofs(
			deterministic.map((s, i) => ({ id: KEYSET_ID, amount: 1, secret: s, C: `C-${i}` })),
			MINT_URL,
			KEYSET_ID
		);

		expect(await detectLegacyProofs()).toEqual([]);
	});

	it('round-trip: legacy proofs → new deterministic proofs bound to the new seed', async () => {
		await addProofs([makeLegacyProof(0), makeLegacyProof(1)], MINT_URL, KEYSET_ID);

		const result = await migrateWallet(TEST_PIN);

		expect(result.success).toBe(true);
		expect(result.swappedCount).toBe(2);
		expect(result.receivedCount).toBe(2);
		expect(result.batches).toBe(1);

		const stored = await getAllProofs();
		expect(stored.length).toBe(2);
		// old random secrets are gone
		expect(stored.every((p) => p.secret !== 'legacy-secret-0' && p.secret !== 'legacy-secret-1')).toBe(
			true
		);

		// new proofs are deterministic w.r.t. the NEW active seed
		const newSeed = getActiveSeed();
		expect(newSeed).not.toBeNull();
		const expected = [
			deriveSecret(newSeed!, KEYSET_ID, 0),
			deriveSecret(newSeed!, KEYSET_ID, 1)
		].sort();
		expect(stored.map((p) => p.secret).sort()).toEqual(expected);

		// new mnemonic persisted
		expect(getEncryptedMnemonic()).not.toBeNull();
	});

	it('sets counter_k = swap count (NOT 0)', async () => {
		await addProofs(
			[makeLegacyProof(0), makeLegacyProof(1), makeLegacyProof(2)],
			MINT_URL,
			KEYSET_ID
		);
		expect(getCounterK(KEYSET_ID)).toBe(0);

		await migrateWallet(TEST_PIN);

		expect(getCounterK(KEYSET_ID)).toBe(3);
	});

	it('batches swaps per NUT-29 (≤ 1000 per request) for > 1000 proofs', { timeout: 30000 }, async () => {
		expect(NUT29_MAX_BATCH_SIZE).toBe(1000);
		const proofs = Array.from({ length: 1001 }, (_, i) => makeLegacyProof(i));
		await addProofs(proofs, MINT_URL, KEYSET_ID);

		await migrateWallet(TEST_PIN);

		expect(mockSwapProofs).toHaveBeenCalledTimes(2);
		for (const call of mockSwapProofs.mock.calls) {
			const outputs = call[2] as Array<{ amount: number; id: string; B_: string }> | undefined;
			expect(outputs).toBeDefined();
			expect(outputs!.length).toBeLessThanOrEqual(1000);
		}

		expect(getCounterK(KEYSET_ID)).toBe(1001);
		expect((await getAllProofs()).length).toBe(1001);
	});

	it('atomic: swap failure leaves old proofs, seed and mnemonic untouched', async () => {
		await addProofs([makeLegacyProof(0), makeLegacyProof(1)], MINT_URL, KEYSET_ID);
		mockSwapProofs.mockRejectedValue(new Error('mint unreachable'));

		await expect(migrateWallet(TEST_PIN)).rejects.toThrow(/mint unreachable/);

		// old proofs NOT cleared
		const stored = await getAllProofs();
		expect(stored.map((p) => p.secret).sort()).toEqual(
			['legacy-secret-0', 'legacy-secret-1'].sort()
		);

		// no new mnemonic, no active seed, counter untouched, journal rolled back
		expect(getEncryptedMnemonic()).toBeNull();
		expect(getActiveSeed()).toBeNull();
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect(getMigrationJournal()).toBeNull();
	});

	it('rejects a wrong PIN before any swap', async () => {
		await addProofs([makeLegacyProof(0)], MINT_URL, KEYSET_ID);

		await expect(migrateWallet('000000')).rejects.toThrow(/PIN/i);

		// no swap attempted, old proof intact
		expect(mockSwapProofs).not.toHaveBeenCalled();
		expect((await getAllProofs()).length).toBe(1);
	});

	it('writes the pending journal BEFORE swap and clears it after commit', async () => {
		await addProofs([makeLegacyProof(0)], MINT_URL, KEYSET_ID);

		let journalDuringSwap: ReturnType<typeof getMigrationJournal> = null;
		mockSwapProofs.mockImplementation(async (url, inputs, outputs) => {
			journalDuringSwap = getMigrationJournal();
			return {
				signatures: (inputs as Array<{ id: string; amount: number }>).map((inp, i) => ({
					id: (outputs?.[i] as { id?: string } | undefined)?.id ?? inp.id,
					amount: inp.amount,
					C_: '02' + 'cc'.repeat(32)
				}))
			};
		});

		await migrateWallet(TEST_PIN);

		// Journal (recovery anchor) exists DURING the swap…
		expect(journalDuringSwap).not.toBeNull();
		expect(journalDuringSwap!.status).toBe('pending');
		expect(journalDuringSwap!.encryptedNewMnemonic).toBeDefined();
		// …and is cleared once the commit completes.
		expect(getMigrationJournal()).toBeNull();
	});

	it('Phase B crash path: mnemonic persists before removeProofs → proofs recoverable', async () => {
		await addProofs([makeLegacyProof(0), makeLegacyProof(1)], MINT_URL, KEYSET_ID);

		// Simulate a kill mid-commit: removeProofs throws AFTER addProofs succeeded.
		mockRemoveProofs.mockRejectedValueOnce(new Error('crash mid-commit (kill)'));

		await expect(migrateWallet(TEST_PIN)).rejects.toThrow(/crash mid-commit/);

		// Recovery anchor: the NEW mnemonic was persisted BEFORE old proofs were
		// removed → no fund-loss window. (In the OLD ordering this was NULL here.)
		const encrypted = getEncryptedMnemonic();
		expect(encrypted).not.toBeNull();

		// Pending journal still present (commit never completed) → recoverable.
		expect(getMigrationJournal()).not.toBeNull();

		// The NEW deterministic proofs were added before the crash → funds intact.
		// Recover the mnemonic exactly as unlock/restore would, and prove its
		// seed re-derives the swapped proofs' secrets.
		const newMnemonic = await decryptKey(encrypted!, TEST_PIN);
		const newSeed = mnemonicToSeed(newMnemonic);
		const newSecrets = [
			deriveSecret(newSeed, KEYSET_ID, 0),
			deriveSecret(newSeed, KEYSET_ID, 1)
		];
		const stored = await getAllProofs();
		for (const s of newSecrets) {
			expect(stored.some((p) => p.secret === s)).toBe(true);
		}
		// Old proofs were NOT yet removed (removeProofs threw) → both remain.
		expect(stored.length).toBe(4);

		// recoverPendingMigration() is idempotent and reports the pending anchor.
		expect(recoverPendingMigration()).toBe(true);
		expect(recoverPendingMigration()).toBe(true);
	});

	it('journal present → detectLegacyProofs keeps reporting proofs (resume)', async () => {
		await addProofs([makeLegacyProof(0)], MINT_URL, KEYSET_ID);

		// Emulate a crash before swap completed: pending journal left behind,
		// no mnemonic, no active seed.
		localStorage.setItem(
			MIGRATION_JOURNAL_KEY,
			JSON.stringify({
				status: 'pending',
				encryptedNewMnemonic: { salt: 'x', iv: 'y', iterations: 600000, data: 'z' },
				startedAt: Date.now()
			})
		);

		// Old proofs are still reported as legacy so the UI can re-offer migration.
		const legacy = await detectLegacyProofs();
		expect(legacy.length).toBe(1);

		// recoverPendingMigration() promotes the journaled mnemonic (no-op here
		// because it is a dummy, but it must not throw and must report success).
		expect(recoverPendingMigration()).toBe(true);
	});
});
