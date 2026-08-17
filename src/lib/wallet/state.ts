/**
 * Wallet lifecycle state machine.
 *
 * States: UNINITIALIZED → LOCKED → UNLOCKED
 *                          ↑         ↓
 *                          └─────────┘  (lock)
 *                          ↑         ↓
 *                          └─ DELETED ─┘  (delete resets to UNINITIALIZED)
 *
 * Private key is stored encrypted in localStorage at all times.
 * When unlocked, the plaintext private key exists ONLY in memory (closure).
 * lockWallet() clears the in-memory key.
 */
import { hashPin, verifyPin, encryptKey, decryptKey } from '../crypto/encrypt';
import { generateKeyPair } from './keys';
import {
	getEncryptedKey,
	setEncryptedKey,
	getEncryptedMnemonic,
	setEncryptedMnemonic,
	getPinHash,
	setPinHash,
	getWalletState,
	setWalletState,
	clearAllWalletData,
	type WalletStateEnum
} from './storage';
import { deleteProofDB } from './proofsDb';
import { deleteDatabase } from '../storage/db';
import { setWalletMetadata, clearSettings } from '../storage/local';
import { clearMintConfigs } from './store';
import { InvalidPinError, WalletLockedError, WalletNotInitializedError } from './errors';
import { setActiveSeed, clearActiveSeed, seedFromMnemonic } from './nut13';
import { clearAllCounters } from './counterK';

// ─── In-Memory State (CLOSURE — never persisted) ─────────────

let unlockedPrivateKey: string | null = null;

// ─── State Machine ───────────────────────────────────────────

export type WalletState = {
	state: WalletStateEnum;
	walletName: string | null;
	createdAt: number | null;
};

/**
 * Create a new wallet with a PIN (4+ digits).
 *
 * 1. Generate secp256k1 keypair
 * 2. Hash PIN for verification
 * 3. Encrypt private key with PIN-derived key
 * 4. Save encrypted key + PIN hash + metadata to localStorage
 * 5. Set state to LOCKED (user must call unlockWallet)
 *
 * @returns KeyPair (public key for display, private key stays in-memory until lock)
 */
export async function createWallet(
	pin: string,
	walletName: string
): Promise<{ publicKey: string; state: WalletStateEnum }> {
	if (getWalletState() !== 'UNINITIALIZED') {
		throw new Error('Wallet already exists — delete it first');
	}

	if (pin.length < 4) {
		throw new Error('PIN must be at least 4 characters');
	}

	// Generate keypair (BIP39 mnemonic → private key)
	const { privateKey, publicKey, mnemonic } = generateKeyPair();

	// Hash PIN for future verification
	const pinHash = await hashPin(pin);
	setPinHash(pinHash);

	// Encrypt private key with PIN
	const encryptedKey = await encryptKey(privateKey, pin);
	setEncryptedKey(encryptedKey);

	// Encrypt the BIP39 mnemonic too — it cannot be derived back from the key
	const encryptedMnemonic = await encryptKey(mnemonic, pin);
	setEncryptedMnemonic(encryptedMnemonic);

	// Save metadata
	const createdAt = Date.now();
	setWalletMetadata({ name: walletName, created_at: createdAt });

	// Set state to LOCKED
	setWalletState('LOCKED');

	// Reset NUT-13 counters — a fresh wallet must start counter_k = 0.
	clearAllCounters();

	// CRITICAL: Clear private key from memory — wallet starts LOCKED
	unlockedPrivateKey = null;

	return { publicKey, state: 'LOCKED' };
}

/**
 * Unlock the wallet by verifying the PIN and decrypting the private key.
 *
 * 1. Load encrypted key + PIN hash from localStorage
 * 2. Verify PIN against stored hash
 * 3. Decrypt private key → keep in memory
 * 4. Set state to UNLOCKED
 *
 * @throws InvalidPinError if PIN is wrong
 * @throws WalletNotInitializedError if no wallet exists
 */
export async function unlockWallet(pin: string): Promise<WalletState> {
	const state = getWalletState();
	if (state === 'UNINITIALIZED') {
		throw new WalletNotInitializedError();
	}

	const pinHash = getPinHash();
	const encryptedKey = getEncryptedKey();

	if (!pinHash || !encryptedKey) {
		throw new WalletNotInitializedError();
	}

	// Verify PIN
	const valid = await verifyPin(pin, pinHash);
	if (!valid) {
		throw new InvalidPinError();
	}

	// Decrypt private key
	const privateKey = await decryptKey(encryptedKey, pin);
	unlockedPrivateKey = privateKey;

	// Decrypt the stored BIP39 mnemonic (if present) and set the active NUT-13
	// seed so the mint path can pull it via getActiveSeed() for deterministic
	// proof secrets. Graceful: legacy 24-word wallets store no mnemonic, and a
	// corrupt/undecryptable mnemonic must not block unlock — unlock proceeds
	// without an active seed (TASK-250: minting now requires a seed instead of
	// falling back to random secrets).
	const encryptedMnemonic = getEncryptedMnemonic();
	if (encryptedMnemonic) {
		try {
			const mnemonic = await decryptKey(encryptedMnemonic, pin);
			setActiveSeed(seedFromMnemonic(mnemonic));
		} catch {
			// corrupt mnemonic → skip, leave active seed unset
		}
	}

	setWalletState('UNLOCKED');

	return getWalletStatus();
}

/**
 * Change the wallet PIN by re-encrypting the private key (and BIP39 mnemonic,
 * when present) under the new PIN. The underlying key material is unchanged —
 * only the encryption PIN changes, so the in-memory unlocked private key stays
 * valid and the active NUT-13 seed is left untouched.
 *
 * 1. Validate the new PIN length
 * 2. Verify the current PIN against the stored hash
 * 3. Decrypt the private key with the current PIN
 * 4. Re-encrypt the private key (and mnemonic) with the new PIN
 * 5. Persist the new PIN hash + re-encrypted blobs
 *
 * @throws Error('PIN must be at least 4 characters') if newPin is too short
 * @throws WalletNotInitializedError if no wallet exists
 * @throws InvalidPinError if currentPin is wrong
 */
export async function changePin(currentPin: string, newPin: string): Promise<void> {
	if (newPin.length < 4) {
		throw new Error('PIN must be at least 4 characters');
	}

	const pinHash = getPinHash();
	if (!pinHash) {
		throw new WalletNotInitializedError();
	}

	const valid = await verifyPin(currentPin, pinHash);
	if (!valid) {
		throw new InvalidPinError();
	}

	const encryptedKey = getEncryptedKey();
	const encryptedMnemonic = getEncryptedMnemonic();
	if (!encryptedKey) {
		throw new WalletNotInitializedError();
	}

	const privateKey = await decryptKey(encryptedKey, currentPin);
	const newPinHash = await hashPin(newPin);
	const newEncryptedKey = await encryptKey(privateKey, newPin);

	// Re-encrypt the BIP39 mnemonic under the new PIN as-is (no re-derivation),
	// so exportSeed() returns the identical recovery phrase after a PIN change.
	if (encryptedMnemonic) {
		const mnemonic = await decryptKey(encryptedMnemonic, currentPin);
		const newEncryptedMnemonic = await encryptKey(mnemonic, newPin);
		setEncryptedMnemonic(newEncryptedMnemonic);
	}

	setPinHash(newPinHash);
	setEncryptedKey(newEncryptedKey);
}

/**
 * Lock the wallet: clear in-memory private key, set state to LOCKED.
 */
export function lockWallet(): WalletState {
	unlockedPrivateKey = null;
	clearActiveSeed();
	setWalletState('LOCKED');
	return getWalletStatus();
}

/**
 * Delete the wallet: clear ALL data (localStorage + IndexedDB), reset state.
 * This is IRREVERSIBLE — funds will be lost if proofs aren't backed up!
 */
export async function deleteWallet(): Promise<void> {
	unlockedPrivateKey = null;
	clearActiveSeed();
	clearSessionPin();
	// TASK-265 + TASK-273 (fix 5): reset the in-memory mint config store + user
	// settings, then wipe storage COMPLETELY — clearAllWalletData() removes the
	// core keys (+ their native secure-storage mirrors) + IndexedDB proofs, and
	// the final localStorage.clear() is the authoritative full wipe that removes
	// EVERY remaining key (rekey journal, lockout counter + device secret, active
	// mint, autolock timeout, keyset cache) so localStorage.length === 0.
	clearMintConfigs();
	clearSettings();
	await clearAllWalletData();
	localStorage.clear();
	// TASK-276 (fix 8): also delete the transactions IndexedDB. The wallet keeps
	// TWO IndexedDB stores — proofsDb.ts (proofs, already wiped by
	// clearAllWalletData()/deleteProofDB) and storage/db.ts (transactions). A
	// full wallet delete must wipe BOTH so no transaction history survives.
	await deleteDatabase();
}

/**
 * Get current wallet status (public info only — no private key).
 */
export function getWalletStatus(): WalletState {
	const state = getWalletState();
	const meta = (() => {
		try {
			const raw = localStorage.getItem('lnwcash_wallet_meta');
			if (raw) return JSON.parse(raw);
		} catch { /* ignore */ }
		return null;
	})();

	return {
		state,
		walletName: meta?.name ?? null,
		createdAt: meta?.created_at ?? null
	};
}

/**
 * Get the unlocked private key (for internal wallet operations).
 * CRITICAL: Never expose this outside the wallet module.
 *
 * @throws WalletLockedError if wallet is not unlocked
 */
export function getPrivateKey(): string {
	if (!unlockedPrivateKey) {
		throw new WalletLockedError();
	}
	return unlockedPrivateKey;
}

/**
 * TASK-273 (fix 6c): refresh the in-memory unlocked private key after a re-key.
 *
 * rekeyWallet() persists the NEW encrypted key + activates the NEW seed BEFORE
 * swapping, so the in-memory key must rotate to the NEW key at the same anchor —
 * otherwise getPrivateKey() returns a stale OLD key while every NUT-13 proof
 * secret is derived from the NEW seed (key/seed mismatch → mint/melt/swap
 * signatures fail or derive wrong keys).
 *
 * This is an internal wallet-module hook (NOT a public unlock path): it does not
 * verify a PIN. Callers must only pass the key they already derived from the NEW
 * mnemonic inside rekeyWallet(), or null to clear (zero-success rollback).
 *
 * @param privateKey New plaintext private key (base64url), or null to clear.
 */
export function refreshUnlockedPrivateKey(privateKey: string | null): void {
	unlockedPrivateKey = privateKey;
}

/**
 * Check if wallet is currently unlocked.
 */
export function isUnlocked(): boolean {
	return unlockedPrivateKey !== null && getWalletState() === 'UNLOCKED';
}

// ─── Re-export storage functions needed by other modules ─────

export { getEncryptedKey, getPinHash, getWalletState, setWalletState };

// ─── TASK-092 (F-061): Session PIN for auto-unlock ───────────

const SESSION_PIN_KEY = 'lnw_session_pin';

/** Store PIN in sessionStorage for auto-unlock on page refresh */
export function storeSessionPin(pin: string): void {
	try {
		sessionStorage.setItem(SESSION_PIN_KEY, pin);
	} catch {
		// sessionStorage unavailable (e.g., private browsing)
	}
}

/** Read PIN from sessionStorage */
export function getSessionPin(): string | null {
	try {
		return sessionStorage.getItem(SESSION_PIN_KEY);
	} catch {
		return null;
	}
}

/** Clear PIN from sessionStorage */
export function clearSessionPin(): void {
	try {
		sessionStorage.removeItem(SESSION_PIN_KEY);
	} catch {
		// ignore
	}
}

/**
 * Try to auto-unlock wallet using stored session PIN.
 * Returns true if unlock succeeded, false otherwise.
 */
export async function tryAutoUnlock(): Promise<boolean> {
	const pin = getSessionPin();
	if (!pin) return false;

	try {
		await unlockWallet(pin);
		return true;
	} catch {
		clearSessionPin(); // clear invalid PIN
		return false;
	}
}
