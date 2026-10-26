/**
 * TASK-4206 (INTENT-042 rev7) — receive swap fee-aware (B-4201-01).
 *
 * Root cause (commander): receiving a 10 sat token → mint answers
 * 400 error 11005 expected_fee 1 (Inputs 10 Outputs 10) — outputs summed
 * to the full total without deducting the fee.
 *
 * Acceptance (scoped, file-only — L-P033):
 * 1. fee-charging keyset (ppk=2, single 10 sat proof → NUT-02 fee 1):
 *    swap succeeds with outputs = completeSet(10-1) = completeSet(9);
 *    result.amount == 9; mint stub enforces sum(inputs)-fee == sum(outputs)
 *    with 11005 on violation (the old full-total outputs would fail it).
 * 2. zero-fee keyset (ppk=0): behavior unchanged — outputs completeSet(10).
 * 3. edge total<=fee (1 sat vs fee 1): rejects with a human message BEFORE
 *    any derive/blind/swap (swapProofs never called, counter 0, DB empty).
 * 4. mixed keysets: fee sums per-input ppk (600+500=1100 → fee 2) —
 *    outputs completeSet(8).
 *
 * Formula (NUT-02 §Fees, the mint's own rule): fee = floor((Σ ppk + 999)/1000)
 * over the ACTUAL input proofs, each indexed by its own keyset. Integer
 * math only. The mint's 11005 expected_fee is computed from this exact
 * formula, so matching it is what makes the swap pass.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, KEYSET_B, MNEMONIC, isOnlineRef } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.4206.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	KEYSET_B: '012fbb01a4e200c76df911eeba3b8fe1831202914b24664f4bccbd25852a6708f8',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble',
	isOnlineRef: { value: true }
}));

vi.mock('../../lib/cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn()
}));

vi.mock('../../lib/cashu/client', () => ({
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

vi.mock('../../lib/cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([]),
	getKeysetById: vi.fn(),
	getAllKeysets: vi.fn(() => []),
	rotateKeysets: vi.fn(),
	isCacheStale: vi.fn(() => false),
	clearCache: vi.fn(),
	getMintPubkey: vi.fn(() => null),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

vi.mock('../../lib/wallet/normalizeWiring', () => ({
	isWalletOnline: vi.fn(() => isOnlineRef.value),
	scheduleNormalizeAfterReceiveOnline: vi.fn(),
	scheduleNormalizeAfterMint: vi.fn(),
	flushPendingNormalizeOnBackOnline: vi.fn(),
	cancelScheduledNormalize: vi.fn(),
	normalizePileNow: vi.fn()
}));

vi.mock('../../lib/offline-indicator', () => ({
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
	onOnlineConfirmed: vi.fn(() => () => {}),
	setPendingPileReader: vi.fn(),
	setProbeTargets: vi.fn(),
	wasOffline: vi.fn(() => false),
	resetWasOffline: vi.fn(() => false),
	trackWasOffline: vi.fn(() => () => {})
}));

vi.mock('../../lib/wallet/discovery', () => ({
	discoverMintEndpoints: vi.fn(),
	isMintReachable: vi.fn(async () => true)
}));

vi.mock('../../lib/wallet/mint-validation', () => ({
	validateMintUrl: vi.fn()
}));

import * as client from '../../lib/cashu/client';
import { decodeToken } from '../../lib/cashu/token';
import { getKeysetById } from '../../lib/cashu/keyset';
import { discoverMintEndpoints } from '../../lib/wallet/discovery';
import { validateMintUrl } from '../../lib/wallet/mint-validation';
import { setMintConfig, clearMintConfigs } from '../../lib/wallet/store';
import { receiveTokens } from '../../lib/wallet/tokenStore';
import { TokenValidationError } from '../../lib/wallet/errors';
import { createWallet, unlockWallet } from '../../lib/wallet/state';
import { clearAllWalletData } from '../../lib/wallet/storage';
import { deleteProofDB, resetProofDB, getAllProofs } from '../../lib/wallet/proofsDb';
import { setActiveSeed, clearActiveSeed } from '../../lib/wallet/nut13';
import { mnemonicToSeed } from '../../lib/wallet/keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../../lib/wallet/counterK';
import { completeSet } from '../../lib/wallet/completeSet';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);

const FULL_CONFIG = {
	url: MINT_URL,
	name: 'Mint 4206',
	pubkey: '03' + 'ab'.repeat(32),
	version: 'Nutshell/0.20.1',
	supported_nuts: ['04', '05'],
	cached_endpoints: [],
	ttl: 0,
	last_info_fetch: Date.now()
};

/** ppk table for getKeysetById: keyset id → input_fee_ppk. */
function setPpkTable(table: Record<string, number>): void {
	vi.mocked(getKeysetById).mockImplementation((mintUrl: string, id: string) => {
		if (mintUrl !== MINT_URL) return null;
		if (!(id in table)) return null;
		return { id, unit: 'sat', active: true, input_fee_ppk: table[id], keys: {}, last_updated: Date.now() };
	});
}

function setDecoded(proofs: Array<{ id: string; amount: number }>): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: proofs.map((p, i) => ({
			id: p.id,
			amount: p.amount,
			secret: `old4206-${p.id.slice(0, 4)}-${i}`,
			C: 'C-old4206-' + i
		}))
	} as never);
}

/**
 * Spec-faithful mint stub (NUT-03): enforces
 * sum(inputs) - fee == sum(outputs) with fee = floor((Σ ppk + 999)/1000)
 * from the SAME ppk table the wallet reads. Violations throw a 11005
 * shaped like the real mint's "expected_fee" reject (the commander's
 * `Inputs 10 Outputs 10` failure); compliant swaps echo signatures.
 */
function mintEnforcesFee(table: Record<string, number>): void {
	vi.mocked(client.swapProofs).mockImplementation(
		async (
			_url: string,
			inputs: Array<{ amount: number; id: string }>,
			outputs?: Array<{ id: string; amount: number; B_: string }>
		) => {
			const inSum = inputs.reduce((s, p) => s + p.amount, 0);
			const ppkSum = inputs.reduce((s, p) => s + (table[p.id] ?? 0), 0);
			const fee = Math.floor((ppkSum + 999) / 1000);
			const outSum = (outputs ?? []).reduce((s, o) => s + o.amount, 0);
			if (inSum - fee !== outSum) {
				const err = new Error(
					`HTTP 400 (11005): transaction fee is too low: expected_fee ${fee} (Inputs ${inSum} Outputs ${outSum})`
				);
				(err as unknown as Record<string, unknown>).code = 11005;
				(err as unknown as Record<string, unknown>).status = 400;
				throw err;
			}
			return {
				signatures: (outputs ?? []).map((o) => ({ id: o.id, amount: o.amount, C_: '02' + 'a1'.repeat(32) }))
			};
		}
	);
}

describe('TASK-4206: fee-aware receive swap', () => {
	beforeEach(async () => {
		isOnlineRef.value = true;
		vi.clearAllMocks();
		clearMintConfigs();
		localStorage.clear();
		localStorage.removeItem(STORAGE_KEY);
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
		// 4201 ensure runs after success — unknown mint would hit network
		// without these; keep success-path hermetic (not under test here).
		vi.mocked(discoverMintEndpoints).mockResolvedValue({
			success: true,
			config: { ...FULL_CONFIG },
			resolvedPaths: {},
			wasRefreshed: true
		});
		vi.mocked(validateMintUrl).mockResolvedValue({
			success: true,
			config: { ...FULL_CONFIG },
			nuts: ['04', '05']
		});
		setMintConfig({ ...FULL_CONFIG });
	});

	afterEach(async () => {
		isOnlineRef.value = true;
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		clearMintConfigs();
		localStorage.clear();
	});

	it('commander repro: 10 sat single proof, ppk=2 → fee 1 → outputs completeSet(9), amount 9', async () => {
		setPpkTable({ [KEYSET_ID]: 2 });
		mintEnforcesFee({ [KEYSET_ID]: 2 });
		setDecoded([{ id: KEYSET_ID, amount: 10 }]);

		const result = await receiveTokens('cashuA4206-repro');

		// The old code submitted outputs summing to 10 → the stub (like the
		// real mint) would 11005. Fee-aware outputs sum to 9 and pass.
		const swapCall = vi.mocked(client.swapProofs).mock.calls[0];
		const submitted = swapCall[2] as Array<{ amount: number }>;
		const outSum = submitted.reduce((s, o) => s + o.amount, 0);
		expect(outSum).toBe(9);
		expect(submitted.map((o) => o.amount).sort((a, b) => a - b))
			.toEqual([...completeSet(9)].sort((a, b) => a - b));

		expect(result.amount).toBe(9);
		expect(result.proofCount).toBe(completeSet(9).length);

		// Counter advanced by outputs signed (5), not inputs (1):
		expect(getCounterK(KEYSET_ID)).toBe(completeSet(9).length);
		const stored = await getAllProofs();
		expect(stored.reduce((s, p) => s + p.amount, 0)).toBe(9);
	}, 15000);

	it('zero-fee keyset (ppk=0): unchanged — outputs completeSet(10), amount 10', async () => {
		setPpkTable({ [KEYSET_ID]: 0 });
		mintEnforcesFee({ [KEYSET_ID]: 0 });
		setDecoded([{ id: KEYSET_ID, amount: 10 }]);

		const result = await receiveTokens('cashuA4206-zerofee');

		const swapCall = vi.mocked(client.swapProofs).mock.calls[0];
		const submitted = swapCall[2] as Array<{ amount: number }>;
		expect(submitted.reduce((s, o) => s + o.amount, 0)).toBe(10);
		expect(submitted.map((o) => o.amount).sort((a, b) => a - b))
			.toEqual([...completeSet(10)].sort((a, b) => a - b));
		expect(result.amount).toBe(10);
		expect(getCounterK(KEYSET_ID)).toBe(completeSet(10).length);
	}, 15000);

	it('edge total<=fee: 1 sat vs fee 1 → human reject BEFORE swap (no wasted swap)', async () => {
		setPpkTable({ [KEYSET_ID]: 1000 });
		mintEnforcesFee({ [KEYSET_ID]: 1000 });
		setDecoded([{ id: KEYSET_ID, amount: 1 }]);

		let caught: unknown;
		try {
			await receiveTokens('cashuA4206-short');
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(TokenValidationError);
		expect((caught as Error).message).toMatch(/swap fee|ค่าธรรมเนียม/);

		// No wasted swap, counter untouched, nothing stored:
		expect(vi.mocked(client.swapProofs)).not.toHaveBeenCalled();
		expect(getCounterK(KEYSET_ID)).toBe(0);
		expect(await getAllProofs()).toHaveLength(0);
	}, 15000);

	it('mixed keysets: per-input ppk 600+500=1100 → fee 2 → outputs completeSet(8)', async () => {
		setPpkTable({ [KEYSET_ID]: 600, [KEYSET_B]: 500 });
		mintEnforcesFee({ [KEYSET_ID]: 600, [KEYSET_B]: 500 });
		setDecoded([
			{ id: KEYSET_ID, amount: 6 },
			{ id: KEYSET_B, amount: 4 }
		]);

		const result = await receiveTokens('cashuA4206-mixed');

		const swapCall = vi.mocked(client.swapProofs).mock.calls[0];
		const submitted = swapCall[2] as Array<{ amount: number }>;
		expect(submitted.reduce((s, o) => s + o.amount, 0)).toBe(8);
		expect(submitted.map((o) => o.amount).sort((a, b) => a - b))
			.toEqual([...completeSet(8)].sort((a, b) => a - b));
		expect(result.amount).toBe(8);
	}, 15000);
});
