/**
 * Seed export/import tests
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportSeed, importSeed } from '../seed';
import { generateKeyPair, privateKeyToSeed, seedToPrivateKey } from '../keys';
import { createWallet, unlockWallet, deleteWallet, getPrivateKey } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB } from '../proofsDb';
import { InvalidPinError } from '../errors';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('Seed export/import', () => {
	beforeEach(async () => {
		await clearAllWalletData();
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	describe('exportSeed', () => {
		it('should export seed phrase from unlocked wallet', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			const seed = await exportSeed(TEST_PIN);
			expect(seed).toBeTruthy();
			expect(seed.split(' ').length).toBe(24);
		});

		it('should reject wrong PIN during export', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			await expect(exportSeed('wrongpin')).rejects.toThrow(InvalidPinError);
		});

		it('should export seed matching original private key', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			const pk = getPrivateKey();
			const seed = await exportSeed(TEST_PIN);
			const restoredPk = seedToPrivateKey(seed);

			expect(restoredPk).toBe(pk);
		});
	});

	describe('importSeed', () => {
		it('should import wallet from valid seed', async () => {
			// Create a keypair first
			const { privateKey } = generateKeyPair();
			const seed = privateKeyToSeed(privateKey);

			const result = await importSeed(seed, TEST_PIN, 'Imported');
			expect(result.publicKey).toBeTruthy();
			expect(result.publicKey.length).toBe(66);
		});

		it('should restore correct public key from seed', async () => {
			const { privateKey } = generateKeyPair();
			const { getPublicKey } = await import('../keys');
			const expectedPub = getPublicKey(privateKey);

			const seed = privateKeyToSeed(privateKey);
			const { publicKey } = await importSeed(seed, TEST_PIN, 'Restored');
			expect(publicKey).toBe(expectedPub);
		});

		it('should reject invalid seed', async () => {
			await expect(
				importSeed('invalid seed phrase here not valid', TEST_PIN, 'Fail')
			).rejects.toThrow(/expected 24 words/i);
		});

		it('should reject short PIN during import', async () => {
			const seed = privateKeyToSeed(generateKeyPair().privateKey);
			await expect(importSeed(seed, '123', 'Fail')).rejects.toThrow(/at least 6/i);
		});
	});

	describe('Roundtrip: export → delete wallet → import', () => {
		it('should fully restore wallet from seed after deletion', async () => {
			// Create wallet
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			const originalPk = getPrivateKey();
			const { getPublicKey } = await import('../keys');
			const originalPub = getPublicKey(originalPk);

			// Export seed
			const seed = await exportSeed(TEST_PIN);

			// Delete wallet
			await deleteWallet();

			// Import from seed
			const { publicKey } = await importSeed(seed, TEST_PIN, 'Restored');
			expect(publicKey).toBe(originalPub);

			// Verify the wallet works
			await unlockWallet(TEST_PIN);
			const restoredPk = getPrivateKey();
			expect(restoredPk).toBe(originalPk);
		});
	});
});
