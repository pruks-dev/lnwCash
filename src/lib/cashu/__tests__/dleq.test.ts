/**
 * DLEQ verification tests — NUT-12 (TASK-1313).
 *
 * Golden vectors, all hardcoded with provenance:
 * - Gate-0 LIVE probe (Nutshell/0.20.1 @ mint.lnw.cash):
 *   /home/debian/ARX/.arx/evidence/brick/TASK-1312/dleq-mint-probe.json
 *   (quote PyL0Kjug…, keyset 00c25786d85a1dcd, amount 2, paid → claim 200 OK)
 * - Official NUT-12 vectors: nuts/tests/12-tests.md
 *   (hash_e function; deterministic nonce; BlindSignature; Proof/Carol)
 *
 * Case tags per TASK-1313 spec: (ก) golden PASS / (ข) tamper reject ×3 /
 * (ค) edge reject / (ง) Carol reconstruct PASS.
 */
import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { hash_to_curve } from '../blind';
import { hash_e, verifyDleqAlice, verifyDleqCarol, lookupAmountKey } from '../dleq';

const P = secp256k1.Point;
const G = P.BASE;
const enc = new TextEncoder();

// ─── Gate-0 LIVE goldens (dleq-mint-probe.json, TASK-1312) ────

const GATE0 = {
	keysetId: '00c25786d85a1dcd',
	amount: 2,
	A2: '035657164bf307ca7d1fe968ecabb7af374f7bca6e75485f7c290f638a5c602dc7', // /v1/keys amount=2
	secret: '9aec3afb1ac8ed8efd53b888e2ba428a51ffd12f2cad5e804480a0908d1fcbf9', // Proof.secret (hex string)
	r: '3c8caa8e7dfb8932193415910cb4d9281706460122c383ee3a8b60a240a50e01', // wallet blinding factor
	B_: '02b305cc379f7e724e5d123bd6bf7e9c7517282546f8e3f2adcbc9820be467cbf4', // BlindedMessage (wire)
	Y: '0208f51528001ead5324bea3746c18f126984e3c6fd9d1b72002f8a19eaaf5ca36', // hash_to_curve(secret) — recorded
	C_: '038766afc110d3da171804ea30b6f39e6bc365c5108a7a14daa02ae5611e6727a8', // BlindSignature (wire)
	e: 'ef79060ae66c6bc38db3055c181b9d309a269a213e0365a9aadcd308e91a927b', // BlindSignature.dleq.e (wire)
	s: 'df9cace107f7f3e7e9d534c60dde723532533a1bc1b05424263921e85078e48c', // BlindSignature.dleq.s (wire)
	C: '03fb538640a4042eb46dcfcc1972aa5bac6c0a8c4a32fdb2ae05af06fa34238ac6' // unblinded signature C = C_ − r*A
};

// ─── Official NUT-12 vectors (nuts/tests/12-tests.md) ────────

const HASH_V = {
	R1: '020000000000000000000000000000000000000000000000000000000000000001',
	R2: '020000000000000000000000000000000000000000000000000000000000000001',
	K: '020000000000000000000000000000000000000000000000000000000000000001',
	C_: '02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2',
	e: 'a4dc034b74338c28c6bc3ea49731f2a24440fc7c4affc08b31a93fc9fbe6401e'
};

const NONCE_V = {
	a: '0000000000000000000000000000000000000000000000000000000000000002',
	A: '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
	B_: '02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2',
	C_: '0244eccfc7a348274458bb38044c7f3c389b3c2086c7ec18b5812d2877ab937787',
	e: '2a16ffee280aff3c429045607f9b8e0bf8b35910c44c1b20b9dfaf01b263d7b3',
	s: '9df27731238334718d120d4f74611a7c668233f988e687ac3fb188f0a34a2dab'
};

const SIG_V = {
	A: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
	B_: '02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2',
	C_: '02a9acc1e48c25eeeb9289b5031cc57da9fe72f3fe2861d264bdc074209b107ba2',
	amount: 8,
	id: '00882760bfa2eb41',
	e: '9818e061ee51d5c8edc3342369a554998ff7b4381c8652d724cdf46429be73d9',
	s: '9818e061ee51d5c8edc3342369a554998ff7b4381c8652d724cdf46429be73da'
};

const PROOF_V = {
	A: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
	amount: 1,
	id: '00882760bfa2eb41',
	secret: 'daf4dd00a2b68a0858a80450f52c8a7d2ccf87d375e43e216e0c571f089f63e9',
	C: '024369d2d22a80ecf78f3937da9d5f30c1b9f74f0c32684d583cca0fa6a61cdcfc',
	e: 'b31e58ac6527f34975ffab13e70a48b6d2b0d35abc4b03f0151f09ee1a9763d4',
	s: '8fbae004c59e754d71df67e392b6ae4e29293113ddc2ec86592a0431d16306d8',
	r: 'a6d13fcd7a18442e6076f5e1e7c887ad5de40a019824bdfa9fe740d302e8d861'
};

// Keyset subset of keyset 00c25786d85a1dcd (live /v1/keys, TASK-1312):
// denominations 1, 2, 4 only — used for the (ค) boundary edge (amount 3 misses).
const KEYSET_SUBSET: Record<string, string> = {
	'1': '022dcce4385fbe5e311fca1a0b34bf8eb811881148ce0163f03268b460c19163d2',
	'2': GATE0.A2,
	'4': '03575665b8f11dddc0f0d48d931ce602d5ddefdb6afaf30cfadf7783c0753e0dea'
};

// ─── Deterministic tamper helper (no RNG) ────────────────────

const bumpHexScalar = (hex: string) => (BigInt('0x' + hex) + 1n).toString(16).padStart(64, '0');

describe('DLEQ verification — NUT-12 (TASK-1313)', () => {
	// ── hash_e semantics, official vector ──
	describe('hash_e (NUT-12: uncompressed 65B → 130 hex chars, SHA256 over hex text)', () => {
		it('(ก-0) reproduces the official hash_e vector', () => {
			const e = hash_e(P.fromHex(HASH_V.R1), P.fromHex(HASH_V.R2), P.fromHex(HASH_V.K), P.fromHex(HASH_V.C_));
			expect(bytesToHex(e)).toBe(HASH_V.e);
			// deterministic — same bytes on rerun
			const e2 = hash_e(P.fromHex(HASH_V.R1), P.fromHex(HASH_V.R2), P.fromHex(HASH_V.K), P.fromHex(HASH_V.C_));
			expect(e2).toEqual(e);
		});
	});

	// ── (ก) golden Alice vectors ──
	describe('verifyDleqAlice — golden vectors', () => {
		it('(ก) Gate-0 LIVE golden (real Nutshell 0.20.1 mint response) → PASS', () => {
			const first = verifyDleqAlice({ e: GATE0.e, s: GATE0.s }, GATE0.B_, GATE0.C_, GATE0.A2);
			expect(first).toBe(true);
			// deterministic — same result on rerun
			expect(verifyDleqAlice({ e: GATE0.e, s: GATE0.s }, GATE0.B_, GATE0.C_, GATE0.A2)).toBe(true);
		});

		it('(ก-N1) NUT-12 deterministic-nonce vector → PASS', () => {
			expect(verifyDleqAlice({ e: NONCE_V.e, s: NONCE_V.s }, NONCE_V.B_, NONCE_V.C_, NONCE_V.A)).toBe(true);
		});

		it('(ก-N2) NUT-12 BlindSignature vector → PASS', () => {
			expect(verifyDleqAlice({ e: SIG_V.e, s: SIG_V.s }, SIG_V.B_, SIG_V.C_, SIG_V.A)).toBe(true);
		});
	});

	// ── (ข) tampered scalars — every mutation rejects ──
	describe('(ข) verifyDleqAlice — tampered scalars (Gate-0 golden base)', () => {
		it('(ข-1) tampered e (+1) → reject', () => {
			expect(verifyDleqAlice({ e: bumpHexScalar(GATE0.e), s: GATE0.s }, GATE0.B_, GATE0.C_, GATE0.A2)).toBe(false);
		});

		it('(ข-2) tampered s (+1) → reject', () => {
			expect(verifyDleqAlice({ e: GATE0.e, s: bumpHexScalar(GATE0.s) }, GATE0.B_, GATE0.C_, GATE0.A2)).toBe(false);
		});

		it('(ข-3) tampered C_ (swapped for a different valid curve point) → reject', () => {
			// amount-1 key of the same mint — a valid curve point, not the signature
			const otherPoint = KEYSET_SUBSET['1'];
			expect(otherPoint).not.toBe(GATE0.C_);
			expect(verifyDleqAlice({ e: GATE0.e, s: GATE0.s }, GATE0.B_, otherPoint, GATE0.A2)).toBe(false);
		});
	});

	// ── (ค) edge cases — reasoned rejection ──
	describe('(ค) edge cases', () => {
		it('(ค-1) point not on the curve → reject (no throw)', () => {
			// well-formed hex, but x=0 is not a curve point — noble fromHex rejects it
			const offCurve = '02' + '00'.repeat(32);
			expect(() => P.fromHex(offCurve)).toThrow();
			expect(verifyDleqAlice({ e: GATE0.e, s: GATE0.s }, offCurve, GATE0.C_, GATE0.A2)).toBe(false);
			expect(verifyDleqCarol({ e: GATE0.e, s: GATE0.s, r: GATE0.r }, GATE0.secret, offCurve, GATE0.A2)).toBe(false);
		});

		it('(ค-2) malformed scalar hex → reject (no throw)', () => {
			expect(verifyDleqAlice({ e: 'not-hex!', s: GATE0.s }, GATE0.B_, GATE0.C_, GATE0.A2)).toBe(false);
			expect(verifyDleqAlice({ e: GATE0.e, s: '' }, GATE0.B_, GATE0.C_, GATE0.A2)).toBe(false);
			expect(verifyDleqCarol({ e: GATE0.e, s: GATE0.s, r: 'zzzz' }, GATE0.secret, GATE0.C, GATE0.A2)).toBe(false);
		});

		it('(ค-3) missing r in Carol proof → reject (cannot reconstruct)', () => {
			const withoutR = { e: GATE0.e, s: GATE0.s };
			expect(verifyDleqCarol(withoutR, GATE0.secret, GATE0.C, GATE0.A2)).toBe(false);
		});

		it('(ค-4) amount without A in keyset → key lookup returns undefined (boundary)', () => {
			// live keyset only carries denominations 1, 2, 4 … (powers of two):
			// amount 3 has no key — DLEQ cannot even start (no A to pair with)
			expect(lookupAmountKey(KEYSET_SUBSET, 3)).toBeUndefined();
			// boundary in-map values resolve (amounts 1, 2, 4)
			expect(lookupAmountKey(KEYSET_SUBSET, 1)).toBe(KEYSET_SUBSET['1']);
			expect(lookupAmountKey(KEYSET_SUBSET, 2)).toBe(GATE0.A2);
			expect(lookupAmountKey(KEYSET_SUBSET, 4)).toBe(KEYSET_SUBSET['4']);
		});
	});

	// ── (ง) Carol reconstruct vectors ──
	describe('(ง) verifyDleqCarol — reconstruct then verify', () => {
		it('(ง-1) Gate-0 LIVE Carol construct (C = C_ − r*A from probe) → PASS', () => {
			const A = P.fromHex(GATE0.A2);
			const C_ = P.fromHex(GATE0.C_);
			const r = BigInt('0x' + GATE0.r);
			// construct Carol's wire input locally from the probe: C = C_ − r*A
			const constructed = C_.subtract(A.multiply(r));
			expect(P.fromHex(GATE0.C).equals(constructed)).toBe(true);

			// coherence: reconstruction C' = C + r*A must reproduce the wire C_
			const recon = constructed.add(A.multiply(r));
			expect(P.fromHex(GATE0.C_).equals(recon)).toBe(true);
			// sign sanity: feeding a pre-shaped wrong-sign C gives a C' that is not the wire C_
			const wrongSignFeed = P.fromHex(GATE0.C).subtract(A.multiply(r));
			expect(P.fromHex(GATE0.C_).equals(wrongSignFeed.add(A.multiply(r)))).toBe(false);

			const dleq = { e: GATE0.e, s: GATE0.s, r: GATE0.r };
			const first = verifyDleqCarol(dleq, GATE0.secret, GATE0.C, GATE0.A2);
			expect(first).toBe(true);
			// deterministic rerun
			expect(verifyDleqCarol(dleq, GATE0.secret, GATE0.C, GATE0.A2)).toBe(true);
		});

		it('(ง-2) NUT-12 public Proof vector → PASS', () => {
			expect(verifyDleqCarol({ e: PROOF_V.e, s: PROOF_V.s, r: PROOF_V.r }, PROOF_V.secret, PROOF_V.C, PROOF_V.A)).toBe(true);
		});

		it('(ง-3) hash_to_curve cross-check: Y(GATE0.secret) equals probe-recorded Y', () => {
			// pins the utf8(secret-string) input convention (NUT-00, blind.ts reuse)
			const Y = hash_to_curve(enc.encode(GATE0.secret));
			expect(P.fromHex(GATE0.Y).equals(Y)).toBe(true);
		});

		it('(ง-4) sign-flipped reconstruction B\' = Y − r*G must NOT verify', () => {
			// HIGH-risk sign mistake — wrong sign silently rejects legitimate coins
			const Y = hash_to_curve(enc.encode(GATE0.secret));
			const r = BigInt('0x' + GATE0.r);
			const wrongB = Y.subtract(G.multiply(r));
			const s = BigInt('0x' + GATE0.s);
			const e = BigInt('0x' + GATE0.e);
			const A = P.fromHex(GATE0.A2);
			const C_ = P.fromHex(GATE0.C_);
			const R1 = G.multiply(s).subtract(A.multiply(e));
			const R2 = wrongB.multiply(s).subtract(C_.multiply(e));
			// golden e is on the wire — a different R2 would hash differently
			expect(bytesToHex(hash_e(R1, R2, A, C_))).not.toBe(GATE0.e);
		});

		it('(ง-5) r = 0 tampered into live golden Proof → reject (blinding collapsed)', () => {
			expect(verifyDleqCarol({ e: GATE0.e, s: GATE0.s, r: '0'.padStart(64, '0') }, GATE0.secret, GATE0.C, GATE0.A2)).toBe(false);
		});

		it('(ง-6) Carol tampered e/s → reject', () => {
			const base = { e: GATE0.e, s: GATE0.s, r: GATE0.r };
			expect(verifyDleqCarol({ ...base, e: bumpHexScalar(GATE0.e) }, GATE0.secret, GATE0.C, GATE0.A2)).toBe(false);
			expect(verifyDleqCarol({ ...base, s: bumpHexScalar(GATE0.s) }, GATE0.secret, GATE0.C, GATE0.A2)).toBe(false);
		});
	});
});
