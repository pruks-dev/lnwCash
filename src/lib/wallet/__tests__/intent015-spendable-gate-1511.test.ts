/**
 * TASK-1511 (INTENT-015 TEST-GATE, BLUEPRINT-015 v2 step 3) — 5-direction
 * spendable-only gate: select/quarantine + ByMint + force-fail quarantine +
 * balance-excludes-pending-failed + send-path-rejects-failed-pool.
 *
 * Contract under test (TASK-1510 production truth — this file asserts it,
 * never implements it):
 *   'failed แบบไหนก็ไม่ควรเอามาใช้ได้'
 *   'pending และ failed proof ไม่ควรเอามานับเป็น balance ด้วย'
 *
 * Directions:
 *   d1) selectProofs layer-2 refuses quarantined + orphaned raw pools
 *       (exact-amount failed trap + only-failed-throws).
 *   d2) getUnspentProofsByMint excludes pending + quarantined per mint.
 *   d3) forceFailMappedTxsOnFlushAbort (TERMINAL) quarantines mapped proofs
 *       → out of spendable AND out of balance, tx flipped 'failed'.
 *   d4) ALL balance APIs exclude pending + quarantined:
 *       getTotalBalance / proofsDb.getBalanceByMint / getProofBalance /
 *       balance.getBalance + balance.getBalanceByMint.
 *   d5) sendTokens send path rejects a failed-only pool (ProofSelectionError,
 *       no token minted — failed coins can never fund a spend).
 *
 * Test-only file (gate — no production code touched).
 * DB is fake-indexeddb; proofsDb/proofs/balance/tokenStore modules are REAL.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, MINT_URL_B, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.spendable1511.test',
	MINT_URL_B: 'https://mint.spendable1511-b.test',
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

import { CashuError } from '../../cashu/client';
import { getMintPubkey } from '../../cashu/keyset';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import {
	addProofs,
	deleteProofDB,
	resetProofDB,
	getAllProofs,
	getUnspentProofs,
	getUnspentProofsByMint,
	getPendingNormalizeProofs,
	markPendingNormalizeByProof,
	getTotalBalance,
	getBalanceByMint as getBreakdownByMint,
	makeLocalId,
	type StoredProof
} from '../proofsDb';
import { selectProofs } from '../proofs';
import { ProofSelectionError } from '../errors';
import {
	getProofBalance,
	forceFailMappedTxsOnFlushAbort,
	sendTokens
} from '../tokenStore';
import { getBalance, getBalanceByMint } from '../balance';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { addTransaction, getTransactionById, deleteDatabase } from '../../storage/db';
import { createTestMint, buildCarolChainFromKeys } from './dleq-harness';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);
const mint = createTestMint('spendable1511');

function chainProof(amount: number, label: string): TokenProof {
	return buildCarolChainFromKeys(mint.privateKey, mint.A, amount, KEYSET_ID, label).proof;
}

function asStored(
	proof: TokenProof,
	extra?: Partial<StoredProof>,
	mintUrl = MINT_URL
): StoredProof {
	return {
		...proof,
		local_id: `${KEYSET_ID}:${proof.secret}`,
		mint_url: mintUrl,
		keyset_id: KEYSET_ID,
		stored_at: Date.now(),
		spent: false,
		...extra
	} as StoredProof;
}

describe('TASK-1511 INTENT-015 — 5-direction spendable-only gate', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		localStorage.clear();
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

	// ── d1: select/quarantine layer-2 ──
	it('d1) selectProofs refuses quarantined + orphaned raw pools — exact-amount failed trap skipped, only-failed pool throws', async () => {
		// 'failed แบบไหนก็ไม่ควรเอามาใช้ได้' — every failed KIND refused:
		const healthy = [asStored(chainProof(3, 'ok1')), asStored(chainProof(2, 'ok2'))];
		const failedKinds = [
			asStored(chainProof(5, 'q-dead'), { quarantined: true }), // mint double-spent reject
			asStored(chainProof(5, 'o-unknown'), { orphaned: true }), // keyset-unknown
			{ ...asStored(chainProof(5, 'p-wait')), pending_normalize: true } // awaits T3 flush
		];
		const rawPool = [...healthy, ...failedKinds];

		// amount 5: healthy ladder (3+2) covers — the three failed exact-5
		// singles MUST stay out even though each is a perfect single match:
		const five = selectProofs(rawPool, 5);
		expect(five.map((p) => p.secret).sort()).toEqual(['ok1', 'ok2']);
		expect(five.every((p) => !p.quarantined && !p.orphaned && !p.pending_normalize)).toBe(true);

		// amount 6: healthy (5) insufficient; failed pile has 15 → must REFUSE:
		expect(() => selectProofs(rawPool, 6)).toThrow(ProofSelectionError);

		// pure-failed pools can never select anything (per kind):
		for (const failed of failedKinds) {
			expect(() => selectProofs([failed], 1)).toThrow(ProofSelectionError);
		}
		expect(() => selectProofs(failedKinds, 1)).toThrow(ProofSelectionError);
	}, 15000);

	// ── d2: ByMint per-mint spendable pool ──
	it('d2) getUnspentProofsByMint excludes pending + quarantined per mint — healthy per-mint coins intact', async () => {
		await addProofs([chainProof(3, 'a-ok')], MINT_URL, KEYSET_ID);
		await addProofs([chainProof(7, 'b-ok')], MINT_URL_B, KEYSET_ID);
		await addProofs([chainProof(4, 'a-pend')], MINT_URL, KEYSET_ID);
		await addProofs([chainProof(6, 'b-dead')], MINT_URL_B, KEYSET_ID);
		await markPendingNormalizeByProof([chainProof(4, 'a-pend')]);
		const { markQuarantined } = await import('../proofsDb');
		await markQuarantined([makeLocalId(chainProof(6, 'b-dead'))]);

		// per-mint spendable: only the healthy coin of THAT mint:
		const mintA = await getUnspentProofsByMint(MINT_URL);
		expect(mintA.map((p) => p.secret)).toEqual(['a-ok']);
		const mintB = await getUnspentProofsByMint(MINT_URL_B);
		expect(mintB.map((p) => p.secret)).toEqual(['b-ok']);

		// unknown mint → empty (never leaks across mints):
		expect(await getUnspentProofsByMint('https://mint.unknown.test')).toHaveLength(0);
	}, 15000);

	// ── d3: force-fail quarantine ──
	it('d3) forceFailMappedTxsOnFlushAbort (TERMINAL) quarantines mapped proofs — tx failed + out of spendable AND balance', async () => {
		const proofs = [chainProof(1, 'ff-a'), chainProof(2, 'ff-b')];
		await addProofs(proofs, MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof(proofs);
		const ids = proofs.map((p) => makeLocalId(p));
		await addTransaction({
			id: 'tx-1511-forcefail',
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: 3,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: 'tok-1511-forcefail',
			status: 'pending',
			fee: 0,
			proofIds: ids
		});

		const res = await forceFailMappedTxsOnFlushAbort(
			ids,
			new CashuError('mint rule reject: locktime in future', 400, 12001)
		);
		expect(res.failed).toContain('tx-1511-forcefail');
		expect((await getTransactionById('tx-1511-forcefail'))!.status).toBe('failed');

		// TERMINAL-failed proofs quarantined: out of the pending pipeline,
		// out of the spendable pool, out of every balance:
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		const all = await getAllProofs();
		expect(all.every((p) => p.quarantined === true)).toBe(true);
		expect(await getUnspentProofs()).toHaveLength(0);
		expect(await getTotalBalance()).toBe(0);
		expect((await getBalance()).total).toBe(0);
	}, 15000);

	// ── d4: balance excludes pending-failed (all four APIs) ──
	it('d4) every balance API excludes pending + quarantined — only spendable counted', async () => {
		await addProofs([chainProof(3, 'spend-ok')], MINT_URL, KEYSET_ID);
		await addProofs([chainProof(4, 'pend-wait')], MINT_URL, KEYSET_ID);
		await addProofs([chainProof(6, 'q-dead')], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([chainProof(4, 'pend-wait')]);
		const { markQuarantined } = await import('../proofsDb');
		await markQuarantined([makeLocalId(chainProof(6, 'q-dead'))]);

		// spendable = 3; pending 4 + quarantined 6 MUST NOT count:
		// 'pending และ failed proof ไม่ควรเอามานับเป็น balance ด้วย'
		expect(await getTotalBalance()).toBe(3);
		expect((await getBreakdownByMint())[MINT_URL]).toBe(3);

		const proofBalance = await getProofBalance();
		expect(proofBalance.total).toBe(3);
		expect(proofBalance.proofCount).toBe(1);

		const badge = await getBalance();
		expect(badge.total).toBe(3);
		expect(badge.proofCount).toBe(1);
		expect(await getBalanceByMint(MINT_URL)).toBe(3);
	}, 15000);

	// ── d5: send path rejects failed pool ──
	it('d5) sendTokens rejects a failed-only pool — ProofSelectionError, no token minted', async () => {
		await addProofs([chainProof(4, 'pend-only')], MINT_URL, KEYSET_ID);
		await addProofs([chainProof(6, 'dead-only')], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([chainProof(4, 'pend-only')]);
		const { markQuarantined } = await import('../proofsDb');
		await markQuarantined([makeLocalId(chainProof(6, 'dead-only'))]);

		// pool holds 10 face value but ZERO spendable → send MUST refuse:
		await expect(sendTokens(1, MINT_URL)).rejects.toThrow(ProofSelectionError);
		await expect(sendTokens(5, MINT_URL)).rejects.toThrow(ProofSelectionError);

		// nothing consumed by the refusal — rows intact for audit/flush:
		expect(await getAllProofs()).toHaveLength(2);
	}, 15000);
});
