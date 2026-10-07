/**
 * TASK-1315 (INTENT-013) — P3 pending-spendability gate + P8 restore immunity
 * + balance-never-quietly-missing.
 *
 * The gate is TWO layers (L-P005):
 *   layer 1 (DB)  : proofsDb.getUnspentProofs filters !pending_normalize —
 *                   every caller of the SPENDABLE pool is gated at once.
 *   layer 2 (pool): proofs.ts selectProofs defensively re-filters
 *                   !p.pending_normalize — a raw pool handed by any caller
 *                   cannot leak pending coins into send/melt/swap.
 * Role separation (P3 vs flush):
 *   getPendingNormalizeProofs STILL sees every pending proof — the T3 flush
 *   consumes exactly that pile (normalizeWiring.ts:354) — the two queries
 *   differ by ROLE, not by accident.
 * P8 (NUT-9): restored proofs carry NO pending flag — spendable the moment
 *   they land; P3 never seizes them.
 * Balance: getTotalBalance / getBalanceByMint / getProofBalance /
 *   balance.ts getBalance count pending ALWAYS (the user's money never
 *   disappears quietly from the badge — only from the SPENDABLE selection).
 *
 * DB is fake-indexeddb; proofsDb/proofs/balance modules are REAL.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.pendinggate.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', () => ({
	restoreOutputs: vi.fn(),
	checkState: vi.fn(),
	swapProofs: vi.fn(),
	mintTokens: vi.fn(),
	requestMintQuote: vi.fn(),
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	meltTokens: vi.fn(),
	requestMeltQuote: vi.fn(),
	checkMeltQuote: vi.fn(),
	getMintInfo: vi.fn(),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

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

import * as client from '../../cashu/client';
import { getMintPubkey } from '../../cashu/keyset';
import {
	addProofs,
	deleteProofDB,
	resetProofDB,
	getAllProofs,
	getUnspentProofs,
	getPendingNormalizeProofs,
	markPendingNormalizeByProof,
	clearPendingNormalize,
	getTotalBalance,
	getBalanceByMint
} from '../proofsDb';
import { selectProofs, sumProofs } from '../proofs';
import { ProofSelectionError } from '../errors';
import { getProofBalance } from '../tokenStore';
import { getBalance } from '../balance';
import { restoreBatch } from '../restore';
import { mnemonicToSeed } from '../keys';
import { createTestMint, buildCarolChainFromKeys } from './dleq-harness';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const mint = createTestMint('pendinggate');

function pendingProof(amount: number, label: string): TokenProof {
	return { id: KEYSET_ID, amount, secret: label, C: '02' + '66'.repeat(32) };
}

/** Real Carol-verifyable chain proofs (restore-style: NO pending flag). */
function chainProof(amount: number, label: string): TokenProof {
	return buildCarolChainFromKeys(mint.privateKey, mint.A, amount, KEYSET_ID, label).proof;
}

describe('TASK-1315: P3 pending-spendability gate + P8 restore immunity', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		localStorage.clear();
		await deleteProofDB();
		resetProofDB();
		vi.mocked(getMintPubkey).mockReturnValue(mint.A);
	});

	afterEach(async () => {
		await deleteProofDB();
		resetProofDB();
	});

	// ── Layer 1 (DB) + role separation ──
	it('g1) getUnspentProofs EXCLUDES pending (spendable pool) while getPendingNormalizeProofs sees the full pile — two queries, two roles', async () => {
		const chains = [chainProof(3, 'free1'), chainProof(2, 'free2')];
		await addProofs(chains, MINT_URL, KEYSET_ID);
		await addProofs([pendingProof(4, 'pend1'), pendingProof(1, 'pend2')], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([
			pendingProof(4, 'pend1'),
			pendingProof(1, 'pend2')
		]);

		const spendable = await getUnspentProofs();
		expect(spendable.map((p) => p.secret).sort()).toEqual(['free1', 'free2']);

		const pending = await getPendingNormalizeProofs();
		expect(pending).toHaveLength(2); // flush sees ALL — ห้ามโดน filter ยึด
		expect(pending.map((p) => p.secret).sort()).toEqual(['pend1', 'pend2']);
		expect(pending.every((p) => p.pending_normalize === true)).toBe(true);
	}, 15000);

	// ── Layer 2 (pool guard) ──
	it('g2) selectProofs on a RAW pool (including pending) never picks pending — and throws when only pending could cover', async () => {
		const chains = [chainProof(3, 'free1'), chainProof(2, 'free2')];
		// RAW pool hand-in (worst case): pending proofs ARE in the pool WITH the
		// flag set — the guard must refuse them:
		const pends = [pendingProof(4, 'pend1'), pendingProof(1, 'pend2')].map(
			(p) => ({ ...p, pending_normalize: true as const })
		);
		const rawPool = [...chains, ...pends];

		// spendable alone can cover 4 → 3+2 — the pending 4 MUST stay out even
		// though it is an exact single match for amount 4 (ขั้น 1 trap):
		const selected = selectProofs(rawPool, 4);
		expect(selected.every((p) => !p.pending_normalize)).toBe(true);
		expect(selected.map((p) => p.secret).sort()).toEqual(['free1', 'free2']);

		// amount 5: spendable = 5 exactly — pending must not enter any ladder:
		const five = selectProofs(rawPool, 5);
		expect(five.map((p) => p.secret).sort()).toEqual(['free1', 'free2']);

		// amount 6: spendable (5) insufficient; pending has 5 → a leaked pool
		// would have succeeded via the pending 4 — the guard must REFUSE:
		expect(() => selectProofs(rawPool, 6)).toThrow(ProofSelectionError);

		// and the pure-pending pool can never select anything:
		expect(() => selectProofs(pends, 1)).toThrow(ProofSelectionError);
	}, 15000);

	// ── Balance never quietly missing ──
	it('g3) balance counts pending ALWAYS: getTotalBalance / getBalanceByMint / getProofBalance / balance.getBalance', async () => {
		const chains = [chainProof(3, 'free1'), chainProof(2, 'free2')];
		await addProofs(chains, MINT_URL, KEYSET_ID);
		await addProofs([pendingProof(4, 'pend1'), pendingProof(1, 'pend2')], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([
			pendingProof(4, 'pend1'),
			pendingProof(1, 'pend2')
		]);

		// spendable = 5; balance = 5 + 5 = 10 (pending = money):
		expect(await getTotalBalance()).toBe(10);
		const byMint = await getBalanceByMint();
		expect(byMint[MINT_URL]).toBe(10);

		const proofBalance = await getProofBalance();
		expect(proofBalance.total).toBe(10);
		expect(proofBalance.proofCount).toBe(4);

		const badge = await getBalance(); // the UI badge source (F003/Receive/Send)
		expect(badge.total).toBe(10);
		expect(badge.proofCount).toBe(4);
	}, 15000);

	// ── P8 — NUT-9 restore immunity ──
	it('g4) restore proofs land spendable (no pending flag): select immediately + balance exact — P3 never seizes NUT-9 output', async () => {
		// REAL restoreBatch against the mocked /v1/restore — the mint signs REAL
		// chains (harness), the wallet unblinds REAL (blind.ts unmocked):
		const seed = mnemonicToSeed(MNEMONIC);
		vi.mocked(client.restoreOutputs).mockImplementation(async (_u: string,
			outputs: Array<{ id: string; amount: number; B_: string }>) => {
			// the mint echoes its OWN denomination split — mock as 1 sat each:
			return {
				signatures: (outputs ?? []).map((o) => ({ ...mint.blindSign(o), amount: 1 }))
			} as never;
		});

		const batch = await restoreBatch(MINT_URL, seed, KEYSET_ID, 0, 3);
		expect(batch.proofs).toHaveLength(3);
		expect(batch.proofs.every((p) => p.dleq && typeof p.dleq.r === 'string')).toBe(true);

		await addProofs(batch.proofs, MINT_URL, KEYSET_ID);
		const stored = await getAllProofs();
		expect(stored.every((p) => !p.pending_normalize)).toBe(true);

		// IMMEDIATELY selectable from the gated spendable pool:
		const pool = await getUnspentProofs();
		expect(pool).toHaveLength(3);
		const selected = selectProofs(pool, 2);
		expect(selected).toHaveLength(2); // the ladder picks two 1-sat proofs
		expect(sumProofs(selected)).toBe(2);

		// balance exact — nothing seized by P3:
		expect(await getTotalBalance()).toBe(3);
		const badge = await getBalance();
		expect(badge.total).toBe(3);
		expect(badge.proofCount).toBe(3);
	}, 15000);

	// ── Flush lifecycle end-to-end (the two queries swap roles over time) ──
	it('g5) flush lifecycle: pending flagged → hidden from spendable → T3 clears flag → coins RETURN to spendable', async () => {
		const chains = [chainProof(3, 'free1'), chainProof(2, 'free2')];
		await addProofs(chains, MINT_URL, KEYSET_ID);

		// offline passthrough (1314 gate passed) → mark pending:
		const pends = [pendingProof(4, 'pend1'), pendingProof(1, 'pend2')];
		await addProofs(pends, MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof(pends);

		expect((await getUnspentProofs()).map((p) => p.secret).sort())
			.toEqual(['free1', 'free2']);
		expect(await getPendingNormalizeProofs()).toHaveLength(2);

		// T3 flush consumed the pile → clear flag → the SAME coins re-enter
		// the spendable pool (this is how the gate is RESOLVED, not destroyed):
		await clearPendingNormalize((await getAllProofs()).map((p) => p.local_id));
		const afterFlush = await getUnspentProofs();
		expect(afterFlush.map((p) => p.secret).sort())
			.toEqual(['free1', 'free2', 'pend1', 'pend2']);
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		expect(await getTotalBalance()).toBe(10);
	}, 15000);

	// ── S1 guarantee: the flag rides on the stored proof (not a parallel map) ──
	it('g6) stored proof shape: pending_normalize lives ON the StoredProof as a SEPARATE field (not orphaned, not dleq)', async () => {
		await addProofs([pendingProof(2, 'pend1')], MINT_URL, KEYSET_ID);
		await markPendingNormalizeByProof([pendingProof(2, 'pend1')]);
		const stored = (await getAllProofs())[0];
		expect(stored.pending_normalize).toBe(true);
		expect('orphaned' in stored ? stored.orphaned : undefined).toBeUndefined(); // คนละ field คนละเหตุ
		expect(stored.dleq).toBeUndefined(); // dleq field untouched by this task
	});
});
