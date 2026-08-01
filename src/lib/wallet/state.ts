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
	getPinHash,
	setPinHash,
	getWalletState,
	setWalletState,
	clearAllWalletData,
	type WalletStateEnum
} from './storage';
import { deleteProofDB } from './proofsDb';
import { setWalletMetadata } from '../storage/local';
import { InvalidPinError, WalletLockedError, WalletNotInitializedError } from './errors';

// ─── In-Memory State (CLOSURE — never persisted) ─────────────

let unlockedPrivateKey: string | null = null;

// ─── State Machine ───────────────────────────────────────────

export type WalletState = {
	state: WalletStateEnum;
	walletName: string | null;
	createdAt: number | null;
};

/**
 * Create a new wallet with a PIN (6+ digits).
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

	if (pin.length < 6) {
		throw new Error('PIN must be at least 6 characters');
	}

	// Generate keypair
	const { privateKey, publicKey } = generateKeyPair();

	// Hash PIN for future verification
	const pinHash = await hashPin(pin);
	setPinHash(pinHash);

	// Encrypt private key with PIN
	const encryptedKey = await encryptKey(privateKey, pin);
	setEncryptedKey(encryptedKey);

	// Save metadata
	const createdAt = Date.now();
	setWalletMetadata({ name: walletName, created_at: createdAt });

	// Set state to LOCKED
	setWalletState('LOCKED');

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

	setWalletState('UNLOCKED');

	return getWalletStatus();
}

/**
 * Lock the wallet: clear in-memory private key, set state to LOCKED.
 */
export function lockWallet(): WalletState {
	unlockedPrivateKey = null;
	setWalletState('LOCKED');
	return getWalletStatus();
}

/**
 * Delete the wallet: clear ALL data (localStorage + IndexedDB), reset state.
 * This is IRREVERSIBLE — funds will be lost if proofs aren't backed up!
 */
export async function deleteWallet(): Promise<void> {
	unlockedPrivateKey = null;
	await clearAllWalletData();
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
 * Check if wallet is currently unlocked.
 */
export function isUnlocked(): boolean {
	return unlockedPrivateKey !== null && getWalletState() === 'UNLOCKED';
}

// ─── Re-export storage functions needed by other modules ─────

export { getEncryptedKey, getPinHash, getWalletState, setWalletState };
