/**
 * TASK-4914 (INTENT-049, BLUEPRINT-049 v4 + Commander ORDER rev59):
 * on-demand poll CUT — unknownOutcome + reconcile=>unknown returns pending
 * IMMEDIATELY (no 20s pollMeltQuoteUntilTerminal), hands to central+M2.
 *
 * Scoped proof (4 cases, real proofsDb + real storage, mocked mint only):
 *   1. meltFlow: POST throws (unknown) + reconcile=>unknown (PENDING quote +
 *      PENDING input) → pending:true IMMEDIATELY (elapsed << 20s) +
 *      pollMeltQuoteUntilTerminal NEVER called + handoff-to-central logged +
 *      tx stays pending under quote-bound id + reservation KEPT.
 *   2. central handoff: the pending tx keeps its quote id recoverable via
 *      extractMeltQuoteId + checkMeltQuote still answers (central 15s poll
 *      can re-check it) + resolver leaves it pending (M2 owns it, n=0).
 *   3. 4913 intact: POST throws + UNPAID + all UNSPENT → still failed NOW
 *      (no regression of retryable=>failed).
 *   4. source-level: melt.ts no longer references pollMeltQuoteUntilTerminal
 *      (single poller = central+M2 only); client.ts still exports it.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { MINT_URL, KEYSET_ID, MNEMONIC, postMeltCalls, failBox } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	postMeltCalls: [] as Array<{ quote: string }>,
	failBox: { current: null as unknown | null }
}));

/** Mutable mint verdicts (per-test). */
let mockQuoteState: string = 'PENDING';
let mockProofStates: Array<'UNSPENT' | 'SPENT' | 'PENDING'> = [];
let mockPollCalls = 0;

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => Promise.resolve(true)),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn(() =>
		Promise.resolve({ nuts: ['04', '05', '08'], version: 'Nutshell/0.20.1', cached_at: Date.now() })
	)
}));

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn().mockResolvedValue({
		nuts: { '08': { supported: true }, '04': true, '05': true },
		version: 'Nutshell/0.20.1',
		name: 'Test Mint',
		pubkey: '03' + 'b1'.repeat(32)
	}),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	requestMeltQuote: vi.fn().mockImplementation((_mint: string, _inv: string, amount: number) =>
		Promise.resolve({
			quote: 'q4914-unknown-01',
			amount,
			fee_reserve: 0,
			expiry: 9999999999,
			state: 'UNPAID'
		})
	),
	meltTokens: vi.fn((_mintUrl: string, quoteId: string) => {
		postMeltCalls.push({ quote: quoteId });
		if (failBox.current !== null) {
			const err = failBox.current;
			failBox.current = null;
			return Promise.reject(err);
		}
		return Promise.resolve({ paid: true, payment_preimage: `preimage-${quoteId}`, change: [] });
	}),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockImplementation((_mint: string, proofs: Array<{ secret: string }>) =>
		Promise.resolve({
			states: proofs.map((p, i) => ({
				secret: p.secret,
				state: mockProofStates[i] ?? 'PENDING',
				witness: null
			}))
		}
	)),
	checkMintQuote: vi.fn(),
	checkMeltQuote: vi.fn().mockImplementation((_mint: string, quoteId: string) =>
		Promise.resolve({
			quote: quoteId,
			amount: 10,
			fee_reserve: 0,
			paid: mockQuoteState === 'PAID',
			expiry: 9999999999,
			state: mockQuoteState
		})
	),
	pollMeltQuoteUntilTerminal: vi.fn().mockImplementation(() => {
		mockPollCalls++;
		return Promise.resolve({ quote: { state: mockQuoteState }, terminal: false, timedOut: true });
	}),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{ id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0, keys: { '1': '02' + 'a1'.repeat(32) }, last_updated: Date.now() }
	]),
	getAllKeysets: vi.fn().mockReturnValue([
		{ id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0, keys: { '1': '02' + 'a1'.repeat(32) }, last_updated: Date.now() }
	]),
	getMintPubkey: vi.fn().mockReturnValue('03' + 'b1'.repeat(32)),
	getKeysetById: vi.fn().mockReturnValue({
		id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0, keys: { '1': '02' + 'a1'.repeat(32) }, last_updated: Date.now()
	}),
	resolveKeysetId: vi.fn().mockImplementation((_url: string, id: string) => id),
	isCacheStale: vi.fn().mockReturnValue(false),
	clearCache: vi.fn(),
	rotateKeysets: vi.fn()
}));

vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockImplementation((secret: string) => ({ B_: 'B_' + secret, blindingFactor: 'r_' + secret })),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

// ─── Imports (after mocks) ─────────────────────────────────────

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { getTransactions, clearTransactions } from '../../storage/db';
import {
	addProofs,
	getAllProofs,
	getReservedProofs,
	getTotalBalance,
	deleteProofDB,
	resetProofDB
} from '../proofsDb';
import { setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { meltFlow, reconcileMeltAttempt } from '../melt';
import { resolvePendingTransactions, extractMeltQuoteId } from '../pending-tx-resolver';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const HERE = dirname(fileURLToPath(import.meta.url));
const MELT_SRC = resolve(HERE, '../melt.ts');
const CLIENT_SRC = resolve(HERE, '../../cashu/client.ts');

function makeProof(tag: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-4914-${tag}`, C: `sig-4914-${tag}` };
}

async function localIdsOf(tags: string[]): Promise<string[]> {
	const all = await getAllProofs();
	return tags.map((t) => {
		const found = all.find((p) => p.secret === `secret-4914-${t}`);
		if (!found) throw new Error(`test setup: proof ${t} not stored`);
		return found.local_id;
	});
}

async function freshWalletWithFunds(tags: Array<{ tag: string; amount: number }>): Promise<void> {
	await clearAllWalletData();
	await clearTransactions();
	await deleteProofDB();
	resetProofDB();
	localStorage.removeItem(STORAGE_KEY);
	try { localStorage.clear(); } catch { /* ignore */ }
	postMeltCalls.length = 0;
	failBox.current = null;
	mockPollCalls = 0;
	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	setActiveSeed(mnemonicToSeed(MNEMONIC));
	setCounterK(KEYSET_ID, 7);
	for (const { tag, amount } of tags) {
		await addProofs([makeProof(tag, amount)], MINT_URL, KEYSET_ID);
	}
}

describe('TASK-4914 no on-demand poll: unknown=>pending immediately', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mockQuoteState = 'PENDING';
		mockProofStates = [];
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await clearTransactions();
		await deleteProofDB();
		resetProofDB();
	});

	it('(1) unknown=>pending immediately: no poll, handoff log, reservation kept', async () => {
		await freshWalletWithFunds([{ tag: 'u1', amount: 20 }]);
		expect(await getTotalBalance()).toBe(20);

		// POST leaves the wallet but the answer is lost → unknownOutcome.
		failBox.current = new client.CashuError('HTTP 500 (20004): routing failed');
		// Reconcile=>unknown: quote PENDING + input PENDING (mint may hold it).
		mockQuoteState = 'PENDING';
		mockProofStates = ['PENDING'];
		const sanity = await reconcileMeltAttempt(
			MINT_URL,
			'q-sanity',
			[{ local_id: 'x', amount: 20, id: KEYSET_ID, secret: 's', C: 'c' }]
		);
		expect(sanity.outcome).toBe('unknown');

		const warns: string[] = [];
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
			warns.push(a.map(String).join(' '));
		});
		const t0 = Date.now();
		const res = await meltFlow(MINT_URL, 'lnbc-4914-unknown-sentinel', 10);
		const elapsed = Date.now() - t0;
		warnSpy.mockRestore();

		// Pending — NOT success, NOT failed.
		expect(res.success).toBe(false);
		expect(res.pending).toBe(true);
		// Immediate: far below the old 20s on-demand budget.
		expect(elapsed).toBeLessThan(5000);
		// Exactly ONE POST — no second send, no poll calls.
		expect(postMeltCalls).toHaveLength(1);
		expect(mockPollCalls).toBe(0);
		expect((client.pollMeltQuoteUntilTerminal as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
		// No poll-shaped log lines from meltFlow.
		expect(warns.some((w) => /pollMeltQuote|on-demand poll until|poll-until-terminal/i.test(w))).toBe(false);
		// Handoff log present (central+M2 own it from here).
		expect(warns.some((w) => /handoff-to-central/i.test(w))).toBe(true);
		// Tx stays pending under the quote-bound id (central can find it).
		const pendings = await getTransactions({ type: 'melt', status: 'pending' });
		expect(pendings.some((t) => t.id === 'melt-q4914-unknown-01')).toBe(true);
		// Reservation KEPT (coins on the wire — not back in the pool, not spent).
		const reserved = await getReservedProofs();
		expect(reserved.map((p) => p.local_id)).toHaveLength(1);
		expect(await getTotalBalance()).toBe(0);
	});

	it('(2) central takes over: quote recoverable + resolver keeps it pending', async () => {
		await freshWalletWithFunds([{ tag: 'c1', amount: 20 }]);
		failBox.current = new client.CashuError('HTTP 500 (20004): routing failed');
		mockQuoteState = 'PENDING';
		mockProofStates = ['PENDING'];
		const res = await meltFlow(MINT_URL, 'lnbc-4914-unknown-sentinel', 10);
		expect(res.pending).toBe(true);

		// Quote-bound tx id → central extracts the quote for its 15s re-check.
		expect(extractMeltQuoteId('melt-q4914-unknown-01')).toBe('q4914-unknown-01');
		// Central re-check still answers (mint reachable, quote PENDING).
		const recheck = await client.checkMeltQuote(MINT_URL, 'q4914-unknown-01');
		expect(recheck.state).toBe('PENDING');
		// M2 resolver: PENDING + input PENDING → stays pending (n=0, lock kept).
		mockQuoteState = 'PENDING';
		mockProofStates = ['PENDING'];
		const n = await resolvePendingTransactions();
		expect(n).toBe(0);
		const still = await getTransactions({ type: 'melt', status: 'pending' });
		expect(still.some((t) => t.id === 'melt-q4914-unknown-01')).toBe(true);
		expect((await getReservedProofs()).map((p) => p.local_id)).toHaveLength(1);
	});

	it('(3) 4913 intact: UNPAID + all UNSPENT still fails NOW (no poll)', async () => {
		await freshWalletWithFunds([{ tag: 'f1', amount: 20 }]);
		const [idF] = await localIdsOf(['f1']);
		failBox.current = new client.CashuError('HTTP 500 (20004): routing failed');
		mockQuoteState = 'UNPAID';
		mockProofStates = ['UNSPENT'];

		const res = await meltFlow(MINT_URL, 'lnbc-4914-fresh-never-decoded', 10);

		expect(res.success).toBe(false);
		expect(res.pending).not.toBe(true);
		expect(postMeltCalls).toHaveLength(1);
		expect(mockPollCalls).toBe(0);
		const failed = await getTransactions({ type: 'melt', status: 'failed' });
		expect(failed.some((t) => t.id === 'melt-q4914-unknown-01')).toBe(true);
		expect(await getReservedProofs()).toEqual([]);
		expect(await getTotalBalance()).toBe(20);
		expect((await getAllProofs()).find((p) => p.local_id === idF)?.spent).not.toBe(true);
	});

	it('(4) source-level: melt.ts never polls, client.ts still exports the poll fn', () => {
		const meltSrc = readFileSync(MELT_SRC, 'utf8');
		const clientSrc = readFileSync(CLIENT_SRC, 'utf8');
		// Single poller = central+M2 only: meltFlow holds no on-demand poll.
		expect(meltSrc).not.toContain('pollMeltQuoteUntilTerminal');
		expect(meltSrc).toContain('handoff-to-central');
		// Export kept (importers keep compiling — just never called from meltFlow).
		expect(clientSrc).toContain('export async function pollMeltQuoteUntilTerminal');
	});
});
