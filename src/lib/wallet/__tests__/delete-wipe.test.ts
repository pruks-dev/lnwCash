/**
 * TASK-265 + TASK-273 (fix 5): deleteWallet() full-wipe test.
 *
 * Verifies that deleteWallet() clears EVERYTHING:
 *   - localStorage: encrypted key, encrypted mnemonic, PIN hash, wallet state,
 *     wallet metadata, NUT-13 counters, mint configs, user settings, AND every
 *     residue key (rekey journal, lockout counter + device secret, active mint,
 *     autolock timeout, keyset cache) → localStorage.length === 0.
 *   - IndexedDB: proofs.
 *
 * The TASK-265 change adds clearMintConfigs() + clearSettings() BEFORE
 * clearAllWalletData(); TASK-273 (fix 5) adds localStorage.clear() so a full
 * delete leaves ZERO residue instead of selective key counting.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWallet, deleteWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { setMintConfig, getAllMintConfigs } from '../store';
import { setSettings } from '../../storage/local';
import { setCounterK, getAllCounters } from '../counterK';
import { addProofs, getAllProofs, deleteProofDB, resetProofDB } from '../proofsDb';
import { addTransaction, getTransactions, deleteDatabase, resetDB } from '../../storage/db';
import type { TokenProof, Transaction } from '../../types';

const TEST_PIN = '1234';
const TEST_NAME = 'Test Wallet';

const PROOF: TokenProof = {
	id: 'proof-1',
	amount: 1,
	secret: 'secret-0001',
	C: 'c-0001'
};

/** Residue keys TASK-273 (fix 5) must wipe — none of these are core wallet keys. */
const RESIDUE_KEYS = [
	'lnwcash_rekey_journal',
	'lnwcash_lockout_counter',
	'lnwcash_lockout_device_secret',
	'lnwcash_active_mint',
	'lnwcash_autolock_timeout',
	'lnwcash_keyset_cache'
] as const;

describe('TASK-265 + TASK-273: deleteWallet wipes all storage', () => {
	beforeEach(async () => {
		localStorage.clear();
		await deleteProofDB();
		resetProofDB();
		await deleteDatabase();
		resetDB();
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		await deleteDatabase();
		resetDB();
		localStorage.clear();
	});

	it('clears every localStorage key (wallet + mint configs + settings + residue) and IndexedDB proofs', async () => {
		// Seed a full wallet: core keys, mint config, settings, counter, proofs,
		// plus every residue key (rekey journal, lockout, active mint, autolock,
		// keyset cache) that a real session could leave behind.
		await createWallet(TEST_PIN, TEST_NAME);
		setMintConfig({
			url: 'https://example.com',
			name: 'Example',
			pubkey: '03' + '00'.repeat(32),
			version: 'Nutshell/0.20.1',
			supported_nuts: ['04', '05'],
			cached_endpoints: [],
			ttl: 0,
			last_info_fetch: 0
		});
		setSettings({ language: 'th', theme: 'dark', default_mint: 'https://example.com' });
		setCounterK('ks-1', 42);
		await addProofs([PROOF], 'https://example.com', 'ks-1');
		for (const key of RESIDUE_KEYS) {
			localStorage.setItem(key, `residue-${key}`);
		}

		// Sanity: data exists BEFORE delete.
		expect(localStorage.getItem('lnwcash_encrypted_key')).not.toBeNull();
		expect(localStorage.getItem('lnwcash_encrypted_mnemonic')).not.toBeNull();
		expect(localStorage.getItem('lnwcash_pin_hash')).not.toBeNull();
		expect(localStorage.getItem('lnwcash_wallet_state')).not.toBeNull();
		expect(localStorage.getItem('lnwcash_wallet_meta')).not.toBeNull();
		expect(localStorage.getItem('lnwcash_counter_k')).not.toBeNull();
		expect(localStorage.getItem('lnwcash_mint_configs')).not.toBeNull();
		expect(localStorage.getItem('lnwcash_settings')).not.toBeNull();
		for (const key of RESIDUE_KEYS) {
			expect(localStorage.getItem(key)).not.toBeNull();
		}
		expect(getAllMintConfigs().length).toBeGreaterThan(0);
		expect(Object.keys(getAllCounters()).length).toBeGreaterThan(0);
		expect((await getAllProofs()).length).toBeGreaterThan(0);

		await deleteWallet();

		// TASK-273 (fix 5): the authoritative assertion — localStorage is FULLY
		// empty (length 0), not just the known keys.
		expect(localStorage.length).toBe(0);

		// localStorage — every wallet/config/settings key is gone.
		expect(localStorage.getItem('lnwcash_encrypted_key')).toBeNull();
		expect(localStorage.getItem('lnwcash_encrypted_mnemonic')).toBeNull();
		expect(localStorage.getItem('lnwcash_pin_hash')).toBeNull();
		expect(localStorage.getItem('lnwcash_wallet_state')).toBeNull();
		expect(localStorage.getItem('lnwcash_wallet_meta')).toBeNull();
		expect(localStorage.getItem('lnwcash_counter_k')).toBeNull();
		expect(localStorage.getItem('lnwcash_mint_configs')).toBeNull();
		expect(localStorage.getItem('lnwcash_settings')).toBeNull();
		// Every residue key is gone too.
		for (const key of RESIDUE_KEYS) {
			expect(localStorage.getItem(key)).toBeNull();
		}
		expect(getAllCounters()).toEqual({});

		// IndexedDB — proofs fully wiped.
		expect(await getAllProofs()).toEqual([]);
	});

	it('clears residue keys even without a wallet (delete is a pure full wipe)', async () => {
		// No wallet created — only residue keys present.
		for (const key of RESIDUE_KEYS) {
			localStorage.setItem(key, `residue-${key}`);
		}

		await deleteWallet();

		expect(localStorage.length).toBe(0);
		for (const key of RESIDUE_KEYS) {
			expect(localStorage.getItem(key)).toBeNull();
		}
	});

	it('recreates a fresh wallet after a full delete (state returns to UNINITIALIZED)', async () => {
		await createWallet(TEST_PIN, TEST_NAME);
		await deleteWallet();

		// A delete must reset state so the setup welcome (create/recover) can run.
		const { createWallet: recreate } = await import('../state');
		const result = await recreate(TEST_PIN, 'Fresh Wallet');
		expect(result.state).toBe('LOCKED');
		expect(localStorage.getItem('lnwcash_encrypted_key')).not.toBeNull();
	});

	it('TASK-276: clears the transactions IndexedDB (add → delete → getTransactions() === [])', async () => {
		// Seed a wallet + a transaction, then delete the wallet. The transactions
		// IndexedDB ('lnw-cash' / 'transactions' store) must be wiped so no
		// transaction history survives the delete.
		await createWallet(TEST_PIN, TEST_NAME);
		const tx: Transaction = {
			id: 'tx-276',
			type: 'mint',
			amount: 1000,
			mint_url: 'https://example.com',
			timestamp: Date.now(),
			token_hash: null,
			status: 'confirmed'
		};
		await addTransaction(tx);

		// Sanity: the transaction exists BEFORE delete.
		expect(await getTransactions()).toHaveLength(1);

		await deleteWallet();

		// TASK-276 acceptance: transaction history is empty after delete.
		expect(await getTransactions()).toEqual([]);
	});
});
