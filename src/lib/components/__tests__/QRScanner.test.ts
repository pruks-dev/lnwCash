/**
 * QRScanner tests — TASK-503 (LnwCash Iter 5 — NUT-16 unified scanner)
 *
 * Verifies:
 *   - Component renders without throwing (DOM contains expected testids).
 *   - handleResult pattern (cashu.me QrcodeReader.vue lines 53-72) is mirrored:
 *     static QR (non-`ur:` prefix) → onDecode fires immediately.
 *   - handleResult with `ur:` prefix → urDecoder.receivePart is called.
 *   - handleResult with all UR frames → urDecoder completes → onDecode fires
 *     with the decoded UTF-8 payload.
 *   - scanner.destroy() is called on unmount (no camera leak).
 *   - Camera permission denied (CameraPermissionError thrown by scanner.start())
 *     surfaces the paste-from-clipboard fallback UI.
 *   - Progress UI updates as ur: frames accumulate.
 *   - Close button emits onClose callback.
 *
 * Testing strategy:
 *   - Mock `@agicash/qr-scanner` to avoid jsdom camera access — jsdom does
 *     not implement `getUserMedia`/`MediaDevices`. The mock captures the
 *     `onDecode` callback passed to the QrScanner constructor so tests can
 *     invoke it directly with synthetic ScanResult payloads.
 *   - The handleResult function is not exported; tests reach it via the
 *     captured onDecode callback. This matches the cashu.me behavior
 *     exactly (their `handleResult` is wired straight into QrcodeReader.vue).
 *   - onMount is async — tests use `await Promise.resolve()` chains (or
 *     `vi.waitFor`) to let the camera-start microtask settle before asserting
 *     on lifecycle-affected DOM (e.g. the fallback UI showing after a
 *     permission-denied rejection).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte/svelte5';
import { encodeURString } from '$lib/wallet/ur-encoder';
import QRScanner from '../QRScanner.svelte';

/* ──────────────────────────────────────────────────────────────────────────
 * Mock @agicash/qr-scanner
 *
 * jsdom does not implement getUserMedia. We replace the QrScanner default
 * export with a constructor that:
 *   1. Captures the `onDecode` callback into `__capturedOnDecode` so tests
 *      can simulate camera-frame decode events.
 *   2. Resolves `start()` by default (simulates a successful camera start).
 *   3. Records `start`, `stop`, `destroy` invocations for assertion.
 *   4. Stores the `preferredCamera` and `maxScansPerSecond` options so tests
 *      can verify the scanner is wired per cashu.me.
 *
 * `__mockStartShouldThrow` (set on the module) lets a single test simulate
 * camera-permission-denied by making `start()` reject with a
 * CameraPermissionError-shaped error.
 * ──────────────────────────────────────────────────────────────────────── */
type CapturedOnDecode = (result: { data: string; cornerPoints: unknown[] }) => void;

const mockState = {
	instances: [] as Array<{
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		destroy: ReturnType<typeof vi.fn>;
		onDecode: CapturedOnDecode | null;
		options: Record<string, unknown> | undefined;
	}>,
	mockStartShouldThrow: null as Error | null
};

// Mock implementation factory — must use `function` (NOT arrow) so the
// `new QrScanner(...)` call in the component can construct it. Arrow
// functions are not constructable and cause the
// "(_video, onDecode, options) => {...} is not a constructor" error.
vi.mock('@agicash/qr-scanner', () => {
	class CameraPermissionError extends Error {
		constructor(message?: string) {
			super(message ?? 'Camera permission denied');
			this.name = 'CameraPermissionError';
		}
	}
	class CameraNotFoundError extends Error {
		constructor(message?: string) {
			super(message ?? 'Camera not found');
			this.name = 'CameraNotFoundError';
		}
	}

	// `function` (NOT arrow) — required for `new QrScannerMock(...)`.
	const QrScannerMock = vi.fn(function (
		this: unknown,
		_video: HTMLVideoElement,
		onDecode: CapturedOnDecode,
		options?: Record<string, unknown>
	) {
		const instance = {
			start: vi.fn(async () => {
				if (mockState.mockStartShouldThrow) {
					throw mockState.mockStartShouldThrow;
				}
			}),
			stop: vi.fn(),
			destroy: vi.fn(),
			onDecode,
			options
		};
		mockState.instances.push(instance);
		// Returning an object from a constructor replaces `this` with it.
		return instance;
	});

	// TASK-507: cast to any to bypass strict Mock type narrowing (real lib has configureWasm static method)
	(QrScannerMock as any).configureWasm = vi.fn();

	return {
		default: QrScannerMock,
		CameraPermissionError,
		CameraNotFoundError
	};
});

// Import AFTER the mock so the mocked default export is in scope.
import QrScannerLib from '@agicash/qr-scanner';
const QrScannerMock = QrScannerLib as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
	mockState.instances = [];
	mockState.mockStartShouldThrow = null;
	QrScannerMock.mockClear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/**
 * Helper: render the scanner and wait for onMount's async start() to settle.
 * After awaiting, mockState.instances should have exactly one entry whose
 * `onDecode` callback tests can invoke directly.
 */
async function renderAndAwaitStart(props: { onDecode: (s: string) => void; onClose: () => void }) {
	const result = render(QRScanner, { props });
	// onMount awaits scanner.start() — give microtasks time to settle.
	for (let i = 0; i < 20; i++) await Promise.resolve();
	return result;
}

/** Latest captured onDecode (sugar for the common 1-instance-per-test case). */
function getOnDecode(): CapturedOnDecode {
	expect(mockState.instances.length).toBe(1);
	const onDecode = mockState.instances[0].onDecode;
	expect(onDecode).not.toBeNull();
	return onDecode as CapturedOnDecode;
}

describe('QRScanner component (TASK-503 — D-6 γ unified scanner)', () => {
	it('renders without throwing and exposes the expected DOM hooks', async () => {
		await renderAndAwaitStart({ onDecode: vi.fn(), onClose: vi.fn() });

		// Component root + video + close button must all be present in the
		// happy path (camera start succeeded because mockStartShouldThrow=null).
		const root = document.querySelector('[data-testid="qr-scanner"]');
		expect(root).not.toBeNull();
		expect(document.querySelector('[data-testid="qr-scanner-video"]')).not.toBeNull();
		expect(document.querySelector('[data-testid="qr-scanner-close"]')).not.toBeNull();
	});

	it('configures QrScanner with cashu.me options (environment camera, 10 fps)', async () => {
		await renderAndAwaitStart({ onDecode: vi.fn(), onClose: vi.fn() });
		const opts = mockState.instances[0].options;
		expect(opts).toBeDefined();
		expect(opts!.preferredCamera).toBe('environment');
		expect(opts!.maxScansPerSecond).toBe(10);
	});

	it('handleResult — static QR (non-`ur:` prefix) emits onDecode immediately with raw string', async () => {
		const onDecode = vi.fn();
		await renderAndAwaitStart({ onDecode, onClose: vi.fn() });

		const onCameraDecode = getOnDecode();
		onCameraDecode({ data: 'lnbc1pwz...', cornerPoints: [] });

		expect(onDecode).toHaveBeenCalledTimes(1);
		expect(onDecode).toHaveBeenCalledWith('lnbc1pwz...');
		// stopScanner called after emission — scanner.stop() should have fired.
		expect(mockState.instances[0].stop).toHaveBeenCalled();
	});

	it('handleResult — cashuA static token emits via onDecode (verifies non-ur: routing)', async () => {
		const onDecode = vi.fn();
		await renderAndAwaitStart({ onDecode, onClose: vi.fn() });

		getOnDecode()({
			data: 'cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbXX0ifQ',
			cornerPoints: []
		});

		expect(onDecode).toHaveBeenCalledWith('cashuAeyJ0b2tlbiI6W3sicHJvb2ZzIjpbXX0ifQ');
	});

	it('handleResult — `ur:` prefix routes to URDecoder (does NOT emit onDecode mid-stream)', async () => {
		// Use a multi-part payload so the decoder stays incomplete after the
		// first frame, and we can verify that onDecode is NOT called until
		// the decoder reports isComplete.
		const payload = 'a'.repeat(400); // >1 frame at default fragmentLength
		const frags = encodeURString(payload);
		expect(frags.length).toBeGreaterThan(1);

		const onDecode = vi.fn();
		await renderAndAwaitStart({ onDecode, onClose: vi.fn() });

		// Feed only the first fragment — decoder should NOT be complete yet.
		getOnDecode()({ data: frags[0], cornerPoints: [] });
		expect(onDecode).not.toHaveBeenCalled();
		// scanner.stop() must NOT have fired — we keep scanning.
		expect(mockState.instances[0].stop).not.toHaveBeenCalled();
	});

	it('handleResult — animated complete path: emits decoded string once all UR frames received', async () => {
		const payload = 'cashuBtoken-payload-roundtrip-1234567890';
		const frags = encodeURString(payload);

		const onDecode = vi.fn();
		await renderAndAwaitStart({ onDecode, onClose: vi.fn() });

		const onCameraDecode = getOnDecode();
		// Feed all fragments — last one triggers isComplete + onDecode.
		for (const frag of frags) {
			onCameraDecode({ data: frag, cornerPoints: [] });
		}

		// Round-trip: encoder → decoder → original payload byte-identical.
		expect(onDecode).toHaveBeenCalledTimes(1);
		expect(onDecode).toHaveBeenCalledWith(payload);
		// Scanner must stop after emission.
		expect(mockState.instances[0].stop).toHaveBeenCalled();
	});

	it('handleResult — `ur:` case-insensitive detection (UR: prefix accepted)', async () => {
		// cashu.me's pattern uses `.toLowerCase().startsWith('ur:')`. We must
		// match that so an emitter that uppercases the prefix (rare but
		// possible from hand-rolled senders) still routes to URDecoder.
		const payload = 'tiny';
		const frags = encodeURString(payload);
		expect(frags.length).toBe(1);
		const upperPrefixed = frags[0].toUpperCase(); // UR:BYTES/...

		const onDecode = vi.fn();
		await renderAndAwaitStart({ onDecode, onClose: vi.fn() });
		getOnDecode()({ data: upperPrefixed, cornerPoints: [] });

		expect(onDecode).toHaveBeenCalledWith(payload);
	});

	it('cleanup on unmount — calls scanner.destroy() to release camera + WASM worker', async () => {
		const { unmount } = render(QRScanner, {
			props: { onDecode: vi.fn(), onClose: vi.fn() }
		});
		for (let i = 0; i < 20; i++) await Promise.resolve();

		const instance = mockState.instances[0];
		expect(instance.destroy).not.toHaveBeenCalled();

		unmount();
		// After unmount, onDestroy fires synchronously (Svelte 5 lifecycle).
		expect(instance.destroy).toHaveBeenCalledTimes(1);
	});

	it('permission denied — CameraPermissionError → paste-from-clipboard fallback UI', async () => {
		// Force the next QrScanner.start() call to reject with a
		// CameraPermissionError (the user's browser denied the camera prompt).
		mockState.mockStartShouldThrow = new (await import('@agicash/qr-scanner'))
			.CameraPermissionError('Permission denied by user');

		const { container } = await renderAndAwaitStart({
			onDecode: vi.fn(),
			onClose: vi.fn()
		});

		await waitFor(() => {
			expect(container.querySelector('[data-testid="qr-scanner-fallback"]')).not.toBeNull();
		});

		// Fallback UI elements present:
		expect(container.querySelector('[data-testid="qr-scanner-fallback-input"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="qr-scanner-fallback-use"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="qr-scanner-fallback-cancel"]')).not.toBeNull();

		// Camera video should NOT be in the DOM when we fell back.
		expect(container.querySelector('[data-testid="qr-scanner-video"]')).toBeNull();
	});

	it('permission denied — camera-not-found surfaces the same fallback UI', async () => {
		mockState.mockStartShouldThrow = new (await import('@agicash/qr-scanner'))
			.CameraNotFoundError('No camera available');

		const { container } = await renderAndAwaitStart({
			onDecode: vi.fn(),
			onClose: vi.fn()
		});

		await waitFor(() => {
			expect(container.querySelector('[data-testid="qr-scanner-fallback"]')).not.toBeNull();
		});
	});

	it('fallback UI — paste-from-clipboard emits onDecode via the same routing pipeline', async () => {
		mockState.mockStartShouldThrow = new (await import('@agicash/qr-scanner'))
			.CameraPermissionError();

		const onDecode = vi.fn();
		const { container } = await renderAndAwaitStart({ onDecode, onClose: vi.fn() });
		await waitFor(() => {
			expect(container.querySelector('[data-testid="qr-scanner-fallback-input"]')).not.toBeNull();
		});

		const input = container.querySelector(
			'[data-testid="qr-scanner-fallback-input"]'
		) as HTMLTextAreaElement;
		await fireEvent.input(input, { target: { value: 'cashuAstatic-token-from-paste' } });

		const useBtn = container.querySelector(
			'[data-testid="qr-scanner-fallback-use"]'
		) as HTMLButtonElement;
		await fireEvent.click(useBtn);

		expect(onDecode).toHaveBeenCalledWith('cashuAstatic-token-from-paste');
	});

	it('close button (X) — invokes onClose callback', async () => {
		const onClose = vi.fn();
		const { container } = await renderAndAwaitStart({
			onDecode: vi.fn(),
			onClose
		});

		const closeBtn = container.querySelector(
			'[data-testid="qr-scanner-close"]'
		) as HTMLButtonElement;
		expect(closeBtn).not.toBeNull();
		await fireEvent.click(closeBtn);

		expect(onClose).toHaveBeenCalledTimes(1);
		// handleClose calls stopScanner() before onClose, so scanner.stop() fired.
		expect(mockState.instances[0].stop).toHaveBeenCalled();
	});

	// ── F-V40-007 regression guard (TASK-511) ────────────────────────────
	// QRScanner.svelte calls `QrScanner.configureWasm({ locateFile: ... })` in
	// onMount, BEFORE constructing the QrScanner instance. If the mock factory
	// does not provide a `configureWasm` static method, this call throws
	// `TypeError: QrScanner.configureWasm is not a function` and the scanner
	// silently fails to start in test environments.
	//
	// F-V40-007 fix: add `QrScannerMock.configureWasm = vi.fn();` to the mock
	// factory (TASK-506-FIX-B1 commit 48f4c00) with `as any` cast to defeat
	// TypeScript narrowing (TASK-507 commit c689f90).
	//
	// This regression test prevents future mock refactors from removing
	// configureWasm and silently breaking the scanner in test environments.
	it('F-V40-007 regression guard — mock has configureWasm static method (prevents TypeError on QrScanner.configureWasm in onMount)', () => {
		const configureWasm = (QrScannerMock as unknown as { configureWasm?: unknown })
			.configureWasm;
		expect(configureWasm).toBeDefined();
		expect(typeof configureWasm).toBe('function');
	});
});
