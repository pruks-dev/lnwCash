<!--
  QRScanner.svelte — Unified QR scanner component (TASK-503, LnwCash Iter 5)

  Architecture decision D-6 γ (replaces src/screens/F007-QRScan.svelte entirely):
  This is the SINGLE unified QR scanner for the entire wallet. It auto-routes
  between two transport modes:

    1. Static QR (bolt11 / cashuA / cashuB) — detected by absence of the
       `ur:` prefix. The decoded string is emitted immediately via `onDecode`.

    2. Animated QR (NUT-16 UR fragments) — detected by a case-insensitive
       `ur:` prefix. Each fragment is fed into a per-instance URDecoder;
       once the decoder reports the multi-part message is fully reassembled,
       the decoded UTF-8 payload is emitted via `onDecode`. While accumulating,
       a progress bar shows the current frame-receipt percent.

  Library choice (D-1): @agicash/qr-scanner (same as cashu.me, NOT jsQR).
  WASM handling (D-7): configured in vite.config.ts via optimizeDeps.exclude +
  ?url import — see TASK-501 for the wiring details.

  Pattern source: cashu.me/QrcodeReader.vue lines 21, 53-72 (handleResult).
  The handleResult function below mirrors cashu.me verbatim — see the
  `handleResult` body for the line-by-line match.

  Lifecycle:
    onMount  — construct QrScanner, request camera, start scanning.
    onDestroy — scanner.destroy() (releases camera stream + WASM worker).

  Failure modes:
    CameraPermissionError → permissionDenied = true (paste-from-clipboard UI)
    CameraNotFoundError    → permissionDenied = true (no camera available)
    Other errors           → errorMessage populated, generic error UI

  Props:
    onDecode — (decoded: string) => void — emitted with the final decoded
              payload (static string OR animated-QR-assembled cashu token).
              Fires exactly once per scan; component auto-stops the scanner
              after emitting.
    onClose  — () => void — emitted when the user clicks the X button.

  TASK-505 will delete src/screens/F007-QRScan.svelte and rewire its
  callers to use this component instead. Do NOT modify F007 in this task.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import QrScanner, {
		CameraNotFoundError,
		CameraPermissionError,
		type ScanResult,
		type ScannerOptions
	} from '@agicash/qr-scanner';
	// Pattern source: cashu.me/QrcodeReader.vue line 4 — explicit WASM ?url import
	// then `QrScanner.configureWasm({ locateFile: ... })` below. Without this,
	// zxing-wasm fetches the WASM binary from a path the bundler doesn't know
	// about → silent worker init failure → no decoded frames (the
	// "scanner-dies-silently" symptom in the bug report). The ?url suffix
	// makes Vite emit a static URL string that locateFile() returns.
	import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
	import { createURDecoder } from '$lib/wallet/ur-decoder';

	interface Props {
		/** Emitted exactly once per scan with the final decoded payload
		 *  (static string for bolt11/cashuA/cashuB, OR the UTF-8 cashu
		 *  token reconstructed from NUT-16 animated-QR fragments). */
		onDecode: (decoded: string) => void;
		/** Emitted when the user closes the scanner (X button). */
		onClose: () => void;
	}

	let { onDecode, onClose }: Props = $props();

	// --- DOM + scanner handles ---------------------------------------------
	let videoEl: HTMLVideoElement | undefined = $state();
	let scanner: QrScanner | null = $state(null);

	// --- Per-instance stateful UR decoder (TASK-502 wrapper) ----------------
	// Each QRScanner instance owns exactly one decoder so two scans in
	// parallel (unlikely but possible if multiple <QRScanner> mounted) cannot
	// contaminate each other's UR state.
	const urDecoder = createURDecoder();

	// --- UI state -----------------------------------------------------------
	/** Progress percent 0-100 for animated QR accumulation. 0 when idle. */
	let progress: number = $state(0);
	/** True when camera permission was denied OR no camera is available. */
	let permissionDenied: boolean = $state(false);
	/** Free-text error message for unexpected scanner failures. */
	let errorMessage: string | null = $state(null);
	/** Buffer for the paste-from-clipboard fallback textarea. */
	let pastedToken: string = $state('');

	// --- Pattern source: cashu.me/QrcodeReader.vue lines 53-72 --------------
	// Mirrors cashu.me verbatim. The `ur:` prefix detection is
	// case-insensitive (matches cashu.me's `.toLowerCase().startsWith('ur:')`).
	// TASK-502's `isComplete()` already folds `isComplete() && isSuccess()`,
	// so we do NOT re-check `isSuccess()` here — the wrapper contract guarantees it.
	function handleResult(result: ScanResult) {
		const data = result.data;
		if (data.toLowerCase().startsWith('ur:')) {
			urDecoder.receivePart(data);
			progress = Math.round(urDecoder.getProgress() * 100);
			if (urDecoder.isComplete()) {
				const decoded = urDecoder.getDecoded();
				if (decoded !== null) {
					onDecode(decoded);
					stopScanner();
				}
			}
		} else {
			onDecode(data);
			stopScanner();
		}
	}

	function stopScanner() {
		// Stop the camera + scanning loop WITHOUT destroying the instance —
		// keeps the worker alive so re-start is cheap (matches cashu.me).
		scanner?.stop();
	}

	function handleClose() {
		stopScanner();
		onClose();
	}

	function handlePasteSubmit() {
		const trimmed = pastedToken.trim();
		if (trimmed.length === 0) return;
		// Re-use the same code path as a live camera decode — if it happens to
		// be a ur: fragment or static token, it goes through the same routing.
		// We synthesize a ScanResult so handleResult stays the single source
		// of truth for the decode pipeline.
		handleResult({ data: trimmed, cornerPoints: [] });
	}

	// --- Lifecycle ----------------------------------------------------------
	onMount(async () => {
		if (!videoEl) {
			errorMessage = 'Video element not mounted';
			return;
		}

		// Pattern source: cashu.me/QrcodeReader.vue lines 9-11. MUST run
		// before `new QrScanner(...)` — QrScanner's static init reads
		// the configured locateFile once during construction. Calling it
		// later has no effect on already-instantiated scanners.
		QrScanner.configureWasm({
			locateFile: () => zxingWasmUrl
		});

		// Pattern: cashu.me/QrcodeReader.vue lines 17-26 — uses
		// `preferredCamera: 'environment'` so phone cameras pick the back
		// camera by default. `maxScansPerSecond: 10` caps CPU on slower devices.
		const options: ScannerOptions = {
			preferredCamera: 'environment',
			maxScansPerSecond: 10
		};

		try {
			scanner = new QrScanner(videoEl, handleResult, options);
			await scanner.start();
		} catch (err) {
			// Per @agicash/qr-scanner API: `CameraPermissionError` is thrown
			// when the user denies getUserMedia; `CameraNotFoundError` when
			// the device has no camera (or all are in use). Both share the
			// same UX fallback — paste-from-clipboard.
			if (
				err instanceof CameraPermissionError ||
				err instanceof CameraNotFoundError ||
				(err instanceof Error && /permission|not.?found|denied/i.test(err.message))
			) {
				permissionDenied = true;
			} else {
				const msg = err instanceof Error ? err.message : String(err);
				errorMessage = `Camera error: ${msg}`;
			}
		}
	});

	onDestroy(() => {
		// MUST call destroy() — releases the MediaStream tracks AND terminates
		// the WASM worker. Without this, switching routes would leave the
		// camera indicator ON in the OS and leak a worker thread.
		scanner?.destroy();
		scanner = null;
	});
</script>

<div class="qr-scanner" data-testid="qr-scanner">
	<!-- Close button (X) — always visible in top-right, matches cashu.me
	     QrcodeReader.vue line 25 (the close button on the camera overlay). -->
	<button
		type="button"
		class="qr-scanner-close"
		aria-label="Close scanner"
		onclick={handleClose}
		data-testid="qr-scanner-close"
	>
		×
	</button>

	{#if errorMessage}
		<div class="qr-scanner-error" role="alert" data-testid="qr-scanner-error">
			<p class="qr-scanner-error-message">{errorMessage}</p>
			<button
				type="button"
				class="qr-scanner-error-close"
				onclick={handleClose}
				data-testid="qr-scanner-error-close"
			>
				Close
			</button>
		</div>
	{:else if permissionDenied}
		<div class="qr-scanner-fallback" data-testid="qr-scanner-fallback">
			<p class="qr-scanner-fallback-title">Camera unavailable</p>
			<p class="qr-scanner-fallback-help">
				Grant camera permission or paste a token manually below.
			</p>
			<textarea
				class="qr-scanner-fallback-input"
				bind:value={pastedToken}
				placeholder="cashuA... / lnbc... / ur:bytes/..."
				rows="4"
				data-testid="qr-scanner-fallback-input"
			></textarea>
			<div class="qr-scanner-fallback-actions">
				<button
					type="button"
					class="qr-scanner-fallback-use"
					disabled={pastedToken.trim().length === 0}
					onclick={handlePasteSubmit}
					data-testid="qr-scanner-fallback-use"
				>
					Use
				</button>
				<button
					type="button"
					class="qr-scanner-fallback-cancel"
					onclick={handleClose}
					data-testid="qr-scanner-fallback-cancel"
				>
					Cancel
				</button>
			</div>
		</div>
	{:else}
		<video
			bind:this={videoEl}
			class="qr-scanner-video"
			autoplay
			muted
			playsinline
			data-testid="qr-scanner-video"
		></video>
		{#if progress > 0 && progress < 100}
			<div class="qr-scanner-progress" aria-live="polite" data-testid="qr-scanner-progress">
				<span class="qr-scanner-progress-text">Frame {progress}%</span>
				<div class="qr-scanner-progress-bar">
					<div class="qr-scanner-progress-fill" style:width="{progress}%"></div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.qr-scanner {
		position: relative;
		width: 100%;
		max-width: 480px;
		margin: 0 auto;
		background: #000;
		border-radius: var(--radius-md, 8px);
		overflow: hidden;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.qr-scanner-video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		background: #000;
	}

	.qr-scanner-close {
		position: absolute;
		top: var(--space-sm, 8px);
		right: var(--space-sm, 8px);
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
		transition: background var(--transition-fast, 120ms ease);
	}

	.qr-scanner-close:hover,
	.qr-scanner-close:focus-visible {
		background: rgba(0, 0, 0, 0.85);
	}

	.qr-scanner-close:focus-visible {
		outline: 2px solid var(--color-primary, #1976d2);
		outline-offset: 2px;
	}

	.qr-scanner-progress {
		position: absolute;
		bottom: var(--space-md, 12px);
		left: var(--space-md, 12px);
		right: var(--space-md, 12px);
		padding: var(--space-sm, 8px) var(--space-md, 12px);
		background: rgba(0, 0, 0, 0.7);
		border-radius: var(--radius-md, 8px);
		color: #fff;
		font-family: var(--font-family-mono, monospace);
		font-size: var(--font-size-xs, 11px);
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs, 4px);
	}

	.qr-scanner-progress-text {
		letter-spacing: 0.05em;
	}

	.qr-scanner-progress-bar {
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-full, 999px);
		overflow: hidden;
	}

	.qr-scanner-progress-fill {
		height: 100%;
		background: var(--color-primary, #1976d2);
		transition: width 100ms linear;
	}

	.qr-scanner-fallback,
	.qr-scanner-error {
		padding: var(--space-lg, 24px);
		background: var(--color-surface, #1a1a2e);
		color: var(--color-text, #fff);
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-md, 12px);
		box-sizing: border-box;
		text-align: center;
	}

	.qr-scanner-fallback-title,
	.qr-scanner-error-message {
		margin: 0;
		font-family: var(--font-family, sans-serif);
		font-size: var(--font-size-md, 14px);
		font-weight: 600;
	}

	.qr-scanner-fallback-help {
		margin: 0;
		font-family: var(--font-family, sans-serif);
		font-size: var(--font-size-sm, 12px);
		color: var(--color-text-secondary, #aaa);
	}

	.qr-scanner-fallback-input {
		width: 100%;
		max-width: 320px;
		padding: var(--space-sm, 8px);
		font-family: var(--font-family-mono, monospace);
		font-size: var(--font-size-xs, 11px);
		background: var(--color-surface-variant, #2a2a3e);
		color: var(--color-text, #fff);
		border: 1px solid var(--color-border, #444);
		border-radius: var(--radius-sm, 4px);
		resize: vertical;
		box-sizing: border-box;
	}

	.qr-scanner-fallback-input:focus-visible {
		outline: 2px solid var(--color-primary, #1976d2);
		outline-offset: 2px;
	}

	.qr-scanner-fallback-actions {
		display: flex;
		gap: var(--space-sm, 8px);
	}

	.qr-scanner-fallback-use,
	.qr-scanner-fallback-cancel,
	.qr-scanner-error-close {
		padding: var(--space-sm, 8px) var(--space-md, 16px);
		font-family: var(--font-family, sans-serif);
		font-size: var(--font-size-sm, 13px);
		font-weight: 500;
		border-radius: var(--radius-md, 6px);
		border: 1px solid var(--color-border, #444);
		background: var(--color-surface-variant, #2a2a3e);
		color: var(--color-text, #fff);
		cursor: pointer;
		min-height: 40px;
		transition: background var(--transition-fast, 120ms ease);
	}

	.qr-scanner-fallback-use:not(:disabled) {
		background: var(--color-primary, #1976d2);
		border-color: var(--color-primary, #1976d2);
	}

	.qr-scanner-fallback-use:not(:disabled):hover,
	.qr-scanner-fallback-use:not(:disabled):focus-visible {
		background: var(--color-primary-hover, #1565c0);
	}

	.qr-scanner-fallback-use:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.qr-scanner-fallback-cancel:hover,
	.qr-scanner-fallback-cancel:focus-visible,
	.qr-scanner-error-close:hover,
	.qr-scanner-error-close:focus-visible {
		background: var(--color-surface, #1a1a2e);
	}

	.qr-scanner-fallback-use:focus-visible,
	.qr-scanner-fallback-cancel:focus-visible,
	.qr-scanner-error-close:focus-visible {
		outline: 2px solid var(--color-primary, #1976d2);
		outline-offset: 2px;
	}
</style>
