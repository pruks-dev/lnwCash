/**
 * TASK-252-fix (F1): counter_k must be reset on wallet delete / seed import /
 * create. A stale counter causes the next derived seed to replay an old
 * counter → gap → restore misalignment (root cause pinned in TASK-249).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWallet, deleteWallet } from '../state';
import { importSeed } from '../seed';
import { generateMnemonic } from '../keys';
import { clearAllWalletData } from '../storage';
import {
	setCounterK,
	getCounterK,
	getAllCounters,
	clearAllCounters,
	STORAGE_KEY
} from '../counterK';
import { deleteProofDB, resetProofDB } from '../proofsDb';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const KS_A = '01' + 'aa'.repeat(32);

/** Seed a stale counter so we can assert it gets wiped. */
function seedStaleCounter(): void {
	setCounterK(KS_A, 42);
	expect(getCounterK(KS_A)).toBe(42); // sanity: stale counter present
}

describe('counter_k reset on wallet lifecycle (TASK-252-fix)', () => {
	beforeEach(async () => {
		clearAllCounters();
		await clearAllWalletData();
	});

	afterEach(async () => {
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('deleteWallet should reset counter_k to 0', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		seedStaleCounter();

		await deleteWallet();

		expect(getCounterK(KS_A)).toBe(0);
		expect(getAllCounters()).toEqual({});
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('importSeed should reset counter_k to 0', async () => {
		seedStaleCounter();
		const mnemonic = generateMnemonic();

		await importSeed(mnemonic, TEST_PIN, 'Imported');

		expect(getCounterK(KS_A)).toBe(0);
		expect(getAllCounters()).toEqual({});
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('createWallet should reset counter_k to 0', async () => {
		seedStaleCounter();

		await createWallet(TEST_PIN, TEST_NAME);

		expect(getCounterK(KS_A)).toBe(0);
		expect(getAllCounters()).toEqual({});
		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it('clearAllWalletData should reset counter_k to 0', async () => {
		seedStaleCounter();

		await clearAllWalletData();

		expect(getCounterK(KS_A)).toBe(0);
		expect(getAllCounters()).toEqual({});
	});
});
