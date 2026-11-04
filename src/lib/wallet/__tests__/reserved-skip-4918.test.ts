/**
 * TASK-4918 (INTENT-049, BLUEPRINT-049 v5 fix-forward): swap ห้ามหยิบ reserved.
 *
 *   1. IncludingPending กรอง reserved (คง pending_normalize ไว้ให้ T3 —
 *      รับแค่กอง pending ไม่เอาของ in-flight) + createAutoNormalizeDeps
 *      getProofs ย้ำกรอง reserved (defense in depth).
 *   2. swapGroup P5: 11002 ที่ inputs ติด reserved (melt-lock ชั่วคราว)
 *      ห้าม quarantine — benign abort untouched เหมือน 11003.
 *      11002-dead จริง (non-reserved) ยัง quarantine.
 *
 * test-only, scoped — no prod change here.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.4918.test',
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
	getMintPubkey: vi.fn().mockReturnValue(undefined),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockImplementation((secret: string) => ({
		B_: 'B_4918_' + secret,
		blindingFactor: 'r_4918_' + secret
	})),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
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

import * as client from '../../cashu/client';
import { CashuError } from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import {
	addProofs,
	getAllProofs,
	getUnspentProofsIncludingPending,
	getPendingNormalizeProofs,
	markPendingNormalizeByProof,
	markReserved,
	deleteProofDB,
	resetProofDB,
	type StoredProof
} from '../proofsDb';
import { runAutoNormalizeNow } from '../proofs';
import {
	boundSwapFn,
	createAutoNormalizeDeps
} from '../normalizeWiring';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);

function tok(tag: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-4918-${tag}`, C: `sig-4918-${tag}` };
}

async function storedByTag(tag: string): Promise<StoredProof> {
	const all = await getAllProofs();
	const found = all.find((p) => p.secret === `secret-4918-${tag}`);
	if (!found) throw new Error(`test setup: proof ${tag} not stored`);
	return found;
}

describe('TASK-4918: swap ห้ามหยิบ reserved + 11002-reserved ไม่ quarantine', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		localStorage.removeItem(STORAGE_KEY);
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
		setCounterK(KEYSET_ID, 50);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('T3 reserved-skip: IncludingPending + deps.getProofs กรอง reserved แต่คง pending', async () => {
		await addProofs([tok('pend1', 1), tok('pend2', 2), tok('lock8', 8)], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([tok('pend1', 1), tok('pend2', 2), tok('lock8', 8)]);
		const locked = await storedByTag('lock8');
		await markReserved([locked.local_id]);

		// pending_normalize คงอยู่ให้ T3 — แต่ reserved ต้องไม่อยู่ในกอง flush
		expect(await getPendingNormalizeProofs()).toHaveLength(3);
		const pile = await getUnspentProofsIncludingPending();
		expect(pile.map((p) => p.secret).sort()).toEqual(['secret-4918-pend1', 'secret-4918-pend2']);
		expect(pile.every((p) => !p.reserved)).toBe(true);

		// defense in depth: deps.getProofs ย้ำกรอง reserved
		const deps = createAutoNormalizeDeps();
		const viaDeps = await deps.getProofs();
		expect(viaDeps.map((p) => p.secret).sort()).toEqual(['secret-4918-pend1', 'secret-4918-pend2']);
		expect(viaDeps.every((p) => !p.reserved)).toBe(true);
	});

	it('post-mint T2 ไม่พังเมื่อมี reserved: T2 run ยัง consolidate กองปกติได้', async () => {
		// กองปกติ complete-set [1,2]=3 → T2 zero-skip ได้แม้มี reserved 8 ลอยอยู่
		await addProofs([tok('t2a', 1), tok('t2b', 2), tok('t2lock', 8)], MINT_URL, KEYSET_ID);
		const locked = await storedByTag('t2lock');
		await markReserved([locked.local_id]);

		const deps = createAutoNormalizeDeps();
		let swapRuns = 0;
		const result = await runAutoNormalizeNow(
			{ getProofs: deps.getProofs, swapFn: async (proofs, outputs) => { swapRuns++; return proofs; } },
			'T2-complete-mint'
		);
		expect(result).not.toBeNull();
		expect(result?.zeroSwap).toBe(true);
		expect(result?.swapped).toBe(false);
		expect(swapRuns).toBe(0);
		expect(result?.proofs.every((p) => !p.reserved)).toBe(true);
		expect(result?.sum).toBe(3);
	});

	it('11002-reserved-no-quarantine: inputs ติด reserved → benign abort, ห้าม quarantine', async () => {
		await addProofs([tok('r1', 2), tok('r2', 1)], MINT_URL, KEYSET_ID);
		const s1 = await storedByTag('r1');
		const s2 = await storedByTag('r2');
		await markReserved([s1.local_id, s2.local_id]);
		const inputs = [await storedByTag('r1'), await storedByTag('r2')];
		expect(inputs.every((p) => p.reserved === true)).toBe(true);

		vi.mocked(client.swapProofs).mockRejectedValue(
			new CashuError('tokens already spent', 400, 11002)
		);

		// เหมือน 11003: error ดิบ propagate ออกมา — ไม่ใช่ QuarantineAppliedError
		await expect(boundSwapFn(inputs, [1, 2])).rejects.toMatchObject({ code: 11002 });
		// ห้าม quarantine เป็นของตาย — flags เดิม untouched
		const all = await getAllProofs();
		expect(all.every((p) => !p.quarantined)).toBe(true);
		expect(all.every((p) => p.reserved === true)).toBe(true);
		expect(all.every((p) => !p.spent)).toBe(true);
	});

	it('11002-dead จริงยัง quarantine: non-reserved → quarantine เหมือนเดิม', async () => {
		await addProofs([tok('d1', 2), tok('d2', 1)], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([tok('d1', 2), tok('d2', 1)]);
		const inputs = [await storedByTag('d1'), await storedByTag('d2')];
		expect(inputs.every((p) => !p.reserved)).toBe(true);

		vi.mocked(client.swapProofs).mockRejectedValue(
			new CashuError('tokens already spent', 400, 11002)
		);

		// quarantine leg: boundSwapFn กลืน group แล้ว continue → return []
		const out = await boundSwapFn(inputs, [1, 2]);
		expect(out).toEqual([]);
		const all = await getAllProofs();
		expect(all.length).toBe(2);
		expect(all.every((p) => p.quarantined === true)).toBe(true);
		expect(await getUnspentProofsIncludingPending()).toHaveLength(0);
	});
});
