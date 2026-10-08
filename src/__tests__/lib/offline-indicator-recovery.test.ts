/**
 * TASK-1401 (INTENT-013 — F-049-001 recovery-chain) — 4 bonds + EVENT API.
 *
 * Fresh module registry per test FILE (vitest isolate): the module-init boot
 * probe runs HERE with zero targets → the catch-up boot probe fires on the
 * first setProbeTargets() — which is exactly the BOOT-DRAIN scenario
 * (test 1 must run before any other setProbeTargets call in this file).
 *
 * Bonds:
 *   1. BOOT-DRAIN — first boot probe answers online + pile non-empty →
 *      onOnlineConfirmed fires IMMEDIATELY (no flip wait — the seed is
 *      already 'online', so onConnectivityChange stays silent).
 *   2. RETRY — offline verdicts walk the ladder 3s→6s→12s→24s→cap 60s;
 *      online confirms cancel every timer.
 *   3. OFFLINE-HEARTBEAT — same schedule re-fires GET `${mint}/v1/info`
 *      while offline (boss: 'ตอน offline ไม่เห็นมีการยิง /v1/info เช็คเลย');
 *      online = silence.
 *   4. COALESCING — triggers while probing queue ONE replay (never dropped
 *      silently, never stacked).
 *   5. EVENT API — onOnlineConfirmed export + steady-state flip fires +
 *      unsubscribe; the drain binding itself is TASK-1402 scope.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

type DetectorModule = typeof import('../../lib/offline-indicator');

let mod: DetectorModule;

async function waitForState(
	expected: 'online' | 'offline' | 'probing',
	timeout = 2000
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

afterEach(() => {
	vi.useRealTimers();
});

describe('TASK-1401 — BOOT-DRAIN (bond 1)', () => {
	it("boot online + pile pending → onOnlineConfirmed fires immediately, no flip wait ('แล้วตอนที่ผม รีเฟรช boot ใหม่ ไม่มีการเช็ค pending swap ให้ proof ใช้ได้เลย')", async () => {
		const confirmed = vi.fn();
		const flip = vi.fn();
		const offConfirmed = mod.onOnlineConfirmed(confirmed);
		const offFlip = mod.onConnectivityChange(flip);

		// The wallet layer registers its pile reader (TASK-1402) — here the
		// pile is NON-EMPTY (pending swaps await draining after refresh).
		mod.setPendingPileReader(() => true);

		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		mod.setProbeTargets(['https://mint.boot.test']); // ONE catch-up boot probe (trigger 'boot')

		await waitForState('online');
		expect(confirmed).toHaveBeenCalledTimes(1); // fired — ห้ามรอ flip
		expect(flip).not.toHaveBeenCalled(); // no flip: seed was already online — proof of "no flip wait"
		expect(mod.getDetectorStatus().lastResult).toBe('online');

		offConfirmed();
		offFlip();
		// Leave the reader armed (harmless — boot bond already consumed).
		mod.setPendingPileReader(() => false);
	});
});

describe('TASK-1401 — EVENT API onOnlineConfirmed (bond 5)', () => {
	it('steady-state offline→online flip fires onOnlineConfirmed; unsubscribe works', async () => {
		// precondition: online (boot test ends online)
		expect(mod.getDetectorStatus().state).toBe('online');

		fetchMock.mockResolvedValue({ ok: false, status: 503 });
		window.dispatchEvent(new Event('online'));
		await waitForState('offline');

		const cb = vi.fn();
		const off = mod.onOnlineConfirmed(cb);

		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(cb).toHaveBeenCalledTimes(1);
		expect(mod.getRecoveryStatus()).toEqual({ retryStep: 0, liveTimers: 0 });

		off();
		// after unsubscribe: another full flip cycle → silent
		fetchMock.mockResolvedValue({ ok: false, status: 503 });
		window.dispatchEvent(new Event('online'));
		await waitForState('offline');
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(cb).toHaveBeenCalledTimes(1);
	});

	it('API surface: new exports present (onOnlineConfirmed / setPendingPileReader / getRecoveryStatus / RETRY_BACKOFF_MS)', () => {
		expect(typeof mod.onOnlineConfirmed).toBe('function');
		expect(typeof mod.setPendingPileReader).toBe('function');
		expect(typeof mod.getRecoveryStatus).toBe('function');
		expect([...mod.RETRY_BACKOFF_MS]).toEqual([3000, 6000, 12000, 24000, 60000]);
	});
});

describe('TASK-1401 — RETRY ladder (bond 2)', () => {
	it('offline verdicts walk 3s→6s→12s→24s→cap 60s; online cancels every timer', async () => {
		// precondition: online
		expect(mod.getDetectorStatus().state).toBe('online');

		// Fake timers BEFORE the offline verdict: the retry schedule must be
		// armed on the fake clock (a real-clock timer is invisible to it).
		// Probes run on stubbed fetch — no timer dependency (mock resolves
		// immediately), so fake time only gates retry + abort-timeout.
		// NOTE: vi.waitFor needs the REAL clock — drive the verdict with a
		// real-timer poll instead.
		vi.useFakeTimers();
		try {
			fetchMock.mockResolvedValue({ ok: false, status: 503 });
			window.dispatchEvent(new Event('online'));
			// pump the fake clock in small slices until the verdict lands
			// (fetch mock resolves without timers; abort-timeout is 4s).
			// Track elapsed fake-ms: the 3s retry is measured from the
			// verdict, not from dispatch.
			let elapsed = 0;
			for (let i = 0; i < 100 && mod.getDetectorStatus().state !== 'offline'; i++) {
				await vi.advanceTimersByTimeAsync(10);
				elapsed += 10;
			}
			expect(mod.getDetectorStatus().state).toBe('offline');
			expect(mod.getRecoveryStatus()).toEqual({ retryStep: 1, liveTimers: 1 });
			const callsAfterVerdict = fetchMock.mock.calls.length;

			// step 1: fires exactly 3000ms after the verdict — walk up to
			// (3000 - elapsed - 1), assert silence, then cross the line.
			const toStep1 = 3000 - elapsed - 1;
			await vi.advanceTimersByTimeAsync(toStep1);
			expect(fetchMock.mock.calls.length).toBe(callsAfterVerdict);
			await vi.advanceTimersByTimeAsync(1);
			expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterVerdict);
			// retry probe failed too (mock still false) → offline → step 2
			expect(mod.getDetectorStatus().state).toBe('offline');
			expect(mod.getRecoveryStatus().retryStep).toBe(2);

			// step 2: 6s
			const afterStep1 = fetchMock.mock.calls.length;
			await vi.advanceTimersByTimeAsync(5999);
			expect(fetchMock.mock.calls.length).toBe(afterStep1);
			await vi.advanceTimersByTimeAsync(1);
			expect(fetchMock.mock.calls.length).toBeGreaterThan(afterStep1);
			expect(mod.getRecoveryStatus().retryStep).toBe(3);

			// step 3: 12s → step 4: 24s → step 5: 60s
			for (const [delay, step] of [[12000, 4], [24000, 5]] as const) {
				const before = fetchMock.mock.calls.length;
				await vi.advanceTimersByTimeAsync(delay);
				expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
				expect(mod.getRecoveryStatus().retryStep).toBe(step);
			}

			// cap: next delay stays 60s (59999ms silent, fires at 60000ms)
			const beforeCap = fetchMock.mock.calls.length;
			await vi.advanceTimersByTimeAsync(59999);
			expect(fetchMock.mock.calls.length).toBe(beforeCap);
			await vi.advanceTimersByTimeAsync(1);
			expect(fetchMock.mock.calls.length).toBeGreaterThan(beforeCap);
		} finally {
			vi.useRealTimers();
		}

		// online confirmed = cancel every timer + reset ladder
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(mod.getRecoveryStatus()).toEqual({ retryStep: 0, liveTimers: 0 });
	});
});

describe('TASK-1401 — OFFLINE-HEARTBEAT (bond 3)', () => {
	it("while offline the schedule re-fires GET <mint>/v1/info ('ตอน offline ไม่เห็นมีการยิง /v1/info เช็คเลย' — now it does); online = silence", async () => {
		expect(mod.getDetectorStatus().state).toBe('online');

		// Fake timers BEFORE the offline verdict (same reason as RETRY test).
		// vi.waitFor needs the REAL clock — poll with fake-clock slices.
		vi.useFakeTimers();
		try {
			fetchMock.mockResolvedValue({ ok: false, status: 503 });
			fetchMock.mockClear();
			window.dispatchEvent(new Event('online'));
			for (let i = 0; i < 100 && mod.getDetectorStatus().state !== 'offline'; i++) {
				await vi.advanceTimersByTimeAsync(10);
			}
			expect(mod.getDetectorStatus().state).toBe('offline');

			const v1infoHits = () =>
				fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/v1/info')).length;
			expect(v1infoHits()).toBeGreaterThan(0); // the verdict probe itself

			await vi.advanceTimersByTimeAsync(3000); // first heartbeat
			expect(v1infoHits()).toBeGreaterThan(1); // heartbeat re-fired /v1/info while offline
		} finally {
			vi.useRealTimers();
		}

		// online → silence: far beyond the 60s cap, nothing new fires
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(mod.getRecoveryStatus().liveTimers).toBe(0);
		const settledCalls = fetchMock.mock.calls.length;
		vi.useFakeTimers();
		try {
			await vi.advanceTimersByTimeAsync(120000);
		} finally {
			vi.useRealTimers();
		}
		expect(fetchMock.mock.calls.length).toBe(settledCalls); // online = 0 timer = silence
	});
});

describe('TASK-1401 — COALESCING queue+replay (bond 4)', () => {
	it('triggers while probing queue ONE replay — never dropped silently, never stacked', async () => {
		// precondition: online (previous test ends offline — drive it first;
		// the run-start also cancels the armed retry → hygiene holds).
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		window.dispatchEvent(new Event('online'));
		await waitForState('online');
		expect(mod.getRecoveryStatus()).toEqual({ retryStep: 0, liveTimers: 0 });

		const releases: Array<(v: { ok: boolean }) => void> = [];
		fetchMock.mockClear(); // drop the precondition drive calls — count the run below only
		fetchMock.mockImplementation(
			() =>
				new Promise<{ ok: boolean }>(res => {
					releases.push(res);
				})
		);

		window.dispatchEvent(new Event('online')); // run 1 — enters probing
		await vi.waitFor(() => expect(mod.getDetectorStatus().probing).toBe(true));

		window.dispatchEvent(new Event('online')); // queued
		mod.notifySuspectOffline(); // queued (single slot — latest wins)
		expect(fetchMock.mock.calls.length).toBe(1); // probes never stack

		releases.splice(0).forEach(r => r({ ok: false })); // settle run 1 → offline
		await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(2)); // EXACTLY one replay
		releases.splice(0).forEach(r => r({ ok: false })); // settle replay → offline
		await waitForState('offline');

		await new Promise(resolve => setTimeout(resolve, 50));
		expect(fetchMock.mock.calls.length).toBe(2); // queue drained — no more
		expect(mod.getDetectorStatus().state).toBe('offline');
	});
});

describe('TASK-1401 — online = 0 timers (hygiene)', () => {
	it('confirmed online leaves zero live timers (retry cancelled at run start + on verdict)', async () => {
		// precondition: offline with a real retry armed (previous test ends offline)
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		window.dispatchEvent(new Event('online')); // run-start cancels the armed retry
		await waitForState('online');
		expect(mod.getRecoveryStatus()).toEqual({ retryStep: 0, liveTimers: 0 });
	});

	it("boot-drain negative (LAST): boot online + EMPTY pile → onOnlineConfirmed stays silent — fresh singleton, no window events dispatched", async () => {
		vi.resetModules();
		const fresh: DetectorModule = await import('../../lib/offline-indicator');
		const cb = vi.fn();
		const off = fresh.onOnlineConfirmed(cb);
		fresh.setPendingPileReader(() => false); // pile ว่าง — nothing to drain
		fetchMock.mockResolvedValue({ ok: true, status: 200 });
		fresh.setProbeTargets(['https://mint.empty.test']); // catch-up boot probe
		await vi.waitFor(
			() => {
				expect(fresh.getDetectorStatus().state).toBe('online');
			},
			{ timeout: 2000, interval: 10 }
		);
		await new Promise(resolve => setTimeout(resolve, 100));
		expect(cb).not.toHaveBeenCalled();
		off();
	});
});
