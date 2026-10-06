/**
 * TASK-1309 (INTENT-013 / D3) — receiveTokens network-error fallback boundary.
 *
 * THE boundary (risk HIGH — commander exactness):
 *   FALLBACK (ห้าม rethrow — passthrough กลไกเดิม offline branch):
 *     MintUnreachableError | NetworkError | TypeError — pure transport
 *     (client.ts throws these before any HTTP verdict exists; nothing
 *     reached the mint rules engine).
 *   RETHROW (ห้าม passthrough — mint saw and answered):
 *     CashuError with HTTP code/status (incl. double-spent / BENIGN
 *     11003,20002) + InvalidResponseError — storing those would bank
 *     mint-REJECTED proofs.
 *
 * Suite layout (4 boundary cases via the real receiveTokens flight):
 *   a1) MintUnreachableError → fallback: passthrough 1:1 + pending flag +
 *       transaction record + notifySuspectOffline() (suspect badge) +
 *       counter_k untouched.
 *   a2) NetworkError → fallback as well (plain passthrough asserts).
 *   b1) CashuError(code=11002, status=400 — NOT benign) → rethrow as
 *       TokenValidationError; NOTHING stored; suspect never flips.
 *   b2) InvalidResponseError → rethrow (never passthrough).
 *
 * Detector control (the TASK-1308 passing pattern — detector-flush-flight):
 * global fetch IS the probe transport and is stubbed at MODULE SCOPE, and
 * store.ts is stubbed out of the graph so no import-time/catch-up probe can
 * ever touch the real network (a real-fetch probe settles the singleton at
 * 'offline'/'probing' and poisons every state assertion downstream — the
 * previous attempt's exact death). beforeEach wires targets and runs one
 * ok:true probe to a definite 'online' + suspect=false baseline; in-body
 * probe fetches are then PARKED: a probe triggered INSIDE a test (the
 * fallback's notifySuspectOffline) stays 'probing' with `suspect` true and
 * exactly one added fetch call until afterEach releases it — a stable,
 * exact assertion surface for both groups (notify-POSITIVE in the fallback
 * cases, notify-NEGATIVE in the rethrow cases).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC, fetchMock } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.d3.test',
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

// state.ts imports { clearMintConfigs } from './store' — store.ts at module
// init feeds real probe targets into the detector → import-time probe. This
// suite pins the detector (no targets) for deterministic online-seed state;
// stub the store module out of the graph.
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
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, getAllProofs, getPendingNormalizeProofs } from '../proofsDb';
import { receiveTokens } from '../tokenStore';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { getTransactions } from '../../storage/db';
import { getDetectorStatus, setProbeTargets } from '../../offline-indicator';
import { TokenValidationError } from '../errors';

// Global fetch is the probe transport — stub from module scope (TASK-1308
// passing pattern). The detector is a module SINGLETON: any probe running on
// the real fetch (import-time, boot catch-up, or in-test) settles the state
// at 'offline'/'probing' after a real 4s abort and every assertion poisons.
// Stubbing here guarantees the singleton never touches the network in this
// suite; beforeEach then arms fetchMock explicitly per test.
vi.stubGlobal('fetch', fetchMock);

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

interface ClientErrorCtor {
	new (message: string, status?: number, code?: number | string): Error;
}

/**
 * Detector-instance hygiene: `suspect` is module-scope singleton state,
 * cleared ONLY by a successful probe. beforeEach arms targets and runs one
 * ok:true probe to flush it (verdict 'online' vs seed — no flip, but the
 * suspect badge is reset deterministically).
 *
 * In-body fetch is then PARKED for the `${MINT}/v1/info` probe URL: a probe
 * triggered INSIDE a test (e.g. a fallback's notifySuspectOffline) stays
 * 'probing' with `suspect` untouched until afterEach releases it — making
 * both the notify-POSITIVE (fallback tests) and notify-NEGATIVE (rethrow
 * tests) suspect assertions fully deterministic.
 */
let releaseParkedProbe: ((resp: { ok: boolean } & Record<string, unknown>) => void) | null = null;

function parkProbeFetcher(): void {
	fetchMock.mockImplementation((url: unknown) => {
		if (String(url).includes('/v1/info')) {
			return new Promise((resolve) => { releaseParkedProbe = () => resolve({ ok: true, status: 200 }); });
		}
		return Promise.resolve({ ok: false, status: 500 });
	});
}

function clientClass(name: 'CashuError' | 'MintUnreachableError' | 'NetworkError' | 'InvalidResponseError'): ClientErrorCtor {
	return (client as unknown as Record<string, ClientErrorCtor>)[name];
}

function mockReceiveProofs(amounts: number[]): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: amounts.map((a, i) => ({ id: KEYSET_ID, amount: a, secret: `rcv${i}`, C: `C-rcv${i}` }))
	} as never);
}

describe('TASK-1309: receiveTokens D3 boundary — transport vs rules-reject', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		fetchMock.mockReset();
		vi.clearAllMocks();
		localStorage.removeItem(STORAGE_KEY);
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);

		// Probe ONCE with ok:true — guarantees the suspect badge is flushed
		// (singleton state from an earlier fallback test) while leaving the
		// state at its 'online' verify point. suspect===false implies a probe
		// COMPLETED ok (only a successful probe clears it) — wait for the
		// definite state too, never assert a mid-flight singleton:
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		setProbeTargets([MINT_URL]);
		window.dispatchEvent(new Event('online'));
		await vi.waitFor(() => expect(getDetectorStatus().suspect).toBe(false), { timeout: 2000, interval: 10 });
		await vi.waitFor(() => expect(getDetectorStatus().state).toBe('online'), { timeout: 2000, interval: 10 });
		expect(getDetectorStatus().lastResult).toBe('online');
		// The wallet's gate reads the DETECTOR here, not navigator.onLine —
		// navigator stays untouched and true throughout this suite:
		expect(navigator.onLine).toBe(true);
		// Park in-body probe fetches (see parkProbeFetcher) — release in afterEach:
		parkProbeFetcher();
	});

	afterEach(async () => {
		// Settle any parked probe cleanly (state back to a definite verdict):
		releaseParkedProbe?.({ ok: true, status: 200 });
		releaseParkedProbe = null;
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('a1) MintUnreachableError → fallback: passthrough 1:1 + pending flag + record + notifySuspectOffline, counter untouched', async () => {
		setCounterK(KEYSET_ID, 4); // live band — fallback must NOT touch it
		mockReceiveProofs([3, 2]);
		const fetchCallsAtStart = fetchMock.mock.calls.length;

		// The swap transport dies wire-level (client.ts maps fetch TypeError →
		// MintUnreachableError). Mint rules NEVER evaluated the proofs:
		vi.mocked(client.swapProofs).mockImplementation(() => {
			const E = clientClass('MintUnreachableError');
			throw new E(`Mint unreachable: ${MINT_URL}`);
		});

		const result = await receiveTokens('cashuAdummy'); // must NOT reject

		// passthrough 1:1 — EXACTLY as decoded:
		expect(result.proofCount).toBe(2);
		expect(result.amount).toBe(5);
		expect(result.mint).toBe(MINT_URL);
		const stored = await getAllProofs();
		expect(stored.map((p) => p.amount).sort((a, b) => a - b)).toEqual([2, 3]);
		expect(stored.map((p) => p.secret).sort()).toEqual(['rcv0', 'rcv1']);

		// pending flag armed — the T3 flush (TASK-1308) will consolidate it:
		expect(stored.every((p) => p.pending_normalize === true)).toBe(true);
		expect(await getPendingNormalizeProofs()).toHaveLength(2);

		// counter_k untouched (แนว v4.0 — "ไม่เข้าระบบ counter"):
		expect(getCounterK(KEYSET_ID)).toBe(4);

		// notifySuspectOffline attached (D1 trigger (c)) — suspect badge flips
		// synchronously; the follow-up probe fetch is PARKED (deterministic):
		expect(getDetectorStatus().suspect).toBe(true);
		expect(getDetectorStatus().state).toBe('probing');
		// exactly ONE probe call was added (no ping loop from the fallback):
		expect(fetchMock.mock.calls.length - fetchCallsAtStart).toBe(1);

		// transaction record (F-088 same-shape as the offline branch):
		const txs = await getTransactions();
		expect(txs).toHaveLength(1);
		expect(txs[0].type).toBe('cashu_receive');
		expect(txs[0].amount).toBe(5);
		expect(txs[0].mint_url).toBe(MINT_URL);
		expect(txs[0].status).toBe('confirmed');
	}, 15000);

	it('a2) NetworkError → fallback as well (boundary case 2 — same passthrough)', async () => {
		setCounterK(KEYSET_ID, 4);
		mockReceiveProofs([1, 2]);

		vi.mocked(client.swapProofs).mockImplementation(() => {
			const E = clientClass('NetworkError');
			throw new E('Network error: connection reset');
		});

		const result = await receiveTokens('cashuAdummy'); // fallback, not reject
		expect(result.proofCount).toBe(2);
		expect(result.amount).toBe(3);
		const stored = await getAllProofs();
		expect(stored.every((p) => p.pending_normalize === true)).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(4);
		expect(await getPendingNormalizeProofs()).toHaveLength(2);
	}, 15000);

	it('b1) CashuError code=11002 (HTTP 400, not benign) → RETHROW — never passthrough', async () => {
		setCounterK(KEYSET_ID, 4);
		mockReceiveProofs([3, 2]);

		// Mint-reject เชิง rules: tokens already spent / double-spent:
		vi.mocked(client.swapProofs).mockImplementation(() => {
			const E = clientClass('CashuError');
			throw new E('tokens already spent', 400, 11002);
		});

		const rejection = await receiveTokens('cashuAdummy').then(
			(r) => { throw new Error(`must reject — got resolve ${JSON.stringify(r)}`); },
			(err) => err
		);
		expect(rejection).toBeInstanceOf(TokenValidationError);
		expect((rejection as Error).message).toContain('tokens already spent');

		// ห้ามเก็บก้อนที่ mint ปฏิเสธเชิง rules:
		expect(await getAllProofs()).toHaveLength(0);
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		// rethrow path NEVER touched the suspect badge or the counter:
		expect(getDetectorStatus().suspect).toBe(false);
		expect(getCounterK(KEYSET_ID)).toBe(4);
	}, 15000);

	it('b2) InvalidResponseError → RETHROW (boundary case 4)', async () => {
		setCounterK(KEYSET_ID, 4);
		mockReceiveProofs([1, 1]);

		vi.mocked(client.swapProofs).mockImplementation(() => {
			const E = clientClass('InvalidResponseError');
			throw new E(`Invalid response from ${MINT_URL}`);
		});

		const rejection = await receiveTokens('cashuAdummy').then(
			() => { throw new Error('must reject — got resolve'); },
			(err) => err
		);
		expect(rejection).toBeInstanceOf(TokenValidationError);
		expect(await getAllProofs()).toHaveLength(0);
		expect(getDetectorStatus().suspect).toBe(false);
		expect(getCounterK(KEYSET_ID)).toBe(4);
	}, 15000);
});
