/**
 * TASK-1501 (F-050-001 / INTENT-013 v5.2) — flush-abort settle + 3-way
 * classification + diagnostic field.
 *
 * Boss device proof T1 (L-P008): spent-proof reuse offline → pending →
 * back-online flush MUST flip 'failed' (not stay pending):
 *   'pending transaction ถ้า swap ไม่ผ่าน ทำไมไม่ failed'
 *   'คือ pending ถ้าถูก swap ตอนกลับมา ออนไลน์แล้วไม่ผ่านให้ถือว่า failed'
 *   'ผมเอา proof เก่าที่ spent ไปแล้ว มาใช้ซ้ำตอนออฟไลน์ แล้วขึ้น pending
 *    แต่พอกลับมาออนไลน์ก็ยังขึ้น pending ไม่ failed'
 *
 * WHAT THIS PROVES (dispatch must_do 8 + acceptance 1/2):
 *   ทิศตาย (TERMINAL-FAIL, 2 sub-cases):
 *     a) spent-reuse → flush + mock mint reject 11002 family (quarantine leg,
 *        SUCCESS-shaped run) → mapped tx 'failed' + diagnostic {11002, name} มี
 *     b) spent-reuse → flush + mock mint reject NON-WHITELIST generic
 *        mint-rule error (abort leg, attempt-level force-fail) → mapped tx
 *        'failed' + diagnostic (failName) มี
 *   ทิศคง (RETRYABLE):
 *     c) network-fail (MintUnreachableError) → tx คง 'pending' + proofs คง
 *        pending_normalize (retry รอบหน้า — ไม่ settle ไม่ clear)
 *   边界 (boundary):
 *     d) legacy/unmapped (ไม่มี proofIds) → ไม่ force-flip (migration owns)
 *     e) taxonomy unit: TERMINAL (11002/unknown/generic) vs RETRYABLE
 *        (transport + benign 11003/20002) — unknown default failed per boss
 *
 * Record-level only: proofsDb + storage/db + REAL flush binding
 * (normalizeWiring, no module mock — production abort-path caller). No
 * .svelte, no online receive (P2), no mint.ts/melt.ts/client.ts edits.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.abort1501.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
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
	onOnlineConfirmed: vi.fn(() => () => {}),
	setPendingPileReader: vi.fn(),
	notifySuspectOffline: vi.fn(),
	setProbeTargets: vi.fn(),
	wasOffline: vi.fn(() => false),
	resetWasOffline: vi.fn(),
	trackWasOffline: vi.fn(() => () => {})
}));

vi.mock('../store', () => ({
	clearMintConfigs: vi.fn()
}));

import * as client from '../../cashu/client';
import {
	CashuError,
	MintUnreachableError,
	NetworkError
} from '../../cashu/client';
import { getMintPubkey } from '../../cashu/keyset';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import {
	addProofs,
	deleteProofDB,
	resetProofDB,
	getAllProofs,
	getPendingNormalizeProofs,
	markPendingNormalizeByProof,
	makeLocalId
} from '../proofsDb';
import { flushPendingNormalizeOnBackOnline } from '../normalizeWiring';
import {
	classifyFlushAbortError,
	forceFailMappedTxsOnFlushAbort
} from '../tokenStore';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { addTransaction, getTransactionById, deleteDatabase } from '../../storage/db';
import { createTestMint, buildCarolChainFromKeys } from './dleq-harness';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);
const mint = createTestMint('abort1501');

function spentReuseProof(amount: number, label: string): TokenProof {
	// Boss T1 shape: a proof ALREADY spent at the mint, reused offline.
	const chain = buildCarolChainFromKeys(mint.privateKey, mint.A, amount, KEYSET_ID, label);
	return { ...chain.proof };
}

async function seedSpentReuseTx(txId: string, labels: string[]): Promise<string[]> {
	const proofs = labels.map((label, i) => spentReuseProof(i + 1, label));
	await addProofs(proofs, MINT_URL, KEYSET_ID);
	await markPendingNormalizeByProof(proofs);
	const ids = proofs.map((p) => makeLocalId(p));
	await addTransaction({
		id: txId,
		type: 'cashu_receive',
		protocol: 'cashu',
		amount: proofs.reduce((s, p) => s + p.amount, 0),
		mint_url: MINT_URL,
		timestamp: Date.now(),
		token_hash: `tok-${txId}`,
		status: 'pending',
		fee: 0,
		proofIds: ids
	});
	return ids;
}

describe('TASK-1501 — ทิศตาย (a): 11002 family reject → tx failed + diagnostic {11002}', () => {
	it('spent-reuse offline → flush + mint 11002 → mapped tx failed + failCode 11002 + failName', async () => {
		await seedSpentReuseTx('tx-abort-11002', ['spent-a', 'spent-b']);
		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw new CashuError('tokens already spent', 400, 11002);
		}) as never;

		const flush = await flushPendingNormalizeOnBackOnline();
		// Quarantine leg: groups completed → SUCCESS-shaped run (not null),
		// mapped tx settled via the quarantine-cause diagnostic backfill.
		expect(flush?.swapped).toBe(true);

		const tx = await getTransactionById('tx-abort-11002');
		expect(tx!.status).toBe('failed');
		expect(tx!.failCode).toBe(11002);
		expect(tx!.failName).toBe('CashuError');
		// Proofs leave the pending pipeline (quarantined + flags cleared).
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
	}, 15000);
});

describe('TASK-1501 — ทิศตาย (b): non-whitelist generic mint-rule reject → tx failed + diagnostic', () => {
	it('spent-reuse offline → flush + generic mint reject (non-11002/11005) → mapped tx failed + diagnostic มี', async () => {
		await seedSpentReuseTx('tx-abort-generic', ['spent-c', 'spent-d']);
		// Non-whitelist, non-benign mint-rule reject (e.g. 12001): NOT
		// quarantine, NOT retryable → abort-leg attempt force-fail.
		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw new CashuError('mint rule reject: locktime in future', 400, 12001);
		}) as never;

		const flush = await flushPendingNormalizeOnBackOnline();
		expect(flush).toBeNull(); // abort leg — engine swallowed

		const tx = await getTransactionById('tx-abort-generic');
		expect(tx!.status).toBe('failed');
		expect(tx!.failCode).toBe(12001);
		expect(tx!.failName).toBe('CashuError');
		// Attempt over: pending_normalize cleared for the mapped proofs.
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
	}, 15000);

	it('unknown error default = failed per boss (plain Error → terminal)', async () => {
		await seedSpentReuseTx('tx-abort-unknown', ['spent-e']);
		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw new Error('mystery transport-ish boom');
		}) as never;

		const flush = await flushPendingNormalizeOnBackOnline();
		expect(flush).toBeNull();

		const tx = await getTransactionById('tx-abort-unknown');
		expect(tx!.status).toBe('failed');
		expect(tx!.failName).toBe('Error');
	}, 15000);
});

describe('TASK-1501 — ทิศคง (c): network-fail → คง pending (tx + proofs)', () => {
	it('flush + MintUnreachableError → tx pending + pending_normalize คง (retry รอบหน้า)', async () => {
		const ids = await seedSpentReuseTx('tx-abort-retry', ['alive-a', 'alive-b']);
		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw new MintUnreachableError(MINT_URL);
		}) as never;

		const flush = await flushPendingNormalizeOnBackOnline();
		expect(flush).toBeNull(); // abort leg — retryable → swallowed

		// RETRYABLE: NO settle, NO clear — everything stays for next round.
		expect((await getTransactionById('tx-abort-retry'))!.status).toBe('pending');
		expect((await getTransactionById('tx-abort-retry'))!.failCode).toBeUndefined();
		expect(await getPendingNormalizeProofs()).toHaveLength(2);
		const all = await getAllProofs();
		expect(all.every((p) => !p.quarantined)).toBe(true);
		expect(ids).toHaveLength(2);
	}, 15000);

	it('flush + NetworkError(timeout) → คง pending (ไม่ failed ผิด)', async () => {
		await seedSpentReuseTx('tx-abort-timeout', ['alive-c']);
		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw new NetworkError(new Error('reset'));
		}) as never;

		expect(await flushPendingNormalizeOnBackOnline()).toBeNull();
		expect((await getTransactionById('tx-abort-timeout'))!.status).toBe('pending');
		expect(await getPendingNormalizeProofs()).toHaveLength(1);
	}, 15000);

	it('flush + benign 11003 (OUTPUT-side idempotent) → คง pending (ห้าม force-fail ห้าม quarantine)', async () => {
		await seedSpentReuseTx('tx-abort-benign', ['alive-d']);
		vi.mocked(client.swapProofs).mockImplementation(async () => {
			throw new CashuError('outputs already signed', 400, 11003);
		}) as never;

		expect(await flushPendingNormalizeOnBackOnline()).toBeNull();
		expect((await getTransactionById('tx-abort-benign'))!.status).toBe('pending');
		expect(await getPendingNormalizeProofs()).toHaveLength(1);
		expect((await getAllProofs()).every((p) => !p.quarantined)).toBe(true);
	}, 15000);
});

describe('TASK-1501 — boundary (d): legacy/unmapped never force-flipped', () => {
	it('legacy tx (no proofIds) + TERMINAL abort → stays pending, reported unmatched', async () => {
		await addTransaction({
			id: 'tx-abort-legacy',
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: 9,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: 'tok-legacy',
			status: 'pending',
			fee: 0
			// NO proofIds — v4.4/v4.5 shape — migration owns
		});
		const res = await forceFailMappedTxsOnFlushAbort(
			['nonexistent-local-id'],
			new CashuError('mint rule reject', 400, 12001)
		);
		expect(res.unmatched).toContain('tx-abort-legacy');
		expect(res.failed).not.toContain('tx-abort-legacy');
		expect((await getTransactionById('tx-abort-legacy'))!.status).toBe('pending');
	});
});

describe('TASK-1501 — taxonomy unit (e): TERMINAL vs RETRYABLE enumeration', () => {
	it('RETRYABLE = transport group + benign 11003/20002 ONLY', () => {
		expect(classifyFlushAbortError(new MintUnreachableError(MINT_URL))).toBe('retryable');
		expect(classifyFlushAbortError(new NetworkError(new Error('x')))).toBe('retryable');
		expect(classifyFlushAbortError(new TypeError('fetch failed'))).toBe('retryable');
		expect(classifyFlushAbortError(new DOMException('timeout', 'AbortError'))).toBe('retryable');
		expect(classifyFlushAbortError(new CashuError('outputs already signed', 400, 11003))).toBe('retryable');
		expect(classifyFlushAbortError(new CashuError('quote already issued', 400, 20002))).toBe('retryable');
	});
	it('TERMINAL = double-spent family + mint-rule reject + anomaly + unknown (default failed)', () => {
		expect(classifyFlushAbortError(new CashuError('tokens already spent', 400, 11002))).toBe('terminal');
		expect(classifyFlushAbortError(new CashuError('already signed', 400, 11005))).toBe('terminal');
		expect(classifyFlushAbortError(new CashuError('mint rule reject', 400, 12001))).toBe('terminal');
		expect(classifyFlushAbortError(new Error('mint anomaly: signed 3 of 2'))).toBe('terminal');
		expect(classifyFlushAbortError(new Error('NUT-13 counter_k is 0'))).toBe('terminal');
		expect(classifyFlushAbortError(new Error('plain unknown'))).toBe('terminal');
		expect(classifyFlushAbortError('string chaos')).toBe('terminal');
	});
});

beforeEach(async () => {
	vi.clearAllMocks();
	localStorage.removeItem(STORAGE_KEY);
	await clearAllWalletData();
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();

	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	setActiveSeed(seed);
	setCounterK(KEYSET_ID, 50); // live band — counter-0 guard stays off
	vi.mocked(getMintPubkey).mockReturnValue(mint.A);
});

afterEach(async () => {
	clearActiveSeed();
	clearAllCounters();
	await clearAllWalletData();
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();
});
