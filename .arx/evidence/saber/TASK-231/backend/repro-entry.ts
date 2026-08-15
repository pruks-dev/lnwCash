import '/home/debian/arx-projects/lnw-cash/node_modules/fake-indexeddb/auto/index.mjs';
import { generateMnemonic, mnemonicToSeed } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/keys.ts';
import { importSeed } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/seed.ts';
import { unlockWallet, deleteWallet } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/state.ts';
import { mintFlow } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/mint.ts';
import { restoreWallet } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/restore.ts';
import { getCounterK, clearAllCounters } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/counterK.ts';
import { deriveSecretAndR } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/nut13.ts';
import { blindMessage } from '/home/debian/arx-projects/lnw-cash/src/lib/cashu/blind.ts';
import {
  requestMintQuote, pollMintQuoteUntil, mintTokens,
  requestMeltQuote, meltTokens, checkState
} from '/home/debian/arx-projects/lnw-cash/src/lib/cashu/client.ts';
import { fetchAndCacheKeysets } from '/home/debian/arx-projects/lnw-cash/src/lib/cashu/keyset.ts';

// ── Browser shims (Node runtime) ──────────────────────────────
const store = new Map<string, string>();
const ls = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
};
(globalThis as any).localStorage = ls;
(globalThis as any).window = { localStorage: ls };
(globalThis as any).isSecureContext = true;

const MINT_URL = 'https://mint.lnw.cash/'; // trailing slash → bypass Vite proxy branch
const BASE = 'https://mint.lnw.cash';
const KEYSET = '00c25786d85a1dcd';
const PIN = '123456';

function log(label: string, data?: any) {
  console.log(`\n=== ${label} ===`);
  if (data !== undefined) {
    console.log(typeof data === 'string' ? data : JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  }
}
function k(label: string) {
  console.log(`[counter_k] ${label}: ${getCounterK(KEYSET)}`);
}
async function rawPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  console.log('TASK-231 RC-4 Live Repro — mint 400 "outputs already signed" (code 11003)');
  console.log('Mint:', BASE, '| Keyset:', KEYSET, '| Nutshell/0.20.1');
  await fetchAndCacheKeysets(MINT_URL);

  // ════════════════════════════════════════════════════════════
  // PART A — reproduce the 400 (counter REUSE: new quote + already-signed B_)
  //          + idempotent control (same quote + same B_ → 200)
  // ════════════════════════════════════════════════════════════
  log('PART A — isolate the exact "outputs already signed" trigger (seed A)');
  {
    const seedA = mnemonicToSeed(MNEMONIC_A);
    const { secret, r } = deriveSecretAndR(seedA, KEYSET, 0);
    const { B_ } = blindMessage(secret, r);

    const qA = await requestMintQuote(MINT_URL, 64);
    await pollMintQuoteUntil(MINT_URL, qA.quote, 'PAID', 60000, 2000);
    const a1 = await rawPost('/v1/mint/bolt11', { quote: qA.quote, outputs: [{ amount: 64, id: KEYSET, B_ }] });
    log('A1: quote A + B_ (first sign)', { status: a1.status, sig: JSON.parse(a1.body).signatures?.[0]?.C_?.slice(0, 20) + '...' });

    const a2 = await rawPost('/v1/mint/bolt11', { quote: qA.quote, outputs: [{ amount: 64, id: KEYSET, B_ }] });
    log('A2: quote A + B_ AGAIN (double-submit control → idempotent 200)', { status: a2.status });

    const qB = await requestMintQuote(MINT_URL, 64);
    await pollMintQuoteUntil(MINT_URL, qB.quote, 'PAID', 60000, 2000);
    const a3 = await rawPost('/v1/mint/bolt11', { quote: qB.quote, outputs: [{ amount: 64, id: KEYSET, B_ }] });
    log('A3: quote B (NEW) + same B_ → FULL 400 body', { status: a3.status, rawBody: a3.body });
    try { log('A3 parsed', JSON.parse(a3.body)); } catch { /* not json */ }
  }

  // ════════════════════════════════════════════════════════════
  // PART B — counter_k trace: mint → melt → restore → mint (seed B)
  // ════════════════════════════════════════════════════════════
  log('PART B — counter_k trace with wallet functions (seed B)');
  clearAllCounters();
  await importSeed(MNEMONIC_B, PIN, 'Repro Wallet');
  await unlockWallet(PIN);
  k('start (cleared)');

  const mint = await mintFlow(MINT_URL, 64);
  log('B1: mintFlow(64) result', { success: mint.success, numProofs: mint.proofs.length, error: mint.error });
  k('after mint');

  {
    const proof = mint.proofs[0];
    let melted = false;
    for (let attempt = 1; attempt <= 3 && !melted; attempt++) {
      try {
        const selfQ = await requestMintQuote(MINT_URL, 32);
        const mq = await requestMeltQuote(MINT_URL, selfQ.request!, 32);
        await new Promise((r) => setTimeout(r, 1500));
        const changeSecret = (() => { const b = new Uint8Array(32); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); })();
        const { B_: changeB } = blindMessage(changeSecret);
        const mr = await meltTokens(MINT_URL, mq.quote, [{ amount: 64, id: KEYSET, secret: proof.secret, C: proof.C }], [{ amount: 32, id: KEYSET, B_: changeB }]);
        log(`B2: melt 32 (attempt ${attempt}) spent counter-0 proof`, { paid: mr.paid, changeAmounts: mr.change?.map((c: any) => c.amount) });
        melted = true;
      } catch (e: any) {
        log(`B2 melt attempt ${attempt} failed`, { message: e?.message });
      }
    }
    k('after melt (unchanged — melt.ts never calls incrementCounterK)');
  }

  await deleteWallet();
  clearAllCounters();
  k('after clear (new device)');

  await importSeed(MNEMONIC_B, PIN, 'Repro Wallet');
  await unlockWallet(PIN);
  await fetchAndCacheKeysets(MINT_URL);
  const restore = await restoreWallet(MINT_URL, seedB, KEYSET);
  log('B4: restoreWallet (NUT-9) result', { success: restore.success, counter: restore.counter, numProofs: restore.proofs.length, proofAmounts: restore.proofs.map((p: any) => p.amount) });
  k('after restore');

  const mintAgain = await mintFlow(MINT_URL, 64);
  log('B5: mintFlow(64) again → SUCCESS (counter reconstructed correctly)', { success: mintAgain.success, numProofs: mintAgain.proofs.length, error: mintAgain.error });
  k('after mint-again');

  // ════════════════════════════════════════════════════════════
  // PART C — checkState secondary finding (hexToBytes vs UTF-8)
  // ════════════════════════════════════════════════════════════
  log('PART C — checkState on a SPENT proof (client.ts uses hexToBytes → always UNSPENT)');
  {
    const spentProof = mint.proofs[0];
    const st = await checkState(MINT_URL, [{ secret: spentProof.secret, C: spentProof.C }]);
    log('checkState(spent counter-0 proof)', st);
  }

  console.log('\n=== REPRO COMPLETE ===');
}

const MNEMONIC_A = generateMnemonic();
const MNEMONIC_B = generateMnemonic();
const seedB = mnemonicToSeed(MNEMONIC_B);
main().catch((e) => { console.error('REPRO FAILED', e); process.exit(1); });
