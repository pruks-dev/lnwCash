<script lang="ts">
	/**
	 * AnimatedQR — NUT-16 animated QR code renderer (TASK-401, Iter 4)
	 *
	 * Splits a payload (typically a cashu token) into NUT-16 UR fragments
	 * and renders them sequentially as a single QR canvas that swaps the
	 * current frame on a fixed interval (default 200 ms).
	 *
	 * UR encoding pipeline:
	 *   payload bytes → CBOR byte-string → BC32 encode → SHA-256 digest
	 *   → split into fragments → wrap as `ur:crypto-token/<seq>of<total>/<digest>/<data>`
	 * See ./ur-encoder.ts for the full algorithm (BCR-2020-005 / NUT-16).
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
	 *   frameIntervalMs — milliseconds per frame (default 200, range 50–2000).
	 *                     Per NUT-16 reference implementations 150–300 ms is
	 *                     typical; 200 ms gives ~5 fps for a smooth loop.
	 *   size — rendered QR canvas size in pixels (default 256, range 128–512)
	 *   autoStart — begin animation on mount (default true). When false,
	 *               the component starts paused and exposes `start()` / `stop()`
	 *               via the `controller` bind.
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

	interface Props {
		data: string;
		maxFrames?: number;
		frameIntervalMs?: number;
		size?: number;
		autoStart?: boolean;
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
		frameIntervalMs = 200,
		size = 256,
		autoStart = true,
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

	// --- QR rendering helpers ---------------------------------------------
	async function renderFrameToDataURL(text: string): Promise<string> {
		return QRCode.toDataURL(text, {
			width: size,
			margin: 2,
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

		// Pre-flight: refuse payloads that would exceed maxFrames
		const cap = maxFrames;
		const est = estimateFragmentCount(new TextEncoder().encode(d).length, 200);
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
			encoded = encodeURString(d, { fragmentCapacity: 200 });
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
		max-width: min(320px, 100%);
		max-height: min(320px, 100%);
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
		max-width: min(320px, 100%);
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
		max-width: min(320px, 100%);
		width: 100%;
		aspect-ratio: 1;
		padding: var(--space-md);
		box-sizing: border-box;
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-error, #d32f2f);
		text-align: center;
	}
</style>
