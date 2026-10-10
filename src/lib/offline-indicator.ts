/**
 * TASK-1307 (INTENT-013 wave 5 — FR-2 + D1 + D1-boot-probe)
 * Detector service — ONE connectivity state for the entire app.
 *
 * TASK-1401 (INTENT-013 — F-049-001 recovery-chain): on top of the TASK-1307
 * detector, four recovery bonds — BOOT-DRAIN / RETRY / OFFLINE-HEARTBEAT /
 * COALESCING — plus the EVENT API onOnlineConfirmed. The 4 external triggers
 * are UNTOUCHED (additive only); recovery reuses the same probe engine and
 * introduces NO new trigger kind, NO ping loop, NO setInterval — and the
 * detector NEVER fires a flush itself (it only emits onOnlineConfirmed; the
 * drain binding is TASK-1402 scope).
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
 * External triggers (exactly 4 — D1; no ping loop, no setInterval, no recursion):
 *   (boot) module init fires the first probe immediately — cold open ends in
 *          real state as soon as results arrive, never parked in 'probing'
 *          waiting for visibilitychange. When targets are not wired yet (the
 *          wallet store loads after this module in the app graph), exactly
 *          ONE catch-up boot probe runs on the first setProbeTargets().
 *   (a)    visibilitychange → 'visible' → probe
 *   (b)    window 'online' event → probe
 *   (c)    notifySuspectOffline() — after an op fails with a network error —
 *          probe follows
 * ('retry' below is NOT a 5th external trigger — it is the internal
 *  continuation of the RETRY/OFFLINE-HEARTBEAT schedule: one offline-only
 *  setTimeout re-entering the same gate. No setInterval, no ping loop.)
 *
 *   Recovery bonds (TASK-1401 — F-049-001; additive — triggers above are
 *   untouched):
 *   - BOOT-DRAIN: the first boot probe answering 'online' (trigger 'boot')
 *     while the pending pile is non-empty fires onOnlineConfirmed
 *     IMMEDIATELY (no flip wait — fires even when the verdict matches the
 *     seed). The detector never flushes itself; it only signals.
 *   - RETRY: a failed probe schedules a backoff re-probe 3s→6s→12s→24s→cap
 *     60s — offline-state ONLY. Any confirmed 'online' verdict cancels every
 *     pending retry timer. No setInterval, no ping loop (D1 holds).
 *   - OFFLINE-HEARTBEAT: runs on the same RETRY schedule while state is
 *     'offline' — the retry probe IS the heartbeat (GET `${mint}/v1/info`,
 *     the boss quote: 'ตอน offline ไม่เห็นมีการยิง /v1/info เช็คเลย' —
 *     now it fires). online = zero timers.
 *   - COALESCING: a trigger arriving while 'probing' is queued (ONE slot)
 *     and replayed exactly once when the in-flight run settles — never
 *     dropped silently, never stacked.
 *
 * Usage in Svelte 5:
 *   import { isOnline, onConnectivityChange, onOnlineConfirmed, wasOffline } from '$lib/offline-indicator';
 *
 *   let online = $state(isOnline());
 *   $effect(() => onConnectivityChange(v => online = v));
 *   $effect(() => onOnlineConfirmed(() => drainPending())); // TASK-1402 binding
 */

export type DetectorState = 'online' | 'offline' | 'probing';

type ProbeTrigger = 'boot' | 'visibility' | 'online-event' | 'op-fail' | 'retry';
type ProbeVerdict = 'online' | 'offline';

/** D1 probe frame 3–5s → fixed 4s per target fetch. */
const PROBE_TIMEOUT_MS = 4000;

/** Probe path appended to each mint URL. */
const PROBE_PATH = '/v1/info';

/** TASK-1401 RETRY bond — offline-only backoff ladder (ms): 3s→6s→12s→24s→cap 60s. */
export const RETRY_BACKOFF_MS = [3000, 6000, 12000, 24000, 60000] as const;

/** TASK-1401 COALESCING bond — queued trigger slot (ONE; latest wins). */
let coalescedTrigger: ProbeTrigger | null = null;

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

/** TASK-1401 EVENT API — confirmed-online subscribers (onOnlineConfirmed).
 *  Fires when a probe run CONFIRMS online (boot-drain: even without a flip;
 *  steady-state: on the offline→online flip). The detector itself never
 *  flushes — the pending-drain binding subscribes here (TASK-1402 scope). */
const onlineConfirmedListeners = new Set<() => void>();

/** TASK-1401 RETRY bond — pending backoff step + live timer handle.
 *  Timers exist ONLY while state === 'offline' (offline-only; online
 *  confirms cancel every timer → online = 0 timers, enforced by tests). */
let retryStep = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** TASK-1401 BOOT-DRAIN bond — true until the first boot probe answers. */
let bootProbeAwaiting = false;

/**
 * TASK-1401 pending-pile reader — set by the wallet layer (TASK-1402) so
 * the boot-drain bond can know whether a pending pile awaits draining.
 * Default: no pile (detector never imports the wallet — import-cycle guard).
 */
let hasPendingPile: () => boolean = () => false;

/** TASK-1401 — register the pending-pile reader (wallet layer, TASK-1402). */
export function setPendingPileReader(reader: () => boolean): void {
	hasPendingPile = reader;
}

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

/**
 * TASK-1401 EVENT API — subscribe to CONFIRMED-online moments.
 * Fires when a probe run confirms 'online':
 *   - BOOT-DRAIN: the first boot probe answers online + pending pile
 *     non-empty → fires immediately (no flip wait);
 *   - steady-state: any probe run flips offline/probing → online.
 * The detector NEVER flushes — the drain binding (TASK-1402) subscribes here.
 * Returns an unsubscribe function.
 */
export function onOnlineConfirmed(callback: () => void): () => void {
	if (typeof window === 'undefined') return () => {};
	onlineConfirmedListeners.add(callback);
	return () => {
		onlineConfirmedListeners.delete(callback);
	};
}

/** TASK-1401 — test/ops introspection: pending retry step + live timer count (online must be 0). */
export function getRecoveryStatus(): { retryStep: number; liveTimers: number } {
	return { retryStep, liveTimers: retryTimer === null ? 0 : 1 };
}

/** TASK-1401 — cancel every pending retry timer (online-confirm path). */
function cancelRetryTimers(): void {
	if (retryTimer !== null) {
		clearTimeout(retryTimer);
		retryTimer = null;
	}
}

/**
 * TASK-1401 RETRY + OFFLINE-HEARTBEAT bond — schedule the next backoff probe.
 * Single setTimeout (NO setInterval, NO ping loop); armed ONLY while the
 * settled state is 'offline'. The retry probe IS the heartbeat: it re-fires
 * GET `${mint}/v1/info` on the ladder 3s→6s→12s→24s→cap 60s (boss quote:
 * 'ตอน offline ไม่เห็นมีการยิง /v1/info เช็คเลย' — this schedule is the check).
 */
function scheduleRetry(): void {
	if (state !== 'offline') return;
	if (retryTimer !== null) return; // one timer at a time — never stack
	const delay = RETRY_BACKOFF_MS[Math.min(retryStep, RETRY_BACKOFF_MS.length - 1)];
	retryStep++;
	retryTimer = setTimeout(() => {
		retryTimer = null;
		requestProbe('retry');
	}, delay);
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
 *
 * TASK-1401 COALESCING bond: a trigger arriving while 'probing' is queued
 * into ONE slot (latest wins) and replayed exactly once when the in-flight
 * run settles — never dropped silently, probes still never stack.
 */
function requestProbe(trigger: ProbeTrigger): void {
	// COALESCING: a probe is already running — queue ONE replay (never stack).
	if (state === 'probing') {
		coalescedTrigger = trigger;
		return;
	}

	if (targets.length === 0) {
		// Nothing to probe: never flip on a guess, never park in 'probing'.
		if (trigger === 'boot') bootFollowUpPending = true;
		return;
	}

	if (trigger === 'boot') bootProbeAwaiting = true;
	firstProbeStarted = true;
	bootFollowUpPending = false;
	// A fresh probe run supersedes any armed retry (the new verdict will
	// schedule its own follow-up) — one timer at a time, never stacked.
	cancelRetryTimers();
	state = 'probing';

	void runProbe().then(verdict => {
		applyVerdict(verdict, trigger);
		// COALESCING replay: exactly one queued trigger runs after settle.
		const replay = coalescedTrigger;
		coalescedTrigger = null;
		if (replay !== null) requestProbe(replay);
	});
}

/**
 * TASK-1401 verdict apply — single settlement point for every probe run:
 * flip listeners (unchanged D1), onOnlineConfirmed event, retry schedule.
 */
function applyVerdict(verdict: ProbeVerdict, trigger: ProbeTrigger): void {
	const flipped = verdict !== lastDefinite;
	state = verdict;
	lastDefinite = verdict;
	probeCount++;
	lastProbeAt = Date.now();
	lastResult = verdict;
	if (verdict === 'online') {
		suspect = false; // probe is truth — suspicion disproven
		cancelRetryTimers(); // online confirmed = cancel every timer
		retryStep = 0;
	} else {
		scheduleRetry(); // offline → backoff retry (= OFFLINE-HEARTBEAT schedule)
	}

	// BOOT-DRAIN: the FIRST boot probe answered 'online' (trigger 'boot',
	// the boss quote: 'แล้วตอนที่ผม รีเฟรช boot ใหม่ ไม่มีการเช็ค pending
	// swap ให้ proof ใช้ได้เลย') — with a non-empty pending pile, fire
	// onOnlineConfirmed IMMEDIATELY (no flip wait — the seed may already be
	// 'online'). Detector only signals; the drain itself is TASK-1402.
	const wasBootVerdict = bootProbeAwaiting && trigger === 'boot';
	bootProbeAwaiting = false;

	const confirmedOnline = verdict === 'online' && (flipped || wasBootVerdict);
	if (confirmedOnline) {
		const drainable = wasBootVerdict ? hasPendingPile() : true;
		if (drainable) {
			for (const cb of [...onlineConfirmedListeners]) {
				try {
					cb();
				} catch {
					// one bad subscriber must not break the rest of the chain
				}
			}
		}
	}

	if (flipped) {
		for (const cb of listeners) cb(verdict === 'online');
	}
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
