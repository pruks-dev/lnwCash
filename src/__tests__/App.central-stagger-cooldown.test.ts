/**
 * Test: App.svelte TASK-4402 (INTENT-044 CENTRAL-STAGGER-COOLDOWN)
 *
 * Mirrors the pacing block in App.svelte's central poll (per repo precedent
 * src/__tests__/App.mint-polling.test.ts — "Simulates the polling function
 * found in App.svelte"). Constants below MUST match App.svelte:
 *   STAGGER_MIN_MS=300, STAGGER_MAX_MS=500, STAGGER_JITTER_MS=100,
 *   COOLDOWN_DEFAULT_MS=30_000, COOLDOWN_MAX_MS=300_000.
 * No mint name/URL is hardcoded — mints are arbitrary test URLs.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Mirror of App.svelte TASK-4402 block (injectable sleep/now/rand) ──

const STAGGER_MIN_MS = 300;
const STAGGER_MAX_MS = 500;
const STAGGER_JITTER_MS = 100;
const COOLDOWN_DEFAULT_MS = 30_000;
const COOLDOWN_MAX_MS = 300_000;

function staggerDelayMs(rand: () => number = Math.random): number {
	return STAGGER_MIN_MS + rand() * (STAGGER_MAX_MS - STAGGER_MIN_MS) + rand() * STAGGER_JITTER_MS;
}

function isRateLimited(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const e = err as { status?: unknown; name?: unknown };
	if (e.status === 429) return true;
	return typeof e.name === 'string' && e.name === 'RateLimitedError';
}

function retryAfterOf(err: unknown): number | undefined {
	const ms = (err as { retryAfterMs?: unknown }).retryAfterMs;
	return typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

type Tx = { id: string; mint_url: string };

function rateLimitedError(retryAfterMs?: number) {
	const e = new Error('HTTP 429: Rate limit exceeded') as Error & {
		status: number;
		name: string;
		retryAfterMs?: number;
	};
	e.status = 429;
	e.name = 'RateLimitedError';
	if (retryAfterMs !== undefined) e.retryAfterMs = retryAfterMs;
	return e;
}

/** Faithful mirror of the App.svelte poll loop pacing (CAS/mint body stubbed). */
async function pacedRound(
	pendingTxs: Tx[],
	cooldowns: Map<string, number>,
	check: (tx: Tx) => Promise<void>,
	deps: { sleep: (ms: number) => Promise<void>; now: () => number; rand?: () => number } = {
		sleep: async () => {},
		now: () => Date.now()
	}
): Promise<void> {
	for (let i = 0; i < pendingTxs.length; i++) {
		const tx = pendingTxs[i];
		const cooledUntil = cooldowns.get(tx.mint_url);
		if (cooledUntil !== undefined) {
			if (deps.now() < cooledUntil) continue;
			cooldowns.delete(tx.mint_url);
		}
		if (i > 0) await deps.sleep(staggerDelayMs(deps.rand));
		try {
			await check(tx);
		} catch (txErr) {
			if (isRateLimited(txErr)) {
				const waitMs = Math.min(retryAfterOf(txErr) ?? COOLDOWN_DEFAULT_MS, COOLDOWN_MAX_MS);
				cooldowns.set(tx.mint_url, deps.now() + waitMs);
			}
		}
	}
}

// ── Tests ──

describe('App.svelte TASK-4402 — central stagger + per-mint cooldown', () => {
	let cooldowns: Map<string, number>;
	let nowMs: number;
	let sleepCalls: number[];
	let checkOrder: string[];

	const deps = () => ({
		sleep: async (ms: number) => {
			sleepCalls.push(ms);
		},
		now: () => nowMs,
		rand: () => 0.5
	});

	beforeEach(() => {
		cooldowns = new Map();
		nowMs = 1_000_000;
		sleepCalls = [];
		checkOrder = [];
	});

	// ── 1. stagger-order ──
	it('checks txs in order with a 300-500ms+jitter gap between them (no burst)', async () => {
		const txs: Tx[] = [
			{ id: 'mint-a', mint_url: 'https://mint-a.test' },
			{ id: 'mint-b', mint_url: 'https://mint-b.test' },
			{ id: 'mint-c', mint_url: 'https://mint-c.test' }
		];
		await pacedRound(
			txs,
			cooldowns,
			async (tx) => {
				checkOrder.push(tx.id);
			},
			deps()
		);
		expect(checkOrder).toEqual(['mint-a', 'mint-b', 'mint-c']);
		expect(sleepCalls).toHaveLength(2); // gap before 2nd + 3rd, none before 1st
		for (const gap of sleepCalls) {
			expect(gap).toBeGreaterThanOrEqual(300);
			expect(gap).toBeLessThanOrEqual(600); // 500 max + 100 jitter
		}
	});

	it('staggerDelayMs spans [300, 600] at the rand edges', () => {
		expect(staggerDelayMs(() => 0)).toBe(300);
		expect(staggerDelayMs(() => 0.999999)).toBeLessThanOrEqual(600);
		expect(staggerDelayMs(() => 0.999999)).toBeGreaterThan(500);
	});

	// ── 2. cooldown-per-mint ──
	it('a 429 parks ONLY that mint_url for Retry-After; same-mint tx skipped next round', async () => {
		const bad: Tx = { id: 'mint-x1', mint_url: 'https://mint-x.test' };
		await pacedRound(
			[bad],
			cooldowns,
			async () => {
				throw rateLimitedError(60_000);
			},
			deps()
		);
		expect(cooldowns.get('https://mint-x.test')).toBe(nowMs + 60_000);

		// Next round: same-mint tx skipped (0 checks), no sleep consumed for it
		checkOrder = [];
		sleepCalls = [];
		await pacedRound(
			[{ id: 'mint-x2', mint_url: 'https://mint-x.test' }],
			cooldowns,
			async (tx) => {
				checkOrder.push(tx.id);
			},
			deps()
		);
		expect(checkOrder).toEqual([]);
	});

	it('429 without Retry-After falls back to the 30s default cooldown', async () => {
		await pacedRound(
			[{ id: 'mint-d1', mint_url: 'https://mint-d.test' }],
			cooldowns,
			async () => {
				throw rateLimitedError();
			},
			deps()
		);
		expect(cooldowns.get('https://mint-d.test')).toBe(nowMs + 30_000);
	});

	it('cooldown expires → mint is checked again (entry cleaned)', async () => {
		cooldowns.set('https://mint-e.test', nowMs + 10_000);
		nowMs += 10_001; // past the park
		await pacedRound(
			[{ id: 'mint-e1', mint_url: 'https://mint-e.test' }],
			cooldowns,
			async (tx) => {
				checkOrder.push(tx.id);
			},
			deps()
		);
		expect(checkOrder).toEqual(['mint-e1']);
		expect(cooldowns.has('https://mint-e.test')).toBe(false);
	});

	// ── 3. other-continues ──
	it('other mints keep flowing in the SAME round while one mint is 429-parked', async () => {
		const txs: Tx[] = [
			{ id: 'mint-f1', mint_url: 'https://mint-f.test' },
			{ id: 'mint-g1', mint_url: 'https://mint-g.test' },
			{ id: 'mint-h1', mint_url: 'https://mint-h.test' }
		];
		await pacedRound(
			txs,
			cooldowns,
			async (tx) => {
				checkOrder.push(tx.id);
				if (tx.mint_url === 'https://mint-f.test') throw rateLimitedError(45_000);
			},
			deps()
		);
		// All three were still attempted in order despite the 429
		expect(checkOrder).toEqual(['mint-f1', 'mint-g1', 'mint-h1']);
		// ONLY the 429 mint is parked
		expect(cooldowns.has('https://mint-f.test')).toBe(true);
		expect(cooldowns.has('https://mint-g.test')).toBe(false);
		expect(cooldowns.has('https://mint-h.test')).toBe(false);
	});

	it('non-429 errors never park any mint', async () => {
		await pacedRound(
			[{ id: 'mint-i1', mint_url: 'https://mint-i.test' }],
			cooldowns,
			async () => {
				throw new Error('Network error');
			},
			deps()
		);
		expect(cooldowns.size).toBe(0);
	});
});
