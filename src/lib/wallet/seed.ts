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
import {
	privateKeyToSeed,
	seedToPrivateKey,
	BIP39_SEED_WORD_COUNT
} from './keys';
import {
	getEncryptedKey,
	getEncryptedMnemonic,
	setEncryptedKey,
	setEncryptedMnemonic,
	clearEncryptedMnemonic,
	setPinHash,
	getWalletState,
	setWalletState
} from './storage';
import { setWalletMetadata } from '../storage/local';
import { clearAllCounters } from './counterK';
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
 * @returns 12-word BIP39 seed phrase (or 24-word legacy phrase for old wallets)
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

	// New wallets store the BIP39 mnemonic (encrypted) — return it directly.
	// A BIP39 mnemonic cannot be reverse-derived from the private key.
	const encryptedMnemonic = getEncryptedMnemonic();
	if (encryptedMnemonic) {
		return await decryptKey(encryptedMnemonic, pin);
	}

	// Legacy (24-word) wallets: re-derive the direct-mapped phrase from the key
	const privateKey = await decryptKey(encryptedKey, pin);
	return privateKeyToSeed(privateKey);
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
 * @param seed - 12-word BIP39 seed phrase (or 24-word legacy phrase)
 * @param newPin - New PIN (4+ characters) for the imported wallet
 * @param walletName - Name for the wallet
 * @returns The public key derived from the seed
 * @throws SeedImportError if seed phrase is invalid
 */
export async function importSeed(
	seed: string,
	newPin: string,
	walletName: string
): Promise<{ publicKey: string }> {
	if (newPin.length < 4) {
		throw new SeedImportError('PIN must be at least 4 characters');
	}

	const words = seed.trim().toLowerCase().split(/\s+/);

	// Convert seed to private key (auto-detects 12-word BIP39 vs 24-word legacy)
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

	// Persist the mnemonic for 12-word BIP39 so it can be re-exported verbatim.
	// (Legacy 24-word phrases are re-derived from the key on export instead.)
	if (words.length === BIP39_SEED_WORD_COUNT) {
		const encryptedMnemonic = await encryptKey(words.join(' '), newPin);
		setEncryptedMnemonic(encryptedMnemonic);
	} else {
		clearEncryptedMnemonic();
	}

	setWalletMetadata({ name: walletName, created_at: Date.now() });
	setWalletState('LOCKED');

	// Reset NUT-13 counters — a new/imported seed must start counter_k = 0,
	// otherwise restore replays stale counters → gap → misaligned proofs.
	clearAllCounters();

	return { publicKey };
}

// ─── Re-export for convenience ───────────────────────────────

export { privateKeyToSeed, seedToPrivateKey };
