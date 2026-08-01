/**
 * Wallet-specific error types — i18n-ready with key patterns.
 * All error messages use key patterns like `error.mint_unreachable`
 * for translation via svelte-i18n or custom i18n.
 */

// ─── Base Error ───────────────────────────────────────────────

export class WalletError extends Error {
	public readonly key: string;

	constructor(message: string, key: string) {
		super(message);
		this.name = 'WalletError';
		this.key = key;
	}
}

// ─── Domain Errors ───────────────────────────────────────────

export class MintUnreachableError extends WalletError {
	constructor(mintUrl: string) {
		super(`Mint unreachable: ${mintUrl}`, 'error.mint_unreachable');
		this.name = 'MintUnreachableError';
	}
}

export class InsufficientFundsError extends WalletError {
	constructor(available: number, required: number) {
		super(
			`Insufficient funds: have ${available}, need ${required}`,
			'error.insufficient_funds'
		);
		this.name = 'InsufficientFundsError';
	}
}

export class QuoteExpiredError extends WalletError {
	constructor(quoteId: string) {
		super(`Quote expired: ${quoteId}`, 'error.quote_expired');
		this.name = 'QuoteExpiredError';
	}
}

export class InvalidPinError extends WalletError {
	constructor() {
		super('Invalid PIN', 'error.invalid_pin');
		this.name = 'InvalidPinError';
	}
}

export class WalletLockedError extends WalletError {
	constructor() {
		super('Wallet is locked — call unlockWallet() first', 'error.wallet_locked');
		this.name = 'WalletLockedError';
	}
}

export class WalletNotInitializedError extends WalletError {
	constructor() {
		super('Wallet not initialized — call createWallet() first', 'error.wallet_not_initialized');
		this.name = 'WalletNotInitializedError';
	}
}

export class SeedImportError extends WalletError {
	constructor(details?: string) {
		super(`Seed import failed${details ? `: ${details}` : ''}`, 'error.seed_import');
		this.name = 'SeedImportError';
	}
}

export class TokenValidationError extends WalletError {
	constructor(details?: string) {
		super(`Token validation failed${details ? `: ${details}` : ''}`, 'error.token_validation');
		this.name = 'TokenValidationError';
	}
}

export class ProofSelectionError extends WalletError {
	constructor(amount: number) {
		super(
			`Cannot select proofs for amount ${amount}`,
			'error.proof_selection'
		);
		this.name = 'ProofSelectionError';
	}
}
