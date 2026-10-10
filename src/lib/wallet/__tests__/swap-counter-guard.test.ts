/**
 * TASK-250 (RC-3): swap (receiveTokens) counter-0 guard.
 *
 * When `counter_k === 0` for a keyset but proofs for that keyset already exist
 * in IndexedDB, the counter was lost (localStorage cleared). Receiving tokens
 * (NUT-03 swap) would derive the new outputs at counter 0 and reuse a secret
 * the mint already signed → "outputs already signed" (11003). The receive flow
 * must refuse and force NUT-9 restore instead.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

vi.mock('../../cashu/token', () => ({
	encodeToken: vi.fn(),
	getTokenAmount: vi.fn(),
	decodeToken: vi.fn().mockReturnValue({
		mint: MINT_URL,
		unit: 'sat',
		proofs: [
			{ id: KEYSET_ID, amount: 2, secret: 'olds1', C: 'C-old1' },
			{ id: KEYSET_ID, amount: 1, secret: 'olds2', C: 'C-old2' }
		]
	})
}));

vi.mock('../../cashu/client', () => ({
	checkState: vi.fn(),
	swapProofs: vi.fn().mockResolvedValue({
		signatures: [
			{ id: KEYSET_ID, amount: 2, C_: '02' + 'a1'.repeat(32) },
			{ id: KEYSET_ID, amount: 1, C_: '02' + 'a2'.repeat(32) }
		]
	}),
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
	getMintPubkey: vi.fn(() => null),
	resolveKeysetId: vi.fn((_url: string, id: string) => id)
}));

// TASK-1315 flake-lock: this suite pins the ONLINE counter-0 guard — the
// detector singleton must read 'online' deterministically here (a real
// jsdom/worker probe race previously let it settle 'offline' occasionally,
// which routed receiveTokens into the offline passthrough BEFORE the guard
// could fire — see 1314/1315 flaky notes). Controllable fake detector,
// mirroring the auto-normalize-wiring pattern; no real probes run here.
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
	// TASK-1402: dual-rail binding (module-init) needs both EVENT API
	// entries on the mocked detector surface (no-op stubs — the rail
	// behavior itself is proven in flush-binding-1402.test.ts).
	onOnlineConfirmed: vi.fn(() => () => {}),
	setPendingPileReader: vi.fn(),
	notifySuspectOffline: vi.fn(),
	setProbeTargets: vi.fn(),
	wasOffline: vi.fn(() => false),
	resetWasOffline: vi.fn(),
	trackWasOffline: vi.fn(() => () => {})
}));

import * as client from '../../cashu/client';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs } from '../proofsDb';
import { receiveTokens } from '../tokenStore';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

describe('TASK-250 RC-3: swap (receiveTokens) counter-0 guard', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		vi.clearAllMocks();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);

		// Simulate localStorage loss: old proofs remain in IndexedDB, counter_k = 0.
		await addProofs(
			[{ id: KEYSET_ID, amount: 1, secret: '00'.repeat(32), C: '03' + 'c1'.repeat(32) }],
			MINT_URL,
			KEYSET_ID
		);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('counter_k=0 + existing proofs → forced NUT-9 restore, swapProofs NOT called', async () => {
		expect(getCounterK(KEYSET_ID)).toBe(0);

		await expect(receiveTokens('cashuAdummy')).rejects.toThrow(/NUT-9|restore/i);

		// The receive must NOT reach the mint — no swap submitted.
		expect(client.swapProofs).not.toHaveBeenCalled();
		expect(getCounterK(KEYSET_ID)).toBe(0);
	});
});
