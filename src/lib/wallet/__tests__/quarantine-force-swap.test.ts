/**
 * TASK-1316 (INTENT-013) — P4 T3 flush force-swap + P5 quarantine boundary.
 *
 * P4: the T3 flush (autoNormalizeOnBackOnline → runAutoNormalizeNow with
 * {forceSwap:true}) MUST bypass the zero-swap short-circuit — the pending
 * pile is swapped AT THE MINT even when it is already complete-set shaped
 * (the mint itself re-attests the coins were never spent). T1/T2 keep the
 * zero-skip semantics 100% (self-minted coins — TASK-1303 ruling_2).
 *
 * P5: when the flush swap is rejected by the mint with the DOUBLE-SPENT
 * family — CashuError code 11002 (tokens already spent) / 11005 (tokens
 * already signed) — the group is marked `quarantined` (a NEW StoredProof
 * field; NOT a reuse of orphaned:26 or pending_normalize) and the flush
 * CONTINUES with the remaining groups. Quarantined coins leave the spendable
 * pool AND every balance (the mint already counted them as spent).
 *
 * Classification boundary (both directions — the envelope assumption
 * "11003 from swap = double-spent family" was PROVEN FALSE against this
 * repo's own error model: client.ts CashuError.BENIGN_CODES = {11003, 20002}
 * — 11003 is the OUTPUT-side idempotent collision mint.ts:114 retries
 * benignly; quarantining on it would seize healthy money on a counter
 * desync. The family is therefore NARROW: 11002 + 11005 — see
 * errors.ts isDoubleSpentFamilyError):
 *   NOT quarantined: network (MintUnreachableError/NetworkError/TypeError),
 *     benign 11003/20002, InvalidResponseError, plain errors;
 *   quarantined:      CashuError 11002 / 11005 (numeric or string code).
 *
 * The client module is PARTIALLY mocked via importOriginal — the REAL
 * CashuError classes stay real so `instanceof` classification is genuine.
 * Proof piles are REAL dleq chains (dleq-harness); blind/dleq/nut13 unmocked.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, MINT_URL_DEAD, KEYSET_ID, KEYSET_ID_B, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.alive1316.test',
	MINT_URL_DEAD: 'https://mint.dead1316.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	KEYSET_ID_B: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76b',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../cashu/client')>();
	return {
		...actual,
		swapProofs: vi.fn(),
		checkState: vi.fn(),
		mintTokens: vi.fn(),
		requestMintQuote: vi.fn(),
		checkMintQuote: vi.fn(),
		pollMintQuoteUntil: vi.fn(),
		meltTokens: vi.fn(),
		requestMeltQuote: vi.fn(),
		checkMeltQuote: vi.fn(),
		restoreOutputs: vi.fn()
	};
});

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([]),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

vi.mock('../../offline-indicator', () => ({
	getDetectorStatus: vi.fn(() => ({
		state: 'online',
		online: true,
		suspect: false,
		probing: false,
		bootWired: true,
		targets: [],
		probeCount: 0,
		lastProbeAt: 0,
		lastResult: 'online'
	})),
	isOnline: vi.fn(() => true),
	onConnectivityChange: vi.fn(() => () => {}),
	// TASK-1402: dual-rail binding (module-init) needs both EVENT API
	// entries on the mocked detector surface (no-op stubs — the rail
	// behavior itself is proven in flush-binding-1402.test.ts).
	onOnlineConfirmed: vi.fn(() => () => {}),
	setPendingPileReader: vi.fn(),
	notifySuspectOffline: vi.fn(),
	setProbeTargets: vi.fn(),
	wasOffline: vi.fn(() => false),
	resetWasOffline: vi.fn(),
	trackWasOffline: vi.fn(() => () => {})
}));

import * as client from '../../cashu/client';
import { getMintPubkey } from '../../cashu/keyset';
import { CashuError, MintUnreachableError, NetworkError, InvalidResponseError } from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import {
	addProofs,
	deleteProofDB,
	resetProofDB,
	getAllProofs,
	getUnspentProofs,
	getUnspentProofsIncludingPending,
	getPendingNormalizeProofs,
	markPendingNormalizeByProof,
	markQuarantined,
	getTotalBalance
} from '../proofsDb';
import { isDoubleSpentFamilyError as isFamilyReal } from '../errors';
import {
	runAutoNormalizeNow,
	autoNormalizeOnBackOnline,
	cancelAutoNormalize,
	type AutoNormalizeDeps
} from '../proofs';
import {
	flushPendingNormalizeOnBackOnline,
	cancelScheduledNormalize,
	boundSwapFn
} from '../normalizeWiring';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeMint } from '../mint';
import { createTestMint, buildCarolChainFromKeys } from './dleq-harness';
import type { StoredProof } from '../proofsDb';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);
const mint = createTestMint('q1316');

function chainProof(amount: number, label: string, keysetId = KEYSET_ID, mintUrl = MINT_URL): StoredProof {
	const chain = buildCarolChainFromKeys(mint.privateKey, mint.A, amount, keysetId, label);
	return {
		...chain.proof,
		local_id: `${keysetId}:${label}`,
		mint_url: mintUrl,
		keyset_id: keysetId,
		stored_at: Date.now(),
		spent: false
	} as StoredProof;
}

function pendingFlagged(proof: StoredProof): StoredProof {
	return { ...proof, pending_normalize: true };
}

describe('TASK-1316: P4 force-swap + P5 quarantine boundary', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		localStorage.removeItem(STORAGE_KEY);
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
		vi.mocked(getMintPubkey).mockReturnValue(mint.A);
		vi.mocked(client.checkMintQuote).mockResolvedValue({
			quote: 'q', request: 'lnbc…mock', paid: true, expiry: 9999999999, state: 'PAID'
		} as never);
	});

	afterEach(async () => {
		cancelScheduledNormalize();
		cancelAutoNormalize();
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	// ── classification unit (boundary both ways — REAL CashuError classes) ──
	it('q0) isDoubleSpentFamilyError: whitelist 11002/11005 ONLY — network, benign 11003/20002, invalid, plain are OUT', () => {
		const inFamily = [new CashuError('tokens already spent', 400, 11002),
			new CashuError('already signed', 400, 11005),
			new CashuError('string code', 400, '11002')];
		const outFamily = [new CashuError('outputs already signed (benign)', 400, 11003),
			new CashuError('quote already issued', 400, 20002),
			new MintUnreachableError(MINT_URL),
			new NetworkError('reset'),
			new InvalidResponseError('bad shape'),
			new Error('plain'),
			new TypeError('transport')];
		for (const e of inFamily) expect(isFamilyReal(e)).toBe(true);
		for (const e of outFamily) expect(isFamilyReal(e)).toBe(false);
	});

	// ── P4 — pure engine ──
	it('q1) engine: T3 hook forces a swap on a complete-set pile; T1 hook keeps the zero-skip on the same pile', async () => {
		const pile = [chainProof(1, 'p1'), chainProof(2, 'p2')]; // completeSet(3) = [1,2]
		let swapRuns = 0;
		const deps: AutoNormalizeDeps = {
			getProofs: async () => pile,
			swapFn: async (proofs, outputs) => {
				swapRuns++;
				return proofs; // echo — shape irrelevant here
			}
		};

		// T1 hook — zero-skip EXACTLY as before (self-minted coins):
		const t1 = await runAutoNormalizeNow(deps, 'T1-receive-online');
		expect(t1?.zeroSwap).toBe(true);
		expect(t1?.swapped).toBe(false);
		expect(swapRuns).toBe(0);

		// T3 hook — FORCE: same pile, same deps → the swap RUNS:
		const t3 = await autoNormalizeOnBackOnline(deps);
		expect(t3?.swapped).toBe(true);
		expect(t3?.zeroSwap).toBe(false);
		expect(swapRuns).toBe(1);
	}, 15000);

	// ── P4 — REAL wiring flush ──
	it('q2) REAL T3 flush: pending pile already complete-set → FORCE swap at the mint (no zero-skip leak), counter advances, flags cleared', async () => {
		setCounterK(KEYSET_ID, 5);
		const pile = [chainProof(1, 'p1'), chainProof(2, 'p2')];
		await addProofs(pile.map(pendingFlagged), MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof(pile);

		vi.mocked(client.swapProofs).mockImplementation(async (_u, _in,
			outputs?: Array<{ id: string; amount: number; B_: string }>) => ({
			signatures: (outputs ?? []).map((o) => mint.blindSign(o))
		}) as never);

		const flush = await flushPendingNormalizeOnBackOnline();
		expect(flush?.swapped).toBe(true);
		expect(flush?.zeroSwap).toBe(false);
		expect(vi.mocked(client.swapProofs).mock.calls.length).toBe(1); // จริงที่ mint
		expect(getCounterK(KEYSET_ID)).toBe(7); // 5 + outputs.length(2) — advance เกิดจริง
		expect(await getPendingNormalizeProofs()).toHaveLength(0); // flags cleared
	}, 15000);

	// ── P5 — boundary: ทิศกังวาล (never quarantine on non-evidence) ──
	it.each([
		['MintUnreachableError (transport)', () => new MintUnreachableError(MINT_URL)],
		['NetworkError (timeout)', () => new NetworkError('reset')],
		['benign 11003 (outputs already signed)', () => new CashuError('outputs already signed', 400, 11003)],
		['benign 20002 (quote already issued)', () => new CashuError('quote already issued', 400, 20002)],
		['InvalidResponseError', () => new InvalidResponseError('bad shape')]
	])('q3) flush swap fails with %s → NO quarantine, flags STAY (retry later)', async (_label, makeErr) => {
		setCounterK(KEYSET_ID, 5); // live band — the counter-0 guard must not fire
		const pile = [chainProof(2, 'alive1'), chainProof(1, 'alive2')];
		await addProofs(pile.map(pendingFlagged), MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof(pile);

		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw makeErr();
		}) as never;

		const flush = await flushPendingNormalizeOnBackOnline();
		expect(flush).toBeNull(); // engine swallowed the error (flags stay — retry)

		// NOT quarantined — the coins remain unspent, pending (flags stay).
		// INTENT-015 (TASK-1510/1511 flip): pending is NOT counted in the
		// balance — 'pending และ failed proof ไม่ควรเอามานับเป็น balance
		// ด้วย'. Balance = spendable only = 0 here (both coins pending);
		// the flush pile (IncludingPending) still sees 2 for retry:
		const all = await getAllProofs();
		expect(all.every((p) => !p.quarantined)).toBe(true);
		expect(await getUnspentProofsIncludingPending()).toHaveLength(2);
		expect(await getTotalBalance()).toBe(0); // FLIPPED from 3 (TASK-1315 contract) — intended breakage, see g3-flip-note.md
		// flags STAY — the next back-online flush retries:
		expect(await getPendingNormalizeProofs()).toHaveLength(2);
	}, 15000);

	// ── P5 — boundary: ทิศตาย (11002/11005 quarantine) ──
	it.each([
		['11002 numeric', 11002 as const],
		['11002 string', '11002' as const],
		['11005 numeric', 11005 as const]
	])('q4) flush swap rejected with %s → group quarantined: out of spendable, out of balance, out of pending query', async (_label, code) => {
		setCounterK(KEYSET_ID, 5); // live band — the counter-0 guard must not fire
		const pile = [chainProof(2, 'dead1'), chainProof(1, 'dead2')];
		await addProofs(pile.map(pendingFlagged), MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof(pile);

		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw new CashuError('tokens already spent', 400, code);
		}) as never;

		const flush = await flushPendingNormalizeOnBackOnline();
		expect(flush?.swapped).toBe(true); // run completed (all groups quarantined)

		// quarantined — out of spendable AND out of balance AND out of pending:
		expect(await getUnspentProofs()).toHaveLength(0);
		const all = await getAllProofs();
		expect(all.every((p) => p.quarantined === true)).toBe(true);
		expect(await getUnspentProofsIncludingPending()).toHaveLength(0);
		expect(await getTotalBalance()).toBe(0);
		expect(await getPendingNormalizeProofs()).toHaveLength(0); // flags cleared by flush
	}, 15000);

	// ── P5 — mixed flush pile (ตายกลาง + สุขภาพดี) across two mints ──
	it('q5) mixed flush pile: dead group (11002) quarantined + healthy group swaps to completion — counter/balance per group', async () => {
		setCounterK(KEYSET_ID, 4);   // group A — will die with 11002
		setCounterK(KEYSET_ID_B, 2); // group B — healthy

		const deadGroup = [chainProof(2, 'dead1', KEYSET_ID, MINT_URL_DEAD),
			chainProof(1, 'dead2', KEYSET_ID, MINT_URL_DEAD)];
		const aliveGroup = [chainProof(3, 'alive1', KEYSET_ID_B, MINT_URL),
			chainProof(2, 'alive2', KEYSET_ID_B, MINT_URL)];
		// addProofs STAMPS mint_url/keyset_id from its args — separate calls so
		// each group keeps its own mint (groupPile groups by mint_url||keyset):
		await addProofs(deadGroup.map(pendingFlagged), MINT_URL_DEAD, KEYSET_ID);
		await addProofs(aliveGroup.map(pendingFlagged), MINT_URL, KEYSET_ID_B);
		await markPendingNormalizeByProof([...deadGroup, ...aliveGroup]);

		vi.mocked(client.swapProofs).mockImplementation(async (mintUrl: string, _in, outputs) => {
			if (String(mintUrl) === MINT_URL_DEAD) {
				throw new CashuError('tokens already spent: dead secrets', 400, 11002);
			}
			return {
				signatures: ((outputs ?? []) as Array<{ id: string; amount: number; B_: string }>)
					.map((o) => mint.blindSign(o))
			};
		}) as never;

		// REAL flush shape: the engine normalizes the WHOLE pile (both mints)
		// toward completeSet(total sum) = completeSet(8) = [1,1,2,4] and
		// boundSwapFn splits shares per group:
		const pile = (await getUnspentProofsIncludingPending()) as StoredProof[];
		const newProofs = await boundSwapFn(pile, [1, 1, 2, 4]);

		// healthy group re-signed — the dead group is quarantined and gone:
		expect(newProofs.reduce((s, p) => s + p.amount, 0)).toBe(5); // alive group's share
		expect(newProofs.every((p) => p.mint_url === MINT_URL)).toBe(true);

		// dead group quarantined — gone from spendable/balance/pending:
		const all = await getAllProofs();
		const dead = all.filter((p) => p.mint_url === MINT_URL_DEAD);
		expect(dead.every((p) => p.quarantined === true)).toBe(true);
		// spendable = ONLY the re-signed healthy proofs (old alive inputs were
		// marked spent inside the swap; dead ones quarantined):
		const spendable = await getUnspentProofs();
		expect(spendable.every((p) => p.mint_url === MINT_URL)).toBe(true);
		expect(spendable).toHaveLength(2);
		expect(await getPendingNormalizeProofs()).toHaveLength(0);

		// balance: healthy only — quarantined money is NOT counted:
		expect(await getTotalBalance()).toBe(5);
		expect((await getUnspentProofsIncludingPending()).every((p) => p.mint_url === MINT_URL)).toBe(true);

		// counters: dead group aborted BEFORE its increment (TASK-313 pattern —
		// untouched); healthy group advanced by its share's output count:
		expect(getCounterK(KEYSET_ID)).toBe(4);
		expect(getCounterK(KEYSET_ID_B)).toBeGreaterThan(2);
	}, 15000);

	// ── classification isolation — mint flow benign retry untouched ──
	it('q6) mint flow benign-11003 retry: coins minted fine, NEVER quarantined (flow-based boundary)', async () => {
		setCounterK(KEYSET_ID, 0);
		// first postMint → benign 11003; retry → real signatures:
		let attempts = 0;
		vi.mocked(client.mintTokens).mockImplementation(async (_u, _q,
			body: Array<{ amount: number; id: string; B_: string }>) => {
			attempts++;
			if (attempts === 1) {
				throw new CashuError('outputs already signed', 400, 11003);
			}
			return {
				signatures: ((body ?? []) as Array<{ amount: number; id: string; B_: string }>)
					.map((o) => mint.blindSign(o))
			};
		}) as never;

		const outcome = await completeMint(MINT_URL, 'q-mint', 2, KEYSET_ID, false, seed);
		expect(outcome.success).toBe(true);
		expect(attempts).toBeGreaterThanOrEqual(2); // benign retry ran

		const stored = await getAllProofs();
		expect(stored.every((p) => !p.quarantined)).toBe(true); // ไม่มีการกักเหรียญใน mint flow
		expect(stored.every((p) => p.dleq)).toBe(true);
	}, 15000);
});
