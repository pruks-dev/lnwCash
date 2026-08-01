/**
 * Seed phrase export/import for wallet backup and recovery.
 *
 * ⚠️ ผู้ใช้ต้องเก็บ seed เอง — เครื่องหาย/ล้างข้อมูล → เงินหายถาวร
 * ⚠️ Seed phrase gives FULL access to the wallet funds.
 * ⚠️ Never share it. Never store online. Never screenshot it.
 * ⚠️ This is client-side ONLY — seed never leaves the device.
 *
 * Flow:
 *   Export:  UNLOCKED wallet → decrypt private key → convert to seed phrase → show to user
 *   Import:  seed phrase → convert to private key → encrypt with new PIN → save wallet
 */
import { decryptKey, encryptKey, hashPin } from '../crypto/encrypt';
import { privateKeyToSeed, seedToPrivateKey } from './keys';
import { getEncryptedKey, setEncryptedKey, setPinHash, getWalletState, setWalletState } from './storage';
import { setWalletMetadata } from '../storage/local';
import { InvalidPinError, SeedImportError, WalletLockedError } from './errors';

// ─── Export Seed ─────────────────────────────────────────────

/**
 * Export the wallet's seed phrase.
 *
 * ⚠️ WARNING:
 * - This reveals the private key in mnemonic form.
 * - Anyone with this seed can access ALL funds.
 * - Wallet MUST be unlocked (correct PIN required).
 * - Only call this in a secure, private environment.
 *
 * @param pin - The wallet PIN (re-verified for security)
 * @returns 24-word BIP39 seed phrase
 * @throws InvalidPinError if PIN is wrong
 * @throws WalletLockedError if wallet is not initialized
 */
export async function exportSeed(pin: string): Promise<string> {
	const encryptedKey = getEncryptedKey();
	const pinHash = (() => {
		try {
			const raw = localStorage.getItem('lnwcash_pin_hash');
			if (raw) return JSON.parse(raw);
		} catch { /* ignore */ }
		return null;
	})();

	if (!encryptedKey || !pinHash) {
		throw new WalletLockedError();
	}

	// Re-verify PIN before exposing seed
	const { verifyPin } = await import('../crypto/encrypt');
	const valid = await verifyPin(pin, pinHash);
	if (!valid) {
		throw new InvalidPinError();
	}

	// Decrypt private key
	const privateKey = await decryptKey(encryptedKey, pin);

	// Convert to seed phrase
	const seed = privateKeyToSeed(privateKey);

	return seed;
}

/**
 * Import a wallet from a seed phrase.
 *
 * This DELETES any existing wallet data and creates a new wallet.
 *
 * Process:
 * 1. Convert seed phrase → private key
 * 2. Hash new PIN for verification
 * 3. Encrypt private key with new PIN
 * 4. Save wallet metadata + encrypted key + PIN hash
 * 5. Set state to LOCKED
 *
 * @param seed - 24-word BIP39 seed phrase
 * @param newPin - New PIN (6+ characters) for the imported wallet
 * @param walletName - Name for the wallet
 * @returns The public key derived from the seed
 * @throws SeedImportError if seed phrase is invalid
 */
export async function importSeed(
	seed: string,
	newPin: string,
	walletName: string
): Promise<{ publicKey: string }> {
	if (newPin.length < 6) {
		throw new SeedImportError('PIN must be at least 6 characters');
	}

	// Convert seed to private key
	let privateKey: string;
	try {
		privateKey = seedToPrivateKey(seed);
	} catch (err) {
		throw new SeedImportError(
			err instanceof Error ? err.message : 'Invalid seed phrase'
		);
	}

	// Derive public key
	const { getPublicKey } = await import('./keys');
	const publicKey = getPublicKey(privateKey);

	// Hash new PIN
	const pinHashValue = await hashPin(newPin);

	// Encrypt private key with new PIN
	const encryptedKey = await encryptKey(privateKey, newPin);

	// Save everything
	setPinHash(pinHashValue);
	setEncryptedKey(encryptedKey);
	setWalletMetadata({ name: walletName, created_at: Date.now() });
	setWalletState('LOCKED');

	return { publicKey };
}

// ─── Re-export for convenience ───────────────────────────────

export { privateKeyToSeed, seedToPrivateKey };
