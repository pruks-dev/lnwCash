import { blindMessage, unblindSignature, blindingFactorToHex, hash_to_curve } from './src/lib/cashu/blind.ts';
import { cborEncodeToken, cborDecodeToken } from './src/lib/util/cbor.ts';
import { decodeToken } from './src/lib/cashu/token.ts';
import { base64url } from './src/lib/util/base64.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { fetchAndCacheKeysets, getMintPubkey } from './src/lib/cashu/keyset.ts';

function hashE(...pts) {
  const hex = pts.map(p => p.toHex(false)).join('');
  return BigInt('0x' + Array.from(sha256(new TextEncoder().encode(hex)), b => b.toString(16).padStart(2,'0')).join(''));
}

const mintUrl = 'https://mint.lnw.cash';
const keysetId = '00c25786d85a1dcd';

async function main() {
  // === STEP 1: MINT (like completeMint) ===
  console.log('1. generateSecret...');
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(secretBytes, b => b.toString(16).padStart(2,'0')).join('');

  console.log('2. blindMessage...');
  const { B_, blindingFactor } = blindMessage(secret);
  const rHex = blindingFactorToHex(blindingFactor);
  console.log('   B_:', B_.substring(0,10)+'...');
  console.log('   r (base64):', blindingFactor.substring(0,10)+'...');
  console.log('   r (hex):', rHex.substring(0,10)+'...');

  console.log('3. fetchAndCacheKeysets...');
  await fetchAndCacheKeysets(mintUrl);
  const K = getMintPubkey(mintUrl, keysetId);
  console.log('   K:', K ? K.substring(0,10)+'...' : 'MISSING!');

  console.log('4. Mint API...');
  const q = await fetch('https://mint.lnw.cash/v1/mint/quote/bolt11', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({amount:4, unit:'sat'})
  }).then(r => r.json());
  const mr = await fetch('https://mint.lnw.cash/v1/mint/bolt11', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({quote:q.quote, outputs:[{amount:4, id:keysetId, B_}]})
  }).then(r => r.json());
  const sig = mr.signatures[0];
  console.log('   C_:', sig.C_.substring(0,10)+'...');
  console.log('   dleq:', sig.dleq ? `e=${sig.dleq.e.substring(0,8)}... s=${sig.dleq.s.substring(0,8)}...` : 'NO');

  console.log('5. unblindSignature...');
  const C = unblindSignature(sig.C_, blindingFactor, K);
  console.log('   C:', C.substring(0,10)+'...');

  // === STEP 2: STORE (like addProofs) ===
  console.log('6. Build stored proof...');
  const storedProof = {
    id: sig.id, amount: sig.amount, secret, C,
    dleq: sig.dleq ? { e: sig.dleq.e, s: sig.dleq.s, r: rHex } : undefined
  };
  console.log('   dleq present:', !!storedProof.dleq);
  console.log('   dleq.r:', storedProof.dleq?.r?.substring(0,10)+'...');

  // === STEP 3: ENCODE (like sendTokens → encodeToken) ===
  console.log('7. cborEncodeToken...');
  const cborInput = {
    id: storedProof.id, amount: storedProof.amount,
    secret: storedProof.secret, C: storedProof.C,
    dleq: storedProof.dleq
  };
  const cbor = cborEncodeToken([cborInput], mintUrl, 'sat');
  const tokenStr = 'cashuB' + base64url.encode(cbor);
  console.log('   token:', tokenStr.substring(0,40)+'...');

  // === STEP 4: DECODE & VERIFY (other wallet) ===
  console.log('8. decodeToken...');
  const decoded = decodeToken(tokenStr);
  const p = decoded.proofs[0];
  console.log('   amount:', p.amount);
  console.log('   secret:', p.secret.substring(0,10)+'...');
  console.log('   C:', p.C.substring(0,10)+'...');
  console.log('   dleq:', p.dleq ? 'YES' : 'NO');
  if (p.dleq) {
    console.log('   dleq.e:', p.dleq.e.substring(0,10)+'...(len:'+p.dleq.e.length+')');
    console.log('   dleq.s:', p.dleq.s.substring(0,10)+'...(len:'+p.dleq.s.length+')');
    console.log('   dleq.r:', p.dleq.r?.substring(0,10)+'...(len:'+(p.dleq.r?.length||0)+')');
  }

  console.log('9. DLEQ verify...');
  const Y = hash_to_curve(new TextEncoder().encode(p.secret));
  const Cp = secp256k1.Point.fromHex(p.C);
  const A = secp256k1.Point.fromHex(K);
  const G = secp256k1.Point.BASE;
  const e = BigInt('0x'+p.dleq.e);
  const s = BigInt('0x'+p.dleq.s);
  const r_ = BigInt('0x'+p.dleq.r);
  const Bpv = Y.add(G.multiply(r_));
  const Cpv = Cp.add(A.multiply(r_));
  const R1 = G.multiply(s).subtract(A.multiply(e));
  const R2 = Bpv.multiply(s).subtract(Cpv.multiply(e));
  const cE = hashE(R1, R2, A, Cpv);
  console.log('   Expected e:', e.toString(16).substring(0,10)+'...');
  console.log('   Computed e:', cE.toString(16).substring(0,10)+'...');
  console.log('   DLEQ:', cE === e ? '✅ VALID' : '❌ INVALID');

  // === STEP 5: Check round-trip consistency ===
  console.log('10. Round-trip check...');
  console.log('   secret match:', secret === p.secret ? '✅' : '❌');
  console.log('   C match:', C === p.C ? '✅' : '❌');
  const dleqMatch = storedProof.dleq && p.dleq &&
    storedProof.dleq.e === p.dleq.e &&
    storedProof.dleq.s === p.dleq.s &&
    storedProof.dleq.r === p.dleq.r;
  console.log('   dleq match:', dleqMatch ? '✅' : '❌');
}
main();
