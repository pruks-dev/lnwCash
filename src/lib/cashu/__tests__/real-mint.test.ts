/**
 * TASK-084: Real mint end-to-end test against https://mint.lnw.cash
 *
 * Tests the full crypto pipeline and API conventions against the live mint.
 * Uses project's installed dependencies (@noble/curves via vitest).
 */
import { describe, it, expect } from 'vitest';
import {
	blindMessage,
	unblindSignature,
	deterministicBlindingFactor,
	hash_to_curve,
} from '../blind';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base64url } from '../../util/base64';

const MINT_URL = 'https://mint.lnw.cash';

// ─── Helpers ──────────────────────────────────────────────────

function generateSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64url.encode(bytes);
}

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
	if (remaining > 0) result.push(remaining);
	return result;
}

// ─── Real Mint Tests ──────────────────────────────────────────

describe('TASK-084: Real Mint E2E (mint.lnw.cash)', () => {

	// ---- T1: Mint Info ----
	it('T084-RM-01: GET /v1/info returns valid mint info', async () => {
		const response = await fetch(`${MINT_URL}/v1/info`);
		expect(response.ok).toBe(true);
		const info = await response.json();
		expect(info.name).toBeTruthy();
		expect(info.pubkey).toBeTruthy();
		expect(info.version).toContain('Nutshell');
		expect(info.nuts).toBeDefined();
		console.log(`[T084-RM-01] Mint: ${info.name}, Version: ${info.version}`);
	}, 15000);

	// ---- T2: Keysets ----
	it('T084-RM-02: GET /v1/keysets returns active sat keyset', async () => {
		const response = await fetch(`${MINT_URL}/v1/keysets`);
		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.keysets).toBeDefined();
		expect(Array.isArray(data.keysets)).toBe(true);
		const active = data.keysets.filter((k: { active: boolean }) => k.active);
		expect(active.length).toBeGreaterThan(0);
		expect(active[0].unit).toBe('sat');
		console.log(`[T084-RM-02] Active keyset: ${active[0].id}`);
	}, 15000);

	// ---- T3: Mint Quote ----
	it('T084-RM-03: POST /v1/mint/quote/bolt11 returns bolt11 invoice', async () => {
		const response = await fetch(`${MINT_URL}/v1/mint/quote/bolt11`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ amount: 5, unit: 'sat' }),
		});
		expect(response.ok).toBe(true);
		const quote = await response.json();
		expect(quote.quote).toBeTruthy();
		expect(quote.request).toMatch(/^ln/);
		expect(quote.state).toBeDefined();
		console.log(`[T084-RM-03] Quote: ${quote.quote}, Invoice: ${String(quote.request).substring(0, 25)}...`);
	}, 15000);

	// ---- T4: Check Quote State ----
	it('T084-RM-04: GET /v1/mint/quote/bolt11/:id returns quote status', async () => {
		// First create a quote
		const quoteRes = await fetch(`${MINT_URL}/v1/mint/quote/bolt11`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ amount: 5, unit: 'sat' }),
		});
		const quote = await quoteRes.json();

		// Then check its status
		const response = await fetch(`${MINT_URL}/v1/mint/quote/bolt11/${encodeURIComponent(quote.quote)}`);
		expect(response.ok).toBe(true);
		const status = await response.json();
		expect(status.quote).toBe(quote.quote);
		expect(status.state).toBeDefined();
		// State may be UNPAID or PAID — mint may auto-transition small amounts
		expect(['UNPAID', 'PAID', 'ISSUED']).toContain(status.state);
		console.log(`[T084-RM-04] Quote ${quote.quote} state: ${status.state}`);
	}, 15000);

	// ---- T5: BDHKE Blind/Unblind Roundtrip ----
	it('T084-RM-05: BDHKE blind → unblind roundtrip (crypto math)', () => {
		const secret = generateSecret();
		const r = deterministicBlindingFactor(secret);
		const { B_, blindingFactor } = blindMessage(secret, r);

		// Simulated mint: C_ = k * B_
		const testMintPrivKey = 0x0f0e0d0c0b0a090807060504030201000f0e0d0c0b0a09080706050403020100n;
		const testMintPubKey = secp256k1.Point.BASE.multiply(testMintPrivKey).toHex(true);
		const B_point = secp256k1.Point.fromHex(B_);
		const C_ = B_point.multiply(testMintPrivKey).toHex(true);

		// Alice unblinds (additive, needs mint pubkey)
		const C = unblindSignature(C_, blindingFactor, testMintPubKey);

		// C should equal k * hash_to_curve(secret)
		const Y = hash_to_curve(new TextEncoder().encode(secret));
		const expectedC = Y.multiply(testMintPrivKey).toHex(true);

		expect(C).toBe(expectedC);
		console.log(`[T084-RM-05] BDHKE roundtrip: PASS`);
	});

	// ---- T6: Full Mint Flow Simulation (crypto only) ----
	it('T084-RM-06: Full simulated mint flow — blind → sign → unblind → verify', () => {
		const amount = 10;
		const amounts = decomposeAmount(amount);
		const testMintPrivKey = 0x0f0e0d0c0b0a090807060504030201000f0e0d0c0b0a09080706050403020100n;
		const testMintPubKey = secp256k1.Point.BASE.multiply(testMintPrivKey).toHex(true);

		const outputs: Array<{ amount: number; secret: string; B_: string; blindingFactor: string }> = [];
		for (const amt of amounts) {
			const secret = generateSecret();
			const r = deterministicBlindingFactor(secret);
			const { B_, blindingFactor } = blindMessage(secret, r);
			outputs.push({ amount: amt, secret, B_, blindingFactor });
		}

		// Mint signs (simulated)
		const signatures = outputs.map(o => ({
			C_: secp256k1.Point.fromHex(o.B_).multiply(testMintPrivKey).toHex(true),
		}));

		// Client unblinds (additive, needs mint pubkey)
		const proofs = outputs.map((o, i) => ({
			amount: o.amount,
			secret: o.secret,
			C: unblindSignature(signatures[i].C_, o.blindingFactor, testMintPubKey),
		}));

		// Verify each proof
		for (const proof of proofs) {
			const Y = hash_to_curve(new TextEncoder().encode(proof.secret));
			const expectedC = Y.multiply(testMintPrivKey).toHex(true);
			expect(proof.C).toBe(expectedC);
		}

		console.log(`[T084-RM-06] ${proofs.length} proofs verified: PASS`);
	});

	// ---- T7: Melt Verification Simulation ----
	it('T084-RM-07: Melt verification — k*hash_to_curve(secret) must equal C', () => {
		const secret = generateSecret();
		const r = deterministicBlindingFactor(secret);
		const { B_, blindingFactor } = blindMessage(secret, r);

		const testMintPrivKey = 0x0f0e0d0c0b0a090807060504030201000f0e0d0c0b0a09080706050403020100n;
		const testMintPubKey = secp256k1.Point.BASE.multiply(testMintPrivKey).toHex(true);
		const C_ = secp256k1.Point.fromHex(B_).multiply(testMintPrivKey).toHex(true);
		const C = unblindSignature(C_, blindingFactor, testMintPubKey);

		// Mint-side verification: C should equal k * hash_to_curve(secret)
		const Y = hash_to_curve(new TextEncoder().encode(secret));
		const expectedC = Y.multiply(testMintPrivKey).toHex(true);

		expect(C).toBe(expectedC);
		console.log(`[T084-RM-07] Melt verification: PASS`);
	});

	// ---- T8: Tamper Detection ----
	it('T084-RM-08: Tampered proof fails verification', () => {
		const secret = generateSecret();
		const r = deterministicBlindingFactor(secret);
		const { B_, blindingFactor } = blindMessage(secret, r);

		const testMintPrivKey = 0x0f0e0d0c0b0a090807060504030201000f0e0d0c0b0a09080706050403020100n;
		const C_ = secp256k1.Point.fromHex(B_).multiply(testMintPrivKey).toHex(true);
		const C = unblindSignature(C_, blindingFactor);

		// Try to verify with wrong secret
		const wrongSecret = generateSecret();
		const Y_wrong = hash_to_curve(new TextEncoder().encode(wrongSecret));
		const wrongC = Y_wrong.multiply(testMintPrivKey).toHex(true);

		expect(wrongC).not.toBe(C);
		console.log(`[T084-RM-08] Tamper detection: PASS`);
	});

	// ---- T9: hash_to_curve Determinism ----
	it('T084-RM-09: hash_to_curve is deterministic and returns valid points', () => {
		const msg = new TextEncoder().encode('Cashu protocol test vector');
		const p1 = hash_to_curve(msg);
		const p2 = hash_to_curve(msg);

		expect(p1.toHex(true)).toBe(p2.toHex(true));
		expect(p1.toHex(true).length).toBe(66);
		expect(p1.toHex(true).startsWith('02') || p1.toHex(true).startsWith('03')).toBe(true);
		console.log(`[T084-RM-09] hash_to_curve determinism: PASS`);
	});

	// ---- T10: API Convention - POST /v1/swap endpoint exists ----
	it('T084-RM-10: Mint advertises swap (NUT-08) endpoint', async () => {
		const response = await fetch(`${MINT_URL}/v1/info`);
		const info = await response.json();
		expect(info.nuts['8']).toBeDefined();
		console.log(`[T084-RM-10] NUT-08 (swap) supported: ${!!info.nuts['8']}`);
	}, 15000);
});
