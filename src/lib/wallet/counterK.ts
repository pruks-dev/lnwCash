/**
 * counter_k tracking per keyset (NUT-13).
 *
 * NUT-13 requires a separate counter for every keyset the wallet uses:
 *   - `counter_k := 0` when a new keyset is first encountered.
 *   - `counter_k += N` after successfully minting N ecash with that keyset.
 *   - During restore, the wallet replays counters 0..counter_k to regenerate
 *     the same deterministic secrets (see nut13.ts / restore.ts).
 *
 * Persisted in localStorage under `lnwcash_counter_k` as a JSON map
 * `{ [keysetId]: number }`. (Kept in its own module per TASK-206 scope —
 * storage.ts is out of bounds for this task.)
 */

const STORAGE_KEY = 'lnwcash_counter_k';

export type CounterMap = Record<string, number>;

// ─── Storage helpers ─────────────────────────────────────────

function readAll(): CounterMap {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as CounterMap;
		}
		return {};
	} catch {
		return {};
	}
}

function writeAll(map: CounterMap): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		// localStorage unavailable — counter is best-effort, derivation still works.
	}
}

// ─── Public API ──────────────────────────────────────────────

/** Current counter_k for a keyset (defaults to 0 for unseen keysets). */
export function getCounterK(keysetId: string): number {
	const value = readAll()[keysetId];
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** Set the counter_k for a keyset to an explicit value (clamped to ≥ 0). */
export function setCounterK(keysetId: string, value: number): void {
	const map = readAll();
	map[keysetId] = Math.max(0, Math.floor(value));
	writeAll(map);
}

/**
 * Increment counter_k for a keyset by `by` and return the new value.
 * Called after a successful deterministic mint.
 */
export function incrementCounterK(keysetId: string, by = 1): number {
	const next = getCounterK(keysetId) + Math.max(0, Math.floor(by));
	setCounterK(keysetId, next);
	return next;
}

/** Forget the counter for a keyset (removes its entry). */
export function resetCounterK(keysetId: string): void {
	const map = readAll();
	delete map[keysetId];
	writeAll(map);
}

/** Snapshot of all tracked counters. */
export function getAllCounters(): CounterMap {
	return readAll();
}

/** Wipe all counters (used on wallet delete/reset). */
export function clearAllCounters(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

// ─── Per-keyset derivation lock (TASK-250 RC-3, TASK-260) ────
//
// NUT-13 requires the read → derive → increment window to be atomic per keyset.
// A mint/receive/melt reads `counter_k`, derives secrets from it, performs
// network I/O (await points), and only THEN advances the counter. If two such
// operations run concurrently on the same keyset, both can read the same
// counter and derive the same secret/B_ → the mint rejects the second with
// "outputs already signed" (11003).
//
// `withKeysetLock` serializes the whole critical section per keyset in two
// layers:
//   1. Cross-tab (TASK-260): the Web Locks API (`navigator.locks.request`)
//      serializes a named lock ACROSS tabs on the same origin. Two tabs share
//      the same localStorage counter map but each loads its own copy of this
//      module, so the in-memory mutex below alone cannot prevent a double-mint
//      when both tabs read the same counter_k.
//   2. In-tab: a promise-chain mutex (`keysetLocks`) serializes callers within
//      this JS context (FIFO). It is also the sole fallback when the Web Locks
//      API is unavailable (older browsers / non-secure contexts).

const keysetLocks = new Map<string, Promise<void>>();

/**
 * Run `fn` exclusively per keyset within THIS tab (in-memory mutex). Callers
 * targeting the same `keysetId` are serialized (FIFO); different keysets run
 * concurrently.
 */
async function withInMemoryKeysetLock<T>(
	keysetId: string,
	fn: () => Promise<T> | T
): Promise<T> {
	const prev = keysetLocks.get(keysetId) ?? Promise.resolve();

	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});

	// The next holder waits for the previous holder to settle AND for us to
	// release. Both rejection handlers keep the chain alive (never poison it).
	keysetLocks.set(keysetId, prev.then(() => gate, () => gate));

	await prev.catch(() => { /* previous holder's failure must not block us */ });

	try {
		return await fn();
	} finally {
		release();
	}
}

/** Minimal structural type for the Web Locks API surface we use. */
interface CrossTabLockManager {
	request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}

/**
 * Return the Web Locks API manager when available, otherwise `undefined`.
 * Web Locks is only present in secure contexts (HTTPS / localhost) and modern
 * browsers; jsdom (unit tests) and non-secure contexts lack it.
 */
function getCrossTabLocks(): CrossTabLockManager | undefined {
	const nav = globalThis.navigator as unknown as
		| { locks?: CrossTabLockManager }
		| undefined;
	const locks = nav?.locks;
	return locks && typeof locks.request === 'function' ? locks : undefined;
}

/**
 * Run `fn` exclusively per keyset — serialized across tabs via the Web Locks
 * API (when available) and within this tab via the in-memory mutex.
 *
 * @param keysetId The NUT-13 keyset whose counter is being read/advanced.
 * @param fn The critical section (counter guard + derive + submit + increment).
 */
export async function withKeysetLock<T>(
	keysetId: string,
	fn: () => Promise<T> | T
): Promise<T> {
	const locks = getCrossTabLocks();

	// Fallback (TASK-260): no Web Locks API → in-memory lock only. The caller
	// (mint.ts) still has a benign-11003 retry as a second line of defense, so
	// this degrades gracefully instead of crashing.
	if (!locks) {
		return withInMemoryKeysetLock(keysetId, fn);
	}

	// Cross-tab lock name scoped to this app + keyset. The keyset ID is a public
	// identifier from the mint, so it carries no secret material.
	const lockName = `lnwcash:counter:${keysetId}`;

	// Acquire the cross-tab lock, then the in-tab mutex inside it (preserves FIFO
	// fairness within this tab). The Web Lock auto-releases if the tab closes.
	return locks.request(lockName, () => withInMemoryKeysetLock(keysetId, fn));
}

export { STORAGE_KEY };
