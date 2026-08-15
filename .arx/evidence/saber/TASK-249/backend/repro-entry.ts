/**
 * TASK-249 (BLUEPRINT-003 v1.4.2, Wave 1, P0, HIGH) — READ-ONLY live repro
 *
 * Question to answer:
 *   (A) Does NUT-9 /v1/restore return the blind signature of a MELT-CHANGE
 *       output and a SWAP (receive) output?
 *   (B) Does restoreWallet reconstruct counter_k correctly after those outputs
 *       were mint-signed and the counter was advanced?
 *
 * This is a READ-ONLY repro — imports production modules and drives them
 * against the live FakeWallet mint. No production file is modified.
 *
 * Bundle → repro-a2-a4.mjs, then run:  node repro-a2-a4.mjs
 */
import '/home/debian/arx-projects/lnw-cash/node_modules/fake-indexeddb/auto/index.mjs';
import { generateMnemonic, mnemonicToSeed } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/keys.ts';
import { importSeed } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/seed.ts';
import { unlockWallet, deleteWallet } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/state.ts';
import { mintFlow } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/mint.ts';
import { meltFlow } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/melt.ts';
import { receiveTokens } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/tokenStore.ts';
import { restoreWallet } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/restore.ts';
import { getCounterK, clearAllCounters, getAllCounters } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/counterK.ts';
import { deriveSecretAndR } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/nut13.ts';
import { blindMessage } from '/home/debian/arx-projects/lnw-cash/src/lib/cashu/blind.ts';
import { requestMintQuote } from '/home/debian/arx-projects/lnw-cash/src/lib/cashu/client.ts';
import { fetchAndCacheKeysets } from '/home/debian/arx-projects/lnw-cash/src/lib/cashu/keyset.ts';
import { encodeToken } from '/home/debian/arx-projects/lnw-cash/src/lib/cashu/token.ts';
import { clearProofs } from '/home/debian/arx-projects/lnw-cash/src/lib/wallet/proofsDb.ts';

// ─── Browser shims (Node runtime) ──────────────────────────────
const store = new Map<string, string>();
const ls = {
	getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
	setItem: (k: string, v: string) => { store.set(k, String(v)); },
	removeItem: (k: string) => { store.delete(k); },
	clear: () => store.clear()
};
(globalThis as any).localStorage = ls;
(globalThis as any).window = { localStorage: ls };
(globalThis as any).sessionStorage = ls;
(globalThis as any).isSecureContext = true;

const MINT_URL = 'https://mint.lnw.cash/';
const BASE = 'https://mint.lnw.cash';
const PIN = '123456';

function log(label: string, data?: any) {
	console.log(`\n=== ${label} ===`);
	if (data !== undefined) {
		console.log(typeof data === 'string' ? data : JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
	}
}

function k(label: string, keyset: string) {
	console.log(`[counter_k] ${label}: ${getCounterK(keyset)}`);
}

async function rawPost(path: string, body: unknown) {
	const res = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return { status: res.status, body: await res.text() };
}

function bFor(seed: Uint8Array, keyset: string, counter: number): string {
	const { secret, r } = deriveSecretAndR(seed, keyset, counter);
	const { B_ } = blindMessage(secret, r);
	return B_;
}

function secretFor(seed: Uint8Array, keyset: string, counter: number): string {
	return deriveSecretAndR(seed, keyset, counter).secret;
}

async function main() {
	console.log('TASK-249 Live Repro — NUT-9 restore of melt-change (A2) and swap (A4) outputs');
	console.log('Mint:', BASE, '| Nutshell/0.20.1 | FakeWallet (auto-pay)');

	// ── PART 0: mint probe ─────────────────────────────────────
	log('PART 0 — mint probe');
	const info = await (await fetch(`${BASE}/v1/info`)).json();
	log('info', { name: info.name, version: info.version, nut09: info.nuts?.['9'], nut13: info.nuts?.['13'], nut17: info.nuts?.['17'], nut03: info.nuts?.['3'] });

	const keysets = await fetchAndCacheKeysets(MINT_URL);
	const active = keysets.filter((x: any) => x.active);
	const KEYSET = active[0].id;
	log('active keyset', { id: KEYSET, unit: active[0].unit, denominations: Object.keys(active[0].keys ?? {}).map(Number).sort((a, b) => a - b).slice(0, 12) });

	// ════════════════════════════════════════════════════════════
	// PART 1 (A2) — CLEAN: mint 64 → melt 32 (deterministic change)
	//              → clear → NUT-9 restore
	// ════════════════════════════════════════════════════════════
	log('PART 1 (A2) — mint 64 → melt 32 → clear → NUT-9 restore');
	const MNEMONIC_A = generateMnemonic();
	const seedA = mnemonicToSeed(MNEMONIC_A);
	log('seed A', { mnemonic: MNEMONIC_A });

	await importSeed(MNEMONIC_A, PIN, 'A2 repro');
	await unlockWallet(PIN);
	clearAllCounters();
	k('A2 start (fresh wallet, cleared)', KEYSET);

	const mint = await mintFlow(MINT_URL, 64);
	log('A2 mintFlow(64)', { success: mint.success, numProofs: mint.proofs.length, amounts: mint.proofs.map((p) => p.amount), error: mint.error });
	k('A2 after mint', KEYSET);
	const counterBeforeMelt = getCounterK(KEYSET);

	const selfQ = await requestMintQuote(MINT_URL, 32);
	const melt = await meltFlow(MINT_URL, selfQ.request!, 32);
	log('A2 meltFlow(32)', { success: melt.success, changeAmounts: melt.change?.map((p: any) => p.amount), spentAmount: melt.spentAmount, feeReserve: melt.feeReserve, error: melt.error });
	k('A2 after melt', KEYSET);
	const counterAfterMelt = getCounterK(KEYSET);

	const mintB0 = bFor(seedA, KEYSET, 0);
	const changeB = bFor(seedA, KEYSET, counterBeforeMelt);
	const unsignedB = bFor(seedA, KEYSET, 7777);

	log('A2 RAW /v1/restore (verbatim) — [mint c0, change c1, unsigned]');
	const rawA2 = await rawPost('/v1/restore', {
		outputs: [
			{ amount: 0, id: KEYSET, B_: mintB0 },
			{ amount: 0, id: KEYSET, B_: changeB },
			{ amount: 0, id: KEYSET, B_: unsignedB }
		]
	});
	log('A2 restore raw response', { status: rawA2.status, body: rawA2.body });

	// Simulate new machine
	await deleteWallet();
	clearAllCounters();
	await clearProofs();
	k('A2 after clear (new machine)', KEYSET);

	await fetchAndCacheKeysets(MINT_URL);
	const restoreA2 = await restoreWallet(MINT_URL, seedA, KEYSET, { batchSize: 100, emptyBatchLimit: 3, persist: false });
	log('A2 restoreWallet (NUT-9) result', { success: restoreA2.success, counter: restoreA2.counter, numProofs: restoreA2.proofs.length, proofAmounts: restoreA2.proofs.map((p: any) => p.amount), error: restoreA2.error });
	k('A2 after restore', KEYSET);

	log('A2 VERDICT', {
		meltChangeCounter: counterBeforeMelt,
		meltChangeSecret: secretFor(seedA, KEYSET, counterBeforeMelt).slice(0, 16) + '...',
		recoveredSecrets: restoreA2.proofs.map((p: any) => p.secret.slice(0, 16) + '...'),
		meltChangeRecovered: restoreA2.proofs.some((p: any) => p.secret === secretFor(seedA, KEYSET, counterBeforeMelt)),
		counterReconstructed: getCounterK(KEYSET),
		expectedCounter: counterAfterMelt
	});

	// ════════════════════════════════════════════════════════════
	// PART 2 (A4) — CLEAN: mint 16 → receiveTokens(swap) → clear
	//              → NUT-9 restore
	// ════════════════════════════════════════════════════════════
	log('PART 2 (A4) — mint 16 → receiveTokens(swap) → clear → NUT-9 restore');
	const MNEMONIC_B = generateMnemonic();
	const seedB = mnemonicToSeed(MNEMONIC_B);
	log('seed B', { mnemonic: MNEMONIC_B });

	// Fresh state for a clean swap test (counter + proofs wiped).
	await deleteWallet();
	clearAllCounters();
	await clearProofs();
	await importSeed(MNEMONIC_B, PIN, 'A4 repro');
	await unlockWallet(PIN);
	await fetchAndCacheKeysets(MINT_URL);
	k('A4 start (fresh wallet, cleared)', KEYSET);

	const mintB = await mintFlow(MINT_URL, 16);
	log('A4 mintFlow(16)', { success: mintB.success, amounts: mintB.proofs.map((p: any) => p.amount), error: mintB.error });
	k('A4 after mint', KEYSET);

	const token = encodeToken([mintB.proofs[0]], MINT_URL, 'sat');
	const counterBeforeSwap = getCounterK(KEYSET);
	const recv = await receiveTokens(token);
	log('A4 receiveTokens(swap)', { amount: recv.amount, proofCount: recv.proofCount, dleqCount: recv.dleqCount });
	k('A4 after swap', KEYSET);
	const counterAfterSwap = getCounterK(KEYSET);

	const mintB0b = bFor(seedB, KEYSET, 0);
	const swapB = bFor(seedB, KEYSET, counterBeforeSwap);
	log('A4 RAW /v1/restore (verbatim) — [mint c0, swap c1, unsigned]');
	const rawA4 = await rawPost('/v1/restore', {
		outputs: [
			{ amount: 0, id: KEYSET, B_: mintB0b },
			{ amount: 0, id: KEYSET, B_: swapB },
			{ amount: 0, id: KEYSET, B_: bFor(seedB, KEYSET, 8888) }
		]
	});
	log('A4 restore raw response', { status: rawA4.status, body: rawA4.body });

	await deleteWallet();
	clearAllCounters();
	await clearProofs();
	k('A4 after clear (new machine)', KEYSET);

	await fetchAndCacheKeysets(MINT_URL);
	const restoreA4 = await restoreWallet(MINT_URL, seedB, KEYSET, { batchSize: 100, emptyBatchLimit: 3, persist: false });
	log('A4 restoreWallet (NUT-9) result', { success: restoreA4.success, counter: restoreA4.counter, numProofs: restoreA4.proofs.length, proofAmounts: restoreA4.proofs.map((p: any) => p.amount), error: restoreA4.error });
	k('A4 after restore', KEYSET);

	log('A4 VERDICT', {
		swapReceiveCounter: counterBeforeSwap,
		swapReceiveSecret: secretFor(seedB, KEYSET, counterBeforeSwap).slice(0, 16) + '...',
		recoveredSecrets: restoreA4.proofs.map((p: any) => p.secret.slice(0, 16) + '...'),
		swapReceiveRecovered: restoreA4.proofs.some((p: any) => p.secret === secretFor(seedB, KEYSET, counterBeforeSwap)),
		counterReconstructed: getCounterK(KEYSET),
		expectedCounter: counterAfterSwap
	});

	// ════════════════════════════════════════════════════════════
	// PART 3 — ROOT CAUSE: stale counter_k across wallet delete/import
	//          (deleteWallet/importSeed do NOT reset counter_k)
	//          → gap in signed counters → restoreBatch misalignment
	// ════════════════════════════════════════════════════════════
	log('PART 3 — counter_k lifecycle across deleteWallet() + importSeed() (stale counter → gap)');
	const MNEMONIC_C = generateMnemonic();
	const seedC = mnemonicToSeed(MNEMONIC_C);
	const MNEMONIC_D = generateMnemonic();
	const seedD = mnemonicToSeed(MNEMONIC_D);

	// 3a: seed C uses the wallet, leaving counter_k = 1
	await deleteWallet();
	clearAllCounters();
	await clearProofs();
	await importSeed(MNEMONIC_C, PIN, 'C');
	await unlockWallet(PIN);
	await fetchAndCacheKeysets(MINT_URL);
	k('P3 seed C start', KEYSET);
	const mintC = await mintFlow(MINT_URL, 16);
	k('P3 seed C after mint (counter_k=1)', KEYSET);

	// 3b: deleteWallet() — does it clear counter_k?
	await deleteWallet();
	k('P3 after deleteWallet() — counter_k survives?', KEYSET);
	log('P3 counters after deleteWallet', getAllCounters());

	// 3c: importSeed(D) — does it clear counter_k?
	await importSeed(MNEMONIC_D, PIN, 'D');
	await unlockWallet(PIN);
	k('P3 after importSeed(D) — counter_k reused?', KEYSET);

	// 3d: seed D mints at the STALE counter (gap: counters 0..stale-1 never signed)
	const mintD = await mintFlow(MINT_URL, 16);
	log('P3 seed D mintFlow(16) at stale counter', { success: mintD.success, amounts: mintD.proofs.map((p: any) => p.amount) });
	k('P3 seed D after mint', KEYSET);
	const staleMintCounter = getCounterK(KEYSET) - 1; // the counter seed D's mint just used

	// 3e: seed D swap-receives at the next counter
	const tokenD = encodeToken([mintD.proofs[0]], MINT_URL, 'sat');
	const counterBeforeSwapD = getCounterK(KEYSET);
	await receiveTokens(tokenD);
	k('P3 seed D after swap', KEYSET);

	// 3f: raw restore shows the GAP (counter 0 unsigned for seed D)
	log('P3 RAW /v1/restore (verbatim) — seed D [c0 (never signed), c' + staleMintCounter + ' (mint), c' + counterBeforeSwapD + ' (swap)]');
	const rawGap = await rawPost('/v1/restore', {
		outputs: [
			{ amount: 0, id: KEYSET, B_: bFor(seedD, KEYSET, 0) },
			{ amount: 0, id: KEYSET, B_: bFor(seedD, KEYSET, staleMintCounter) },
			{ amount: 0, id: KEYSET, B_: bFor(seedD, KEYSET, counterBeforeSwapD) }
		]
	});
	log('P3 restore raw response (gap)', { status: rawGap.status, body: rawGap.body });

	// 3g: new machine → restore seed D → misalignment + counter undercount
	await deleteWallet();
	clearAllCounters();
	await clearProofs();
	await fetchAndCacheKeysets(MINT_URL);
	const restoreD = await restoreWallet(MINT_URL, seedD, KEYSET, { batchSize: 100, emptyBatchLimit: 3, persist: false });
	log('P3 restoreWallet(seed D) result', { success: restoreD.success, counter: restoreD.counter, numProofs: restoreD.proofs.length, proofAmounts: restoreD.proofs.map((p: any) => p.amount), error: restoreD.error });
	k('P3 after restore (seed D)', KEYSET);

	log('P3 VERDICT (gap) — is the swap-receive proof recoverable?', {
		expectedSwapCounter: counterBeforeSwapD,
		expectedSwapSecret: secretFor(seedD, KEYSET, counterBeforeSwapD).slice(0, 16) + '...',
		recoveredSecrets: restoreD.proofs.map((p: any) => p.secret.slice(0, 16) + '...'),
		swapRecovered: restoreD.proofs.some((p: any) => p.secret === secretFor(seedD, KEYSET, counterBeforeSwapD)),
		counterReconstructed: getCounterK(KEYSET),
		expectedCounter: counterBeforeSwapD + 1
	});

	console.log('\n=== REPRO COMPLETE ===');
}

main().catch((e) => { console.error('REPRO FAILED', e); process.exit(1); });
