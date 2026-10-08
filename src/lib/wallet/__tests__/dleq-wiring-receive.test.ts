/**
 * TASK-1314 (INTENT-013) — P1/S4 receive gate wiring tests.
 *
 * The gate lives in ONE choke point: receiveProofsPassthrough (tokenStore.ts)
 * — the same function both the OFFLINE gate branch and the D3 network-error
 * fallback call (1309 contract — no drift). After this task the passthrough
 * is no longer "silently store anything": every proof MUST carry a complete
 * DLEQ proof {e, s, r} (S4: dleq-less = ปฏิเสธรับ), A must be resolvable from
 * the keyset cache, and verifyDleqCarol must PASS — otherwise the whole token
 * is rejected (nothing stored, nothing recorded).
 *
 * The ONLINE swap receive path is exercised too (r7) to prove the P2 line
 * stays untouched: proofs are passed to swapProofs VERBATIM (idle dleq),
 * stored proofs capture {e,s,r} (S1), no gate, no pending flag.
 *
 * Mock graph: client (transport classes), keyset (A provider), token
 * (decodeToken), normalizeWiring (isWalletOnline controllable), store,
 * offline-indicator (notifySuspectOffline as a spy — the real detector is
 * NOT touched in this suite; probe-flight behavior is owned by
 * detector-flush-flight / receive-d3-fallback suites).
 *
 * ALL DLEQ chains in this suite are REAL: blind.ts + dleq.ts are real, the
 * fake mint signs with real secp256k1 math (see dleq-harness.ts).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC, isOnlineRef } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.dleqwire.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	isOnlineRef: { value: true }
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

// The passthrough gate needs A from the keyset cache — controllable mock:
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

// Controllable online-ness (the wiring calls isWalletOnline)
vi.mock('../normalizeWiring', () => ({
	isWalletOnline: vi.fn(() => isOnlineRef.value),
	scheduleNormalizeAfterReceiveOnline: vi.fn(),
	scheduleNormalizeAfterMint: vi.fn(),
	flushPendingNormalizeOnBackOnline: vi.fn(),
	cancelScheduledNormalize: vi.fn(),
	normalizePileNow: vi.fn()
}));

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn()
}));

// notifySuspectOffline as a spy — the real detector singleton must stay cold here
vi.mock('../../offline-indicator', () => ({
	notifySuspectOffline: vi.fn(),
	getDetectorStatus: vi.fn(() => ({
		state: isOnlineRef.value ? 'online' : 'offline',
		online: isOnlineRef.value,
		suspect: false,
		probing: false,
		bootWired: true,
		targets: [],
		probeCount: 0,
		lastProbeAt: 0,
		lastResult: null
	})),
	isOnline: vi.fn(() => isOnlineRef.value),
	onConnectivityChange: vi.fn(() => () => {}),
	// TASK-1402: dual-rail binding (module-init) needs both EVENT API
	// entries on the mocked detector surface (no-op stubs — the rail
	// behavior itself is proven in flush-binding-1402.test.ts).
	onOnlineConfirmed: vi.fn(() => () => {}),
	setPendingPileReader: vi.fn(),
	setProbeTargets: vi.fn(),
	wasOffline: vi.fn(() => false),
	resetWasOffline: vi.fn(),
	trackWasOffline: vi.fn(() => () => {})
}));

import * as client from '../../cashu/client';
import { decodeToken } from '../../cashu/token';
import { getMintPubkey } from '../../cashu/keyset';
import {
	createWallet, unlockWallet
} from '../state';
import { clearAllWalletData } from '../storage';
import {
	deleteProofDB, resetProofDB, getAllProofs, getPendingNormalizeProofs
} from '../proofsDb';
import { receiveTokens } from '../tokenStore';
import { setActiveSeed, clearActiveSeed, deriveSecretAndR } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, setCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { getTransactions, clearTransactions } from '../../storage/db';
import { notifySuspectOffline } from '../../offline-indicator';
import { TokenValidationError } from '../errors';
import { createTestMint, buildCarolChain, bigIntToHex32 } from './dleq-harness';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);

// The test mint: REAL DLEQ signing with a deterministic private key
const mint = createTestMint('dleqwire');

/** Real Carol-verifyable chains for the given amounts (deterministic). */
function chainsFor(amounts: number[]): TokenProof[] {
	return amounts.map((amount, i) =>
		buildCarolChain(mint, amount, KEYSET_ID, `rcv${i}-dleqwire`).proof
	);
}

/** Last-hex-digit tamper (deterministic — no RNG). */
function tamperLastHex(hex: string): string {
	const last = parseInt(hex[hex.length - 1], 16);
	const bumped = last === 15 ? 1 : last + 1;
	return hex.slice(0, -1) + bumped.toString(16);
}

function mockDecode(proofs: TokenProof[]): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs
	} as never);
}

describe('TASK-1314: P1/S4 receive gate (offline + D3 fallback choke point)', () => {
	beforeEach(async () => {
		isOnlineRef.value = false; // offline by default — the P1 gate path
		vi.clearAllMocks();
		localStorage.removeItem(STORAGE_KEY);
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		await clearTransactions(); // F-088 tx records are NOT in clearAllWalletData — clear explicitly
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
		vi.mocked(getMintPubkey).mockReturnValue(mint.A);
	});

	afterEach(async () => {
		isOnlineRef.value = true;
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await clearTransactions();
		await deleteProofDB();
		resetProofDB();
	});

	it('r1) offline + valid DLEQ chain → stored 1:1 with COMPLETE {e,s,r} + pending + record', async () => {
		mockDecode(chainsFor([3, 2]));
		const result = await receiveTokens('cashuAdummy');

		expect(result.proofCount).toBe(2);
		expect(result.amount).toBe(5);
		expect(result.dleqCount).toBe(2); // every proof carries the complete proof

		const stored = await getAllProofs();
		expect(stored.map((p) => p.amount).sort((a, b) => a - b)).toEqual([2, 3]);
		// S1 — stored proofs carry the COMPLETE dleq {e,s,r} (non-orphaned field):
		expect(stored.every((p) =>
			p.dleq && typeof p.dleq.e === 'string' && p.dleq.e.length === 64
			&& typeof p.dleq.s === 'string' && p.dleq.s.length === 64
			&& typeof p.dleq.r === 'string' && p.dleq.r.length === 64
		)).toBe(true);
		expect(stored.every((p) => 'orphaned' in p ? !p.orphaned : true)).toBe(true);

		// pending_normalize flag armed (1309 contract kept)
		expect(stored.every((p) => p.pending_normalize === true)).toBe(true);
		expect(await getPendingNormalizeProofs()).toHaveLength(2);

		// counter untouched + transaction recorded
		expect(getCounterK(KEYSET_ID)).toBe(0);
		const txs = await getTransactions();
		expect(txs).toHaveLength(1);
		expect(txs[0].type).toBe('cashu_receive');
	}, 15000);

	it('r2) offline + tampered dleq.e → tokenize rejected WHOLE: nothing stored, nothing recorded', async () => {
		const chains = chainsFor([3, 2]);
		(chains[1].dleq!).e = tamperLastHex((chains[1].dleq!).e);
		mockDecode(chains);

		await expect(receiveTokens('cashuAdummy')).rejects.toBeInstanceOf(TokenValidationError);

		expect(await getAllProofs()).toHaveLength(0); // ตีทิ้ง — ไม่ addProofs
		expect(await getPendingNormalizeProofs()).toHaveLength(0);
		const txs = await getTransactions();
		expect(txs.filter((t) => t.type === 'cashu_receive')).toHaveLength(0); // ไม่ record
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect(vi.mocked(client.swapProofs).mock.calls).toHaveLength(0); // mint never touched
	}, 15000);

	it('r3) offline + proof WITHOUT dleq → S4 reject (ปฏิเสธรับ), nothing stored', async () => {
		mockDecode([{ id: KEYSET_ID, amount: 2, secret: 'rcv0-dleqwire', C: '02' + 'dd'.repeat(32) }]);
		await expect(receiveTokens('cashuAdummy')).rejects.toThrow(/S4|no complete DLEQ proof/i);
		expect(await getAllProofs()).toHaveLength(0);
	}, 15000);

	it('r4) offline + dleq {e,s} WITHOUT r → reject (cannot reconstruct B\'/C\')', async () => {
		const chains = chainsFor([2]);
		delete (chains[0].dleq!).r;
		mockDecode(chains);
		await expect(receiveTokens('cashuAdummy')).rejects.toThrow(/no complete DLEQ proof/i);
		expect(await getAllProofs()).toHaveLength(0);
	}, 15000);

	it('r5) offline + EMPTY keyset cache (no A) → reject — cannot verify, refuses receive', async () => {
		vi.mocked(getMintPubkey).mockReturnValue(undefined as never);
		mockDecode(chainsFor([2]));
		await expect(receiveTokens('cashuAdummy')).rejects.toThrow(/no denomination key|keyset cache/i);
		expect(await getAllProofs()).toHaveLength(0);
	}, 15000);

	it('r6) D3 fallback route: online → swap transport dies → passthrough gate STILL enforces (single choke)', async () => {
		isOnlineRef.value = true; // online — but the swap transport dies ∀
		vi.mocked(client.swapProofs).mockImplementation(() => {
			const E = (client as unknown as Record<string, new (...args: unknown[]) => Error>)
				.MintUnreachableError;
			throw new E(`Mint unreachable: ${MINT_URL}`);
		});

		// (a) tampered input → fallback gate REJECTS (nothing stored),
		//     notifySuspectOffline fired BEFORE the passthrough throws:
		const chainsBad = chainsFor([2]);
		(chainsBad[0].dleq!).s = tamperLastHex((chainsBad[0].dleq!).s);
		mockDecode(chainsBad);
		await expect(receiveTokens('cashuAdummy')).rejects.toThrow(/DLEQ Carol-verification FAILED/i);
		expect(notifySuspectOffline).toHaveBeenCalledTimes(1);
		expect(await getAllProofs()).toHaveLength(0);

		// (b) valid input → the fallback stores (transport-dead but DLEQ-live)
		mockDecode(chainsFor([3, 2]));
		const result = await receiveTokens('cashuAdummy');
		expect(result.proofCount).toBe(2);
		expect(notifySuspectOffline).toHaveBeenCalledTimes(2);
		await Promise.resolve();
		const stored = await getAllProofs();
		expect(stored.every((p) => p.pending_normalize === true)).toBe(true);
	}, 15000);

	it('r7) ONLINE receive: proofs passed to swap VERBATIM (P2 — gate idle) + captured dleq {e,s,r} (S1 golden, real derivation)', async () => {
		isOnlineRef.value = true;
		setCounterK(KEYSET_ID, 4); // live band → deriveSecretAndR reachable
		const inputChains = chainsFor([3, 2]);
		mockDecode(inputChains);

		// The mocked mint signs the DERIVED outputs with a REAL DLEQ chain:
		vi.mocked(client.swapProofs).mockImplementation(async (_u: string, _inputs: unknown,
			outputs?: Array<{ id: string; amount: number; B_: string }>) => {
			return { signatures: (outputs ?? []).map((o) => mint.blindSign(o)) };
		});

		const result = await receiveTokens('cashuAdummy');
		expect(result.proofCount).toBe(4);

		// P2 proof: the swap inputs carried the dleq-bearing proofs VERBATIM
		// (the online line is untouched — payload stripping is structural at
		// the client serialize point and pinned in dleq-privacy-payload.test.ts):
		const swapArgs = vi.mocked(client.swapProofs).mock.calls[0];
		const inputs = swapArgs[1] as TokenProof[];
		expect(inputs.every((p) => p.dleq && p.dleq.r && p.dleq.e && p.dleq.s)).toBe(true);
		expect(inputs.map((p) => p.secret).sort()).toEqual(['rcv0-dleqwire', 'rcv1-dleqwire']);

		// S1 golden — captured r == the REAL NUT-13 derivation for deriveSecretAndR:
		const stored = await getAllProofs();
		expect(stored).toHaveLength(4);
		expect(stored.every((p) => p.pending_normalize !== true)).toBe(true); // online path — no flag
		const derivedRs = [4, 5, 6, 7].map((c) => bigIntToHex32(deriveSecretAndR(seed, KEYSET_ID, c).r));
		const storedRs = stored.map((p) => p.dleq!.r).sort();
		expect(storedRs).toEqual([...derivedRs].sort());
	}, 15000);
});
