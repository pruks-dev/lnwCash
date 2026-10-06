/**
 * TASK-1308 (INTENT-013) — F-048-001 closure, layer 3 (trigger source).
 *
 * The T3 flush binding `normalizeWiring.ts → onConnectivityChange → flush`
 * must be driven by the REAL detector state change (probe-success), NOT by
 * the window 'online' event window. Proof sets:
 *
 *   1. FLIGHT-SIM (real detector, real module-init subscriber): targets wired
 *      → catch-up boot probe FAILS → verdict 'offline' → receiveTokens goes
 *      1:1 passthrough + pending_normalize (counter untouched) → probe
 *      succeeds → DEFINITE flip 'offline'→'online' → subscriber fires the
 *      flush immediately → pile consolidated into the completeSet target and
 *      flags cleared. navigator.onLine is NEVER touched (stays true) — the
 *      wallet gate is the detector now.
 *
 *   2. EVENT-WINDOW DEAD CASE (navigator นิ่ง): with navigator.onLine static
 *      (true the whole time — the VPN-tunneled device shape):
 *        a) a window 'online' event (the OLD trigger source) with the probe
 *           STILL failing produces NO verdict flip → NO flush — the event
 *           window alone cannot drive the flush anymore;
 *        b) the flush still runs straight from a probe SUCCESS flip
 *           (visibility trigger — zero window-'online' events dispatched in
 *           this step), proving the source is the probe, not the event
 *           window.
 *
 * NOTE: real timers (fake-indexeddb transaction machinery runs on real
 * setTimeout); the detector's probe fetches are stubbed at the global
 * `fetch` level (probe path `${mint}/v1/info`); cashu client/keyset/token
 * are module-mocked, persistent wallet storage is real (fake-indexeddb).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const { MINT_URL, KEYSET_ID, MNEMONIC, fetchMock } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.flight.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	fetchMock: vi.fn()
}));

vi.mock('../../cashu/client', () => ({
	checkState: vi.fn(),
	swapProofs: vi.fn(),
	mintTokens: vi.fn(),
	requestMintQuote: vi.fn(),
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	getMintInfo: vi.fn(),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

// state.ts imports { clearMintConfigs } from './store'; store.ts at module
// init feeds REAL mint targets into the detector (refreshProbeTargets) → an
// import-time probe with the REAL fetch — the known flake shape. This suite
// controls probe targets EXPLICITLY, so the store module is stubbed here
// (the real flight is still flown against the real detector+wiring).
vi.mock('../store', () => ({
	clearMintConfigs: vi.fn()
}));

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn()
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
	getAllProofs,
	getUnspentProofs,
	getPendingNormalizeProofs
} from '../proofsDb';
import { receiveTokens } from '../tokenStore';
import { isAutoNormalizePending, isAutoNormalizeRunning } from '../proofs';
import { cancelScheduledNormalize } from '../normalizeWiring';
import { completeSet } from '../completeSet';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import {
	getDetectorStatus,
	setProbeTargets,
	notifySuspectOffline
} from '../../offline-indicator';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

// Global fetch is the probe transport — stub from module scope; every probe
// in this file runs on fetchMock.
vi.stubGlobal('fetch', fetchMock);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bounded wait until the auto-normalize run leaves the scheduler. */
async function awaitAutoNormalizeIdle(maxMs = 6000): Promise<void> {
	const start = Date.now();
	while ((isAutoNormalizePending() || isAutoNormalizeRunning()) && Date.now() - start < maxMs) {
		await sleep(50);
	}
}

function swapCalls(): Array<unknown[]> {
	return (client.swapProofs as ReturnType<typeof vi.fn>).mock.calls;
}

/** REAL detector semantics — wait for a completed verdict state. */
async function waitForState(expected: 'online' | 'offline', timeout = 3000): Promise<void> {
	await vi.waitFor(
		() => {
			expect(getDetectorStatus().state).toBe(expected);
		},
		{ timeout, interval: 10 }
	);
}

function mockReceive(amounts: number[]): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: amounts.map((a, i) => ({ id: KEYSET_ID, amount: a, secret: `rcv${i}`, C: `C-rcv${i}` }))
	} as never);
}

describe('TASK-1308: T3 flush trigger = detector probe-success (F-048-001)', () => {
	const seed = mnemonicToSeed(MNEMONIC);
	const mintSecret = secp256k1.utils.randomSecretKey();
	const mintK = bytesToBigInt(mintSecret);
	const mintPubkeyHex = bytesToHex(secp256k1.getPublicKey(mintSecret, true));

	beforeEach(async () => {
		fetchMock.mockReset();
		vi.clearAllMocks();
		localStorage.removeItem(STORAGE_KEY);
		cancelScheduledNormalize();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();

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

		// navigator is FROZEN at the device hint — never redefined by these
		// tests (that is exactly the F-048-001 point: navigator นิ่ง).
		expect(navigator.onLine).toBe(true);
	});

	afterEach(async () => {
		cancelScheduledNormalize();
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('flight: probe fail → receive passthrough + pending flag; probe-success flip → flush + flags cleared', async () => {
		// Live counter band behind the (future) pile — the T3 swap must be
		// able to derive legally (counter-0 guard stays on).
		setCounterK(KEYSET_ID, 2);

		// ── 1) targets wired → probe TRIGGER via window 'online' reconnect —
		// probe FAILS → detector settles 'offline'. navigator NEVER touched:
		fetchMock.mockResolvedValue({ ok: false, status: 503 });
		setProbeTargets([MINT_URL]);
		window.dispatchEvent(new Event('online')); // trigger (b) — deterministic
		await waitForState('offline');
		expect(getDetectorStatus().lastResult).toBe('offline');

		// ── 2) offline receive → 1:1 passthrough + pending flag ──
		mockReceive([3, 2]);
		const offline = await receiveTokens('cashuAdummy');
		expect(offline.proofCount).toBe(2);
		expect(offline.amount).toBe(5);
		const storedOffline = await getAllProofs();
		expect(storedOffline.map((p) => p.amount).sort((a, b) => a - b)).toEqual([2, 3]);
		expect(storedOffline.every((p) => p.pending_normalize === true)).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(2); // passthrough never touches counter_k
		expect(swapCalls()).toHaveLength(0);

		// ── 3) probe SUCCEEDS → DEFINITE flip offline→online → subscriber
		//       fires the flush IMMEDIATELY (no 2s debounce) ──
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		window.dispatchEvent(new Event('online')); // event is only a probe TRIGGER
		await waitForState('online');
		expect(navigator.onLine).toBe(true); // navigator นิ่งตลอด — flush ยังเดิน

		await vi.waitFor(() => expect(swapCalls()).toHaveLength(1), { timeout: 3000, interval: 10 });
		const submitted = swapCalls()[0][2] as Array<{ amount: number }>;
		expect(submitted.reduce((s, o) => s + o.amount, 0)).toBe(5);

		await awaitAutoNormalizeIdle();
		const target = completeSet(5);
		const pileAfter = (await getUnspentProofs()).map((p) => p.amount).sort((a, b) => a - b);
		expect(pileAfter).toEqual([...target].sort((a, b) => a - b));
		// ธงเคลียร์ — the pending pile was consumed by the probe-success flush:
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		// counter advanced by outputs.length ONLY (NUT-13 Option A):
		expect(getCounterK(KEYSET_ID)).toBe(2 + target.length);
	}, 20000);

	it('navigator นิ่ง + event-window dead case: window \'online\' ไม่ยิง flush — ต้องมี probe-success เท่านั้น', async () => {
		// ── 0) settle the detector OFFLINE (explicit trigger, all probes fail) ──
		fetchMock.mockResolvedValue({ ok: false, status: 503 });
		setProbeTargets([MINT_URL]);
		window.dispatchEvent(new Event('online'));
		await waitForState('offline');

		// ── 1) offline receive → passthrough + pending (navigator still true) ──
		// Pile [2,2] (sum 4) is NOT a complete set — completeSet(4) = [4] — so
		// the flush must do a REAL swap (the zero-swap short-circuit must not
		// silently eat the proof).
		setCounterK(KEYSET_ID, 4); // live band for the later T3 swap
		mockReceive([2, 2]);
		const offlineRcv = await receiveTokens('cashuAdummy');
		expect(offlineRcv.proofCount).toBe(2); // detector offline → passthrough
		expect(await getPendingNormalizeProofs()).toHaveLength(2);
		expect(navigator.onLine).toBe(true);

		// ── 2) a) event-window channel (OLD trigger source) fires — navigator
		//      นิ่ง and the probe STILL failing → NO verdict flip → NO flush:
		window.dispatchEvent(new Event('online'));
		await sleep(200);
		expect(swapCalls()).toHaveLength(0);                        // no flush ran
		expect((await getPendingNormalizeProofs()).length).toBe(2); // flags untouched

		// ── 2) b) probe SUCCEEDS → flip → subscriber flush fires. Trigger via
		//      visibilitychange: ZERO window 'online' events dispatched in this
		//      step — the source is the completed PROBE, not the event window.
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		document.dispatchEvent(new Event('visibilitychange'));
		await waitForState('online');
		await vi.waitFor(() => expect(swapCalls()).toHaveLength(1), { timeout: 3000, interval: 10 });
		const submitted = swapCalls()[0][2] as Array<{ amount: number }>;
		expect(submitted.reduce((s, o) => s + o.amount, 0)).toBe(4);

		await awaitAutoNormalizeIdle();
		// ธงเคลียร์ผ่าน flush ที่ติดตั้งจุดเดียว (module-init subscriber):
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		expect(getCounterK(KEYSET_ID)).toBe(4 + completeSet(4).length);
	}, 20000);
});

function bytesToBigInt(bytes: Uint8Array): bigint {
	let x = 0n;
	for (const b of bytes) x = (x << 8n) | BigInt(b);
	return x;
}
