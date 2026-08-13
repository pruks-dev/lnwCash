/**
 * Seed export/import tests — BIP39 (12-word) + legacy (24-word) dual support.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exportSeed, importSeed } from '../seed';
import {
	generateKeyPair,
	generateMnemonic,
	mnemonicToPrivateKey,
	privateKeyToSeed,
	seedToPrivateKey,
	getPublicKey,
	BIP39_SEED_WORD_COUNT,
	LEGACY_SEED_WORD_COUNT
} from '../keys';
import { createWallet, unlockWallet, deleteWallet, getPrivateKey } from '../state';
import { clearAllWalletData, setPinHash, setEncryptedKey, setWalletState, getEncryptedMnemonic } from '../storage';
import { hashPin, encryptKey } from '../../crypto/encrypt';
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
		it('should export a 12-word BIP39 seed phrase from a new wallet', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			const seed = await exportSeed(TEST_PIN);
			expect(seed).toBeTruthy();
			expect(seed.split(' ').length).toBe(BIP39_SEED_WORD_COUNT);
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

	describe('importSeed (12-word BIP39)', () => {
		it('should import wallet from valid 12-word mnemonic', async () => {
			const mnemonic = generateMnemonic();
			const result = await importSeed(mnemonic, TEST_PIN, 'Imported');
			expect(result.publicKey).toBeTruthy();
			expect(result.publicKey.length).toBe(66);
		});

		it('should restore correct public key from 12-word mnemonic', async () => {
			const mnemonic = generateMnemonic();
			const expectedPub = getPublicKey(mnemonicToPrivateKey(mnemonic));

			const { publicKey } = await importSeed(mnemonic, TEST_PIN, 'Restored');
			expect(publicKey).toBe(expectedPub);
		});

		it('should re-export the same 12-word mnemonic after import', async () => {
			const mnemonic = generateMnemonic();
			await importSeed(mnemonic, TEST_PIN, 'Imported');
			await unlockWallet(TEST_PIN);

			const exported = await exportSeed(TEST_PIN);
			expect(exported).toBe(mnemonic);
		});
	});

	describe('importSeed (24-word legacy, backward compat)', () => {
		it('should import wallet from valid 24-word legacy seed', async () => {
			const { privateKey } = generateKeyPair();
			const seed = privateKeyToSeed(privateKey);

			const result = await importSeed(seed, TEST_PIN, 'Legacy');
			expect(result.publicKey).toBeTruthy();
			expect(result.publicKey.length).toBe(66);
		});

		it('should restore correct public key from 24-word legacy seed', async () => {
			const { privateKey } = generateKeyPair();
			const seed = privateKeyToSeed(privateKey);
			const expectedPub = getPublicKey(privateKey);

			const { publicKey } = await importSeed(seed, TEST_PIN, 'Legacy');
			expect(publicKey).toBe(expectedPub);
		});
	});

	describe('invalid seed rejection', () => {
		it('should reject seed with unsupported word count', async () => {
			await expect(
				importSeed('invalid seed phrase here not valid', TEST_PIN, 'Fail')
			).rejects.toThrow(/expected 12 or 24 words/i);
		});

		it('should reject a 12-word mnemonic with bad checksum', async () => {
			const bad =
				'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
			await expect(importSeed(bad, TEST_PIN, 'Fail')).rejects.toThrow(/checksum/i);
		});

		it('should reject short PIN during import', async () => {
			const mnemonic = generateMnemonic();
			await expect(importSeed(mnemonic, '123', 'Fail')).rejects.toThrow(/at least 4/i);
		});
	});

	describe('Roundtrip: export → delete wallet → import', () => {
		it('should fully restore wallet from 12-word seed after deletion', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			const originalPk = getPrivateKey();
			const originalPub = getPublicKey(originalPk);

			const seed = await exportSeed(TEST_PIN);

			await deleteWallet();

			const { publicKey } = await importSeed(seed, TEST_PIN, 'Restored');
			expect(publicKey).toBe(originalPub);

			await unlockWallet(TEST_PIN);
			const restoredPk = getPrivateKey();
			expect(restoredPk).toBe(originalPk);
		});
	});

	describe('Legacy 24-word wallet backward compatibility', () => {
		it('should unlock and export a legacy wallet that stores only the encrypted key', async () => {
			const { privateKey } = generateKeyPair();
			const legacySeed = privateKeyToSeed(privateKey);
			expect(legacySeed.split(' ').length).toBe(LEGACY_SEED_WORD_COUNT);

			// Simulate a v1 wallet: only encrypted key + pin hash, NO mnemonic.
			const pinHash = await hashPin(TEST_PIN);
			const encryptedKey = await encryptKey(privateKey, TEST_PIN);
			setPinHash(pinHash);
			setEncryptedKey(encryptedKey);
			setWalletState('LOCKED');

			// Assert this is a legacy wallet (no mnemonic persisted)
			expect(getEncryptedMnemonic()).toBeNull();

			// 1. Unlock must still work (decrypt key directly)
			await unlockWallet(TEST_PIN);
			expect(getPrivateKey()).toBe(privateKey);

			// 2. Export must return the original 24-word phrase
			const exported = await exportSeed(TEST_PIN);
			expect(exported.split(' ').length).toBe(LEGACY_SEED_WORD_COUNT);
			expect(seedToPrivateKey(exported)).toBe(privateKey);

			// 3. The exported phrase round-trips back to the same key
			expect(exported).toBe(legacySeed);
		});
	});
});
