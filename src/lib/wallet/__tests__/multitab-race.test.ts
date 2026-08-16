/**
 * TASK-260: cross-tab keyset lock (Web Locks API).
 *
 * Two tabs on the same origin share the same localStorage counter map but each
 * loads its own copy of `counterK.ts`, so the in-memory mutex alone cannot
 * serialize across tabs. `withKeysetLock` must wrap the critical section in a
 * Web Lock (`navigator.locks.request`) so the read → derive → advance window is
 * serialized across tabs, preventing a double-mint where both tabs derive the
 * same B_.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	getCounterK,
	setCounterK,
	incrementCounterK,
	clearAllCounters,
	STORAGE_KEY,
	withKeysetLock
} from '../counterK';

const KS = '01' + 'aa'.repeat(32);

// ─── Minimal Web Locks API mock (shared manager, FIFO by lock name) ───────
//
// Mirrors the semantics of `navigator.locks.request`: a single shared manager
// keyed by name (across any number of "tab" callers), FIFO ordering, and the
// lock is held until the callback's returned promise settles.

type LockCallback = () => Promise<unknown> | unknown;

function createMockLockManager() {
	const request = vi.fn((name: string, callback: LockCallback): Promise<unknown> => {
		const prev = queues.get(name) ?? Promise.resolve();

		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		queues.set(name, prev.then(() => gate, () => gate));

		return prev
			.catch(() => { /* previous holder's failure must not block us */ })
			.then(async () => {
				try {
					return await callback();
				} finally {
					release();
				}
			});
	});
	const queues = new Map<string, Promise<unknown>>();
	return { request, queues };
}

function installWebLocks(locks: ReturnType<typeof createMockLockManager> | undefined): void {
	Object.defineProperty(globalThis.navigator, 'locks', {
		value: locks,
		configurable: true,
		writable: true
	});
}

describe('TASK-260: cross-tab keyset lock (Web Locks API)', () => {
	let locks: ReturnType<typeof createMockLockManager>;

	beforeEach(() => {
		locks = createMockLockManager();
		installWebLocks(locks);
		localStorage.removeItem(STORAGE_KEY);
	});

	afterEach(() => {
		// Remove the mock so other test files (jsdom default: no Web Locks) are
		// unaffected, then clear counters.
		installWebLocks(undefined);
		clearAllCounters();
	});

	it('uses navigator.locks.request with a per-keyset lock name when available', async () => {
		await withKeysetLock(KS, async () => 42);

		expect(locks.request).toHaveBeenCalledTimes(1);
		expect(locks.request).toHaveBeenCalledWith(
			`lnwcash:counter:${KS}`,
			expect.any(Function)
		);
	});

	it('serializes concurrent read-modify-write across two tab-contexts (no double-mint)', async () => {
		setCounterK(KS, 0);

		const seen: number[] = [];
		// Each "tab" runs the same critical section: read counter → (await) →
		// advance. Without a cross-tab lock both would read 0 and the final
		// counter would be 1 (a lost update → double-mint).
		const tab = (label: string) =>
			withKeysetLock(KS, async () => {
				const current = getCounterK(KS);
				seen.push(current);
				await new Promise((r) => setTimeout(r, 10)); // derive + network I/O
				incrementCounterK(KS, 1);
				return label;
			});

		const results = await Promise.all([tab('A'), tab('B')]);

		expect(seen).toEqual([0, 1]); // distinct counters — no double-read
		expect(results).toEqual(['A', 'B']);
		expect(getCounterK(KS)).toBe(2);
		expect(locks.request).toHaveBeenCalledTimes(2);
	});

	it('falls back to the in-memory lock when Web Locks API is unavailable (no crash)', async () => {
		installWebLocks(undefined);

		setCounterK(KS, 0);
		const seen: number[] = [];
		const tab = (label: string) =>
			withKeysetLock(KS, async () => {
				const current = getCounterK(KS);
				seen.push(current);
				await new Promise((r) => setTimeout(r, 10));
				incrementCounterK(KS, 1);
				return label;
			});

		const results = await Promise.all([tab('A'), tab('B')]);

		// Within a single tab the in-memory mutex still serializes — no crash.
		expect(seen).toEqual([0, 1]);
		expect(results).toEqual(['A', 'B']);
		expect(getCounterK(KS)).toBe(2);
		// No Web Locks API → the mock was never consulted.
		expect(locks.request).not.toHaveBeenCalled();
	});
});
