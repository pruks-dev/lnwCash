/**
 * TASK-1314 — TEST-ONLY harness: deterministic REAL DLEQ chain builder.
 *
 * Simulates the MINT side (Bob) with a fixed private key + a deterministic
 * nonce, so wallet tests exercise REAL Carol/Alice verification against REAL
 * secp256k1 math (real @noble curves — blind.ts and dleq.ts are NOT mocked in
 * the suites that use this harness).
 *
 * Not named *.test.* — vitest will not collect/run it.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { hash_to_curve, deterministicBlindingFactor } from '../../cashu/blind';
import { hash_e } from '../../cashu/dleq';
import type { TokenProof } from '../../types';

const P = secp256k1.Point;
const G = P.BASE;
const N = secp256k1.Point.Fn.ORDER;

export function bigIntToHex32(v: bigint): string {
	let hex = v.toString(16);
	if (hex.length % 2 !== 0) hex = '0' + hex;
	return hex.padStart(64, '0');
}

/** Deterministic nonzero scalar from an arbitrary label (rejection loop). */
export function scalarFromLabel(label: string): bigint {
	for (let salt = 0; ; salt++) {
		const candidate = BigInt('0x' + bytesToHex(sha256(utf8ToBytes(`${label}|${salt}`)))) % N;
		if (candidate !== 0n) return candidate;
	}
}

export interface ModBlindSignature {
	id: string;
	amount: number;
	C_: string;
	dleq: { e: string; s: string };
}

export interface TestMint {
	/** the flat keyset's public key A = a*G (compressed hex) — every amount uses the same test key */
	A: string;
	/** the test mint's private scalar (test-side reconstruction helpers) */
	privateKey: bigint;
	/**
	 * Sign a blinded message: C_ = a*B' + a NUT-12 DLEQ proof {e,s} derived with
	 * a deterministic nonce bound to B'.
	 */
	blindSign: (req: { id: string; amount: number; B_: string }) => ModBlindSignature;
}

/** A deterministic fake mint for one keyset. */
export function createTestMint(label: string): TestMint {
	const a = scalarFromLabel(`mint|${label}`);
	const A_point = G.multiply(a);
	const A_hex = A_point.toHex(true);
	return {
		A: A_hex,
		privateKey: a,
		blindSign: ({ id, amount, B_ }) => {
			const B__point = P.fromHex(B_);
			const C__point = B__point.multiply(a);
			const rn = scalarFromLabel(`dleq-nonce|${label}|${B_}`);
			const R1 = G.multiply(rn);
			const R2 = B__point.multiply(rn);
			const e = BigInt('0x' + bytesToHex(hash_e(R1, R2, A_point, C__point)));
			const s = (rn + e * a) % N;
			return {
				id,
				amount,
				C_: C__point.toHex(true),
				dleq: { e: bigIntToHex32(e), s: bigIntToHex32(s) }
			};
		}
	};
}

export interface CarolChain {
	/** the COMPLETE TokenProof (with dleq {e,s,r}) — exactly what a dleq-carrying token decodes to */
	proof: TokenProof;
	/** blinded message (what the mint was given) */
	B_: string;
	/** blind signature wire form (C_ = a*B') */
	C_: string;
	/** the blinding scalar actually used */
	rBig: bigint;
	/** unblinded C (what Alice holds before sending to Carol) */
	C: string;
}

/**
 * Build one REAL Carol-verifyable chain given the mint's private scalar + A:
 *   Y  = hash_to_curve(utf8(secret))          (blind.ts, real)
 *   r  = deterministicBlindingFactor(secret)  (blind.ts, real — the blindMessage fallback r)
 *        — override with opts.rOverride to mirror someone else's blinding
 *   B' = Y + r*G ;  C_ = a*B'  (mint);  C = C_ − r*A  (unblinded — what Alice sends Carol)
 *   dleq {e,s} from a deterministic nonce (label opts.mintLabel when a chain
 *   must reproduce the mint's own blindSign nonce for e/s byte-equality);
 *   the token dleq gains `r` (NUT-12 wire rule).
 */
export function buildCarolChainFromKeys(
	a: bigint,
	A: string,
	amount: number,
	id: string,
	secret: string,
	opts?: { rOverride?: bigint; mintLabel?: string }
): CarolChain {
	const r = opts?.rOverride ?? deterministicBlindingFactor(secret);
	const Y = hash_to_curve(utf8ToBytes(secret));
	const B_point = Y.add(G.multiply(r));
	const C_ = B_point.multiply(a);
	const A_point = P.fromHex(A);
	const C = C_.subtract(A_point.multiply(r));
	const rn = scalarFromLabel(`dleq-nonce|${opts?.mintLabel ?? 'chain'}|${B_point.toHex(true)}`);
	const R1 = G.multiply(rn);
	const R2 = B_point.multiply(rn);
	const e = BigInt('0x' + bytesToHex(hash_e(R1, R2, A_point, C_)));
	const s = (rn + e * a) % N;
	return {
		proof: {
			id,
			amount,
			secret,
			C: C.toHex(true),
			dleq: { e: bigIntToHex32(e), s: bigIntToHex32(s), r: bigIntToHex32(r) }
		},
		B_: B_point.toHex(true),
		C_: C_.toHex(true),
		rBig: r,
		C: C.toHex(true)
	};
}

/** Object-mint convenience wrapper over buildCarolChainFromKeys. */
export function buildCarolChain(
	mint: TestMint,
	amount: number,
	id: string,
	secret: string
): CarolChain {
	return buildCarolChainFromKeys(mint.privateKey, mint.A, amount, id, secret);
}
