/**
 * TASK-4909: central early-return fix — 2 acceptance gates.
 *
 * Regression: App.svelte central poll() had
 *   `if (pendingTxs.length === 0) return;`
 * which killed the WHOLE round (including the melt section) whenever no
 * mint was pending — so a melt-only pending tx was never re-checked.
 * Fix: the round returns early ONLY when mint AND melt are both empty.
 *
 * What this test proves (scoped, honest scope):
 *   - source-level: the bare killer guard is gone; the combined
 *     mint+melt guard is present; checkMeltQuote still lives in the melt
 *     section AFTER the guard; cadence is ~15s.
 *   - gate 1 (on-demand timedOut leftover): 0 mint pending + 1 quote-bound
 *     melt pending + last check >15s ago → guard proceeds AND a real
 *     checkMeltQuote fires (mocked fetch) AND the tx is NOT invoice-dead
 *     (stays pending = central keeps checking).
 *   - gate 2 (reboot / boot-reconcile leftover): same shape but never
 *     checked this session (empty lastMeltPollAt, old timestamp) →
 *     guard proceeds AND checkMeltQuote fires AND tx stays pending.
 *
 * NOTE: poll() itself lives inside App.svelte onMount and is not
 * importable — so the behavioral half replays the guard + cadence +
 * quote-bound + checkMeltQuote chain with the REAL resolver/client
 * functions (extractMeltQuoteId / isMeltInvoiceDead / checkMeltQuote),
 * using the exact expressions from App.svelte. Mint poll / pacing / CAS
 * logic is intentionally NOT re-tested here (forbidden to change).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkMeltQuote } from '$lib/cashu/client';
import { extractMeltQuoteId, isMeltInvoiceDead } from '../pending-tx-resolver';
import type { Transaction } from '$lib/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_SVELTE = resolve(HERE, '../../../App.svelte');

const MINT_URL = 'https://mint-test.example.com';
const QUOTE_ID = '01a19c69deadbeef';
// Central cadence mirrors App.svelte MELT_POLL_INTERVAL_MS (single source:
// asserted against the source text below, replica used for gate timing).
const MELT_POLL_INTERVAL_MS = 15_000;

function mintTx(over: Partial<Transaction> = {}): Transaction {
	return {
		id: 'mint-q1',
		type: 'mint',
		amount: 21,
		mint_url: MINT_URL,
		timestamp: Date.now(),
		token_hash: null,
		status: 'confirmed',
		...over
	};
}

function meltPendingTx(over: Partial<Transaction> = {}): Transaction {
	return {
		id: `melt-${QUOTE_ID}`,
		type: 'melt',
		amount: 10,
		mint_url: MINT_URL,
		timestamp: Date.now(),
		token_hash: null,
		invoice: null, // no invoice bound → isMeltInvoiceDead() === null (never auto-fail)
		status: 'pending',
		...over
	};
}

// Exact guard expression from App.svelte poll() (TASK-4909 fix).
function centralRoundReturnsEarly(allTxs: Transaction[]): boolean {
	const pendingTxs = allTxs.filter((tx) => tx.type === 'mint' && tx.status === 'pending');
	const meltTxs = allTxs.filter((tx) => tx.type === 'melt' && tx.status === 'pending');
	return pendingTxs.length === 0 && meltTxs.length === 0;
}

// Exact cadence gate from App.svelte melt section.
function meltCadenceDue(txId: string, lastMeltPollAt: Map<string, number>, now: number): boolean {
	const last = lastMeltPollAt.get(txId) ?? 0;
	return now - last >= MELT_POLL_INTERVAL_MS;
}

const mockFetch = vi.fn();
let originalFetch: typeof fetch;

function okJson(body: unknown) {
	return { ok: true, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('TASK-4909 central early-return: source guard', () => {
	it('bare mint-only early-return is gone; combined mint+melt guard present', () => {
		const src = readFileSync(APP_SVELTE, 'utf8');
		// The killer: return on empty mint list WITHOUT looking at melt.
		expect(src).not.toContain('if (pendingTxs.length === 0) return;');
		// The fix: whole-round return only when BOTH lists are empty.
		expect(src).toContain('if (pendingTxs.length === 0 && meltTxs.length === 0) return;');
		// melt list is hoisted BEFORE the guard (guard must see both lists).
		const hoistIdx = src.indexOf(
			"const meltTxs = allTxs.filter(tx => tx.type === 'melt' && tx.status === 'pending');"
		);
		const guardIdx = src.indexOf('if (pendingTxs.length === 0 && meltTxs.length === 0) return;');
		expect(hoistIdx).toBeGreaterThan(-1);
		expect(guardIdx).toBeGreaterThan(hoistIdx);
		// checkMeltQuote still fires in the melt section AFTER the guard.
		const checkIdx = src.indexOf('await checkMeltQuote(tx.mint_url, meltQuoteId)');
		expect(checkIdx).toBeGreaterThan(guardIdx);
		// Central melt cadence stays ~15s.
		expect(src).toContain('const MELT_POLL_INTERVAL_MS = 15_000;');
		expect(MELT_POLL_INTERVAL_MS).toBe(15_000);
	});
});

describe('TASK-4909 gate 1: on-demand timedOut + still pending → central re-checks', () => {
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch;
		mockFetch.mockReset();
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('0 mint pending + quote-bound melt pending (+ stale last check) → checkMeltQuote fires, tx stays pending', async () => {
		// File reality: no mint pending at all (only a confirmed one) +
		// one melt tx left pending after the on-demand poller gave up
		// (timedOut — melt.ts keeps it pending, never fails on uncertainty).
		const allTxs: Transaction[] = [mintTx(), meltPendingTx()];
		expect(centralRoundReturnsEarly(allTxs)).toBe(false);

		const tx = allTxs[1];
		// Quote-bound: the central section maps melt-{quote} → quote id.
		expect(extractMeltQuoteId(tx.id)).toBe(QUOTE_ID);
		// On-demand era ended >15s ago → central cadence gate is due.
		const lastMeltPollAt = new Map<string, number>([[tx.id, Date.now() - 16_000]]);
		expect(meltCadenceDue(tx.id, lastMeltPollAt, Date.now())).toBe(true);

		// The mint answers UNPAID on a live (non-dead) invoice → central
		// must release back to pending (NOT failed) = keeps checking.
		mockFetch.mockResolvedValueOnce(okJson({ quote: QUOTE_ID, state: 'UNPAID' }));
		const quote = await checkMeltQuote(tx.mint_url, QUOTE_ID);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const calledUrl = String(mockFetch.mock.calls[0]?.[0] ?? '');
		expect(calledUrl).toContain(encodeURIComponent(QUOTE_ID));
		const meltState = (quote as { state?: string }).state ?? 'UNPAID';
		expect(meltState).not.toBe('PAID');
		expect(isMeltInvoiceDead(tx)).not.toBe(true); // stays pending → central keeps checking
	});
});

describe('TASK-4909 gate 2: reboot leftover (boot reconcile left pending) → central re-checks', () => {
	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = mockFetch;
		mockFetch.mockReset();
	});
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('0 mint pending + old quote-bound melt pending (never checked this session) → checkMeltQuote fires, tx stays pending', async () => {
		// File reality after reboot: boot resolver ran once, left this tx
		// pending (unproven) — central must pick it up, not check-once-and-drop.
		const allTxs: Transaction[] = [
			meltPendingTx({ timestamp: Date.now() - 10 * 60_000 })
		];
		expect(allTxs.filter((t) => t.type === 'mint' && t.status === 'pending')).toHaveLength(0);
		expect(centralRoundReturnsEarly(allTxs)).toBe(false);

		const tx = allTxs[0];
		expect(extractMeltQuoteId(tx.id)).toBe(QUOTE_ID);
		// Fresh session: never checked → cadence gate is due immediately.
		expect(meltCadenceDue(tx.id, new Map(), Date.now())).toBe(true);

		mockFetch.mockResolvedValueOnce(okJson({ quote: QUOTE_ID, state: 'UNPAID' }));
		const quote = await checkMeltQuote(tx.mint_url, QUOTE_ID);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		const calledUrl = String(mockFetch.mock.calls[0]?.[0] ?? '');
		expect(calledUrl).toContain(encodeURIComponent(QUOTE_ID));
		const meltState = (quote as { state?: string }).state ?? 'UNPAID';
		expect(meltState).not.toBe('PAID');
		expect(isMeltInvoiceDead(tx)).not.toBe(true); // stays pending → central keeps checking
	});
});
