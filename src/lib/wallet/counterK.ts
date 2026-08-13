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

export { STORAGE_KEY };
