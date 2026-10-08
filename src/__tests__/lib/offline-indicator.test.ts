/**
 * TASK-1307 — Detector service state tests (offline-indicator.ts).
 *
 * Covers the D1 acceptance surface:
 *   - TRIGGER boot (cold open): module-init probe with no targets is a no-op
 *     (no fetch / no flip / never parked in 'probing'); the late-wired
 *     cold open runs exactly ONE catch-up boot probe on first setProbeTargets
 *     and settles into real state as soon as results arrive.
 *   - Flight-sim ×3: probe all-fail → offline / success → online (suspect
 *     cleared) / op-fail → notifySuspectOffline() → suspect set + probe follows.
 *   - Coalesce: hammering triggers while probing → probes never stack.
 *   - No ping loop: idle window after settle fires nothing.
 *   - Probe timeout: hung target aborts at ~4s (D1 frame 3–5s).
 *   - FR-2: navigator.onLine is NOT truth (flipping it moves nothing).
 *   - Legacy signatures kept: isOnline / onConnectivityChange / wasOffline /
 *     trackWasOffline / resetWasOffline.
 *   - FR-2 re-export: wallet/offline.ts shares the same detector state.
 *
 * Module-scope singleton: tests are order-aware by design (state persists
 * across tests in this file — each test drives its own precondition).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

type DetectorModule = typeof import('../../lib/offline-indicator');

let mod: DetectorModule;

function flush(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

async function waitForState(
	expected: 'online' | 'offline' | 'probing',
	timeout = 1000
): Promise<void> {
	await vi.waitFor(
		() => {
			expect(mod.getDetectorStatus().state).toBe(expected);
		},
		{ timeout, interval: 10 }
	);
}

beforeAll(async () => {
	vi.stubGlobal('fetch', fetchMock);
	mod = await import('../../lib/offline-indicator');
});

beforeEach(() => {
	fetchMock.mockReset();
	mod.resetWasOffline();
});

describe('TASK-1307 — TRIGGER boot (cold open)', () => {
	it('module init with zero targets: no fetch, seed state, never parked in probing', () => {
		const st = mod.getDetectorStatus();
		expect(fetchMock).not.toHaveBeenCalled(); // boot probe without targets = no-op
		expect(st.state).toBe('online'); // seed from navigator.onLine (jsdom: true)
		expect(st.probing).toBe(false); // NOT stuck probing
		expect(st.bootWired).toBe(false);
		expect(st.probeCount).toBe(0);
	});

	it('late-wired cold open: first setProbeTargets fires ONE catch-up boot probe → real state lands', async () => {
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		mod.setProbeTargets(['https://mint.a']);

		await waitForState('online');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://mint.a/v1/info',
			expect.objectContaining({
				method: 'GET',
				cache: 'no-store',
				signal: expect.any(AbortSignal)
			})
		);

		const st = mod.getDetectorStatus();
		expect(st.bootWired).toBe(true);
		expect(st.probeCount).toBe(1);
		expect(st.lastResult).toBe('online');
		expect(st.suspect).toBe(false);
	});
});

describe('TASK-1307 — flight-sim (probe verdicts)', () => {
	it('probe all-fail → offline + isOnline() false', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 503 });
		window.dispatchEvent(new Event('online')); // trigger (b)

		await waitForState('offline');
		expect(mod.isOnline()).toBe(false);
		expect(mod.getDetectorStatus().lastResult).toBe('offline');
	});

	it('probe success → online + suspect cleared', async () => {
		// arrive offline with suspicion set
		fetchMock.mockResolvedValue({ ok: false });
		mod.notifySuspectOffline(); // trigger (c) → probe follows → all fail
		await waitForState('offline');
		expect(mod.getDetectorStatus().suspect).toBe(true);

		// a successful probe flips online and clears the suspicion
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		document.dispatchEvent(new Event('visibilitychange')); // trigger (a) — jsdom is 'visible'
		await waitForState('online');
		expect(mod.isOnline()).toBe(true);
		expect(mod.getDetectorStatus().suspect).toBe(false);
	});

	it('op-fail → notifySuspectOffline sets suspect immediately and exactly one probe follows', async () => {
		// precondition: online (previous test)
		expect(mod.getDetectorStatus().state).toBe('online');

		fetchMock.mockResolvedValue({ ok: true });
		mod.notifySuspectOffline();
		expect(mod.getDetectorStatus().suspect).toBe(true); // immediate

		await waitForState('online'); // verdict lands (probe followed the report)
		expect(fetchMock).toHaveBeenCalledTimes(1); // exactly one probe followed
		expect(mod.getDetectorStatus().suspect).toBe(false);
	});
});

describe('TASK-1307 — coalesce (no probe stacking)', () => {
	it('5 triggers while probing → exactly one probe; settles then probes again on next trigger', async () => {
		// TASK-1401 COALESCING bond: triggers arriving while 'probing' are
		// QUEUED (one slot — never dropped silently) and replayed exactly
		// once after settle; probes still never stack. Every fetch parks
		// until explicitly released (releases[] drains the whole run).
		const releases: Array<(v: { ok: boolean }) => void> = [];
		fetchMock.mockImplementation(
			() =>
				new Promise<{ ok: boolean }>(res => {
					releases.push(res);
				})
		);

		window.dispatchEvent(new Event('online')); // trigger 1 — enters probing
		await vi.waitFor(() => expect(mod.getDetectorStatus().probing).toBe(true));

		// hammer 4 more triggers while probing — queued, never stacked
		document.dispatchEvent(new Event('visibilitychange')); // 2
		window.dispatchEvent(new Event('online')); // 3
		mod.notifySuspectOffline(); // 4
		mod.setProbeTargets(['https://mint.b', 'https://mint.a']); // 5 — target push is not a trigger

		expect(fetchMock).toHaveBeenCalledTimes(1); // probes never stack

		// release the first run (single target) → settles offline → the
		// queued trigger replays EXACTLY once (one fetch PER TARGET —
		// list is [mint.b, mint.a] now: 1 first run + 2 replay).
		releases.splice(0).forEach(r => r({ ok: false }));
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		// release the replay run (2 parked fetches) → settles offline.
		releases.splice(0).forEach(r => r({ ok: false }));
		await waitForState('offline');

		// queue drained — state rests offline (no second replay, no ping loop).
		await new Promise(resolve => setTimeout(resolve, 50));
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(mod.getDetectorStatus().state).toBe('offline');

		// after settling, a new trigger runs a fresh probe (not stuck).
		// One probe run = one fetch PER TARGET (list is [mint.b, mint.a] now);
		// a stacked second run would double that count.
		fetchMock.mockClear();
		fetchMock.mockResolvedValue({ ok: true });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(fetchMock).toHaveBeenCalledTimes(mod.getDetectorStatus().targets.length);
	});
});

describe('TASK-1307 — no ping loop / probe timeout / probing semantics', () => {
	it('idle window after settle: no scheduled re-probe (probeCount stable)', async () => {
		const before = mod.getDetectorStatus().probeCount;
		await new Promise(resolve => setTimeout(resolve, 120));
		expect(mod.getDetectorStatus().probeCount).toBe(before);
	});

	it('probe timeout: hung target aborts within the 4s frame → offline', async () => {
		vi.useFakeTimers();
		try {
			fetchMock.mockImplementation(
				(_url: string, init?: { signal?: AbortSignal }) =>
					new Promise((_res, rej) => {
						init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
					})
			);
			window.dispatchEvent(new Event('online')); // trigger (b)
			await vi.advanceTimersByTimeAsync(3999);
			expect(mod.getDetectorStatus().state).toBe('probing'); // still inside the frame
			await vi.advanceTimersByTimeAsync(10); // ≥ 4000ms → abort fires
			expect(mod.getDetectorStatus().state).toBe('offline');
		} finally {
			vi.useRealTimers();
		}
	});

	it('isOnline() during probing returns the previous definite value (no flip)', async () => {
		// precondition: offline (previous test)
		expect(mod.getDetectorStatus().state).toBe('offline');

		let release!: (v: { ok: boolean }) => void;
		fetchMock.mockImplementation(
			() =>
				new Promise<{ ok: boolean }>(res => {
					release = res;
				})
		);
		window.dispatchEvent(new Event('online'));
		await vi.waitFor(() => expect(mod.getDetectorStatus().probing).toBe(true));

		expect(mod.isOnline()).toBe(false); // probing presents pre-probe definite

		release({ ok: true });
		await waitForState('online');
		expect(mod.isOnline()).toBe(true);
	});

	it('FR-2: navigator.onLine is not truth — flipping it moves nothing', async () => {
		expect(mod.getDetectorStatus().state).toBe('online');
		fetchMock.mockResolvedValue({ ok: true });

		Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
		window.dispatchEvent(new Event('online')); // trigger → probe → verdict online
		await flush();
		expect(mod.getDetectorStatus().state).toBe('online');
		expect(mod.isOnline()).toBe(true);

		Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
	});
});

describe('TASK-1307 — legacy API semantics', () => {
	it('wasOffline badge: offline event marks the session (legacy semantics kept)', () => {
		const cleanup = mod.trackWasOffline();
		window.dispatchEvent(new Event('offline'));
		expect(mod.wasOffline()).toBe(true);
		cleanup();
		mod.resetWasOffline();
		expect(mod.wasOffline()).toBe(false);
	});

	it('onConnectivityChange fires only on definite flips; unsubscribe works', async () => {
		const cb = vi.fn();
		const cleanup = mod.onConnectivityChange(cb);

		// currently online → drive offline → exactly one flip callback
		fetchMock.mockResolvedValue({ ok: false });
		window.dispatchEvent(new Event('online'));
		await waitForState('offline');
		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(false);

		// same verdict again — no flip, no callback
		window.dispatchEvent(new Event('online'));
		await flush();
		expect(cb).toHaveBeenCalledTimes(1);

		cleanup();
		// flip after unsubscribe → no callback
		fetchMock.mockResolvedValue({ ok: true });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('API surface: legacy signatures + new exports all present', () => {
		expect(typeof mod.isOnline).toBe('function');
		expect(typeof mod.onConnectivityChange).toBe('function');
		expect(typeof mod.wasOffline).toBe('function');
		expect(typeof mod.trackWasOffline).toBe('function');
		expect(typeof mod.resetWasOffline).toBe('function');
		expect(typeof mod.getDetectorStatus).toBe('function');
		expect(typeof mod.notifySuspectOffline).toBe('function');
		expect(typeof mod.setProbeTargets).toBe('function');
	});

	it('multi-target: success = at least one target ok (parallel launch, fast exit)', async () => {
		fetchMock.mockImplementation((url: string) =>
			Promise.resolve(
				url.startsWith('https://mint.bad') ? { ok: false, status: 500 } : { ok: true, status: 200 }
			)
		);
		mod.setProbeTargets(['https://mint.bad', 'https://mint.good']);
		window.dispatchEvent(new Event('online'));

		await waitForState('online');
		expect(fetchMock).toHaveBeenCalledTimes(2); // both targets launched in parallel
	});
});

describe('TASK-1307 — FR-2: offline.ts thin re-export', () => {
	it('offline.ts isOnline/onConnectivityChange share the detector state (signatures kept)', async () => {
		const legacy = await import('../../lib/wallet/offline');

		expect(typeof legacy.isOnline).toBe('function');
		expect(typeof legacy.onConnectivityChange).toBe('function');

		// same underlying state — no separate navigator read
		expect(legacy.isOnline()).toBe(mod.isOnline());

		// flip via detector → legacy view follows (one state for the entire app)
		fetchMock.mockResolvedValue({ ok: false });
		window.dispatchEvent(new Event('online'));
		await waitForState('offline');
		expect(legacy.isOnline()).toBe(false);

		// legacy subscription receives the same definite flips
		const cb = vi.fn();
		const off = legacy.onConnectivityChange(cb);
		fetchMock.mockResolvedValue({ ok: true });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(cb).toHaveBeenCalledWith(true);
		off();
	});
});
