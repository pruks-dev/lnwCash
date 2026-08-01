/**
 * Wallet errors tests
 */
import { describe, it, expect } from 'vitest';
import {
	WalletError,
	MintUnreachableError,
	InsufficientFundsError,
	QuoteExpiredError,
	InvalidPinError,
	WalletLockedError,
	WalletNotInitializedError,
	SeedImportError,
	TokenValidationError,
	ProofSelectionError
} from '../errors';

describe('Wallet errors', () => {
	describe('WalletError base', () => {
		it('should create a base wallet error with key', () => {
			const err = new WalletError('test message', 'error.test');
			expect(err).toBeInstanceOf(Error);
			expect(err.message).toBe('test message');
			expect(err.key).toBe('error.test');
			expect(err.name).toBe('WalletError');
		});
	});

	describe('MintUnreachableError', () => {
		it('should include mint URL', () => {
			const err = new MintUnreachableError('https://mint.example.com');
			expect(err.key).toBe('error.mint_unreachable');
			expect(err.message).toContain('https://mint.example.com');
		});
	});

	describe('InsufficientFundsError', () => {
		it('should include available and required amounts', () => {
			const err = new InsufficientFundsError(100, 500);
			expect(err.key).toBe('error.insufficient_funds');
			expect(err.message).toContain('100');
			expect(err.message).toContain('500');
		});
	});

	describe('QuoteExpiredError', () => {
		it('should include quote ID', () => {
			const err = new QuoteExpiredError('quote-123');
			expect(err.key).toBe('error.quote_expired');
			expect(err.message).toContain('quote-123');
		});
	});

	describe('InvalidPinError', () => {
		it('should have standard message', () => {
			const err = new InvalidPinError();
			expect(err.key).toBe('error.invalid_pin');
			expect(err.message).toContain('PIN');
		});
	});

	describe('WalletLockedError', () => {
		it('should hint at unlockWallet()', () => {
			const err = new WalletLockedError();
			expect(err.key).toBe('error.wallet_locked');
			expect(err.message).toContain('unlockWallet');
		});
	});

	describe('WalletNotInitializedError', () => {
		it('should hint at createWallet()', () => {
			const err = new WalletNotInitializedError();
			expect(err.key).toBe('error.wallet_not_initialized');
			expect(err.message).toContain('createWallet');
		});
	});

	describe('SeedImportError', () => {
		it('should accept details', () => {
			const err = new SeedImportError('bad checksum');
			expect(err.key).toBe('error.seed_import');
			expect(err.message).toContain('bad checksum');
		});
	});

	describe('TokenValidationError', () => {
		it('should accept details', () => {
			const err = new TokenValidationError('missing proofs');
			expect(err.key).toBe('error.token_validation');
			expect(err.message).toContain('missing proofs');
		});
	});

	describe('ProofSelectionError', () => {
		it('should include amount', () => {
			const err = new ProofSelectionError(1000);
			expect(err.key).toBe('error.proof_selection');
			expect(err.message).toContain('1000');
		});
	});
});
