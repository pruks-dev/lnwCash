/**
 * Wallet lifecycle (state machine) tests
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	createWallet,
	unlockWallet,
	lockWallet,
	deleteWallet,
	getWalletStatus,
	isUnlocked,
	getPrivateKey
} from '../state';
import {
	getEncryptedKey,
	getPinHash,
	getWalletState as getStoredState,
	clearAllWalletData
} from '../storage';
import { deleteProofDB, resetProofDB } from '../proofsDb';
import {
	WalletLockedError,
	WalletNotInitializedError,
	InvalidPinError
} from '../errors';

const TEST_PIN = '1234';
const TEST_NAME = 'Test Wallet';

describe('Wallet lifecycle', () => {
	beforeEach(async () => {
		// Ensure clean state
		await clearAllWalletData();
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	describe('createWallet', () => {
		it('should create a wallet and return public key', async () => {
			const result = await createWallet(TEST_PIN, TEST_NAME);
			expect(result.publicKey).toBeTruthy();
			expect(result.publicKey.length).toBe(66);
			expect(result.state).toBe('LOCKED');
		});

		it('should store encrypted key and PIN hash', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			const enc = getEncryptedKey();
			const hash = getPinHash();
			expect(enc).not.toBeNull();
			expect(hash).not.toBeNull();
			expect(enc?.salt).toBeTruthy();
			expect(enc?.data).toBeTruthy();
		});

		it('should set wallet state to LOCKED', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			expect(getStoredState()).toBe('LOCKED');
		});

		it('should reject PIN shorter than 4 chars', async () => {
			await expect(createWallet('123', TEST_NAME)).rejects.toThrow(/at least 4/i);
		});

		it('should accept a 4-digit PIN (TASK-209 D5)', async () => {
			const result = await createWallet('9876', TEST_NAME);
			expect(result.state).toBe('LOCKED');
		});

		it('should reject duplicate wallet creation', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await expect(createWallet('654321', 'Another')).rejects.toThrow(/already exists/i);
		});
	});

	describe('unlockWallet', () => {
		beforeEach(async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			// Wallet is already LOCKED after creation (but private key is temporarily in memory)
			lockWallet(); // Ensure locked state for testing
		});

		it('should unlock with correct PIN', async () => {
			const status = await unlockWallet(TEST_PIN);
			expect(status.state).toBe('UNLOCKED');
			expect(isUnlocked()).toBe(true);
		});

		it('should reject wrong PIN', async () => {
			await expect(unlockWallet('wrongpin')).rejects.toThrow(InvalidPinError);
		});

		it('should make private key accessible after unlock', async () => {
			await unlockWallet(TEST_PIN);
			const pk = getPrivateKey();
			expect(pk).toBeTruthy();
			expect(typeof pk).toBe('string');
		});

		it('should throw WalletNotInitializedError if no wallet', async () => {
			await clearAllWalletData();
			await expect(unlockWallet(TEST_PIN)).rejects.toThrow(WalletNotInitializedError);
		});
	});

	describe('lockWallet', () => {
		it('should lock and clear in-memory private key', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);
			expect(isUnlocked()).toBe(true);

			lockWallet();
			expect(isUnlocked()).toBe(false);
			expect(getStoredState()).toBe('LOCKED');

			// getPrivateKey should throw
			expect(() => getPrivateKey()).toThrow(WalletLockedError);
		});
	});

	describe('deleteWallet', () => {
		it('should clear all wallet data', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await deleteWallet();

			expect(getEncryptedKey()).toBeNull();
			expect(getPinHash()).toBeNull();
			expect(getStoredState()).toBe('UNINITIALIZED');
		});

		it('should clear in-memory private key', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);
			await deleteWallet();
			expect(() => getPrivateKey()).toThrow(WalletLockedError);
		});
	});

	describe('getWalletStatus', () => {
		it('should return UNINITIALIZED when no wallet', () => {
			const status = getWalletStatus();
			expect(status.state).toBe('UNINITIALIZED');
		});

		it('should return wallet metadata', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			const status = getWalletStatus();
			expect(status.walletName).toBe(TEST_NAME);
			expect(status.createdAt).toBeGreaterThan(0);
		});
	});

	describe('State machine transitions', () => {
		it('UNINITIALIZED -> LOCKED (create)', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			expect(getStoredState()).toBe('LOCKED');
		});

		it('LOCKED -> UNLOCKED -> LOCKED', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			lockWallet();
			expect(getStoredState()).toBe('LOCKED');

			await unlockWallet(TEST_PIN);
			expect(getStoredState()).toBe('UNLOCKED');

			lockWallet();
			expect(getStoredState()).toBe('LOCKED');
		});

		it('LOCKED -> UNLOCKED -> delete -> UNINITIALIZED', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);
			await deleteWallet();
			expect(getStoredState()).toBe('UNINITIALIZED');
		});
	});
});
