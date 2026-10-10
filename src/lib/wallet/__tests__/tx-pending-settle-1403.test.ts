/**
 * TASK-1403 (F-049-002) — tx pending semantics + proofIds mapping + settle.
 *
 * WHAT THIS PROVES (dispatch must_do 1/2 + OI-v5-3, acceptance 1/2/4-part):
 *   1. offline receive (receiveProofsPassthrough) writes the tx record with
 *      status 'pending' — NOT 'confirmed' (boss L-P008: 'transaction ที่รับ
 *      มาแบบ offline ควรอยู่ใน history โดยขึ้นสถานะว่า pending ไม่ใช่
 *      confirm') + the proofIds mapping (tx_id ↔ proof local_ids).
 *   2. flush settle pass (settlePendingReceiveTxs / settleReceiveTxByProofs):
 *      every mapped proof settled → flip 'confirmed'.
 *   3. OI-v5-3 ทาง (1): every mapped proof dead (quarantined) → 'failed'
 *      (record อย่างเดียว — no .svelte); partially dead stays 'pending'.
 *   4. backward-compat: legacy records WITHOUT proofIds are never
 *      force-flipped ('unmapped'); settled txs are never re-flipped
 *      ('skipped'); missing txs are 'unmapped' (no crash).
 *
 * Record-level only: proofsDb + storage/db (fake-indexeddb). No .svelte,
 * no online receive path (P2), no mint.ts, no client.ts.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.txpending1403.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
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

// Offline gate reads the DETECTOR (isWalletOnline → getDetectorStatus),
// never navigator — pin the detector at 'offline' for the receive test.
vi.mock('../../offline-indicator', () => ({
	getDetectorStatus: vi.fn(() => ({
		state: 'offline',
		online: false,
		suspect: false,
		probing: false,
		bootWired: true,
		targets: [],
		probeCount: 0,
		lastProbeAt: 0,
		lastResult: 'offline'
	})),
	isOnline: vi.fn(() => false),
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

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn()
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn(),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

import { decodeToken } from '../../cashu/token';
import { getMintPubkey } from '../../cashu/keyset';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import {
	addProofs,
	deleteProofDB,
	resetProofDB,
	getAllProofs,
	clearPendingNormalize,
	markPendingNormalizeByProof,
	markQuarantined,
	makeLocalId
} from '../proofsDb';
import { settleReceiveTxByProofs, settlePendingReceiveTxs, receiveTokens } from '../tokenStore';
import { addTransaction, getTransactionById, deleteDatabase } from '../../storage/db';
import { getTransactions } from '../../storage/db';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { clearAllCounters } from '../counterK';
import { createTestMint, buildCarolChain } from './dleq-harness';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);
const TEST_MINT = createTestMint('txpending1403');

function proof(amount: number, label: string): TokenProof {
	return { id: KEYSET_ID, amount, secret: `txp-${label}`, C: `sig-txp-${label}` };
}

function mockOfflineToken(amounts: number[]): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: amounts.map((a, i) => buildCarolChain(TEST_MINT, a, KEYSET_ID, `off${i}`).proof)
	} as never);
	vi.mocked(getMintPubkey).mockReturnValue(TEST_MINT.A);
}

async function seedPendingTx(txId: string, amounts: string[]): Promise<string[]> {
	const proofs = amounts.map((label, i) => proof(i + 1, label));
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

describe('TASK-1403 — offline receive writes pending + proofIds mapping (L-P008)', () => {
	it('offline receive → tx status pending (NOT confirmed) + proofIds ↔ stored local_ids', async () => {
		mockOfflineToken([3, 2]);
		const result = await receiveTokens('cashuAdummy');
		expect(result.amount).toBe(5);
		expect(result.proofCount).toBe(2);

		const stored = await getAllProofs();
		expect(stored.every((p) => p.pending_normalize === true)).toBe(true);

		const txs = await getTransactions();
		expect(txs).toHaveLength(1);
		expect(txs[0].type).toBe('cashu_receive');
		expect(txs[0].status).toBe('pending'); // L-P008 — pending ไม่ใช่ confirm
		expect([...(txs[0].proofIds ?? [])].sort()).toEqual(stored.map((p) => p.local_id).sort());
	});
});

describe('TASK-1403 — flush settle: mapping comparison flips confirmed', () => {
	it('every mapped proof settled (pending cleared, alive) → flip confirmed', async () => {
		const ids = await seedPendingTx('tx-settle-ok', ['a', 'b']);
		await clearPendingNormalize(ids); // the flush consolidated them

		const outcome = await settleReceiveTxByProofs('tx-settle-ok');
		expect(outcome).toBe('confirmed');
		expect((await getTransactionById('tx-settle-ok'))!.status).toBe('confirmed');
	});

	it('some mapped proofs still pending → stays pending (no partial flip)', async () => {
		const ids = await seedPendingTx('tx-settle-partial', ['c', 'd']);
		await clearPendingNormalize([ids[0]]); // only one settled

		const outcome = await settleReceiveTxByProofs('tx-settle-partial');
		expect(outcome).toBe('pending');
		expect((await getTransactionById('tx-settle-partial'))!.status).toBe('pending');
	});

	it('settlePendingReceiveTxs sweeps every mapped pending tx in one pass', async () => {
		const idsA = await seedPendingTx('tx-sweep-a', ['e']);
		await seedPendingTx('tx-sweep-b', ['f']);
		await clearPendingNormalize(idsA); // A settled, B still pending

		const out = await settlePendingReceiveTxs();
		const byId = new Map(out.map((o) => [o.txId, o.outcome]));
		expect(byId.get('tx-sweep-a')).toBe('confirmed');
		expect(byId.get('tx-sweep-b')).toBe('pending');
		expect((await getTransactionById('tx-sweep-a'))!.status).toBe('confirmed');
		expect((await getTransactionById('tx-sweep-b'))!.status).toBe('pending');
	});
});

describe('TASK-1403 — OI-v5-3: all-dead → failed, partially-dead → pending', () => {
	it('every mapped proof quarantined → flip failed (record only)', async () => {
		const ids = await seedPendingTx('tx-fail-all', ['g', 'h']);
		await markQuarantined(ids); // mint proved both dead (double-spent family)

		const outcome = await settleReceiveTxByProofs('tx-fail-all');
		expect(outcome).toBe('failed');
		expect((await getTransactionById('tx-fail-all'))!.status).toBe('failed');
	});

	it('some dead but some alive (none pending) → stays pending until fully resolved', async () => {
		const ids = await seedPendingTx('tx-fail-mixed', ['i', 'j']);
		await markQuarantined([ids[0]]); // one dead…
		await clearPendingNormalize([ids[1]]); // …one settled — mixed verdict

		const outcome = await settleReceiveTxByProofs('tx-fail-mixed');
		expect(outcome).toBe('pending'); // ก้อนบางตายคง pending จนสรุปหมด
		expect((await getTransactionById('tx-fail-mixed'))!.status).toBe('pending');
	});
});

describe('TASK-1403 — backward-compat: legacy / settled / missing never force-flipped', () => {
	it('legacy record WITHOUT proofIds → unmapped, never flipped', async () => {
		await addTransaction({
			id: 'tx-legacy',
			type: 'cashu_receive',
			protocol: 'cashu',
			amount: 9,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: 'tok-legacy',
			status: 'pending',
			fee: 0
			// NO proofIds — v4.4/v4.5 record shape
		});
		const outcome = await settleReceiveTxByProofs('tx-legacy');
		expect(outcome).toBe('unmapped');
		expect((await getTransactionById('tx-legacy'))!.status).toBe('pending');
	});

	it('already-settled tx with mapping → skipped (never re-flipped)', async () => {
		await seedPendingTx('tx-done', ['k']);
		await clearPendingNormalize([(await getAllProofs()).map((p) => p.local_id)[0]]);
		expect(await settleReceiveTxByProofs('tx-done')).toBe('confirmed');
		expect(await settleReceiveTxByProofs('tx-done')).toBe('skipped');
	});

	it('missing tx id → unmapped (no crash)', async () => {
		expect(await settleReceiveTxByProofs('tx-no-such')).toBe('unmapped');
	});
});

beforeEach(async () => {
	vi.clearAllMocks();
	await clearAllWalletData();
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();

	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	setActiveSeed(seed);
});

afterEach(async () => {
	clearActiveSeed();
	clearAllCounters();
	await clearAllWalletData();
	await deleteProofDB();
	await deleteDatabase().catch(() => {});
	resetProofDB();
});
