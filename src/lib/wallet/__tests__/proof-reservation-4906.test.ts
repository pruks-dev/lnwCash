/**
 * TASK-4906 (INTENT-049): in-flight proof reservation.
 *
 * Proofs submitted to the mint (melt POST / exact-amount swap POST) are
 * marked `reserved` while the outcome is unknown: the spendable pool
 * (getUnspentProofs / getUnspentProofsByMint), balance, and selectProofs
 * must all exclude them, and every terminal path must settle the lock —
 * success consumes (markSpent), proven non-payment releases (clearReserved),
 * and the pending-tx-resolver settles via the tx proofIds trail.
 *
 * What is proven here (mint-agnostic — only checkState/quote/error codes):
 *   1. mark/release mechanics: markReserved hides proofs from both unspent
 *      pools + getReservedProofs lists them; clearReserved returns them.
 *   2. balance-excludes-reserved: getBalance / getTotalBalance /
 *      getBalanceByMint never count a locked coin (no balance.ts change —
 *      it already sources the gated pools).
 *   3. select-excludes-reserved: selectProofs on a raw pool containing a
 *      reserved coin never picks it (layer-2 guard, mirrors layer 1).
 *   4. melt mark: completeMelt with a failing POST (unknown outcome) leaves
 *      the inputs reserved AND records the lock mid-flight (captured inside
 *      the mocked postMelt); deterministic pre-submit failure releases.
 *   5. melt release: meltFlow success consumes the lock (spent, none left);
 *      meltFlow proven-fail path releases (pool intact).
 *   6. swap mark/release: sendTokens failing swap releases the swap input
 *      back (fall-back sends the originals); the lock is visible mid-swap.
 *   7. reconcile release: resolvePendingTransactions consumes on PAID
 *      (tx confirmed + inputs spent) and releases on terminal fail
 *      (legacy-timeout fail → pool intact, no stuck lock).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC, TEST_INVOICE } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	TEST_INVOICE: 'lnbc-reservation-4906-sentinel'
}));

/** CheckState verdict for the mocked mint (mutable per test). */
let mockProofStates: Array<'UNSPENT' | 'SPENT' | 'PENDING'> = [];
/** checkMeltQuote verdict for the mocked mint (mutable per test). */
let mockQuoteState = 'UNPAID';
/** Mid-flight observations recorded INSIDE the mocked network calls. */
const flightLog: {
	meltInputsLocked?: boolean;
	swapInputLocked?: boolean;
} = {};

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => Promise.resolve(false)),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn(() =>
		Promise.resolve({ nuts: ['04', '05'], version: 'Nutshell/0.20.1', cached_at: Date.now() })
	)
}));

vi.mock('../bolt11', () => ({
	decodeBolt11: vi.fn((invoice: string) => {
		if (invoice === TEST_INVOICE) {
			const nowSec = Math.floor(Date.now() / 1000);
			return {
				network: 'mainnet' as const,
				amountSat: 10,
				paymentHash: 'ab'.repeat(32),
				description: 'reservation sentinel',
				expiry: 3600,
				timestamp: nowSec,
				hrp: 'lnbc100u',
				tags: new Map<number, Uint8Array>()
			};
		}
		return { code: 'invalid_network' as const, message: 'mock: not a real invoice' };
	})
}));

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn(),
	getKeysets: vi.fn(),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	mintTokens: vi.fn(),
	requestMeltQuote: vi.fn().mockImplementation((_mint: string, _inv: string, amount: number) =>
		Promise.resolve({
			quote: `q-4906-${amount}`,
			amount,
			fee_reserve: 0,
			paid: false,
			expiry: 9999999999,
			state: 'UNPAID'
		})
	),
	checkState: vi.fn().mockImplementation((_mint: string, proofs: Array<{ secret: string }>) =>
		Promise.resolve({
			states: proofs.map((p, i) => ({
				secret: p.secret,
				state: mockProofStates[i] ?? 'UNSPENT',
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
	pollMeltQuoteUntilTerminal: vi.fn().mockImplementation((_m: string, q: string) =>
		Promise.resolve({
			quote: { quote: q, amount: 10, fee_reserve: 0, paid: false, expiry: 1, state: 'UNPAID' },
			terminal: false,
			timedOut: true
		})
	),
	meltTokens: vi.fn(),
	swapProofs: vi.fn(),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'a1'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getAllKeysets: vi.fn().mockReturnValue([
		{
			id: KEYSET_ID,
			unit: 'sat',
			active: true,
			input_fee_ppk: 0,
			keys: { '1': '02' + 'a1'.repeat(32) },
			last_updated: Date.now()
		}
	]),
	getMintPubkey: vi.fn().mockReturnValue('03' + 'b1'.repeat(32)),
	getKeysetById: vi.fn().mockReturnValue({
		id: KEYSET_ID,
		unit: 'sat',
		active: true,
		input_fee_ppk: 0,
		keys: { '1': '02' + 'a1'.repeat(32) },
		last_updated: Date.now()
	}),
	resolveKeysetId: vi.fn().mockImplementation((_url: string, id: string) => id),
	isCacheStale: vi.fn().mockReturnValue(false),
	clearCache: vi.fn(),
	rotateKeysets: vi.fn()
}));

vi.mock('../../cashu/blind', () => ({
	blindMessage: vi.fn().mockImplementation((secret: string) => ({
		B_: 'B_' + secret,
		blindingFactor: 'r_' + secret
	})),
	unblindSignature: vi.fn().mockReturnValue('03' + 'c1'.repeat(32)),
	blindingFactorToHex: vi.fn().mockReturnValue('ab'.repeat(32))
}));

// ─── Imports (after mocks) ─────────────────────────────────────

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { addTransaction, getTransactions } from '../../storage/db';
import {
	addProofs,
	getAllProofs,
	getUnspentProofs,
	getUnspentProofsByMint,
	markSpent,
	markReserved,
	clearReserved,
	getReservedProofs,
	getTotalBalance,
	getBalanceByMint,
	deleteProofDB,
	resetProofDB,
	type StoredProof
} from '../proofsDb';
import { selectProofs } from '../proofs';
import { getBalance } from '../balance';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { completeMelt, meltFlow } from '../melt';
import { sendTokens } from '../transfer';
import { resolvePendingTransactions } from '../pending-tx-resolver';
import { ProofSelectionError } from '../errors';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeProof(tag: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-4906-${tag}`, C: `sig-4906-${tag}` };
}

async function localIdsOf(tags: string[]): Promise<string[]> {
	const all = await getAllProofs();
	return tags.map((t) => {
		const found = all.find((p) => p.secret === `secret-4906-${t}`);
		if (!found) throw new Error(`test setup: proof ${t} not stored`);
		return found.local_id;
	});
}

function toStored(tag: string, amount: number, extra?: Partial<StoredProof>): StoredProof {
	return {
		local_id: `${KEYSET_ID}:secret-4906:-${tag}`,
		id: KEYSET_ID,
		amount,
		secret: `secret-4906-${tag}`,
		C: `sig-4906-${tag}`,
		mint_url: MINT_URL,
		keyset_id: KEYSET_ID,
		stored_at: Date.now(),
		spent: false,
		...extra
	};
}

describe('TASK-4906: in-flight proof reservation', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		try { localStorage.clear(); } catch { /* ignore */ }
		vi.clearAllMocks();
		mockProofStates = [];
		mockQuoteState = 'UNPAID';
		delete flightLog.meltInputsLocked;
		delete flightLog.swapInputLocked;

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

	it('(1) mark/release mechanics — reserved hidden from both pools, listed, then restored', async () => {
		await addProofs([makeProof('a', 8), makeProof('b', 4)], MINT_URL, KEYSET_ID);
		const [idA] = await localIdsOf(['a']);

		await markReserved([idA]);

		expect((await getUnspentProofs()).map((p) => p.amount)).toEqual([4]);
		expect((await getUnspentProofsByMint(MINT_URL)).map((p) => p.amount)).toEqual([4]);
		expect((await getReservedProofs()).map((p) => p.local_id)).toEqual([idA]);
		// The row itself is kept (audit trail) — only the flag flips.
		expect((await getAllProofs())).toHaveLength(2);

		await clearReserved([idA]);

		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(2);
	});

	it('(1b) markSpent consumes the reservation — no stuck lock on success', async () => {
		await addProofs([makeProof('a', 8)], MINT_URL, KEYSET_ID);
		const [idA] = await localIdsOf(['a']);
		await markReserved([idA]);
		await markSpent([idA]);
		expect(await getReservedProofs()).toEqual([]);
		expect(await getUnspentProofs()).toEqual([]);
	});

	it('(2) balance-excludes-reserved — locked coins are not the user money', async () => {
		await addProofs([makeProof('a', 8), makeProof('b', 4)], MINT_URL, KEYSET_ID);
		const [idA] = await localIdsOf(['a']);
		expect(await getTotalBalance()).toBe(12);

		await markReserved([idA]);

		expect(await getTotalBalance()).toBe(4);
		const byMint = await getBalanceByMint();
		expect(byMint[MINT_URL]).toBe(4);
		const bal = await getBalance();
		expect(bal.total).toBe(4);
		expect(bal.proofCount).toBe(1);

		await clearReserved([idA]);
		expect(await getTotalBalance()).toBe(12);
	});

	it('(3) select-excludes-reserved — a stale snapshot cannot pick a locked coin', async () => {
		const free = toStored('free5', 5);
		const locked = toStored('lock10', 10, { reserved: true });

		// 8 is coverable only by the locked 10 → must throw, never touch it.
		expect(() => selectProofs([free, locked], 8)).toThrow(ProofSelectionError);
		// 5 is covered by the free coin alone.
		expect(selectProofs([free, locked], 5).map((p) => p.secret)).toEqual([free.secret]);
	});

	it('(4) melt mark — failing POST keeps the inputs reserved + lock visible mid-flight', async () => {
		await addProofs([makeProof('m1', 10), makeProof('m2', 10)], MINT_URL, KEYSET_ID);
		const ids = await localIdsOf(['m1', 'm2']);
		(client.meltTokens as ReturnType<typeof vi.fn>).mockImplementation(
			async (_m: string, _q: string, inputs: Array<{ secret: string }>) => {
				// Mid-flight: the submitted inputs must already be unselectable.
				const pool = await getUnspentProofsByMint(MINT_URL);
				flightLog.meltInputsLocked = inputs.every((in_) =>
					pool.every((p) => p.secret !== in_.secret)
				);
				throw new Error('HTTP 500 (20004): routing failed');
			}
		);

		const inputs = [
			{ local_id: ids[0], amount: 10, id: KEYSET_ID, secret: 'secret-4906-m1', C: 'sig-4906-m1' },
			{ local_id: ids[1], amount: 10, id: KEYSET_ID, secret: 'secret-4906-m2', C: 'sig-4906-m2' }
		];
		const res = await completeMelt(MINT_URL, 'q-4906-mark', inputs, 'lnbc...', 10, 0);

		expect(res.success).toBe(false);
		expect(res.unknownOutcome).toBe(true);
		expect(flightLog.meltInputsLocked).toBe(true);
		// Still locked after the unknown outcome (reconcile owns the release).
		expect((await getReservedProofs()).map((p) => p.local_id).sort()).toEqual([...ids].sort());
		expect(await getTotalBalance()).toBe(0);
	});

	it('(4b) melt deterministic pre-submit failure releases — counter guard never locks', async () => {
		await addProofs([makeProof('g1', 10)], MINT_URL, KEYSET_ID);
		const [idG] = await localIdsOf(['g1']);
		// Counter-0 guard: counter 0 + existing proofs for the keyset → throw
		// BEFORE any POST (change path needs a counter band).
		setCounterK(KEYSET_ID, 0);
		const res = await completeMelt(
			MINT_URL,
			'q-4906-guard',
			[{ local_id: idG, amount: 10, id: KEYSET_ID, secret: 'secret-4906-g1', C: 'sig-4906-g1' }],
			'lnbc...',
			4,
			0
		);
		expect(res.success).toBe(false);
		expect(res.unknownOutcome).toBeFalsy();
		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(1);
	});

	it('(5) meltFlow success consumes the lock — nothing left reserved', async () => {
		await addProofs([makeProof('f1', 16), makeProof('f2', 8)], MINT_URL, KEYSET_ID);
		(client.meltTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
			paid: true,
			payment_preimage: 'preimage-4906',
			change: []
		});

		const res = await meltFlow(MINT_URL, 'lnbc...', 10);
		expect(res.success).toBe(true);
		expect(await getReservedProofs()).toEqual([]);
		// Pending tx bound the inputs and was confirmed.
		const txs = await getTransactions({ type: 'melt', status: 'confirmed' });
		expect(txs.length).toBeGreaterThan(0);
		expect(txs[0].proofIds?.length).toBeGreaterThan(0);
	});

	it('(5b) meltFlow proven-fail releases — reconcile FAILED returns coins', async () => {
		await addProofs([makeProof('r1', 16)], MINT_URL, KEYSET_ID);
		(client.meltTokens as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('HTTP 500 (20004): hard fail'));
		// Second reconcile round: the mint reports a FAILED-ish quote state
		// (mint-agnostic terminal) → proven non-payment → release.
		mockQuoteState = 'FAILED';

		const res = await meltFlow(MINT_URL, 'lnbc...', 10);
		expect(res.success).toBe(false);
		expect(res.pending).toBeFalsy();
		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(1);
		expect(await getTotalBalance()).toBe(16);
	});

	it('(6) swap mark/release — failing swap releases, lock visible mid-swap', async () => {
		await addProofs([makeProof('s10', 10)], MINT_URL, KEYSET_ID);
		const [idS] = await localIdsOf(['s10']);
		(client.swapProofs as ReturnType<typeof vi.fn>).mockImplementation(
			async (_m: string, inputs: Array<{ secret: string }>) => {
				const pool = await getUnspentProofsByMint(MINT_URL);
				flightLog.swapInputLocked = inputs.every((in_) =>
					pool.every((p) => p.secret !== in_.secret)
				);
				throw new Error('mock swap transport failure');
			}
		);

		// Send 6 of 10 → excess → exact-amount swap path, which fails →
		// fall-back sends the original 10-proof (change absorbed by recipient).
		const sent = await sendTokens(6, MINT_URL);
		expect(sent.amount).toBe(10);
		expect(flightLog.swapInputLocked).toBe(true);
		// Fall-back consumed the originals as sent — no stuck lock either way.
		expect(await getReservedProofs()).toEqual([]);
		expect(idS).toBeTruthy();
	});

	it('(7a) reconcile release — pending PAID consumes (confirmed + spent)', async () => {
		await addProofs([makeProof('p1', 8)], MINT_URL, KEYSET_ID);
		const [idP] = await localIdsOf(['p1']);
		await markReserved([idP]);
		await addTransaction({
			id: 'melt-reconcile-paid-4906',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now(),
			token_hash: null,
			invoice: TEST_INVOICE,
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idP]
		});
		mockQuoteState = 'PAID';

		const n = await resolvePendingTransactions();
		expect(n).toBeGreaterThan(0);
		const txs = await getTransactions({ type: 'melt', status: 'confirmed' });
		expect(txs.some((t) => t.id === 'melt-reconcile-paid-4906')).toBe(true);
		expect(await getReservedProofs()).toEqual([]);
		expect((await getAllProofs()).find((p) => p.local_id === idP)?.spent).toBe(true);
	});

	it('(7b) reconcile release — terminal fail releases (legacy-timeout, pool intact)', async () => {
		await addProofs([makeProof('q1', 8)], MINT_URL, KEYSET_ID);
		const [idQ] = await localIdsOf(['q1']);
		await markReserved([idQ]);
		await addTransaction({
			id: 'melt-reconcile-fail-4906',
			type: 'melt',
			amount: 5,
			mint_url: MINT_URL,
			timestamp: Date.now() - 60 * 60 * 1000, // > 30-min legacy fallback
			token_hash: null,
			status: 'pending',
			protocol: 'lightning',
			fee: 0,
			proofIds: [idQ]
		});

		const n = await resolvePendingTransactions();
		expect(n).toBeGreaterThan(0);
		const txs = await getTransactions({ type: 'melt', status: 'failed' });
		expect(txs.some((t) => t.id === 'melt-reconcile-fail-4906')).toBe(true);
		expect(await getReservedProofs()).toEqual([]);
		expect((await getUnspentProofs())).toHaveLength(1);
		expect(await getTotalBalance()).toBe(8);
	});
});
