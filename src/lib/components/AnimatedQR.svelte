<script lang="ts">
	/**
	 * AnimatedQR — NUT-16 animated QR code renderer (TASK-401, Iter 4)
	 * (TASK-FIX-405: match cashu.me reference impl for scanner compatibility)
	 *
	 * Splits a payload (typically a cashu token) into NUT-16 UR fragments
	 * and renders them sequentially as a single QR canvas that swaps the
	 * current frame on a fixed interval (default 300 ms — matches cashu.me).
	 *
	 * UR encoding pipeline:
	 *   payload bytes → CBOR byte-string → BC32 encode → SHA-256 digest
	 *   → split into fragments → wrap as `ur:bytes/<seq>of<total>/<digest>/<data>`
	 * See ./ur-encoder.ts for the full algorithm (BCR-2020-005 / NUT-16).
	 *
	 * TASK-FIX-405 differences from the previous version (matches cashu.me):
	 *   - UR type tag: `crypto-token` → `bytes` (NUT-16 does not specify a
	 *     type; cashu.me uses `bytes` so phone cameras + cashu.me can scan).
	 *   - QR margin: 2 → 4 (default quiet zone; cashu.me uses 4).
	 *   - QR width: 256 → 600 (cashu.me uses 600; bigger is easier to scan
	 *     on phone cameras at typical viewing distance).
	 *   - QR error-correction level: already 'L' (Low — best for scans).
	 *   - Frame interval: 200ms → 300ms default (cashu.me default).
	 *   - Fragment length: 200 → 150 default (cashu.me default).
	 *   - Fragment length is now adjustable via the `fragmentLength` prop
	 *     (50 / 100 / 150 — cashu.me exposes the same choice).
	 *
	 * Out of scope for this iteration:
	 *   - Lightning invoice animated QR (NUT-15 / bolt11) — not requested
	 *   - Cashu receive/scan flow wiring — deferred to Iter 5
	 *   - Fountain codes (byzantine-resilient xor parts) — NUT-16 mentions
	 *     them but the current NUT-16 implementations in the wild use the
	 *     simpler multi-frame UR form, which this component targets.
	 *
	 * Props:
	 *   data — UTF-8 string payload to transmit (e.g. cashuA/cashuB token)
	 *   maxFrames — hard cap on frame count (default 300, see NUT16_MAX_FRAMES).
	 *               When exceeded, encoding is rejected with `error` populated
	 *               and nothing is rendered. Caller may downsample the input.
	 *   frameIntervalMs — milliseconds per frame (default 300, range 50–2000).
	 *                     Per NUT-16 reference implementations 150–500 ms is
	 *                     typical; 300 ms gives ~3.3 fps for a smooth loop.
	 *   size — rendered QR canvas size in pixels (default 600, range 256–1024).
	 *          600 matches cashu.me; smaller sizes are available for tight UIs.
	 *   fragmentLength — BC32 chars per fragment (default 150, options 50/100/150).
	 *                    Smaller → more frames, easier to scan; larger → fewer
	 *                    frames, harder to scan. 150 is cashu.me's default.
	 *   autoStart — begin animation on mount (default true). When false,
	 *               the component starts paused and exposes `start()` / `stop()`
	 *               via the `controller` bind.
	 *   showControls — show speed (Fast/Medium/Slow) + size (S/M/L) buttons
	 *                  (default false). When true, the user can adjust the
	 *                  frame interval and QR size without leaving the screen.
	 *                  This matches cashu.me's behaviour.
	 *
	 * Output bindings (via $bindable):
	 *   currentFrame — data URL of the currently displayed QR frame
	 *   frameIndex — 0-based index of the currently displayed frame
	 *   totalFrames — total number of frames in the animation
	 *   controller — imperative handle: { start(), stop(), next(), prev(), isPlaying() }
	 */
	import QRCode from 'qrcode';
	import { untrack } from 'svelte';
	import {
		encodeURString,
		estimateFragmentCount,
		NUT16_MAX_FRAMES
	} from '$lib/wallet/ur-encoder';

	/** Preset speeds for the user-facing controls. Matches cashu.me's three
	 *  buttons: Fast / Medium / Slow. */
	export type SpeedPreset = 'fast' | 'medium' | 'slow';
	/** Preset sizes for the user-facing controls. S/M/L mirrors cashu.me. */
	export type SizePreset = 'S' | 'M' | 'L';

	const SPEED_PRESETS: Record<SpeedPreset, number> = {
		fast: 150,    // ~6.7 fps — best for slow cameras / poor lighting
		medium: 300,  // ~3.3 fps — cashu.me default, balanced
		slow: 500     // 2 fps — easier on the human eye
	};

	const SIZE_PRESETS: Record<SizePreset, number> = {
		S: 300,   // compact, mobile-first
		M: 600,   // cashu.me default
		L: 900    // large, e.g. desktop / projector
	};

	interface Props {
		data: string;
		maxFrames?: number;
		frameIntervalMs?: number;
		size?: number;
		fragmentLength?: number;
		autoStart?: boolean;
		showControls?: boolean;
		currentFrame?: string;
		frameIndex?: number;
		totalFrames?: number;
		controller?: AnimatedQRController;
	}

	export interface AnimatedQRController {
		start: () => void;
		stop: () => void;
		next: () => void;
		prev: () => void;
		isPlaying: () => boolean;
	}

	let {
		data,
		maxFrames = NUT16_MAX_FRAMES,
		frameIntervalMs = 300,
		size = 600,
		fragmentLength = 150,
		autoStart = true,
		showControls = false,
		currentFrame = $bindable(''),
		frameIndex = $bindable(0),
		totalFrames = $bindable(0),
		controller = $bindable<AnimatedQRController | undefined>(undefined)
	}: Props = $props();

	// --- Internal state ---------------------------------------------------
	let fragments: string[] = $state([]);
	let error: string = $state('');
	let intervalHandle: ReturnType<typeof setInterval> | undefined;
	let playing: boolean = $state(false);

	// --- UI-control local state (only used when showControls === true) ----
	// The actual effective speed/size are read from the parent's props
	// (`frameIntervalMs`, `size`). These local presets are pushed up via
	// a $effect that rewrites the parent-bound props when the user clicks
	// a button. We keep a derived "selected" view to highlight the active
	// button (so the UI reflects the current prop value even when the
	// parent drives the props externally).
	let speedPreset: SpeedPreset = $state('medium');
	let sizePreset: SizePreset = $state('M');

	// Map current prop values → preset label for the "selected" highlight
	let activeSpeedPreset = $derived.by((): SpeedPreset => {
		if (frameIntervalMs <= 200) return 'fast';
		if (frameIntervalMs <= 400) return 'medium';
		return 'slow';
	});
	let activeSizePreset = $derived.by((): SizePreset => {
		if (size <= 400) return 'S';
		if (size <= 700) return 'M';
		return 'L';
	});

	function setSpeed(preset: SpeedPreset) {
		speedPreset = preset;
		frameIntervalMs = SPEED_PRESETS[preset];
	}
	function setSize(preset: SizePreset) {
		sizePreset = preset;
		size = SIZE_PRESETS[preset];
	}

	// --- QR rendering helpers ---------------------------------------------
	async function renderFrameToDataURL(text: string): Promise<string> {
		return QRCode.toDataURL(text, {
			width: 600,
			margin: 4,
			color: { dark: '#000000', light: '#ffffff' },
			errorCorrectionLevel: 'L'
		});
	}

	async function showFrame(idx: number) {
		if (fragments.length === 0) {
			currentFrame = '';
			return;
		}
		const wrapped = ((idx % fragments.length) + fragments.length) % fragments.length;
		frameIndex = wrapped;
		try {
			currentFrame = await renderFrameToDataURL(fragments[wrapped]);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to render QR frame';
			currentFrame = '';
		}
	}

	function start() {
		if (playing || fragments.length === 0) return;
		playing = true;
		// Capture the interval value at start-time so live prop changes don't
		// affect the running animation (the separate "frameIntervalMs effect"
		// below handles live reconfiguration by stopping and re-starting).
		const interval = untrack(() => frameIntervalMs);
		// Show first frame immediately, then on interval
		showFrame(0);
		intervalHandle = setInterval(() => {
			showFrame(frameIndex + 1);
		}, interval);
	}

	function stop() {
		playing = false;
		if (intervalHandle !== undefined) {
			clearInterval(intervalHandle);
			intervalHandle = undefined;
		}
	}

	function next() {
		showFrame(frameIndex + 1);
	}

	function prev() {
		showFrame(frameIndex - 1);
	}

	// --- Imperative controller (stable identity) --------------------------
	const ctrl: AnimatedQRController = {
		start,
		stop,
		next,
		prev,
		isPlaying: () => playing
	};

	// Expose the controller via the bindable prop. We only assign once
	// (on mount) to avoid effect re-runs; the parent can read it any time.
	$effect(() => {
		untrack(() => {
			controller = ctrl;
		});
		return () => {
			untrack(() => {
				controller = undefined;
			});
		};
	});

	// --- Encode pipeline effect ------------------------------------------
	// Re-encodes whenever `data` changes (and re-runs animation with the
	// current `frameIntervalMs`). `maxFrames`/`size`/`autoStart` are read
	// inside `untrack()` because they don't influence fragment identity.
	$effect(() => {
		const d = data;
		if (!d) {
			untrack(() => {
				stop();
				fragments = [];
				totalFrames = 0;
				error = '';
				currentFrame = '';
				frameIndex = 0;
			});
			return;
		}

		// Pre-flight: refuse payloads that would exceed maxFrames.
		// Use the current fragmentLength so the pre-flight count matches
		// the actual encoding (TASK-FIX-405: fragmentLength is configurable,
		// so the cap must follow it).
		const cap = maxFrames;
		const fragLen = untrack(() => fragmentLength);
		const est = estimateFragmentCount(new TextEncoder().encode(d).length, fragLen);
		if (est > cap) {
			untrack(() => {
				stop();
				fragments = [];
				totalFrames = 0;
				frameIndex = 0;
				currentFrame = '';
				error = `Payload too large: would produce ~${est} frames (maxFrames=${cap}). Reduce payload or increase maxFrames.`;
			});
			return;
		}

		// Encode
		let encoded: string[];
		try {
			encoded = encodeURString(d, { fragmentCapacity: fragLen });
		} catch (e) {
			untrack(() => {
				stop();
				fragments = [];
				totalFrames = 0;
				frameIndex = 0;
				currentFrame = '';
				error = e instanceof Error ? e.message : 'Failed to encode payload as UR';
			});
			return;
		}

		// Apply encoding & animation state (read autoStart untracked so it
		// doesn't itself trigger this effect).
		untrack(() => {
			stop();
			fragments = encoded;
			totalFrames = encoded.length;
			frameIndex = 0;
			currentFrame = '';
			error = '';
			if (autoStart) {
				if (encoded.length === 1) {
					showFrame(0);
				} else if (encoded.length > 1) {
					start();
				}
			} else if (encoded.length >= 1) {
				// paused: show first frame for visual preview
				showFrame(0);
			}
		});
	});

	// Re-encode when fragmentLength changes (user picked a new size preset
	// → smaller fragments → more frames; we must split the payload again).
	// IMPORTANT: this effect must NOT run on first mount if the data effect
	// already determined that the payload exceeds maxFrames — re-encoding
	// would override the error state and start an animation that the caller
	// has explicitly rejected via the maxFrames cap.
	$effect(() => {
		const fl = fragmentLength;
		untrack(() => {
			if (!data) return;
			// Respect the maxFrames cap that the caller configured.
			const cap = maxFrames;
			const est = estimateFragmentCount(new TextEncoder().encode(data).length, fl);
			if (est > cap) {
				stop();
				fragments = [];
				totalFrames = 0;
				frameIndex = 0;
				currentFrame = '';
				error = `Payload too large: would produce ~${est} frames (maxFrames=${cap}). Reduce payload or increase maxFrames.`;
				return;
			}
			try {
				const reEncoded = encodeURString(data, { fragmentCapacity: fl });
				stop();
				fragments = reEncoded;
				totalFrames = reEncoded.length;
				frameIndex = 0;
				currentFrame = '';
				error = '';
				if (autoStart && reEncoded.length > 1) start();
				else if (reEncoded.length >= 1) showFrame(0);
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to re-encode';
			}
		});
		// Mark `fl` as used so Svelte keeps the dependency.
		void fl;
	});

	// Restart the timer when frameIntervalMs changes while playing
	$effect(() => {
		const interval = frameIntervalMs;
		untrack(() => {
			if (playing && fragments.length > 1) {
				stop();
				start();
			}
			// Mark `interval` as used so Svelte keeps the dependency.
			void interval;
		});
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			stop();
		};
	});
</script>

<div class="animated-qr" data-testid="animated-qr">
	{#if error}
		<div class="animated-qr-error" role="alert" data-testid="animated-qr-error">
			{error}
		</div>
	{:else if currentFrame}
		<div class="animated-qr-frame" data-testid="animated-qr-frame">
			<img src={currentFrame} alt="Animated QR frame {frameIndex + 1} of {totalFrames}" class="animated-qr-image" />
			{#if totalFrames > 1}
				<div class="animated-qr-progress" aria-live="polite" data-testid="animated-qr-progress">
					<span class="animated-qr-progress-text">{frameIndex + 1}/{totalFrames}</span>
					<div class="animated-qr-progress-bar">
						<div
							class="animated-qr-progress-fill"
							style:width="{((frameIndex + 1) / totalFrames) * 100}%"
						></div>
					</div>
				</div>
			{/if}
		</div>
	{:else if fragments.length === 0 && data}
		<div class="animated-qr-placeholder" data-testid="animated-qr-placeholder">
			Encoding…
		</div>
	{:else if !data}
		<div class="animated-qr-placeholder" data-testid="animated-qr-empty">
			No data
		</div>
	{/if}

	{#if showControls && !error}
		<div class="animated-qr-controls" data-testid="animated-qr-controls">
			<div class="animated-qr-control-group" data-testid="animated-qr-speed-group">
				<span class="animated-qr-control-label">Speed</span>
				<div class="animated-qr-control-buttons" role="group" aria-label="Animation speed">
					<button
						type="button"
						class="animated-qr-control-button"
						class:active={activeSpeedPreset === 'fast'}
						aria-pressed={activeSpeedPreset === 'fast'}
						data-testid="animated-qr-speed-fast"
						onclick={() => setSpeed('fast')}
					>Fast</button>
					<button
						type="button"
						class="animated-qr-control-button"
						class:active={activeSpeedPreset === 'medium'}
						aria-pressed={activeSpeedPreset === 'medium'}
						data-testid="animated-qr-speed-medium"
						onclick={() => setSpeed('medium')}
					>Medium</button>
					<button
						type="button"
						class="animated-qr-control-button"
						class:active={activeSpeedPreset === 'slow'}
						aria-pressed={activeSpeedPreset === 'slow'}
						data-testid="animated-qr-speed-slow"
						onclick={() => setSpeed('slow')}
					>Slow</button>
				</div>
			</div>
			<div class="animated-qr-control-group" data-testid="animated-qr-size-group">
				<span class="animated-qr-control-label">Size</span>
				<div class="animated-qr-control-buttons" role="group" aria-label="QR code size">
					<button
						type="button"
						class="animated-qr-control-button"
						class:active={activeSizePreset === 'S'}
						aria-pressed={activeSizePreset === 'S'}
						data-testid="animated-qr-size-S"
						onclick={() => setSize('S')}
					>S</button>
					<button
						type="button"
						class="animated-qr-control-button"
						class:active={activeSizePreset === 'M'}
						aria-pressed={activeSizePreset === 'M'}
						data-testid="animated-qr-size-M"
						onclick={() => setSize('M')}
					>M</button>
					<button
						type="button"
						class="animated-qr-control-button"
						class:active={activeSizePreset === 'L'}
						aria-pressed={activeSizePreset === 'L'}
						data-testid="animated-qr-size-L"
						onclick={() => setSize('L')}
					>L</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.animated-qr {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		overflow: hidden;
		width: 100%;
	}

	.animated-qr-frame {
		position: relative;
		padding: var(--space-sm);
		background: #ffffff;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		line-height: 0;
		box-sizing: border-box;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.animated-qr-image {
		display: block;
		image-rendering: pixelated;
		min-width: 128px;
		min-height: 128px;
		max-width: 100%;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: contain;
	}

	.animated-qr-progress {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		line-height: normal;
	}

	.animated-qr-progress-text {
		letter-spacing: 0.05em;
	}

	.animated-qr-progress-bar {
		width: 100%;
		height: 4px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.animated-qr-progress-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 100ms linear;
	}

	.animated-qr-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		min-width: 128px;
		min-height: 128px;
		max-width: 100%;
		width: 100%;
		aspect-ratio: 1;
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-disabled);
	}

	.animated-qr-error {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--color-error, #d32f2f);
		border-radius: var(--radius-md);
		background: rgba(211, 47, 47, 0.08);
		min-width: 128px;
		min-height: 128px;
		max-width: 100%;
		width: 100%;
		aspect-ratio: 1;
		padding: var(--space-md);
		box-sizing: border-box;
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-error, #d32f2f);
		text-align: center;
	}

	/* --- UI controls (TASK-FIX-405) ------------------------------------- */
	.animated-qr-controls {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-md, 12px);
		padding: var(--space-sm, 8px);
		width: 100%;
		box-sizing: border-box;
	}

	.animated-qr-control-group {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs, 4px);
	}

	.animated-qr-control-label {
		font-family: var(--font-family);
		font-size: var(--font-size-xs, 11px);
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.animated-qr-control-buttons {
		display: inline-flex;
		gap: 4px;
		background: var(--color-surface-variant, #f0f0f0);
		border-radius: var(--radius-full, 999px);
		padding: 3px;
	}

	.animated-qr-control-button {
		font-family: var(--font-family);
		font-size: var(--font-size-sm, 13px);
		font-weight: 500;
		padding: 6px 14px;
		border: none;
		border-radius: var(--radius-full, 999px);
		background: transparent;
		color: var(--color-text-secondary, #555);
		cursor: pointer;
		transition: background 120ms ease, color 120ms ease;
		min-width: 44px;
		text-align: center;
	}

	.animated-qr-control-button:hover {
		color: var(--color-text-primary, #111);
	}

	.animated-qr-control-button.active {
		background: var(--color-primary, #1976d2);
		color: var(--color-on-primary, #fff);
		box-shadow: var(--shadow-sm);
	}

	.animated-qr-control-button:focus-visible {
		outline: 2px solid var(--color-primary, #1976d2);
		outline-offset: 2px;
	}
</style>
