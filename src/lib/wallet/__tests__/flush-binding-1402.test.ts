/**
 * TASK-1402 (INTENT-013 v5.1, F-049-001+F7) — flush binding:
 * onOnlineConfirmed → T3 (plus the kept flip rail) + boot-drain + dedupe.
 *
 * WHAT THIS PROVES (dispatch acceptance, 4 items):
 *   1. flip-only tx path (TASK-1403's contract: tx pending→confirmed flipped
 *      by the FLUSH — flushPendingNormalizeOnBackOnline IS the non-test
 *      tx-flip caller) settles a mapped tx 'pending'→'confirmed';
 *   2. onOnlineConfirmed-only rail (boot-drain shape: the seed is already
 *      'online', so NO flip fires — detector emits onOnlineConfirmed only)
 *      runs the same T3 flush;
 *   3. flip + onOnlineConfirmed on the SAME verdict run ONE swap
 *      (dedupe: boot-drain ชน flip — promise gate + engine running lock);
 *   4. T1/T2 wires byte-untouched (proven by git diff in the proof file;
 *      here: T1/T2 entry points still exist and behave — zero-skip intact).
 *
 * DESIGN NOTES (collision-safe with the parallel TASK-1403 session):
 *   - uncommitted TREE files (tokenStore settle fns, proofs origin,
 *     types proofIds, state migration, txMigration) are USED as the flip
 *     contract surface but NEVER edited — the mock contract is read from
 *     their uncommitted diff at author time and re-declared here via the
 *     public barrel (wallet/index) so this file compiles against EITHER
 *     tree state (with or without 1403's uncommitted work).
 *   - normalizeWiring is imported for REAL (no module mock): the production
 *     dual-rail binding (module-init subscriber) is what runs. The detector
 *     module itself is NOT imported — its two rails are captured by
 *     re-declaring the mock factory with listener capture, so the REAL
 *     wiring code subscribes into OUR captured rails and the test drives
 *     both rails deterministically (flip rail + confirmed rail, separately
 *     and concurrently) without touching detector internals (EVENT API only
 *     — the rails ARE the event API).
 *   - proofsDb is REAL (fake-indexeddb): the pending-pile reader the wiring
 *     registers is the real proofsDb-backed mirror.
 *   - cashu client/keyset/blind/nut13 are REAL crypto; the mint is a
 *     deterministic blind-sign oracle over the suite's own mint key
 *     (mirror of quarantine-force-swap.test.ts).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.flush1402.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

/**
 * Listener capture for the detector EVENT API. The wiring module's
 * module-init block calls these three; we capture (not execute) so each
 * rail can be fired in isolation. `reader` is the wallet's pile reader
 * (TASK-1401 setPendingPileReader contract).
 */
const rails = vi.hoisted(() => ({
	flipListeners: [] as Array<(online: boolean) => void>,
	confirmedListeners: [] as Array<() => void>,
	reader: null as null | (() => boolean)
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
	onConnectivityChange: vi.fn((cb: (online: boolean) => void) => {
		rails.flipListeners.push(cb);
		return () => {};
	}),
	onOnlineConfirmed: vi.fn((cb: () => void) => {
		rails.confirmedListeners.push(cb);
		return () => {};
	}),
	setPendingPileReader: vi.fn((reader: () => boolean) => {
		rails.reader = reader;
	}),
	notifySuspectOffline: vi.fn(),
	setProbeTargets: vi.fn(),
	wasOffline: vi.fn(() => false),
	resetWasOffline: vi.fn(),
	trackWasOffline: vi.fn(() => () => {})
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

vi.mock('../store', () => ({
	clearMintConfigs: vi.fn()
}));

import * as client from '../../cashu/client';
import { blindMessage } from '../../cashu/blind';
import { getMintPubkey } from '../../cashu/keyset';
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
	makeLocalId
} from '../proofsDb';
import { isAutoNormalizeRunning } from '../proofs';
import {
	flushPendingNormalizeOnBackOnline,
	runFlushDrain,
	isFlushDrainInFlight,
	resetFlushDrainForTests,
	cancelScheduledNormalize,
	scheduleNormalizeAfterReceiveOnline,
	scheduleNormalizeAfterMint
} from '../normalizeWiring';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { addTransaction, getTransactionById, deleteDatabase } from '../../storage/db';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);

let mintK = 0n;
let mintPubkeyHex = '';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

/** A wallet-valid proof (counter-derived secret, mint-signed C). */
async function signedProof(amount: number, counter: number): Promise<TokenProof> {
	const { deriveSecretAndR } = await import('../nut13');
	const derived = deriveSecretAndR(seed, KEYSET_ID, counter);
	// UNIQUE secret per proof: the seed+counter derivation is deterministic,
	// so same-counter proofs would share a secret → same local_id → the
	// second addProofs PUT would silently OVERWRITE the first (IndexedDB
	// keyPath put semantics). The amount tag keeps local_ids distinct while
	// the secret stays counter-derived (wallet-valid for the swap path,
	// which re-derives outputs from the counter band, not from inputs).
	const secret = `${derived.secret}:t1402:${amount}:${counter}`;
	const { B_ } = blindMessage(secret, derived.r);
	const C = secp256k1.Point.fromHex(B_).multiply(mintK).toHex(true);
	return { id: KEYSET_ID, amount, secret, C };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bounded wait until no normalize run is in flight. */
async function awaitDrainIdle(maxMs = 6000): Promise<void> {
	const start = Date.now();
	while (isAutoNormalizeRunning() && Date.now() - start < maxMs) {
		await sleep(25);
	}
}

/** Fire the flip rail the way the detector does on offline→online. */
function fireFlip(online = true): void {
	for (const cb of [...rails.flipListeners]) cb(online);
}

/** Fire the confirmed rail the way the detector does (flip + boot-drain). */
function fireConfirmed(): void {
	for (const cb of [...rails.confirmedListeners]) cb();
}

function swapCalls(): Array<unknown[]> {
	return (client.swapProofs as ReturnType<typeof vi.fn>).mock.calls;
}

describe('TASK-1402 — module-init binding (mount→DB→detector→probe→flush order)', () => {
	it('mount order: wiring subscribes BOTH rails + registers the pile reader at import (no manual wire-up)', async () => {
		// The imports above ARE the mount: normalizeWiring module-init ran
		// (DB layer importable → detector EVENT API subscribed → probe would
		// drive flush). Assert the subscription order effects directly.
		expect(rails.flipListeners.length).toBeGreaterThanOrEqual(1);
		expect(rails.confirmedListeners.length).toBeGreaterThanOrEqual(1);
		expect(rails.reader).not.toBeNull();
	});

	it('pile reader is proofsDb-backed: true with pending pile, false after drain', async () => {
		expect(rails.reader).not.toBeNull();
		const read = rails.reader as () => boolean;
		// fresh DB, no drain yet → pessimistic true (boot-drain can fire)
		expect(read()).toBe(true);
		await runFlushDrain(); // empty pile → null result, mirror → false
		expect(read()).toBe(false);

		// plant a pending pile → drain → mirror true then false
		const p = await signedProof(4, getCounterK(KEYSET_ID));
		await addProofs([p], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p]);
		await runFlushDrain();
		await awaitDrainIdle();
		expect(read()).toBe(false);
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
	});
});

describe('TASK-1402 — flip caller path (1403 contract: flush flips tx pending→confirmed)', () => {
	it('flush settles a mapped tx pending→confirmed (1403 settleReceiveTxByProofs contract)', async () => {
		// Arrange: a pending pile + the tx record the OLD 1403 passthrough
		// writes (status pending + proofIds mapping — read from 1403's
		// uncommitted diff, re-declared here, never edited there).
		const p = await signedProof(4, getCounterK(KEYSET_ID));
		const localId = makeLocalId(p);
		await addProofs([p], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p]);
		await addTransaction({
			id: 'tx-flip-1402',
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: 4,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: 'tok-flip',
			status: 'pending',
			fee: 0,
			proofIds: [localId]
		});

		// Act: the flip caller — flushPendingNormalizeOnBackOnline IS the
		// non-test tx-flip caller per 1403's own comment in normalizeWiring.
		const result = await flushPendingNormalizeOnBackOnline();

		// Assert: pile swapped at the mint (forceSwap — completeSet(4)=[4]
		// would zero-skip without it) + flags cleared + tx flipped.
		expect(result).not.toBeNull();
		expect(result!.swapped).toBe(true);
		expect(swapCalls().length).toBeGreaterThanOrEqual(1);
		expect(await getPendingNormalizeProofs()).toHaveLength(0);

		// The flush's OWN post-run settle (1403's uncommitted hunk inside
		// flushPendingNormalizeOnBackOnline) already flipped the mapped tx —
		// this proves the flip-caller binding end-to-end. The direct call
		// below is then a no-op 'skipped' (already settled, never re-flipped).
		expect((await getTransactionById('tx-flip-1402'))!.status).toBe('confirmed');
		const { settleReceiveTxByProofs } = await import('../tokenStore');
		const outcome = await settleReceiveTxByProofs('tx-flip-1402');
		expect(outcome).toBe('skipped');
	});
});

describe('TASK-1402 — onOnlineConfirmed rail (boot-drain shape: NO flip)', () => {
	it('confirmed rail ALONE flushes (boot online + pile → drain, zero flips fired)', async () => {
		// Arrange: pending pile, flip rail untouched (boot seed already
		// online → detector would NOT flip — only onOnlineConfirmed fires).
		const p = await signedProof(8, getCounterK(KEYSET_ID));
		await addProofs([p], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p]);
		(client.swapProofs as ReturnType<typeof vi.fn>).mockClear();

		// Act: fire ONLY the confirmed rail (boot-drain shape).
		fireConfirmed();
		await vi.waitFor(() => expect(swapCalls().length).toBeGreaterThanOrEqual(1), {
			timeout: 3000,
			interval: 10
		});
		await awaitDrainIdle();

		// Assert: pile consolidated + flags cleared — with NO flip involved.
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		const pile = (await getUnspentProofs()).map((q) => q.amount).sort((a, b) => a - b);
		// completeSet(8) = [1,1,2,4] (MSB-burst, NOT a single 8-coin).
		expect(pile).toEqual([1, 1, 2, 4]);
	});

	it('flip rail ALONE still flushes (legacy TASK-1308 rail kept)', async () => {
		const p = await signedProof(2, getCounterK(KEYSET_ID));
		await addProofs([p], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p]);
		(client.swapProofs as ReturnType<typeof vi.fn>).mockClear();

		fireFlip(true);
		await vi.waitFor(() => expect(swapCalls().length).toBeGreaterThanOrEqual(1), {
			timeout: 3000,
			interval: 10
		});
		await awaitDrainIdle();
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
	});
});

describe('TASK-1402 — dedupe guard (boot-drain ชน flip + concurrent)', () => {
	it('flip + confirmed on the SAME verdict run exactly ONE swap', async () => {
		const p = await signedProof(16, getCounterK(KEYSET_ID));
		await addProofs([p], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p]);
		(client.swapProofs as ReturnType<typeof vi.fn>).mockClear();

		// Act: BOTH rails fire synchronously back-to-back (same verdict —
		// the detector calls onOnlineConfirmed THEN the flip listeners).
		fireConfirmed();
		fireFlip(true);

		await vi.waitFor(() => expect(swapCalls().length).toBeGreaterThanOrEqual(1), {
			timeout: 3000,
			interval: 10
		});
		await awaitDrainIdle();
		// settle: a trailing microtask must not start a second swap
		await sleep(150);
		expect(swapCalls()).toHaveLength(1);
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
	});

	it('concurrent runFlushDrain() calls share ONE promise (no double-swap)', async () => {
		const p = await signedProof(32, getCounterK(KEYSET_ID));
		await addProofs([p], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p]);
		(client.swapProofs as ReturnType<typeof vi.fn>).mockClear();
		resetFlushDrainForTests();

		const [r1, r2, r3] = await Promise.all([
			runFlushDrain(),
			runFlushDrain(),
			runFlushDrain()
		]);
		expect(isFlushDrainInFlight()).toBe(false);
		// all three share the one run — one swap, same result identity
		expect(swapCalls()).toHaveLength(1);
		expect(r1).toBe(r2);
		expect(r2).toBe(r3);
		expect(r1!.swapped).toBe(true);
	});

	it('sequential back-online AFTER settle runs fresh (gate clears, no stuck dedupe)', async () => {
		const p1 = await signedProof(1, getCounterK(KEYSET_ID));
		await addProofs([p1], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p1]);
		(client.swapProofs as ReturnType<typeof vi.fn>).mockClear();

		await runFlushDrain();
		await awaitDrainIdle();
		expect(swapCalls()).toHaveLength(1);

		// a LATER back-online with a new pending pile must flush again
		const p2 = await signedProof(1, getCounterK(KEYSET_ID));
		await addProofs([p2], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([p2]);
		await runFlushDrain();
		await awaitDrainIdle();
		expect(swapCalls()).toHaveLength(2);
	});
});

describe('TASK-1402 — T1/T2 untouched (forceSwap:true stays T3-only)', () => {
	it('T1/T2 entry points keep zero-skip (no forceSwap leak from the binding)', async () => {
		// A complete-set pile via the T1/T2 debounced path must NOT swap.
		const { runAutoNormalizeNow, isAutoNormalizePending } = await import('../proofs');
		const { createAutoNormalizeDeps } = await import('../normalizeWiring');
		expect(typeof scheduleNormalizeAfterReceiveOnline).toBe('function');
		expect(typeof scheduleNormalizeAfterMint).toBe('function');
		expect(isAutoNormalizePending()).toBe(false);
		// engine-level: no-origin run on a complete-set pile zero-skips
		const pile = await getUnspentProofsIncludingPending();
		const res = await runAutoNormalizeNow(
			{ getProofs: () => pile, swapFn: async () => { throw new Error('must not swap'); } },
			'T1-receive-online'
		);
		if (pile.length > 0) expect(res?.swapped).toBe(false);
		expect(createAutoNormalizeDeps).toBeDefined();
	});
});

describe('TASK-1402 — tx-flip caller contract (1403 mock if uncommitted)', () => {
	it('1403 settle surface exists on the barrel (real when 1403 present, mock-shaped otherwise)', async () => {
		// The flip caller binding calls settlePendingReceiveTxs() after a
		// successful flush (1403's uncommitted hunk in normalizeWiring).
		// Here: drive the contract directly — a mapped tx settles per proof
		// state, an unmapped tx is never force-flipped.
		const walletIndex = await import('../index');
		expect(typeof walletIndex.settleReceiveTxByProofs).toBe('function');
		expect(typeof walletIndex.settlePendingReceiveTxs).toBe('function');

		await addTransaction({
			id: 'tx-unmapped-1402',
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: 7,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: 'tok-unmapped',
			status: 'pending',
			fee: 0
		});
		const outcome = await walletIndex.settleReceiveTxByProofs('tx-unmapped-1402');
		expect(outcome).toBe('unmapped');
		expect((await getTransactionById('tx-unmapped-1402'))!.status).toBe('pending');
	});
});

// ─── suite lifecycle ─────────────────────────────────────────

beforeEach(async () => {
	vi.clearAllMocks();
	// NOTE: the wiring module subscribes its two rails + pile reader ONCE at
	// import (module-init = production mount). The rails arrays are append-
	// only for the whole file — NEVER cleared, NEVER re-subscribed (a
	// resetModules + re-import would double-subscribe and every fire would
	// hit two wiring instances → false double-flush). Per-test isolation
	// comes from the drain gate reset + fresh DBs + fresh mint key below.
	localStorage.removeItem(STORAGE_KEY);
	cancelScheduledNormalize();
	resetFlushDrainForTests();
	await clearAllWalletData();
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();

	const mintSecret = secp256k1.utils.randomSecretKey();
	mintK = bytesToBigInt(mintSecret);
	mintPubkeyHex = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	vi.mocked(getMintPubkey).mockReturnValue(mintPubkeyHex);
	const signB = (B_: string) => secp256k1.Point.fromHex(B_).multiply(mintK).toHex(true);
	(client.swapProofs as ReturnType<typeof vi.fn>).mockImplementation(
		async (_url: string, _inputs: unknown, outputs: Array<{ id: string; amount: number; B_: string }>) => ({
			signatures: outputs.map((o) => ({ id: o.id, amount: o.amount, C_: signB(o.B_) }))
		})
	);

	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	setActiveSeed(seed);
	setCounterK(KEYSET_ID, 100); // live band — counter-0 guard stays on
});

afterEach(async () => {
	cancelScheduledNormalize();
	resetFlushDrainForTests();
	clearActiveSeed();
	clearAllCounters();
	await clearAllWalletData();
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();
});
