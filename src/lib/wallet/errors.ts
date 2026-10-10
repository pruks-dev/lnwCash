import { CashuError } from '../cashu/client';

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

// ─── TASK-1316 (P5): double-spent family + quarantine signal ─────────

/**
 * NUT error codes that prove the coins themselves are dead (already spent or
 * already signed by the mint) — the double-spent family of the SWAP flow.
 * Whitelist is deliberately NARROW:
 *   - 11002 "tokens already spent"   (double-spend — coins dead)
 *   - 11005 "tokens already signed"  (already signed — coins dead)
 * Everything else is NOT evidence of dead coins and must NOT quarantine:
 *   - network failures (MintUnreachableError / NetworkError / TypeError) —
 *     the mint never evaluated the inputs;
 *   - benign idempotent family 11003 / 20002 (CashuError.BENIGN_CODES — the
 *     11003 "outputs already signed" collision is OUTPUT-side; the INPUT
 *     proofs may be perfectly healthy — mint.ts handles it as a benign
 *     retry in the mint flow; treating it as dead coins here would quarantine
 *     healthy money on a counter desync);
 *   - InvalidResponseError / unknown errors — no evidence either way.
 * The classification is by FLOW (the swap/flush path), not by code reuse —
 * mint.ts's benign-11003 retry is untouched and can never trigger this.
 */
const DOUBLE_SPENT_FAMILY_CODES: ReadonlySet<number> = new Set([11002, 11005]);

/** True ONLY for mint-rule rejections proving dead coins (see whitelist). */
export function isDoubleSpentFamilyError(err: unknown): boolean {
	if (!(err instanceof CashuError)) return false; // network/invalid/unknown → no evidence
	const numeric = typeof err.code === 'string' ? Number(err.code) : err.code;
	return numeric !== undefined && DOUBLE_SPENT_FAMILY_CODES.has(numeric);
}

/**
 * Thrown by the flush swap path AFTER the dead group's proofs were marked
 * quarantined — signals `boundSwapFn` to CONTINUE with the remaining groups
 * (flush ไปต่อกับที่เหลือ) instead of aborting the whole run.
 */
export class QuarantineAppliedError extends Error {
	constructor(
		message: string,
		public readonly quarantinedLocalIds: string[],
		public readonly causeError: unknown
	) {
		super(message);
		this.name = 'QuarantineAppliedError';
	}
}
