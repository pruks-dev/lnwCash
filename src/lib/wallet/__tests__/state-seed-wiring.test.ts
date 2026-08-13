/**
 * TASK-215 — NUT-13 seed wiring at the wallet lifecycle level.
 *
 * Proves that unlockWallet() decrypts the stored BIP39 mnemonic and sets the
 * active NUT-13 seed (getActiveSeed()), and that lockWallet()/deleteWallet()
 * clear it. Also proves backward-compat: legacy 24-word wallets (no stored
 * mnemonic) and corrupt/missing mnemonics unlock gracefully without throwing.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	createWallet,
	unlockWallet,
	lockWallet,
	deleteWallet,
	getPrivateKey,
	isUnlocked
} from '../state';
import { getActiveSeed, setActiveSeed, clearActiveSeed } from '../nut13';
import {
	getEncryptedMnemonic,
	setEncryptedMnemonic,
	setPinHash,
	setEncryptedKey,
	setWalletState,
	clearAllWalletData
} from '../storage';
import { generateKeyPair, privateKeyToSeed, LEGACY_SEED_WORD_COUNT } from '../keys';
import { hashPin, encryptKey } from '../../crypto/encrypt';
import { deleteProofDB, resetProofDB } from '../proofsDb';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('NUT-13 seed wiring (lifecycle)', () => {
	beforeEach(async () => {
		clearActiveSeed();
		await clearAllWalletData();
	});

	afterEach(async () => {
		clearActiveSeed();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('unlock sets the active seed (deterministic, non-null)', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		lockWallet(); // ensure locked + seed cleared before unlock
		expect(getActiveSeed()).toBeNull();

		await unlockWallet(TEST_PIN);

		const seed = getActiveSeed();
		expect(seed).not.toBeNull();
		expect(seed).toBeInstanceOf(Uint8Array);
		expect(seed!.length).toBe(64); // 512-bit BIP39 seed
	});

	it('lock clears the active seed', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		expect(getActiveSeed()).not.toBeNull();

		lockWallet();

		expect(getActiveSeed()).toBeNull();
		expect(isUnlocked()).toBe(false);
	});

	it('delete clears the active seed', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		expect(getActiveSeed()).not.toBeNull();

		await deleteWallet();

		expect(getActiveSeed()).toBeNull();
	});

	it('unlock after lock re-sets the active seed (repeatable)', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		const seedFirst = getActiveSeed();
		lockWallet();
		expect(getActiveSeed()).toBeNull();

		await unlockWallet(TEST_PIN);
		const seedSecond = getActiveSeed();

		expect(seedSecond).not.toBeNull();
		expect(seedSecond).toEqual(seedFirst); // same mnemonic → same seed
	});
});

describe('NUT-13 seed wiring (legacy 24-word)', () => {
	beforeEach(async () => {
		clearActiveSeed();
		await clearAllWalletData();
	});

	afterEach(async () => {
		clearActiveSeed();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('legacy 24-word wallet unlocks with no stored mnemonic and no crash', async () => {
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

		// Unlock must still work (decrypt key directly), no crash
		await unlockWallet(TEST_PIN);
		expect(getPrivateKey()).toBe(privateKey);
		expect(isUnlocked()).toBe(true);

		// Active seed may be null for legacy wallets (no mnemonic to derive from)
		expect(getActiveSeed()).toBeNull();
	});

	it('legacy 24-word wallet lock/delete still clear (already-null) seed without error', async () => {
		const { privateKey } = generateKeyPair();
		const pinHash = await hashPin(TEST_PIN);
		const encryptedKey = await encryptKey(privateKey, TEST_PIN);
		setPinHash(pinHash);
		setEncryptedKey(encryptedKey);
		setWalletState('LOCKED');

		await unlockWallet(TEST_PIN);
		expect(getActiveSeed()).toBeNull();

		lockWallet();
		expect(getActiveSeed()).toBeNull();

		await deleteWallet();
		expect(getActiveSeed()).toBeNull();
	});
});

describe('NUT-13 seed wiring (mnemonic missing/corrupt fallback)', () => {
	beforeEach(async () => {
		clearActiveSeed();
		await clearAllWalletData();
	});

	afterEach(async () => {
		clearActiveSeed();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('unlock succeeds (no throw) when mnemonic ciphertext is corrupt', async () => {
		await createWallet(TEST_PIN, TEST_NAME);

		// Corrupt the stored mnemonic: encrypt with a DIFFERENT pin so that
		// decryptKey() throws (AES-GCM authentication failure) on unlock.
		const corrupt = await encryptKey('not the real mnemonic', 'wrong-pin');
		setEncryptedMnemonic(corrupt);

		lockWallet();

		await expect(unlockWallet(TEST_PIN)).resolves.toMatchObject({ state: 'UNLOCKED' });
		expect(isUnlocked()).toBe(true);
		expect(getActiveSeed()).toBeNull(); // graceful skip — no seed derived
	});

	it('unlock succeeds (no throw) when mnemonic decrypts to invalid content', async () => {
		await createWallet(TEST_PIN, TEST_NAME);

		// Valid encryption but invalid BIP39 content → seedFromMnemonic throws.
		const bogus = await encryptKey('not a valid bip39 mnemonic phrase', TEST_PIN);
		setEncryptedMnemonic(bogus);

		lockWallet();

		await expect(unlockWallet(TEST_PIN)).resolves.toMatchObject({ state: 'UNLOCKED' });
		expect(isUnlocked()).toBe(true);
		expect(getActiveSeed()).toBeNull(); // graceful skip — no seed derived
	});

	it('unlock succeeds (no throw) when no mnemonic is stored', async () => {
		// A wallet that only stores the encrypted key (no mnemonic key at all).
		const { privateKey } = generateKeyPair();
		const pinHash = await hashPin(TEST_PIN);
		const encryptedKey = await encryptKey(privateKey, TEST_PIN);
		setPinHash(pinHash);
		setEncryptedKey(encryptedKey);
		setWalletState('LOCKED');
		expect(getEncryptedMnemonic()).toBeNull();

		await expect(unlockWallet(TEST_PIN)).resolves.toMatchObject({ state: 'UNLOCKED' });
		expect(getPrivateKey()).toBe(privateKey);
		expect(getActiveSeed()).toBeNull();
	});

	it('setActiveSeed/getActiveSeed round-trips a raw seed for completeness', () => {
		const seed = new Uint8Array(64).fill(0xab);
		setActiveSeed(seed);
		expect(getActiveSeed()).toEqual(seed);
		clearActiveSeed();
		expect(getActiveSeed()).toBeNull();
	});
});
