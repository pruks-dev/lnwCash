/**
 * TASK-1304 (INTENT-013) — integration: T1/T2/T3 wiring of the AUTO mode
 * (TASK-1303 infra from proofs.ts) to the REAL wallet state
 * (normalizeWiring.ts + mint.ts + tokenStore.ts).
 *
 * Suits:
 *   1. T1 — after an ONLINE receive finished: debounced 2s → whole pile normalized.
 *   2. T2 — after completeMint finished: debounced 2s → whole pile normalized.
 *   3. Debounce + zero-swap short-circuit in the wiring: an already-complete
 *      pile is NOT swapped (no mint round-trip).
 *   4. Offline receive = 1:1 passthrough + pending-normalize flag, counter
 *      untouched; back online → T3 flushes the pending pile IMMEDIATELY
 *      (no debounce), consolidates it, clears the flags.
 *   5. T3 cancels a lurking T1 timer (no double normalize run).
 *   6. The bound SwapFn on a MULTI-keyset pile: completeSet target split
 *      EXACTLY per group; counter advance = that group's share length.
 *
 * NOTE: REAL timers — fake-indexeddb's transaction machinery runs on real
 * setTimeout/queueMicrotask, so `vi.useFakeTimers` would stall it. The 2s
 * debounce is honored with a bounded poll-wait (`awaitAutoNormalizeIdle`)
 * instead of timer faking; the debounce VALUE itself is locked by
 * normalize-auto.test.ts (TASK-1303).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const { MINT_URL, KEYSET_ID, KEYSET_ID_B, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	KEYSET_ID_B: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76b',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', () => ({
	checkState: vi.fn(),
	swapProofs: vi.fn(),
	mintTokens: vi.fn(),
	requestMintQuote: vi.fn(),
	checkMintQuote: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	pollMintQuoteUntil: vi.fn().mockResolvedValue({
		quote: 'q',
		request: 'lnbc...',
		paid: true,
		expiry: 9999999999,
		state: 'PAID'
	}),
	getMintInfo: vi.fn(),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn()
}));

/**
 * TASK-1308 (F-048-001): isWalletOnline() reads the DETECTOR state
 * (getDetectorStatus) — not navigator.onLine. This suite adapts with a
 * CONTROLLABLE FAKE detector (per-suite module mock); the real
 * probe→flip→flush flight is proven in `detector-flush-flight.test.ts`
 * against the real offline-indicator module.
 */
const detectorMock = vi.hoisted(() => ({
	state: 'online' as 'online' | 'offline' | 'probing'
}));

vi.mock('../../offline-indicator', () => ({
	getDetectorStatus: vi.fn(() => ({
		state: detectorMock.state,
		online: detectorMock.state === 'online',
		suspect: false,
		probing: detectorMock.state === 'probing',
		bootWired: true,
		targets: [],
		probeCount: 0,
		lastProbeAt: 0,
		lastResult: detectorMock.state === 'probing' ? null : detectorMock.state
	})),
	isOnline: vi.fn(() => detectorMock.state === 'online'),
	onConnectivityChange: vi.fn(() => () => {}),
	notifySuspectOffline: vi.fn(),
	setProbeTargets: vi.fn(),
	wasOffline: vi.fn(() => false),
	resetWasOffline: vi.fn(),
	trackWasOffline: vi.fn(() => () => {})
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'ff'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import * as client from '../../cashu/client';
import { decodeToken } from '../../cashu/token';
import { getMintPubkey } from '../../cashu/keyset';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import {
	deleteProofDB,
	resetProofDB,
	addProofs,
	getAllProofs,
	getUnspentProofs,
	getPendingNormalizeProofs
} from '../proofsDb';
import { receiveTokens } from '../tokenStore';
import { completeMint } from '../mint';
import {
	isAutoNormalizePending,
	isAutoNormalizeRunning,
	AUTO_NORMALIZE_DEBOUNCE_MS
} from '../proofs';
import { completeSet } from '../completeSet';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import {
	getCounterK,
	setCounterK,
	clearAllCounters,
	STORAGE_KEY
} from '../counterK';
import {
	flushPendingNormalizeOnBackOnline,
	boundSwapFn,
	cancelScheduledNormalize
} from '../normalizeWiring';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}

function setOnline(online: boolean): void {
	// TASK-1308: the wallet's online truth is the detector state — the
	// navigator.onLine pin is history (FR-2).
	detectorMock.state = online ? 'online' : 'offline';
}

const ONLINE_DEFAULT = true;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bounded wait until the auto-normalize scheduler is fully idle. */
async function awaitAutoNormalizeIdle(maxMs = 6000): Promise<void> {
	const start = Date.now();
	while ((isAutoNormalizePending() || isAutoNormalizeRunning()) && Date.now() - start < maxMs) {
		await sleep(50);
	}
}

function swapCalls(): ReturnType<typeof vi.fn> {
	return client.swapProofs as ReturnType<typeof vi.fn>;
}

describe('TASK-1304: T1/T2/T3 auto-normalize wiring', () => {
	const seed = mnemonicToSeed(MNEMONIC);
	// Real mock-mint keypair — signatures follow the real blind/unblind algebra.
	const mintSecret = secp256k1.utils.randomSecretKey();
	const mintK = bytesToBigInt(mintSecret);
	const mintPubkeyHex = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();
		cancelScheduledNormalize();
		setOnline(true);

		vi.mocked(getMintPubkey).mockReturnValue(mintPubkeyHex);
		const signB = (B_: string) => secp256k1.Point.fromHex(B_).multiply(mintK).toHex(true);
		swapCalls().mockImplementation(
			async (_url: string, _inputs: unknown, outputs: Array<{ id: string; amount: number; B_: string }>) => ({
				signatures: outputs.map((o) => ({ id: o.id, amount: o.amount, C_: signB(o.B_) }))
			})
		);
		(client.mintTokens as ReturnType<typeof vi.fn>).mockImplementation(
			async (_url: string, _quote: string, postBody: Array<{ id: string; amount: number; B_: string }>) => ({
				signatures: postBody.map((o) => ({ id: o.id, amount: o.amount, C_: signB(o.B_) }))
			})
		);

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
	});

	afterEach(async () => {
		cancelScheduledNormalize();
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		setOnline(ONLINE_DEFAULT);
	});

	it('T1 — online receive schedules the ~2s auto-normalize → whole pile normalized', async () => {
		// Pre-seed the pile with an 8-sat proof (and a live counter band) so the
		// post-receive pile is NOT a complete set.
		await addProofs(
			[{ id: KEYSET_ID, amount: 8, secret: 'old8', C: 'C-old8' }],
			MINT_URL,
			KEYSET_ID
		);
		setCounterK(KEYSET_ID, 2); // 2 earlier derivations already consumed

		vi.mocked(decodeToken).mockReturnValue({
			mint: MINT_URL,
			unit: 'sat',
			proofs: [
				{ id: KEYSET_ID, amount: 3, secret: 'olds1', C: 'C-old1' },
				{ id: KEYSET_ID, amount: 2, secret: 'olds2', C: 'C-old2' }
			]
		} as never);

		const result = await receiveTokens('cashuAdummy');
		// Receive itself went to completeSet(5) = 4 outputs → counter 2+4 = 6:
		expect(result.proofCount).toBe(completeSet(5).length);
		expect(getCounterK(KEYSET_ID)).toBe(6);
		// T1 scheduled, debounce window not yet elapsed → the turbo-timer has
		// NOT fired immediately:
		expect(isAutoNormalizePending()).toBe(true);
		const callsAfReceive = swapCalls().mock.calls.length; // receive's own swap = 1
		expect(callsAfReceive).toBe(1);
		swapCalls().mockClear();

		await awaitAutoNormalizeIdle(); // ~ encompasses the 2s debounce + the run
		// Pile = 8 + completeSet(5) → sum 13, NOT complete → exactly ONE swap:
		expect(swapCalls().mock.calls.length).toBe(1);
		const submitted = swapCalls().mock.calls[0][2] as Array<{ amount: number }>;
		expect(submitted.reduce((s, o) => s + o.amount, 0)).toBe(13);

		const target = completeSet(13); // [1,1,2,4] ⊕ completeSet(5) — 8 coins
		const pile = (await getUnspentProofs()).map((p) => p.amount).sort((a, b) => a - b);
		expect(pile).toEqual([...target].sort((a, b) => a - b));
		// The swap consumed 8 more derivation slots (counter 6 → 14):
		expect(getCounterK(KEYSET_ID)).toBe(14);
	}, 20000);

	it('T2 — completeMint schedules the ~2s auto-normalize → whole pile normalized', async () => {
		await addProofs(
			[{ id: KEYSET_ID, amount: 8, secret: 'old8', C: 'C-old8' }],
			MINT_URL,
			KEYSET_ID
		);
		setCounterK(KEYSET_ID, 1);

		const mintResult = await completeMint(MINT_URL, 'q', 6, KEYSET_ID, false, seed);
		expect(mintResult.success).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(1 + completeSet(6).length); // 1 + 5 = 6
		expect(isAutoNormalizePending()).toBe(true); // T2 scheduled
		swapCalls().mockClear();

		await awaitAutoNormalizeIdle();
		// Pile = 8 + completeSet(6) → sum 14 → ONE normalize swap:
		expect(swapCalls().mock.calls.length).toBe(1);
		const submitted = swapCalls().mock.calls[0][2] as Array<{ amount: number }>;
		expect(submitted.reduce((s, o) => s + o.amount, 0)).toBe(14);

		const target = completeSet(14);
		const pile = (await getUnspentProofs()).map((p) => p.amount).sort((a, b) => a - b);
		expect(pile).toEqual([...target].sort((a, b) => a - b));
		expect(getCounterK(KEYSET_ID)).toBe(6 + target.length);
	}, 20000);

	it('debounce + zero-swap short-circuit in the wiring — complete pile skips the swap', async () => {
		// Fresh receive with nothing else → pile == completeSet(5) exactly.
		vi.mocked(decodeToken).mockReturnValue({
			mint: MINT_URL,
			unit: 'sat',
			proofs: [
				{ id: KEYSET_ID, amount: 3, secret: 'olds1', C: 'C-old1' },
				{ id: KEYSET_ID, amount: 2, secret: 'olds2', C: 'C-old2' }
			]
		} as never);

		await receiveTokens('cashuAdummy');
		expect(isAutoNormalizePending()).toBe(true);
		const callsAfterReceive = swapCalls().mock.calls.length; // receive's own = 1

		await awaitAutoNormalizeIdle();
		// zero-swap short-circuit → NO extra mint round-trip:
		expect(swapCalls().mock.calls.length).toBe(callsAfterReceive);
	}, 20000);

	it('offline receive → 1:1 passthrough + pending flag + counter untouched; T3 flush clears all', async () => {
		// The keyset must have a live (non-zero) counter band for the T3 swap to
		// derive legally (counter-0 guard would demand an NUT-9 restore first).
		setCounterK(KEYSET_ID, 4);

		setOnline(false);
		vi.mocked(decodeToken).mockReturnValue({
			mint: MINT_URL,
			unit: 'sat',
			proofs: [
				{ id: KEYSET_ID, amount: 3, secret: 'ofs1', C: 'C-of1' },
				{ id: KEYSET_ID, amount: 2, secret: 'ofs2', C: 'C-of2' }
			]
		} as never);

		const offline = await receiveTokens('cashuAdummy');
		// Passthrough 1:1 — the proofs are stored EXACTLY as decoded:
		expect(offline.proofCount).toBe(2);
		expect(offline.amount).toBe(5);
		const storedOffline = await getAllProofs();
		expect(storedOffline.map((p) => p.amount).sort((a, b) => a - b)).toEqual([2, 3]);
		expect(storedOffline.map((p) => p.secret).sort()).toEqual(['ofs1', 'ofs2']);
		expect(storedOffline.every((p) => p.pending_normalize === true)).toBe(true);
		// The counter was NOT touched by the passthrough ("ไม่เข้าระบบ counter"):
		expect(getCounterK(KEYSET_ID)).toBe(4);
		expect(swapCalls().mock.calls.length).toBe(0);

		// Back online → T3 runs NOW, without advancing the 2s debounce:
		setOnline(true);
		const flush = (await flushPendingNormalizeOnBackOnline()) as
			{ swapped: boolean } | null;

		const target = completeSet(5);
		expect(flush && flush.swapped).toBe(true);
		expect(swapCalls().mock.calls.length).toBe(1);
		const submitted = swapCalls().mock.calls[0][2] as Array<{ amount: number }>;
		expect(submitted.reduce((s, o) => s + o.amount, 0)).toBe(5);

		// The pile is now a complete set; passthrough inputs consumed:
		const pileAfter = (await getUnspentProofs()).map((p) => p.amount).sort((a, b) => a - b);
		expect(pileAfter).toEqual([...target].sort((a, b) => a - b));
		// Flags are cleared:
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		// Counter advanced by the swapped outputs' count (4 → 8):
		expect(getCounterK(KEYSET_ID)).toBe(4 + target.length);
	});

	it('T3 cancels a lurking T1 timer — no double normalize run', async () => {
		vi.mocked(decodeToken).mockReturnValue({
			mint: MINT_URL,
			unit: 'sat',
			proofs: [{ id: KEYSET_ID, amount: 1, secret: 'ot1', C: 'C-ot1' }]
		} as never);
		await receiveTokens('cashuAdummy'); // online → pile=[1] (completeSet(1)) → T1 scheduled
		expect(isAutoNormalizePending()).toBe(true);

		setOnline(false);
		vi.mocked(decodeToken).mockReturnValue({
			mint: MINT_URL,
			unit: 'sat',
			proofs: [{ id: KEYSET_ID, amount: 2, secret: 'ot2', C: 'C-ot2' }]
		} as never);
		await receiveTokens('cashuAdummy'); // offline passthrough + pending flag
		expect(await getPendingNormalizeProofs()).toHaveLength(1);

		// Back online — T3 must consume the pending pile AND the lurking T1
		// timer. The pile ([received 1] + [passthrough 2]) ALREADY equals
		// completeSet(3): zero-swap → no mint round-trip, flags still cleared.
		setOnline(true);
		const flush = (await flushPendingNormalizeOnBackOnline()) as
			{ swapped: boolean; zeroSwap: boolean } | null;
		expect(flush && flush.zeroSwap).toBe(true);
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		expect(isAutoNormalizePending()).toBe(false);

		// Wait past the T1 debounce window — NO lingering timer may fire a second
		// swap after the flush consumed the pile:
		swapCalls().mockClear();
		await awaitAutoNormalizeIdle();
		await sleep(AUTO_NORMALIZE_DEBOUNCE_MS + 200);
		expect(swapCalls().mock.calls.length).toBe(0);
	}, 25000);

	it('bound SwapFn — multi-keyset pile: completeSet target split EXACTLY per group', async () => {
		// Live counter bands behind the stub piles (counter-0 guard otherwise).
		setCounterK(KEYSET_ID, 2);
		setCounterK(KEYSET_ID_B, 2);

		// Group A (KEYSET_ID): 4+2 = 6 · Group B (KEYSET_ID_B): 1+1 = 2.
		const proofs = [
			stubProof(4, 'a1', KEYSET_ID),
			stubProof(2, 'a2', KEYSET_ID),
			stubProof(1, 'b1', KEYSET_ID_B),
			stubProof(1, 'b2', KEYSET_ID_B)
		];

		// completeSet(8) = [1,1,2,4] — A gets {2,4}, B gets {1,1}:
		const swapped = await boundSwapFn(proofs, completeSet(8));

		expect(swapped).toHaveLength(4);
		expect(swapped.reduce((s, p) => s + p.amount, 0)).toBe(8);
		// Each group's counter advanced by ITS share length (2 outputs each):
		expect(getCounterK(KEYSET_ID)).toBe(2 + 2);
		expect(getCounterK(KEYSET_ID_B)).toBe(2 + 2);
		// One swap per group, each with its exact denomination share:
		expect(swapCalls().mock.calls.length).toBe(2);
		const amountsByCall = swapCalls().mock.calls.map(
			(c) => (c[2] as Array<{ amount: number }>).map((o) => o.amount).sort((x, y) => x - y)
		);
		expect(amountsByCall).toContainEqual([2, 4]);
		expect(amountsByCall).toContainEqual([1, 1]);
	});
});

// ─── helpers ──────────────────────────────────────────────────────────────

function stubProof(amount: number, secret: string, keysetId: string) {
	return {
		id: keysetId,
		amount,
		secret: `secret-${secret}`,
		C: `C-${secret}`,
		local_id: `${keysetId}:stub:${secret}`,
		mint_url: MINT_URL,
		keyset_id: keysetId,
		stored_at: Date.now(),
		spent: false
	};
}
