/**
 * TASK-4201 (INTENT-042 BLUEPRINT-042 v2) — auto-add unknown mint after receive success.
 *
 * Acceptance (scoped, file-only — L-P033):
 * 1. known mint (getMintConfig != undefined) → skip discover/validate, no extra write.
 * 2. unknown mint online swap success → discover+validate → setMintConfig(full).
 * 3. unknown mint discover+validate fail → placeholder set, money still returned (never throws).
 * 4. offline passthrough success (unknown) → ensure runs, money returned, config present.
 *
 * Reuse only: real store.ts + real config.ts, mocked discovery.ts:103 /
 * mint-validation.ts:14 (network surface), mocked cashu client/token/keyset,
 * controllable isWalletOnline. No melt/swap-derive/passthrough/dleq/seed/counter
 * logic touched — this suite only observes post-success side effects.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC, isOnlineRef } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.4201.test',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
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
	resetWasOffline: vi.fn(),
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
import { getMintPubkey } from '../../lib/cashu/keyset';
import { discoverMintEndpoints } from '../../lib/wallet/discovery';
import { validateMintUrl } from '../../lib/wallet/mint-validation';
import { getMintConfig, setMintConfig, clearMintConfigs } from '../../lib/wallet/store';
import { receiveTokens } from '../../lib/wallet/tokenStore';
import { createWallet, unlockWallet } from '../../lib/wallet/state';
import { clearAllWalletData } from '../../lib/wallet/storage';
import { deleteProofDB, resetProofDB, getAllProofs } from '../../lib/wallet/proofsDb';
import { setActiveSeed, clearActiveSeed } from '../../lib/wallet/nut13';
import { mnemonicToSeed } from '../../lib/wallet/keys';
import { clearAllCounters, STORAGE_KEY } from '../../lib/wallet/counterK';
import { createTestMint, buildCarolChain } from '../../lib/wallet/__tests__/dleq-harness';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const seed = mnemonicToSeed(MNEMONIC);
const TEST_MINT = createTestMint('t4201');

const FULL_CONFIG = {
	url: MINT_URL,
	name: 'Mint 4201',
	pubkey: '03' + 'ab'.repeat(32),
	version: 'Nutshell/0.20.1',
	supported_nuts: ['04', '05'],
	cached_endpoints: [],
	ttl: 0,
	last_info_fetch: Date.now()
};

function mockOnlineDecode(amounts: number[]): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: amounts.map((amount, i) => ({
			id: KEYSET_ID,
			amount,
			secret: `old4201-${i}`,
			C: 'C-old4201-' + i
		}))
	} as never);
}

function mockOfflineDecode(amounts: number[]): void {
	vi.mocked(decodeToken).mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: amounts.map((a, i) => buildCarolChain(TEST_MINT, a, KEYSET_ID, `off4201-${i}`).proof)
	} as never);
	vi.mocked(getMintPubkey).mockReturnValue(TEST_MINT.A);
}

function echoSwap(): void {
	vi.mocked(client.swapProofs).mockImplementation(
		async (_url: string, _inputs: unknown, outputs?: Array<{ id: string; amount: number; B_: string }>) => ({
			signatures: (outputs ?? []).map((o) => ({ id: o.id, amount: o.amount, C_: '02' + 'a1'.repeat(32) }))
		})
	);
}

describe('TASK-4201: auto-add unknown mint after receive success', () => {
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
		echoSwap();
		// default: unknown mint, discovery+validation succeed with FULL config
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

	it('known mint → skip discover/validate (no extra write)', async () => {
		setMintConfig({ ...FULL_CONFIG });
		vi.clearAllMocks();
		mockOnlineDecode([3, 2]);

		const result = await receiveTokens('cashuA4201-known');
		expect(result.amount).toBe(5);
		expect(vi.mocked(discoverMintEndpoints)).not.toHaveBeenCalled();
		expect(vi.mocked(validateMintUrl)).not.toHaveBeenCalled();
		// config untouched (still the known full config)
		expect(getMintConfig(MINT_URL)?.name).toBe('Mint 4201');
		expect((await getAllProofs()).length).toBeGreaterThan(0);
	}, 15000);

	it('unknown mint online swap success → discover+validate → setMintConfig(full)', async () => {
		expect(getMintConfig(MINT_URL)).toBeUndefined();
		mockOnlineDecode([3, 2]);

		const result = await receiveTokens('cashuA4201-unknown');
		expect(result.amount).toBe(5);
		expect(vi.mocked(discoverMintEndpoints)).toHaveBeenCalledWith(MINT_URL);
		expect(vi.mocked(validateMintUrl)).toHaveBeenCalledWith(MINT_URL);
		const stored = getMintConfig(MINT_URL);
		expect(stored).toBeDefined();
		expect(stored?.name).toBe('Mint 4201');
	}, 15000);

	it('unknown mint discover+validate fail → placeholder, money still returned (never throws)', async () => {
		expect(getMintConfig(MINT_URL)).toBeUndefined();
		vi.mocked(discoverMintEndpoints).mockResolvedValue({
			success: false,
			config: { url: MINT_URL, name: '', pubkey: '', version: '', supported_nuts: [], cached_endpoints: [], ttl: 0, last_info_fetch: 0 },
			resolvedPaths: {},
			wasRefreshed: false,
			error: 'unreachable'
		});
		vi.mocked(validateMintUrl).mockResolvedValue({ success: false, error: 'unreachable' });
		mockOnlineDecode([1, 2]);

		const result = await receiveTokens('cashuA4201-fail');
		expect(result.amount).toBe(3);
		expect(result.proofCount).toBeGreaterThan(0);
		// fallback placeholder present (fail → placeholder, not missing)
		const stored = getMintConfig(MINT_URL);
		expect(stored).toBeDefined();
		expect(stored?.url).toBe(MINT_URL);
	}, 15000);

	it('offline passthrough success (unknown) → ensure runs, money returned, config present', async () => {
		isOnlineRef.value = false;
		expect(getMintConfig(MINT_URL)).toBeUndefined();
		mockOfflineDecode([3, 2]);

		const result = await receiveTokens('cashuA4201-offline');
		expect(result.amount).toBe(5);
		expect(result.proofCount).toBe(2);
		expect(getMintConfig(MINT_URL)).toBeDefined();
	}, 15000);
});
