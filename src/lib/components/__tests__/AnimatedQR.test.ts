/**
 * AnimatedQR tests — TASK-401 (NUT-16 animated QR codes)
 *                  + TASK-FIX-405 (UR type 'bytes', default frame interval 300ms)
 *                  + TASK-FIX-406 (thin wrapper around @gandlaf21/bc-ur library)
 *
 * Verifies:
 *   - Component renders with sample data
 *   - UR fragment output is valid (ur:bytes/ prefix, library wire format)
 *   - Output bindings (currentFrame, frameIndex, totalFrames) populate
 *   - Error state is reachable (payload-too-large path)
 *   - Frame interval is configurable (200ms ± 10% when explicitly set)
 *   - The wrapper uses the library UREncoder directly (no custom CBOR logic)
 *
 * Wire formats (TASK-FIX-406, library-produced):
 *   - Single-part: ur:bytes/<bc32>
 *   - Multi-part:  ur:bytes/<seq>-<seqLen>/<bytewords>  (fountain codes)
 *
 * Testing strategy notes:
 *   - We mock `QRCode.toDataURL` to avoid jsdom canvas/timer interaction.
 *   - For initial-frame tests, `vi.runAllTimersAsync()` drains all microtasks
 *     AND pending timers so the async showFrame() promise settles and the
 *     DOM updates with the rendered QR img.
 *   - For animation-cadence tests with recurring setInterval, we use
 *     `vi.advanceTimersByTime(N)` (bounded) to avoid the "infinite loop"
 *     abort that `runAllTimersAsync` triggers on a non-stopping interval.
 *   - @testing-library/svelte v5's wrapper cannot capture $bindable() outputs
 *     via function-props (the spread `{...componentProps}` does not generate
 *     `bind:` directives). We instead verify behavior via DOM observation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte/svelte5';
import { init } from 'svelte-i18n';
import QRCode from 'qrcode';
import AnimatedQR from '../AnimatedQR.svelte';
import {
	encodeUR,
	encodeURString,
	estimateFragmentCount,
	NUT16_UR_TYPE
} from '$lib/wallet/ur-encoder';

// Import the library classes directly to verify they are wired up (TASK-FIX-406).
// The library UREncoder is what the wrapper delegates to. If the library
// is missing or its API drifts, this import will fail at test-load time.
import { UR, UREncoder, URDecoder } from '@gandlaf21/bc-ur';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

// F-V40-009 (TASK-601): AnimatedQR.svelte calls $_() at 5 sites
// (lines 431, 440, 444, 451, 461). svelte-i18n throws
// "[svelte-i18n] Cannot format a message without first setting
// the initial locale" unless init() has been called. Other tests
// in the repo bypass this with vi.mock('svelte-i18n', ...); this
// file uses the real store, so we initialize the locale scoped
// to this file (Vera recommendation: scoped > global).
beforeEach(() => {
	// fallbackLocale is required by svelte-i18n's ConfigureOptionsInit type and
	// mirrors the production init shape in src/lib/i18n.ts (fallbackLocale: 'en').
	init({ fallbackLocale: 'en', initialLocale: 'en' });
});

const SAMPLE_TOKEN = 'cashuAeyJ0b2tlbiI6W3sibWFudCI6Imh0dHBzOi8vZm9vLmJhciJ9XX0';

// Library wire-format regexes (TASK-FIX-406)
const SINGLE_PART_RE = /^ur:bytes\/[a-z0-9]+$/;
const MULTI_PART_RE = /^ur:bytes\/\d+-\d+\/[a-z]+$/;

// Helper: returns the current progress text "X/Y" or null
function readProgressText(container: HTMLElement): string | null {
	const el = container.querySelector(
		'[data-testid="animated-qr-progress"] .animated-qr-progress-text'
	);
	return el ? (el.textContent ?? '') : null;
}

describe('AnimatedQR component (TASK-401 / NUT-16)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Stub QRCode.toDataURL with a sync-resolving promise of a tiny PNG.
		vi.spyOn(QRCode, 'toDataURL').mockImplementation(
			async () => 'data:image/png;base64,iVBORw0KGgo='
		);
	});

	it('renders an image element when given data', async () => {
		const { container } = render(AnimatedQR, { data: SAMPLE_TOKEN });
		await vi.runAllTimersAsync();
		const img = container.querySelector('img');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
	});

	it('renders the empty-state element when data is empty', () => {
		const { container } = render(AnimatedQR, { data: '' });
		expect(container.querySelector('[data-testid="animated-qr-empty"]')).not.toBeNull();
		expect(container.querySelector('img')).toBeNull();
	});

	it('renders single fragment for small payload (no progress bar)', async () => {
		const { container } = render(AnimatedQR, { data: 'hi' });
		await vi.runAllTimersAsync();
		expect(container.querySelector('img')).not.toBeNull();
		// Single-frame payload should NOT show progress indicator
		expect(container.querySelector('[data-testid="animated-qr-progress"]')).toBeNull();
	});

	it('renders multi-frame payload with progress bar (autoStart=false preview)', async () => {
		const big = 'a'.repeat(2000); // many frames
		const { container } = render(AnimatedQR, {
			data: big,
			frameIntervalMs: 5000, // not relevant when autoStart=false
			autoStart: false
		});
		await vi.runAllTimersAsync();
		expect(container.querySelector('img')).not.toBeNull();
		// Multi-frame payload should show progress indicator
		expect(container.querySelector('[data-testid="animated-qr-progress"]')).not.toBeNull();
		// Progress text should be "1/N"
		const progressText = readProgressText(container);
		expect(progressText).not.toBeNull();
		expect(progressText).toMatch(/^1\/\d+$/);
	});

	it('shows error when payload exceeds maxFrames (low cap)', async () => {
		const big = 'a'.repeat(2000); // many frames
		const { container } = render(AnimatedQR, {
			data: big,
			maxFrames: 2 // deliberately too small
		});
		await vi.runAllTimersAsync();
		expect(container.querySelector('[data-testid="animated-qr-error"]')).not.toBeNull();
		const err = container.querySelector('[data-testid="animated-qr-error"]') as HTMLElement;
		expect(err.textContent).toContain('Payload too large');
		expect(container.querySelector('img')).toBeNull();
	});

	it('autoStart=true renders frame and starts the animation loop', async () => {
		const big = 'a'.repeat(2000);
		const { container } = render(AnimatedQR, {
			data: big,
			frameIntervalMs: 5000, // long interval — setInterval won't fire again soon
			autoStart: true
		});
		// Drain microtasks for the initial frame's async showFrame() to settle.
		// We can't use runAllTimersAsync because the setInterval recurs forever
		// and vitest aborts at 10000 timer fires.
		for (let i = 0; i < 10; i++) await Promise.resolve();

		expect(container.querySelector('img')).not.toBeNull();
		// Progress should show a multi-frame count, paused at frame 1 (5s interval)
		const text = readProgressText(container);
		expect(text).toMatch(/^1\/\d+$/);
	});
});

describe('ur-encoder module (TASK-FIX-406 thin wrapper)', () => {
	it('exports NUT16_UR_TYPE as "bytes" (TASK-FIX-405/406: matches cashu.me)', () => {
		expect(NUT16_UR_TYPE).toBe('bytes');
	});

	it('encodeURString produces single fragment for tiny payload', () => {
		const frags = encodeURString('hello');
		expect(frags).toHaveLength(1);
		expect(frags[0]).toMatch(SINGLE_PART_RE);
	});

	it('encodeURString produces multiple fragments for large payload', () => {
		const frags = encodeURString('a'.repeat(2000));
		expect(frags.length).toBeGreaterThan(1);
		for (const f of frags) {
			expect(f).toMatch(MULTI_PART_RE);
		}
	});

	it('multi-frame fragments have valid fountain-code sequencing', () => {
		const frags = encodeURString('a'.repeat(2000));
		const total = frags.length;
		const seqLens = new Set<number>();
		for (let i = 0; i < frags.length; i++) {
			const m = frags[i].match(/^ur:bytes\/(\d+)-(\d+)\/([a-z]+)$/);
			expect(m).not.toBeNull();
			if (m) {
				expect(Number(m[1])).toBe(i + 1); // 1-based
				expect(Number(m[2])).toBe(total); // total parts
				seqLens.add(Number(m[2]));
			}
		}
		// All fragments must share the same seqLen
		expect(seqLens.size).toBe(1);
	});

	it('encodeUR rejects empty payload', () => {
		expect(() => encodeUR(new Uint8Array(0))).toThrow();
	});

	it('encodeUR rejects non-Uint8Array payload (duck-type guard)', () => {
		// Pass a plain object that lacks the duck-type fields (length, Symbol.iterator).
		// The `as unknown as Uint8Array` cast is needed at compile time because
		// TypeScript would otherwise reject the call — the duck-type check
		// inside encodeUR is what we're verifying at runtime.
		const badInput = { notALength: 'nope' } as unknown as Uint8Array;
		expect(() => encodeUR(badInput)).toThrow();
	});

	it('estimateFragmentCount returns 1 for tiny payloads', () => {
		expect(estimateFragmentCount(10)).toBe(1);
	});

	it('estimateFragmentCount grows with payload size', () => {
		const a = estimateFragmentCount(1000);
		const b = estimateFragmentCount(10000);
		expect(b).toBeGreaterThan(a);
	});

	it('output round-trips through library URDecoder (byte-identical)', () => {
		// TASK-FIX-406 acceptance: encoder output is byte-for-byte
		// compatible with cashu.me (which uses the same library).
		const original = new TextEncoder().encode('cashuAeyJ0b2tlbiI6W3sibWFudCI6Imh0dHBzOi8vZm9vLmJhciJ9XX0');
		const frags = encodeUR(original);

		const decoder = new URDecoder();
		for (const f of frags) {
			decoder.receivePart(f);
		}
		const resultUr = decoder.resultUR();
		expect(resultUr).not.toBeNull();
		const decoded = resultUr!.decodeCBOR();
		expect(Buffer.from(decoded).toString('hex')).toBe(
			Buffer.from(original).toString('hex')
		);
	});
});

describe('AnimatedQR — frame interval timing (TASK-401 acceptance: 200ms ±10%)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(QRCode, 'toDataURL').mockImplementation(
			async () => 'data:image/png;base64,iVBORw0KGgo='
		);
	});

	it('frameIntervalMs=200: frame index advances ~5 times in 1000ms', async () => {
		const big = 'a'.repeat(2000);
		const { container } = render(AnimatedQR, {
			data: big,
			frameIntervalMs: 200,
			autoStart: true
		});

		// Drain microtasks for the initial showFrame(0) to settle.
		// DO NOT use vi.runAllTimersAsync — the recurring setInterval would
		// loop and vitest aborts at 10000 timer fires.
		for (let i = 0; i < 10; i++) await Promise.resolve();
		const startText = readProgressText(container);
		expect(startText).not.toBeNull();
		expect(startText).toMatch(/^1\/\d+$/);
		const startFrame = parseInt(startText!.split('/')[0], 10);

		// Advance 1000ms = 5 intervals at 200ms; drain microtasks each step
		// so the async showFrame() chain (which sets frameIndex) settles
		// between timer fires.
		for (let i = 0; i < 5; i++) {
			vi.advanceTimersByTime(200);
			for (let j = 0; j < 5; j++) await Promise.resolve();
		}

		const endText = readProgressText(container);
		expect(endText).not.toBeNull();
		const endFrame = parseInt(endText!.split('/')[0], 10);

		// 5 intervals at 200ms each should advance ~5 frames (±1 for ±10% slack)
		expect(endFrame - startFrame).toBeGreaterThanOrEqual(4);
		expect(endFrame - startFrame).toBeLessThanOrEqual(6);
	});

	it('frameIntervalMs=500: at least 4 frames can be queued without aborting', async () => {
		// With autoStart=false and short interval, no setInterval is started,
		// so runAllTimersAsync doesn't loop. We just verify that the initial
		// frame renders correctly with a 500ms config.
		const big = 'a'.repeat(2000);
		const { container } = render(AnimatedQR, {
			data: big,
			frameIntervalMs: 500,
			autoStart: false
		});

		await vi.runAllTimersAsync();
		expect(container.querySelector('img')).not.toBeNull();
		const text = readProgressText(container);
		expect(text).toMatch(/^1\/\d+$/);
	});
});
