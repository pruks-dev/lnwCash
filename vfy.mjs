import { decodeToken } from './src/lib/cashu/token.ts';
import { hash_to_curve } from './src/lib/cashu/blind.ts';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';

function hashE(...pts) {
  const hex = pts.map(p => p.toHex(false)).join('');
  return BigInt('0x' + Array.from(sha256(new TextEncoder().encode(hex)), b => b.toString(16).padStart(2,'0')).join(''));
}

async function main() {
  const token = process.argv[2];
  const d = decodeToken(token); const p = d.proofs[0];
  const keys = await (await fetch('https://mint.lnw.cash/v1/keys')).json();
  const K = keys.keysets.find(k => k.id === '00c25786d85a1dcd').keys[String(p.amount)];
  const Y = hash_to_curve(new TextEncoder().encode(p.secret));
  const C = secp256k1.Point.fromHex(p.C);
  const A = secp256k1.Point.fromHex(K);
  const G = secp256k1.Point.BASE;
  const e = BigInt('0x'+p.dleq.e), s = BigInt('0x'+p.dleq.s), r_ = BigInt('0x'+p.dleq.r);
  const Bp = Y.add(G.multiply(r_)); const Cp = C.add(A.multiply(r_));
  const R1 = G.multiply(s).subtract(A.multiply(e));
  const R2 = Bp.multiply(s).subtract(Cp.multiply(e));
  const cE = hashE(R1, R2, A, Cp);
  console.log('DLEQ:', cE === e ? '✅ VALID' : '❌ INVALID');
  console.log('amount:', p.amount, 'secret:', p.secret.substring(0,10)+'...');
}
main();
