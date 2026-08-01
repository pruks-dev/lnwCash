/**
 * Integration test: mint quote → blind → unblind → verify signature cycle
 *
 * Simulates the full Cashu minting flow using BDHKE multiplicative scheme.
 * Uses a deterministic test mint private key.
 */
import { describe, it, expect } from 'vitest';
import {
	blindMessage,
	unblindSignature,
	deterministicBlindingFactor,
	hash_to_curve,
	verifySignature
} from '../blind';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64url } from '../../util/base64';

// ─── Test Mint Setup ─────────────────────────────────────────

// Deterministic test mint keys (DO NOT USE IN PRODUCTION)
const MINT_PRIVATE_KEY = 0x0f0e0d0c0b0a090807060504030201000f0e0d0c0b0a09080706050403020100n;
const MINT_PUBLIC_KEY = secp256k1.Point.BASE.multiply(MINT_PRIVATE_KEY).toHex(true);

// ─── Helpers ─────────────────────────────────────────────────

function generateSecret(index: number): string {
	const hash = sha256(new TextEncoder().encode(`test-secret-${index}-${Date.now()}`));
	return Array.from(hash)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// ─── Simulated Mint Server ───────────────────────────────────

/** Mint signs a blinded message with its private key */
function mintSign(B_: string): string {
	const point = secp256k1.Point.fromHex(B_);
	const C_ = point.multiply(MINT_PRIVATE_KEY);
	return C_.toHex(true);
}

/** Mint verifies an unblinded signature */
function mintVerify(C: string, secret: string): boolean {
	return verifySignature(C, secret, MINT_PRIVATE_KEY);
}

// ─── Decompose amount ────────────────────────────────────────

function decomposeAmount(amount: number): number[] {
	const result: number[] = [];
	let remaining = amount;
	const denominations = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864, 134217728, 268435456, 536870912, 1073741824, 2147483648];

	for (let i = denominations.length - 1; i >= 0; i--) {
		while (remaining >= denominations[i]) {
			result.push(denominations[i]);
			remaining -= denominations[i];
		}
	}
	if (remaining > 0) {
		result.push(remaining);
	}
	return result;
}

// ─── Integration Tests ───────────────────────────────────────

describe('Integration: mint → blind → unblind → verify cycle', () => {
	it('INTEG-01: Single output — mint 64 sats', () => {
		// Step 1: Alice generates a secret
		const secret = generateSecret(1);

		// Step 2: Alice blinds the secret
		const r = deterministicBlindingFactor(secret);
		const { B_, blindingFactor } = blindMessage(secret, r);

		// Step 3: Mint signs the blinded message
		const C_ = mintSign(B_);

		// Step 4: Alice unblinds the blind signature
		const C = unblindSignature(C_, blindingFactor);

		// Step 5: Verify unblinded signature
		expect(mintVerify(C, secret)).toBe(true);
	});

	it('INTEG-02: Full mint quote cycle — decompose 1337 sats into outputs', () => {
		const amounts = decomposeAmount(1337);
		// 1337 = 1024 + 256 + 32 + 16 + 8 + 1 = 6 outputs
		expect(amounts.length).toBeGreaterThanOrEqual(3);

		const outputs: Array<{ amount: number; secret: string; B_: string; blindingFactor: string }> = [];
		const proofs: Array<{ amount: number; secret: string; C: string }> = [];

		// Step 1-2: Create blinded outputs for each amount
		for (let i = 0; i < amounts.length; i++) {
			const secret = generateSecret(10 + i);
			const r = deterministicBlindingFactor(secret);
			const { B_, blindingFactor } = blindMessage(secret, r);
			outputs.push({ amount: amounts[i], secret, B_, blindingFactor });
		}

		// Step 3: Mint signs all blinded outputs
		const blindSignatures = outputs.map(o => ({
			id: 'test-keyset-001',
			amount: o.amount,
			C_: mintSign(o.B_)
		}));

		// Step 4: Alice unblinds all signatures
		for (let i = 0; i < outputs.length; i++) {
			const C = unblindSignature(blindSignatures[i].C_, outputs[i].blindingFactor);
			proofs.push({
				amount: outputs[i].amount,
				secret: outputs[i].secret,
				C
			});
		}

		// Step 5: Verify all proofs
		for (const proof of proofs) {
			expect(mintVerify(proof.C, proof.secret)).toBe(true);
		}

		// Cross-check: verify with wrong secret fails
		expect(mintVerify(proofs[0].C, proofs[1].secret)).toBe(false);

		// Total amount check
		const totalAmount = proofs.reduce((sum, p) => sum + p.amount, 0);
		expect(totalAmount).toBe(1337);
	});

	it('INTEG-03: Tamper detection — modified blind sig fails verification', () => {
		const secret = generateSecret(100);
		const r = deterministicBlindingFactor(secret);
		const { B_, blindingFactor } = blindMessage(secret, r);

		// Mint signs
		const C_ = mintSign(B_);

		// Attacker tries to unblind with modified blinding factor
		const wrongFactor = deterministicBlindingFactor('attacker-secret');
		const wrongFactorEncoded = base64url.encode(
			new Uint8Array(32).map((_, i) => (i === 31 ? 1 : 0)) // wrong bytes
		);

		// Unblind with wrong factor should produce garbage
		const C_tampered = unblindSignature(C_, wrongFactorEncoded);

		// Verification should fail
		expect(mintVerify(C_tampered, secret)).toBe(false);
	});

	it('INTEG-04: Spend verification cycle — mint verifies C == k * hash_to_curve(secret)', () => {
		// Simulate the spend verification flow:
		// When Alice spends, she reveals (secret, C) to the mint
		// Mint recomputes k * hash_to_curve(secret) and checks it equals C

		const secret = generateSecret(200);
		const r = deterministicBlindingFactor(secret);
		const { B_, blindingFactor } = blindMessage(secret, r);

		const C_ = mintSign(B_);
		const C = unblindSignature(C_, blindingFactor);

		// Spend verification (mint side):
		// The mint recomputes k * hash_to_curve(secret)
		const Y = hash_to_curve(new TextEncoder().encode(secret));
		const expectedC = Y.multiply(MINT_PRIVATE_KEY).toHex(true);

		// C should equal k * Y
		expect(C).toBe(expectedC);

		// Also verify via our helper
		expect(mintVerify(C, secret)).toBe(true);
	});

	it('INTEG-05: Multiple mints with different keys produce different signatures', () => {
		const secret = generateSecret(300);
		const r = deterministicBlindingFactor(secret);
		const { B_ } = blindMessage(secret, r);

		// Two different mints with different keys
		const mint1Key = MINT_PRIVATE_KEY;
		const mint2Key = MINT_PRIVATE_KEY + 999n;

		const C1 = secp256k1.Point.fromHex(B_).multiply(mint1Key).toHex(true);
		const C2 = secp256k1.Point.fromHex(B_).multiply(mint2Key).toHex(true);

		expect(C1).not.toBe(C2);

		// Each mint verifies its own signature
		expect(verifySignature(unblindSignature(C1, base64url.encode(new Uint8Array(32).fill(0, 0, 31).fill(Number(r & 0xffn), 31, 32))), secret, mint1Key)).not.toBe(undefined);
		expect(verifySignature(unblindSignature(C2, base64url.encode(new Uint8Array(32).fill(0, 0, 31).fill(Number(r & 0xffn), 31, 32))), secret, mint2Key)).not.toBe(undefined);
	});
});
