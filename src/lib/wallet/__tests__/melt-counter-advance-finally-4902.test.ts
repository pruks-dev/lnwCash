/**
 * TASK-4902 (M4-ก) counter-advance-test: advance-on-submit `finally`.
 *
 * completeMelt MUST advance counter_k in `finally` AFTER the actual POST —
 * on ALL FOUR failure modes below the counter moves by the FULL derived
 * count N (the B_ were consumed on the wire; freezing would make the retry
 * re-derive the same B_ → 11003, WINDOW-1/C4).
 *
 * 4 modes (postMelt mocked):
 *   (a) routing-fail  — CashuError 500 (20004)
 *   (b) timeout-15s   — NetworkError (client-side abort, mint may continue)
 *   (c) DLEQ-fail     — postMelt rejects on a DLEQ-path error
 *   (d) signedCount-anomaly — postMelt RESOLVES with more sigs than derived
 *
 * Setup (all modes): NUT-08 blanks, spentTotal=200, amount=100, feeReserve=0
 * → changeAmount=100 → N = ceil(log2(100)) = 7 blanks. Counter starts at 100,
 * every mode must end at 107 with success:false + unknownOutcome:true.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { MINT_URL, KEYSET_ID, MNEMONIC } = vi.hoisted(() => ({
	MINT_URL: 'https://mint.example.com',
	KEYSET_ID: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a',
	MNEMONIC: 'half depart obvious quality work element tank gorilla view sugar picture humble'
}));

const DERIVED_N = 7; // ceil(log2(100)) blanks for changeAmount=100
const START_COUNTER = 100;

vi.mock('../capabilities', () => ({
	hasNUT08: vi.fn(() => Promise.resolve(true)),
	isVersionAtLeast: vi.fn(() => true),
	getMintCapability: vi.fn(() =>
		Promise.resolve({
			nuts: ['04', '05', '08'],
			version: 'Nutshell/0.20.1',
			cached_at: Date.now()
		})
	)
}));

vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn().mockResolvedValue({
		nuts: { '08': { supported: true }, '04': true, '05': true },
		version: 'Nutshell/0.20.1',
		name: 'Test Mint',
		pubkey: '03' + 'b1'.repeat(32)
	}),
	getKeysets: vi.fn().mockResolvedValue([
		{ id: KEYSET_ID, unit: 'sat', active: true, input_fee_ppk: 0 }
	]),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn(),
	requestMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-4902',
		amount: 100,
		fee_reserve: 0,
		paid: true,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	meltTokens: vi.fn(),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockResolvedValue({ states: [] }),
	checkMintQuote: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-4902',
		amount: 100,
		fee_reserve: 0,
		paid: true,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	pollMeltQuoteUntilTerminal: vi.fn(),
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
import { deleteProofDB, resetProofDB } from '../proofsDb';
import { setCounterK, getCounterK, clearAllCounters, STORAGE_KEY } from '../counterK';
import { setActiveSeed, clearActiveSeed } from '../nut13';
import { mnemonicToSeed } from '../keys';
import { completeMelt } from '../melt';
import type { TokenProof, SelectedProofInfo } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';

function makeInput(tag: string, amount: number): SelectedProofInfo {
	const secret = `secret-${tag}`;
	const proof: TokenProof = { id: KEYSET_ID, amount, secret, C: `sig-${tag}` };
	return {
		local_id: `${KEYSET_ID}:${secret}:${tag}`,
		amount: proof.amount,
		id: proof.id,
		secret: proof.secret,
		C: proof.C
	};
}

function twoHundredInputs(): SelectedProofInfo[] {
	return [makeInput('a1', 100), makeInput('a2', 100)];
}

describe('TASK-4902 (M4-ก): advance-on-submit finally — counter moves on all 4 failure modes', () => {
	const seed = mnemonicToSeed(MNEMONIC);

	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		localStorage.removeItem(STORAGE_KEY);
		try { localStorage.clear(); } catch { /* ignore */ }
		vi.clearAllMocks();

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);
		setActiveSeed(seed);
		setCounterK(KEYSET_ID, START_COUNTER);
	});

	afterEach(async () => {
		clearActiveSeed();
		clearAllCounters();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	it('(a) routing-fail (20004) → counter advances by derived N', async () => {
		(client.meltTokens as ReturnType<typeof vi.fn>).mockRejectedValue(
			new client.CashuError('HTTP 500 (20004): routing failed')
		);

		const result = await completeMelt(MINT_URL, 'melt-quote-4902', twoHundredInputs(), 'lnbc...', 100, 0);

		expect(result.success).toBe(false);
		expect(result.unknownOutcome).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(START_COUNTER + DERIVED_N);
	});

	it('(b) timeout-15s (client abort, mint may continue) → counter advances by derived N', async () => {
		(client.meltTokens as ReturnType<typeof vi.fn>).mockRejectedValue(
			new client.NetworkError('Network error: Request timeout to https://mint.example.com/v1/melt/bolt11')
		);

		const result = await completeMelt(MINT_URL, 'melt-quote-4902', twoHundredInputs(), 'lnbc...', 100, 0);

		expect(result.success).toBe(false);
		expect(result.unknownOutcome).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(START_COUNTER + DERIVED_N);
	});

	it('(c) DLEQ-path failure → counter advances by derived N', async () => {
		(client.meltTokens as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('DLEQ verification failed for change output #0 — aborting')
		);

		const result = await completeMelt(MINT_URL, 'melt-quote-4902', twoHundredInputs(), 'lnbc...', 100, 0);

		expect(result.success).toBe(false);
		expect(result.unknownOutcome).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(START_COUNTER + DERIVED_N);
	});

	it('(d) signedCount-anomaly (9 sigs > 7 blanks) → throws, counter advances by derived N', async () => {
		(client.meltTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
			paid: true,
			payment_preimage: 'preimage-4902',
			change: Array.from({ length: DERIVED_N + 2 }, (_, i) => ({
				id: KEYSET_ID,
				amount: 1,
				C_: '02' + 'd1'.repeat(32) + String(i)
			}))
		});

		const result = await completeMelt(MINT_URL, 'melt-quote-4902', twoHundredInputs(), 'lnbc...', 100, 0);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/Mint anomaly/);
		expect(result.unknownOutcome).toBe(true);
		expect(getCounterK(KEYSET_ID)).toBe(START_COUNTER + DERIVED_N);
	});
});
