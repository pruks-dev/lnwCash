/**
 * Melt flow tests (with mocked mint API)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWallet, unlockWallet } from '../state';
import { clearAllWalletData } from '../storage';
import { deleteProofDB, resetProofDB, addProofs } from '../proofsDb';
import { setCounterK } from '../counterK';
import type { TokenProof } from '../../types';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const MINT_URL = 'https://mint.example.com';
const KEYSET_ID = '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a';

function makeProof(id: string, amount: number): TokenProof {
	return { id: KEYSET_ID, amount, secret: `secret-${id}`, C: `sig-${id}` };
}

// Mock the keyset module (fetch + cache layer)
vi.mock('../../cashu/keyset', () => ({
	fetchAndCacheKeysets: vi.fn().mockResolvedValue([
		{ id: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a', unit: 'sat', active: true, input_fee_ppk: 5, keys: { '1': '02' + 'a1'.repeat(32) }, last_updated: Date.now() }
	]),
	getAllKeysets: vi.fn().mockReturnValue([
		{ id: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a', unit: 'sat', active: true, input_fee_ppk: 5, keys: { '1': '02' + 'a1'.repeat(32) }, last_updated: Date.now() }
	]),
	getMintPubkey: vi.fn().mockReturnValue('03' + 'b1'.repeat(32)),
	getKeysetById: vi.fn().mockReturnValue({ id: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a', unit: 'sat', active: true, input_fee_ppk: 5, keys: { '1': '02' + 'a1'.repeat(32) }, last_updated: Date.now() }),
	resolveKeysetId: vi.fn().mockImplementation((_url: string, id: string) => id),
	isCacheStale: vi.fn().mockReturnValue(false),
	clearCache: vi.fn(),
	rotateKeysets: vi.fn()
}));

// Mock the client module
vi.mock('../../cashu/client', () => ({
	getMintInfo: vi.fn(),
	getKeysets: vi.fn().mockResolvedValue([
		{ id: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a', unit: 'sat', active: true, input_fee_ppk: 5 }
	]),
	getKeys: vi.fn(),
	requestMintQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 50,
		fee_reserve: 1,
		paid: false,
		expiry: 9999999999
	}),
	requestMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 50,
		fee_reserve: 1,
		paid: false,
		expiry: 9999999999
	}),
	meltTokens: vi.fn().mockResolvedValue({
		paid: true,
		payment_preimage: 'preimage-abc'
	}),
	mintTokens: vi.fn(),
	checkState: vi.fn().mockResolvedValue({
		states: []
	}),
	// TASK-084: new functions
	checkMintQuote: vi.fn(),
	pollMintQuoteUntil: vi.fn(),
	checkMeltQuote: vi.fn().mockResolvedValue({
		quote: 'melt-quote-xyz',
		amount: 50,
		fee_reserve: 1,
		paid: false,
		expiry: 9999999999,
		state: 'UNPAID'
	}),
	CashuError: class extends Error {},
	MintUnreachableError: class extends Error {},
	NetworkError: class extends Error {},
	InvalidResponseError: class extends Error {}
}));

import * as client from '../../cashu/client';
import { meltFlow } from '../melt';
import { getTransactions, clearTransactions } from '../../storage/db';

describe('Melt flow', () => {
	beforeEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
		vi.clearAllMocks();

		// Reset all client mocks to their default implementations
		(client.getKeysets as ReturnType<typeof vi.fn>).mockResolvedValue([
			{ id: '015ba18a8adcd02e715a58358eb618da4a4b3791151a4bee5e968bb88406ccf76a', unit: 'sat', active: true, input_fee_ppk: 5 }
		]);
		(client.requestMeltQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
			quote: 'melt-quote-xyz',
			amount: 50,
			fee_reserve: 1,
			paid: false,
			expiry: 9999999999
		});
		(client.meltTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
			paid: true,
			payment_preimage: 'preimage-abc'
		});
		(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
			states: []
		});

		await createWallet(TEST_PIN, TEST_NAME);
		await unlockWallet(TEST_PIN);

		await addProofs(
			[makeProof('p1', 32), makeProof('p2', 16), makeProof('p3', 8)],
			MINT_URL,
			KEYSET_ID
		);

		// TASK-250 (RC-3): these proofs were "already minted", so the NUT-13 counter
		// must be > 0 — otherwise the melt counter-0 guard forces a NUT-9 restore.
		setCounterK(KEYSET_ID, 3);
	});

	afterEach(async () => {
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	describe('meltFlow', () => {
		it('should successfully melt ecash with mocked API', async () => {
			const result = await meltFlow(MINT_URL, 'lnbc...', 50);

			expect(result.success).toBe(true);
			expect(result.preimage).toBe('preimage-abc');
		});

		it('should handle error when mint unreachable', async () => {
			(client.requestMeltQuote as ReturnType<typeof vi.fn>).mockRejectedValue(
				new TypeError('fetch failed')
			);

			const result = await meltFlow('https://dead-mint.example.com', 'lnbc...', 10);

			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('should handle network errors', async () => {
			(client.requestMeltQuote as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Network down')
			);

			const result = await meltFlow(MINT_URL, 'lnbc...', 10);

			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		it('should return error when wallet is locked', async () => {
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);

			const result = await meltFlow(MINT_URL, 'lnbc...', 10);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
		});

		// ─── C05-05: input_fee_ppk fee calculation ─────────────

		it('C05-05 (TASK-1303): should calculate fee = 1 × ppk for 1 input', async () => {
			// TASK-1303: กอง [32] จ่าย 30 — 30=11110₂ ไม่มี denomination 2/4/16
			// → DP เกณฑ์ 2 ยืม 32 (excess 2) → 1 input
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);
			await addProofs([makeProof('p1', 32)], MINT_URL, KEYSET_ID);
			// TASK-250 (RC-3): proofs "already minted" → counter ต้อง > 0 ก่อน melt
			setCounterK(KEYSET_ID, 1);

			// Mock checkState to return UNSPENT
			(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
				states: [
					{ secret: 'secret-p1', state: 'UNSPENT', witness: null }
				]
			});

			const result = await meltFlow(MINT_URL, 'lnbc...', 30);

			expect(result.success).toBe(true);
			expect(result.inputFeePpk).toBe(5);
			expect(result.calculatedFee).toBe(5); // 1 input × ppk=5
		});

		it('C05-05 (TASK-1303): denomination-first + DP เลือก 3 inputs สำหรับ 30 จาก [32,16,8] → fee = 3 × ppk', async () => {
			// TASK-1303: 30 = 11110₂ — ขั้น 1 hit 8,16 · R=6 → DP เกณฑ์ 2 ยืม 32
			// (excess 26) → selected 3 ก้อน — fee คิดตามจำนวน input จริง
			(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
				states: [
					{ secret: 'secret-p1', state: 'UNSPENT', witness: null }
				]
			});

			const result = await meltFlow(MINT_URL, 'lnbc...', 30);

			expect(result.success).toBe(true);
			expect(result.inputFeePpk).toBe(5);
			expect(result.calculatedFee).toBe(15); // 3 inputs × ppk=5
		});

		it('C05-05: should calculate fee = 3 × ppk for 3 inputs', async () => {
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			// 3 proofs: 32+16+8=56 sats total, need 10 → greedy picks [32,16,8]? 
			// Actually selectProofs tries largest-first with reduction. 
			// For amount=10, greedy: 32≥10 → uses 32 only (1 input).
			// To get 3 inputs we need amount that requires all 3.
			await addProofs(
				[makeProof('p1', 32), makeProof('p2', 16), makeProof('p3', 8)],
				MINT_URL,
				KEYSET_ID
			);

			// Need 55 sats — greedy starting from 32, then 16 (48<55), then 8 (56≥55) = 3 inputs
			(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
				states: [
					{ secret: 'secret-p1', state: 'UNSPENT', witness: null },
					{ secret: 'secret-p2', state: 'UNSPENT', witness: null },
					{ secret: 'secret-p3', state: 'UNSPENT', witness: null }
				]
			});

			const result = await meltFlow(MINT_URL, 'lnbc...', 55);

			expect(result.success).toBe(true);
			expect(result.inputFeePpk).toBe(5);
			expect(result.calculatedFee).toBe(15); // 3 inputs × ppk=5
		});

		// ─── C07-02: checkState before melt ────────────────────

		it('C07-02: should reject melt when proof is SPENT (double-spend prevention)', async () => {
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			await addProofs(
				[makeProof('p1', 64)],
				MINT_URL,
				KEYSET_ID
			);

			// Mock checkState to return SPENT
			(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
				states: [
					{ secret: 'secret-p1', state: 'SPENT', witness: null }
				]
			});

			const result = await meltFlow(MINT_URL, 'lnbc...', 50);

			expect(result.success).toBe(false);
			expect(result.error).toContain('already spent');
		});

		it('C07-02: should proceed with melt when all proofs are UNSPENT', async () => {
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			await addProofs(
				[makeProof('p1', 64)],
				MINT_URL,
				KEYSET_ID
			);

			// TASK-252-fix: simulate that the mint already advanced counter_k for
			// these minted proofs — otherwise the melt counter-0 guard (TASK-250)
			// sees counter_k === 0 with proofs present and forces a NUT-9 restore,
			// so meltFlow returns success:false.
			setCounterK(KEYSET_ID, 1);

			// Mock checkState to return UNSPENT
			(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
				states: [
					{ secret: 'secret-p1', state: 'UNSPENT', witness: null }
				]
			});

			const result = await meltFlow(MINT_URL, 'lnbc...', 50);

			expect(result.success).toBe(true);
			expect(result.preimage).toBe('preimage-abc');
		});

		it('should record transaction with protocol=lightning and bolt11 invoice', async () => {
			await clearTransactions();
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			await addProofs(
				[makeProof('p1', 64)],
				MINT_URL,
				KEYSET_ID
			);

			// TASK-252-fix: simulate that the mint already advanced counter_k for
			// these minted proofs — otherwise the melt counter-0 guard (TASK-250)
			// sees counter_k === 0 with proofs present and forces a NUT-9 restore.
			setCounterK(KEYSET_ID, 1);

			(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
				states: [
					{ secret: 'secret-p1', state: 'UNSPENT', witness: null }
				]
			});

			const result = await meltFlow(MINT_URL, 'lnbc2500u...', 50);

			expect(result.success).toBe(true);

			const txs = await getTransactions({ type: 'melt' });
			expect(txs.length).toBe(1);
			const tx = txs[0];
			expect(tx.protocol).toBe('lightning');
			expect(tx.invoice).toBe('lnbc2500u...');
			expect(tx.token_hash).toBeNull();
			expect(tx.status).toBe('confirmed');
			// Pending→confirmed flow: fee and preimage should be updated by completeMelt
			expect(tx.fee).toBe(1); // feeReserve from mock quote
			expect(tx.preimage).toBe('preimage-abc');
		});

		it('should set transaction status to failed when melt fails', async () => {
			await clearTransactions();
			await clearAllWalletData();
			await deleteProofDB();
			resetProofDB();
			await createWallet(TEST_PIN, TEST_NAME);
			await unlockWallet(TEST_PIN);

			await addProofs(
				[makeProof('p1', 64)],
				MINT_URL,
				KEYSET_ID
			);

			// Force quote request to fail
			(client.requestMeltQuote as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Insufficient funds')
			);

			const result = await meltFlow(MINT_URL, 'lnbc...', 99999);

			expect(result.success).toBe(false);

			const txs = await getTransactions({ type: 'melt' });
			expect(txs.length).toBe(1);
			expect(txs[0].status).toBe('failed');
			expect(txs[0].protocol).toBe('lightning');
		});

		it('should create only one transaction for a successful melt (pending→confirmed)', async () => {
			await clearTransactions();

			(client.checkState as ReturnType<typeof vi.fn>).mockResolvedValue({
				states: [
					{ secret: 'secret-p1', state: 'UNSPENT', witness: null },
					{ secret: 'secret-p2', state: 'UNSPENT', witness: null },
					{ secret: 'secret-p3', state: 'UNSPENT', witness: null }
				]
			});

			const result = await meltFlow(MINT_URL, 'lnbc...', 50);

			expect(result.success).toBe(true);

			// Should have exactly 1 transaction (pending→confirmed, not 2)
			const txs = await getTransactions({ type: 'melt' });
			expect(txs.length).toBe(1);
			expect(txs[0].status).toBe('confirmed');
		});
	});
});
