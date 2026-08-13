/**
 * TASK-219 — changePin() orchestration tests.
 *
 * Proves that changing the wallet PIN re-encrypts the private key (and the
 * BIP39 mnemonic) under the new PIN while preserving the underlying key
 * material and recovery phrase verbatim.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	createWallet,
	unlockWallet,
	lockWallet,
	deleteWallet,
	changePin,
	getPrivateKey,
	isUnlocked
} from '../state';
import { exportSeed } from '../seed';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB } from '../proofsDb';
import { InvalidPinError, WalletNotInitializedError } from '../errors';

const OLD_PIN = '1234';
const NEW_PIN = '9876';
const TEST_NAME = 'Test Wallet';

describe('changePin orchestration', () => {
	beforeEach(async () => {
		await clearAllWalletData();
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('round-trips: unlock(newPin) succeeds and private key is unchanged', async () => {
		await createWallet(OLD_PIN, TEST_NAME);
		await unlockWallet(OLD_PIN);
		const pkBefore = getPrivateKey();

		await changePin(OLD_PIN, NEW_PIN);

		// In-memory key stays valid (same private key, just re-encrypted)
		expect(isUnlocked()).toBe(true);
		expect(getPrivateKey()).toBe(pkBefore);

		// Lock + unlock with the NEW pin must recover the SAME key
		lockWallet();
		await unlockWallet(NEW_PIN);
		expect(getPrivateKey()).toBe(pkBefore);
	});

	it('throws InvalidPinError on wrong current PIN', async () => {
		await createWallet(OLD_PIN, TEST_NAME);
		await expect(changePin('wrongpin', NEW_PIN)).rejects.toThrow(InvalidPinError);
	});

	it('old PIN fails after change; new PIN unlocks', async () => {
		await createWallet(OLD_PIN, TEST_NAME);
		await changePin(OLD_PIN, NEW_PIN);

		// Old PIN no longer unlocks
		await expect(unlockWallet(OLD_PIN)).rejects.toThrow(InvalidPinError);

		// New PIN unlocks cleanly
		await expect(unlockWallet(NEW_PIN)).resolves.toMatchObject({ state: 'UNLOCKED' });
		expect(isUnlocked()).toBe(true);
	});

	it('throws on newPin shorter than 4 characters', async () => {
		await createWallet(OLD_PIN, TEST_NAME);
		await expect(changePin(OLD_PIN, '123')).rejects.toThrow(/at least 4/i);
	});

	it('throws WalletNotInitializedError when no wallet exists', async () => {
		await expect(changePin(OLD_PIN, NEW_PIN)).rejects.toThrow(WalletNotInitializedError);
	});

	it('preserves the 12-word mnemonic verbatim across a PIN change', async () => {
		await createWallet(OLD_PIN, TEST_NAME);
		await unlockWallet(OLD_PIN);

		const seedBefore = await exportSeed(OLD_PIN);
		expect(seedBefore.split(' ').length).toBe(12);

		await changePin(OLD_PIN, NEW_PIN);

		const seedAfter = await exportSeed(NEW_PIN);
		expect(seedAfter).toBe(seedBefore);

		// And the old PIN can no longer decrypt the mnemonic
		await expect(exportSeed(OLD_PIN)).rejects.toThrow(InvalidPinError);
	});
});
