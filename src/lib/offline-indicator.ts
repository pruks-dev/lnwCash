/**
 * TASK-1307 (INTENT-013 wave 5 — FR-2 + D1 + D1-boot-probe)
 * Detector service — ONE connectivity state for the entire app.
 *
 * Truth = probe results (raw GET `${mintUrl}/v1/info`).
 * navigator.onLine is NOT truth: window 'online' events are demoted to probe
 * TRIGGERS (must_do 7). The device hint (navigator.onLine) is read exactly
 * once — here, as the initial seed — and must not survive anywhere else
 * (FR-2; normalizeWiring.ts isWalletOnline is TASK-1308 scope).
 *
 * State machine: 'online' | 'offline' | 'probing'
 *   - A definite verdict ('online'/'offline') is produced ONLY by a completed
 *     probe run. No probe → no flip.
 *   - isOnline() reads from state; while 'probing' it returns the previous
 *     definite value (no flip).
 *   - Success = at least one target answers ok (HTTP 2xx). All fail →
 *     'offline'.
 *
 * Probe (raw fetch — deliberately NOT cashu/client: import-cycle guard):
 *   - GET `${mintUrl}/v1/info`, cache: 'no-store', one AbortController per
 *     target, timeout 4s (D1 frame 3–5s).
 *
 * Triggers (exactly 4 — D1; no ping loop, no setInterval, no recursion):
 *   (boot) module init fires the first probe immediately — cold open ends in
 *          real state as soon as results arrive, never parked in 'probing'
 *          waiting for visibilitychange. When targets are not wired yet (the
 *          wallet store loads after this module in the app graph), exactly
 *          ONE catch-up boot probe runs on the first setProbeTargets().
 *   (a)    visibilitychange → 'visible' → probe
 *   (b)    window 'online' event → probe
 *   (c)    notifySuspectOffline() — after an op fails with a network error —
 *          probe follows
 *
 * Coalescing: requestProbe while 'probing' is skipped — probes never stack.
 *
 * Usage in Svelte 5:
 *   import { isOnline, onConnectivityChange, wasOffline } from '$lib/offline-indicator';
 *
 *   let online = $state(isOnline());
 *   $effect(() => onConnectivityChange(v => online = v));
 */

export type DetectorState = 'online' | 'offline' | 'probing';

type ProbeTrigger = 'boot' | 'visibility' | 'online-event' | 'op-fail';
type ProbeVerdict = 'online' | 'offline';

/** D1 probe frame 3–5s → fixed 4s per target fetch. */
const PROBE_TIMEOUT_MS = 4000;

/** Probe path appended to each mint URL. */
const PROBE_PATH = '/v1/info';

// ─── Internal state ──────────────────────────────────────────

/** Probe targets — mint URLs (default mint + every user-configured mint). */
let targets: string[] = [];

/**
 * Seed state — the ONLY navigator.onLine read in the app (inside the
 * detector). It is a placeholder until the first probe verdict lands,
 * not truth.
 */
let lastDefinite: ProbeVerdict =
	typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline';

let state: DetectorState = lastDefinite;

/** Set by notifySuspectOffline() — cleared by a successful probe. */
let suspect = false;

/** A probe WITH ≥1 target has been started (boot trigger is wired). */
let firstProbeStarted = false;

/** Boot probe fired before targets existed → ONE catch-up on first setProbeTargets. */
let bootFollowUpPending = false;

let probeCount = 0;
let lastProbeAt = 0; // 0 = never probed
let lastResult: ProbeVerdict | null = null;

/** In-flight AbortControllers (bounded — cleared when the probe run ends). */
const inflight = new Set<AbortController>();

/** Definite-flip subscribers (onConnectivityChange). */
const listeners = new Set<(online: boolean) => void>();

// ─── Public API (legacy signatures kept — must_do 7) ─────────

/**
 * Check current online status — reads from detector state.
 * While 'probing' this returns the previous definite value (no flip).
 */
export function isOnline(): boolean {
	return state === 'probing' ? lastDefinite === 'online' : state === 'online';
}

/**
 * Listen for definite online/offline flips of the detector state.
 * Fires ONLY when a completed probe flips the verdict (navigator events are
 * not truth anymore — they merely trigger probes).
 * Returns an unsubscribe function.
 */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
	if (typeof window === 'undefined') return () => {};
	listeners.add(callback);
	return () => {
		listeners.delete(callback);
	};
}

// ─── wasOffline session badge (legacy semantics kept) ────────

let _wasOffline: boolean = false;

export function wasOffline(): boolean {
	return _wasOffline;
}

export function resetWasOffline(): void {
	_wasOffline = false;
}

/**
 * Start tracking wasOffline state (call once at app startup).
 * The window 'offline' event marks the session badge — it is NOT a probe
 * trigger (D1: 4 triggers only) and does not flip detector state.
 * Returns cleanup function.
 */
export function trackWasOffline(): () => void {
	if (typeof window === 'undefined') return () => {};

	const handler = () => {
		_wasOffline = true;
	};

	window.addEventListener('offline', handler);
	return () => {
		window.removeEventListener('offline', handler);
	};
}

// ─── Detector API (new exports — must_do 8) ──────────────────

export interface DetectorStatus {
	state: DetectorState;
	/** isOnline() snapshot (probing presents the previous definite value). */
	online: boolean;
	suspect: boolean;
	probing: boolean;
	/** True once a probe with ≥1 target has started (boot trigger wired). */
	bootWired: boolean;
	targets: string[];
	/** Completed probe runs that had ≥1 target. */
	probeCount: number;
	/** Unix ms of last completed probe (0 = never). */
	lastProbeAt: number;
	lastResult: ProbeVerdict | null;
}

/** Snapshot of the detector state (frozen copy — no live references). */
export function getDetectorStatus(): DetectorStatus {
	return Object.freeze({
		state,
		online: isOnline(),
		suspect,
		probing: state === 'probing',
		bootWired: firstProbeStarted,
		targets: [...targets],
		probeCount,
		lastProbeAt,
		lastResult
	});
}

/**
 * Set the probe target list (default mint + every user-configured mint).
 * The wallet layer calls this when the mint config changes (and once at
 * store init). Replaces the previous list; URLs are normalized (trailing
 * slashes stripped) and de-duplicated. Does NOT fire a probe by itself —
 * except the single late-wired boot catch-up (see module init).
 */
export function setProbeTargets(urls: string[]): void {
	const hadTargets = targets.length > 0;
	targets = [
		...new Set(
			urls
				.map(u => u.replace(/\/+$/, ''))
				.filter(u => u.length > 0)
		)
	];

	// Late-wired cold open: the module-init boot probe found no targets
	// (wallet store loads after this module) — run the boot probe ONCE as
	// soon as the first target list arrives. Single-shot; no ping loop.
	if (!firstProbeStarted && bootFollowUpPending && !hadTargets && targets.length > 0) {
		bootFollowUpPending = false;
		requestProbe('boot');
	}
}

/**
 * TRIGGER (c): an operation failed with a network error — the wallet layer
 * reports suspicion and a probe follows. Coalesced like every trigger.
 */
export function notifySuspectOffline(): void {
	suspect = true;
	requestProbe('op-fail');
}

// ─── Probe engine ────────────────────────────────────────────

/**
 * Central trigger gate — coalescing + zero-target guard + verdict apply.
 */
function requestProbe(trigger: ProbeTrigger): void {
	// Coalesce: a probe is already running — skip (probes never stack).
	if (state === 'probing') return;

	if (targets.length === 0) {
		// Nothing to probe: never flip on a guess, never park in 'probing'.
		if (trigger === 'boot') bootFollowUpPending = true;
		return;
	}

	firstProbeStarted = true;
	bootFollowUpPending = false;
	state = 'probing';

	void runProbe().then(verdict => {
		const flipped = verdict !== lastDefinite;
		state = verdict;
		lastDefinite = verdict;
		probeCount++;
		lastProbeAt = Date.now();
		lastResult = verdict;
		if (verdict === 'online') suspect = false; // probe is truth — suspicion disproven
		if (flipped) {
			for (const cb of listeners) cb(verdict === 'online');
		}
	});
}

/**
 * Probe all targets in parallel; first ok wins ('online'), all fail →
 * 'offline'. Fast-exit on first success; remaining fetches are aborted.
 * Never rejects. Snapshot taken up-front (module targets cannot change
 * mid-run — coalescing guarantees a single run).
 */
async function runProbe(): Promise<ProbeVerdict> {
	const snapshot = [...targets];
	return new Promise<ProbeVerdict>(resolve => {
		let pending = snapshot.length;
		let settled = false;
		for (const base of snapshot) {
			const ctrl = new AbortController();
			fetchProbe(base, ctrl).then(ok => {
				if (settled) return;
				if (ok) {
					settled = true;
					abortInflight();
					resolve('online');
				} else if (--pending === 0) {
					settled = true;
					resolve('offline');
				}
			});
		}
	});
}

function abortInflight(): void {
	for (const ctrl of inflight) ctrl.abort();
	inflight.clear();
}

/**
 * Raw fetch — GET `${base}/v1/info`, cache: 'no-store', AbortController
 * timeout 4s. Plain HTTP — deliberately NOT cashu/client (import-cycle
 * guard) and does NOT touch window.crypto. Success = HTTP ok response.
 */
function fetchProbe(base: string, ctrl: AbortController): Promise<boolean> {
	const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
	inflight.add(ctrl);
	return fetch(`${base}${PROBE_PATH}`, {
		method: 'GET',
		cache: 'no-store',
		signal: ctrl.signal
	})
		.then(resp => resp.ok) // "ตอบ ok" — literal: ok HTTP = target answered
		.catch(() => false) // abort/timeout/network/DNS → fail
		.finally(() => {
			clearTimeout(timer);
			inflight.delete(ctrl);
		});
}

// ─── Global trigger listeners + boot (installed once) ────────

function installTriggerListeners(): void {
	if (typeof window === 'undefined') return;

	// TRIGGER (b): window 'online' — navigator event demoted to probe trigger.
	window.addEventListener('online', () => requestProbe('online-event'));

	// TRIGGER (a): tab becomes visible again → probe.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') requestProbe('visibility');
	});
}

installTriggerListeners();

// TRIGGER (boot) — D1-boot-probe: fire the first probe immediately at module
// init. Cold open settles into real state as soon as results arrive (never
// parked in 'probing' waiting for visibilitychange). If the wallet layer has
// not wired targets yet, this records a single catch-up on setProbeTargets().
requestProbe('boot');
