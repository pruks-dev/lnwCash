/**
 * TASK-1314 — S1 capture goldens (5 unblind points) + Alice MUST-verify aborts.
 *
 * S1: every wallet unblind point that sees a mint BlindSignature with a DLEQ
 * proof captures {e, s, r} into the stored proof — `r` being the REAL
 * blinding scalar the wallet used ( NEVER fabricated). This suite pins, per
 * capture point:
 *   - mint.ts          createOutputs/completeMint  → r == NUT-13 derivation
 *   - transfer.ts      sendTokens send-exact swap  → send portion r ==
 *       deterministicBlindingFactor(secret) (blindMessage fallback),
 *       change portion r == NUT-13 derivation
 *   - melt.ts          completeMelt change          → r == NUT-13 derivation
 *   - normalizeWiring  swapGroup (boundSwapFn)     → r == NUT-13 derivation
 *   - restore.ts       restoreBatch                → r == NUT-13 derivation
 * and the Alice MUST-verify aborts:
 *   - mint.ts:    tampered dleq.e in the response → DleqVerifyFailedError,
 *                 NOTHING stored, counter_k NOT advanced (11003 retry untouched)
 *   - transfer.ts: tampered dleq.e → DleqVerifyFailedError ESCAPES the swap
 *                 fall-back catch; the swap input stays UNspent locally.
 * dleq-less BlindSignatures continue unverified (spec: verify iff included).
 *
 * REAL crypto everywhere: blind.ts + dleq.ts + nut13.ts are NOT mocked. The
 * fake mint signs REAL chains via the deterministic harness (dleq-harness.ts).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.dleqcap.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/client', () => ({
	requestMintQuote: vi.fn(),
	checkMintQuote: vi.fn().mockResolvedValue({
		quote: 'q', request: 'lnbc…mock', paid: true, expiry: 9999999999, state: 'PAID'
	}),
	pollMintQuoteUntil: vi.fn(),
	mintTokens: vi.fn(),
	meltTokens: vi.fn(),
	requestMeltQuote: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'q', unit: 'sat', state: 'READY', paid: false, amount: 1, fee_reserve: 0, expiry: 9999999999
	}),
	restoreOutputs: vi.fn(),
	swapProofs: vi.fn(),
	checkState: vi.fn(),
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

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn().mockResolvedValue(true),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn().mockResolvedValue({
		nuts: ['04', '05', '08'], version: 'Nutshell/0.20.1', cached_at: Date.now()
	})
}));

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn((proofs: unknown) => JSON.stringify(proofs)), // capture-friendly stub
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn()
}));

import * as client from '../../cashu/client';
import { encodeToken } from '../../cashu/token';
import { getMintPubkey } from '../../cashu/keyset';
import { deterministicBlindingFactor } from '../../cashu/blind';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, getAllProofs } from '../proofsDb';
import { completeMint } from '../mint';
import { sendTokens } from '../transfer';
import { completeMelt } from '../melt';
import { boundSwapFn, cancelScheduledNormalize } from '../normalizeWiring';
import { restoreBatch } from '../restore';
import { setActiveSeed, clearActiveSeed, deriveSecretAndR } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { DleqVerifyFailedError } from '../../cashu/dleq';
import { createTestMint, buildCarolChainFromKeys, bigIntToHex32 } from './dleq-harness';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);

const mint = createTestMint('dleqcap');

function tamperLastHex(hex: string): string {
	const last = parseInt(hex[hex.length - 1], 16);
	const bumped = last === 15 ? 1 : last + 1;
	return hex.slice(0, -1) + bumped.toString(16);
}

/** shared fake-mint plumbing: A-provider + echo-mint mint/swap/melt/restore impls */
function armMint(): void {
	vi.mocked(getMintPubkey).mockReturnValue(mint.A);
	const signAll = (outs?: Array<{ id: string; amount: number; B_: string }>) =>
		(outs ?? []).map((o) => mint.blindSign(o));
	vi.mocked(client.mintTokens).mockImplementation(async (_u, _q, body) => ({
		signatures: signAll(body)
	}) as never);
	vi.mocked(client.swapProofs).mockImplementation(async (_u, _in, outs) => ({
		signatures: signAll(outs)
	}) as never);
	vi.mocked(client.meltTokens).mockImplementation(async (_u, _q, _in, outs) => ({
		paid: true,
		change: signAll(outs)
	}) as never);
	vi.mocked(client.restoreOutputs).mockImplementation(async (_u, outs) => ({
		signatures: signAll(outs)
	}) as never);
}

beforeEach(async () => {
	vi.clearAllMocks();
	localStorage.removeItem(STORAGE_KEY);
	await clearAllWalletData();
	await deleteProofDB();
	resetProofDB();
	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	setActiveSeed(seed);
	armMint();
});

afterEach(async () => {
	cancelScheduledNormalize(); // kill any lurking T2 debounce timer
	clearActiveSeed();
	clearAllCounters();
	await clearAllWalletData();
	await deleteProofDB();
	resetProofDB();
});

describe('TASK-1314: S1 capture goldens + Alice MUST-verify', () => {
	// ── mint.ts ──
	it('B1) mint.ts capture: real BlindSignature.dleq stored {e,s,r}; r == real NUT-13 derivation', async () => {
		setCounterK(KEYSET_ID, 0);
		await completeMint(MINT_URL, 'q1', 2, KEYSET_ID, false, seed);
		const stored = await getAllProofs();
		expect(stored).toHaveLength(2);
		for (let i = 0; i < 2; i++) {
			const { secret, r } = deriveSecretAndR(seed, KEYSET_ID, i);
			const withSecret = stored.find((p) => p.secret === secret);
			expect(withSecret).toBeDefined();
			expect(withSecret!.dleq).toBeDefined();
			expect(withSecret!.dleq!.r).toBe(bigIntToHex32(r));
			expect(withSecret!.dleq!.e.length).toBe(64);
			expect(withSecret!.dleq!.s.length).toBe(64);
			// the mint's wire e/s are exactly what this deterministic mint signs:
			const chain = buildCarolChainFromKeys(mint.privateKey, mint.A, 0, KEYSET_ID, secret, {
				rOverride: r, mintLabel: 'dleqcap'
			});
			expect(chain.proof.dleq!.e).toBe(withSecret!.dleq!.e);
			expect(chain.proof.dleq!.s).toBe(withSecret!.dleq!.s);
		}
	}, 15000);

	it('B2) mint.ts Alice-abort: tampered dleq.e → nothing stored, counter NOT advanced (retry loop untouched)', async () => {
		setCounterK(KEYSET_ID, 3);
		vi.mocked(client.mintTokens).mockImplementation(async (_u, _q, body) => {
			const sigs = ((body ?? []) as Array<{ amount: number; id: string; B_: string }>).map((o) => mint.blindSign(o));
			// tamper the FIRST signature's e:
			sigs[0] = { ...sigs[0], dleq: { ...sigs[0].dleq, e: tamperLastHex(sigs[0].dleq.e) } };
			return { signatures: sigs } as never;
		});

		// completeMint surfaces flow failures as {success:false} (MintCompleteResult)
		// — the DLEQ failure aborted BEFORE anything was stored:
		const outcome = await completeMint(MINT_URL, 'q2', 4, KEYSET_ID, false, seed);
		expect(outcome.success).toBe(false);
		expect(outcome.error).toMatch(/DLEQ verification FAILED/i);
		expect(outcome.proofs).toHaveLength(0);

		expect(await getAllProofs()).toHaveLength(0); // abort BEFORE storing
		expect(getCounterK(KEYSET_ID)).toBe(3);       // counter untouched
	}, 15000);

	it('B3) mint.ts without dleq attached → flow completes unverified (spec: verify iff included)', async () => {
		setCounterK(KEYSET_ID, 0);
		// Override with a dleq-LESS echo mint (Core vault shape from the old tests):
		vi.mocked(client.mintTokens).mockImplementation(async (_u, _q, body) => ({
			signatures: ((body ?? []) as Array<{ amount: number; id: string; B_: string }>).map((o) => {
				const sig = mint.blindSign(o);
				return { id: sig.id, amount: sig.amount, C_: sig.C_ }; // dleq dropped
			})
		}) as never);
		await completeMint(MINT_URL, 'q3', 8, KEYSET_ID, false, seed);
		const stored = await getAllProofs();
		expect(stored).toHaveLength(4); // completeSet(8) = [1,1,2,4] — 4 dleq-less proofs
		expect(stored.every((p) => p.dleq === undefined)).toBe(true);
	}, 15000);

	// ── transfer.ts (send-exact swap) ──
	it('B4) transfer.ts capture: SEND portion r == deterministicBlindingFactor(secret); CHANGE portion r == NUT-13 derivation', async () => {
		setCounterK(KEYSET_ID, 0);
		// a real transferable coin: one 16-sat proof (real chain, Carol-verifyable)
		const coin = buildCarolChainFromKeys(mint.privateKey, mint.A, 16, KEYSET_ID, 'asset16');
		const { addProofs } = await import('../proofsDb');
		await addProofs([coin.proof], MINT_URL, KEYSET_ID);

		await sendTokens(12, MINT_URL); // excess 4 → swap: send decompose(12)=[8,4] + change [4]

		// SEND portion — the proofs encoded into the token encodeToken capture:
		const sentArgs = vi.mocked(encodeToken).mock.calls.at(-1);
		expect(sentArgs).toBeDefined();
		const sentProofs = sentArgs![0] as TokenProof[];
		expect(sentProofs).toHaveLength(2);
		for (const p of sentProofs) {
			expect(p.dleq).toBeDefined();
			expect(p.dleq!.r).toBe(bigIntToHex32(deterministicBlindingFactor(p.secret)));
		}

		// CHANGE portion — NUT-08 change = completeSet(4) = [1,1,2] (3 proofs),
		// counters 0/1/2, stored with REAL r:
		const stored = await getAllProofs();
		const changeProofs = stored.filter((p) => p.secret !== 'asset16');
		expect(changeProofs).toHaveLength(3);
		const derivedChange = [0, 1, 2].map((c) => deriveSecretAndR(seed, KEYSET_ID, c));
		expect(changeProofs.map((p) => p.secret).sort())
			.toEqual(derivedChange.map((d) => d.secret).sort());
		for (const d of derivedChange) {
			const match = changeProofs.find((p) => p.secret === d.secret)!;
			expect(match.dleq).toBeDefined();
			expect(match.dleq!.r).toBe(bigIntToHex32(d.r));
		}
	}, 15000);

	it('B5) transfer.ts Alice-abort: tampered swap dleq.e ESCAPES the fall-back catch; input stays unspent', async () => {
		setCounterK(KEYSET_ID, 0);
		const coin = buildCarolChainFromKeys(mint.privateKey, mint.A, 16, KEYSET_ID, 'asset16');
		const { addProofs } = await import('../proofsDb');
		await addProofs([coin.proof], MINT_URL, KEYSET_ID);

		vi.mocked(client.swapProofs).mockImplementation(async (_u, _inputs, outputs) => {
			const sigs = ((outputs ?? []) as Array<{ id: string; amount: number; B_: string }>).map((o) => mint.blindSign(o));
			sigs[0] = { ...sigs[0], dleq: { ...sigs[0].dleq, e: tamperLastHex(sigs[0].dleq.e) } };
			return { signatures: sigs } as never;
		});

		await expect(sendTokens(12, MINT_URL)).rejects.toBeInstanceOf(DleqVerifyFailedError);

		// the swap input was NOT marked spent locally (markSpent never ran)
		const still = await getAllProofs();
		expect(still.map((p) => p.spent)).toEqual([false]);
	}, 15000);

	// ── melt.ts (change capture + privacy input bodies) ──
	it('B6) melt.ts change capture: change proof carries {e,s,r} (r == real NUT-13 derivation) + postMelt inputs carry NO dleq', async () => {
		setCounterK(KEYSET_ID, 9);
		// inputs 2 sats melting 1 → NUT-08 change 1 → ONE blank output:
		await completeMelt(
			MINT_URL,
			'm1',
			[{ local_id: 'melt-in', amount: 2, id: KEYSET_ID, secret: 'melt-secret', C: '03' + '77'.repeat(32) }],
			'lnbc…mock',
			1,
			0
		);
		const stored = await getAllProofs();
		expect(stored).toHaveLength(1);
		const derivedChange = deriveSecretAndR(seed, KEYSET_ID, 9);
		expect(stored[0].secret).toBe(derivedChange.secret);
		expect(stored[0].dleq).toBeDefined();
		expect(stored[0].dleq!.r).toBe(bigIntToHex32(derivedChange.r));

		// ── PRIVACY (NUT-12): the melt INPUT bodies (postMelt arg #3) are the
		// melt serialize point — field-wise pick, dleq GONE:
		const meltArgs = vi.mocked(client.meltTokens).mock.calls[0];
		expect(meltArgs).toBeDefined();
		const sentInputs = meltArgs![2] as Array<Record<string, string>>;
		expect(sentInputs.length).toBeGreaterThan(0);
		for (const inp of sentInputs) {
			expect(Object.keys(inp).sort()).toEqual(['C', 'amount', 'id', 'secret']);
		}
	}, 15000);

	// ── normalizeWiring.ts (swapGroup via boundSwapFn) ──
	it('B7) normalize capture: swap outputs carry {e,s,r}; r == real NUT-13 derivation', async () => {
		setCounterK(KEYSET_ID, 7);
		// a small pile: two proofs 1 + 2 = 3 sats (real chains)
		const chains = [
			buildCarolChainFromKeys(mint.privateKey, mint.A, 1, KEYSET_ID, 'pile1'),
			buildCarolChainFromKeys(mint.privateKey, mint.A, 2, KEYSET_ID, 'pile2')
		];
		const { addProofs } = await import('../proofsDb');
		await addProofs(chains.map((c) => c.proof), MINT_URL, KEYSET_ID);
		const pile = await getAllProofs();

		await boundSwapFn(pile, [1, 2]);

		const stored = await getAllProofs();
		const newOnes = stored.filter((p) => !chains.some((c) => c.proof.secret === p.secret));
		expect(newOnes).toHaveLength(2);
		const derived = [7, 8].map((c) => deriveSecretAndR(seed, KEYSET_ID, c));
		expect(newOnes.map((p) => p.secret).sort()).toEqual(derived.map((d) => d.secret).sort());
		for (const d of derived) {
			const match = newOnes.find((p) => p.secret === d.secret)!;
			expect(match.dleq).toBeDefined();
			expect(match.dleq!.r).toBe(bigIntToHex32(d.r));
		}

		// ── PRIVACY (NUT-12): the normalize swap INPUT bodies (swapProofs arg #2)
		// are field-wise picked — dleq GONE even though the pile proofs carry it:
		const swapArgs = vi.mocked(client.swapProofs).mock.calls[0];
		expect(swapArgs).toBeDefined();
		const swapInputs = swapArgs![1] as Array<Record<string, string>>;
		for (const inp of swapInputs) {
			expect(Object.keys(inp).sort()).toEqual(['C', 'amount', 'id', 'secret']);
		}
	}, 15000);

	// ── restore.ts ──
	it('B8) restore.ts capture: restored proofs carry {e,s,r}; r == real NUT-13 derivation', async () => {
		setCounterK(KEYSET_ID, 0);
		const { proofs } = await restoreBatch(MINT_URL, seed, KEYSET_ID, 0, 2);
		expect(proofs).toHaveLength(2);
		for (let i = 0; i < 2; i++) {
			const derived = deriveSecretAndR(seed, KEYSET_ID, i);
			const match = proofs.find((p) => p.secret === derived.secret)!;
			expect(match.dleq).toBeDefined();
			expect(match.dleq!.r).toBe(bigIntToHex32(derived.r));
		}
	}, 15000);
});
