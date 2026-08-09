<script lang="ts">
	/**
	 * F007-QRScan — QR Scanner Camera Preview (TASK-122 / MOD-004 + MOD-007)
	 *
	 * Features:
	 * - Full viewport camera preview with scan region overlay
	 * - jsQR continuous frame scanning via canvas readback
	 * - bolt11/cashuA/cashuB auto-detect and route
	 * - UX states: idle → requesting → scanning → found | denied | error | nocamera
	 * - Manual input fallback for no-camera environments
	 * - Theme reactive via CSS custom properties
	 */

	import { _ } from 'svelte-i18n';
	import jsQR from 'jsqr';
	import Copy from '$lib/components/icons/Copy.svelte';
	import { scannedQRValue } from '$lib/stores/scannedQR';

	interface Props {
		onResult?: (result: string) => void;
		onClose?: () => void;
	}

	let { onResult, onClose }: Props = $props();

	// ─── State ──────────────────────────────────────────────────
	type ScanState = 'idle' | 'requesting' | 'scanning' | 'found' | 'denied' | 'error' | 'nocamera' | 'uploading';

	let scanState: ScanState = $state('idle');
	let stream: MediaStream | null = $state(null);
	let videoRef: HTMLVideoElement | undefined = $state();
	let canvasRef: HTMLCanvasElement | undefined = $state();
	let rafId: number = $state(0);
	let frameCount = 0;
	let toastMessage: string = $state('');
	let toastVisible: boolean = $state(false);
	let toastType: 'info' | 'success' | 'error' | 'warning' = $state('info');
	let manualInput: string = $state('');
	let lastResult: string = $state('');
	let fileInputRef: HTMLInputElement | undefined = $state();
	let uploadPreviewUrl: string = $state('');

	// ─── Cleanup ────────────────────────────────────────────────
	$effect(() => {
		return () => {
			stopCamera();
			if (rafId) cancelAnimationFrame(rafId);
		};
	});

	// Connect video element to stream once both are ready (fixes race: videoRef
	// may be undefined when startCamera() assigns stream because DOM hasn't rendered yet)
	$effect(() => {
		const video = videoRef;
		const s = stream;
		if (video && s && video.srcObject !== s) {
			video.srcObject = s;
			video.play().catch(() => {});
		}
	});

	// ─── Camera ─────────────────────────────────────────────────

	function stopCamera() {
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
	}

	async function startCamera() {
		scanState = 'requesting';
		lastResult = '';

		if (!navigator.mediaDevices?.getUserMedia) {
			scanState = 'nocamera';
			return;
		}

		try {
			const mediaStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
			});
			stream = mediaStream;

			scanState = 'scanning';
			startFrameLoop();
		} catch (e) {
			stopCamera();
			if (e instanceof DOMException && e.name === 'NotAllowedError') {
				scanState = 'denied';
			} else {
				scanState = 'error';
			}
		}
	}

	// ─── jsQR Frame Scanning ────────────────────────────────────

	function startFrameLoop() {
		function tick() {
			if (scanState !== 'scanning') return;
			scanFrame();
			rafId = requestAnimationFrame(tick);
		}
		rafId = requestAnimationFrame(tick);
	}

	function scanFrame() {
		frameCount++;
		if (frameCount % 3 !== 0) return;

		if (!videoRef || !canvasRef) return;

		const video = videoRef;
		const canvas = canvasRef;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;

		// Only process if video is ready and has dimensions
		if (video.videoWidth === 0 || video.videoHeight === 0) return;

		// Scale canvas down for performance (capture at 50% resolution)
		const scale = 0.8;
		const w = Math.floor(video.videoWidth * scale);
		const h = Math.floor(video.videoHeight * scale);

		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}

		ctx.drawImage(video, 0, 0, w, h);
		const imageData = ctx.getImageData(0, 0, w, h);

		try {
			const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
			if (code && code.data) {
				if (code.data !== lastResult) {
					lastResult = code.data;
					handleDetection(code.data);
				}
			} else {
				lastResult = ''; // reset when no QR in frame → re-detect on next scan
			}
		} catch {
			// jsQR parse error — ignore and continue scanning
		}
	}

	// ─── Detection & Routing ────────────────────────────────────

	function detectType(value: string): 'bolt11' | 'cashuA' | 'cashuB' | 'unknown' {
		// Strip URI scheme prefixes and normalize
		const lowered = value.replace(/^(lightning:|bitcoin:)/i, '').toLowerCase();
		if (lowered.startsWith('lnbc') || lowered.startsWith('lntb') || lowered.startsWith('lnurl')) {
			return 'bolt11';
		}
		if (lowered.startsWith('cashua')) return 'cashuA';
		if (lowered.startsWith('cashub')) return 'cashuB';
		return 'unknown';
	}

	function handleDetection(value: string) {
		const type = detectType(value);
		// Strip URI prefix for bolt11 (send screen expects raw invoice)
		const clean = value.replace(/^(lightning:|bitcoin:)/i, '');

		if (type === 'bolt11') {
			scanState = 'found';
			stopCamera();
			scannedQRValue.set(clean);
			// TASK-133 (F-V13-010): Pass invoice via URL hash params
			window.location.hash = '/send?invoice=' + encodeURIComponent(clean);
		} else if (type === 'cashuA' || type === 'cashuB') {
			scanState = 'found';
			stopCamera();
			scannedQRValue.set(value);
			// TASK-133 (F-V13-010): Pass token via URL hash params
			window.location.hash = '/receive?token=' + encodeURIComponent(value);
		} else {
			// Unknown format — toast + keep scanning
			lastResult = value;
			showToast($_('screen.qrscan.unknown_format'), 'warning');
		}
	}

	// ─── Toast ──────────────────────────────────────────────────

	function showToast(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
		toastMessage = message;
		toastType = type;
		toastVisible = true;
		setTimeout(() => {
			toastVisible = false;
		}, 3000);
	}

	function dismissToast() {
		toastVisible = false;
	}

	// ─── Manual Input ───────────────────────────────────────────

	function handleManualSubmit() {
		const trimmed = manualInput.trim();
		if (!trimmed) return;
		onResult?.(trimmed);
	}

	// ─── Close ──────────────────────────────────────────────────

	function handleClose() {
		stopCamera();
		onClose?.();
	}

	function handleRetry() {
		lastResult = '';
		startCamera();
	}

	// ─── File Upload QR Fallback ───────────────────────────────

	function triggerFileUpload() {
		uploadPreviewUrl = '';
		fileInputRef?.click();
	}

	async function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const previousState = scanState;
		scanState = 'uploading';

		let dataUrl: string;
		try {
			dataUrl = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => reject(new Error('FileReader error'));
				reader.readAsDataURL(file);
			});
		} catch {
			showToast($_('screen.qrscan.decode_failed'), 'error');
			scanState = previousState;
			input.value = '';
			return;
		}

		uploadPreviewUrl = dataUrl;

		try {
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Image load error'));
				img.src = dataUrl;
			});

			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) throw new Error('No canvas context');

			canvas.width = img.width;
			canvas.height = img.height;
			ctx.drawImage(img, 0, 0);
			const imageData = ctx.getImageData(0, 0, img.width, img.height);

			const code = jsQR(imageData.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });

			if (code && code.data) {
				handleDetection(code.data);
			} else {
				showToast($_('screen.qrscan.decode_failed'), 'error');
				scanState = previousState;
				uploadPreviewUrl = '';
			}
		} catch {
			showToast($_('screen.qrscan.decode_failed'), 'error');
			scanState = previousState;
			uploadPreviewUrl = '';
		}

		// Reset file input so same file can be re-selected
		input.value = '';
	}
</script>

<!-- ─── Full Viewport QR Scanner Overlay ──────────────────────── -->
<div class="qrscan-overlay" role="dialog" aria-label={$_('screen.qrscan.title')}>
	<!-- Header -->
	<div class="qrscan-header">
		<button type="button" class="qrscan-back-btn" onclick={handleClose} aria-label={$_('common.close')}>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M15 18l-6-6 6-6" />
			</svg>
		</button>
		<h2 class="qrscan-title">{$_('screen.qrscan.title')}</h2>
		<!-- Spacer to balance the back button -->
		<div class="qrscan-header-spacer"></div>
	</div>

	<!-- Camera Area -->
	<div class="camera-container">

		<!-- Hidden file input for QR image upload (camera fallback) -->
		<input
			type="file"
			accept="image/*"
			bind:this={fileInputRef}
			onchange={handleFileSelected}
			class="file-input-hidden"
			aria-hidden="true"
		/>

		{#if scanState === 'idle'}
			<div class="camera-placeholder">
				<div class="camera-placeholder-icon">
					<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M2 9V6C2 3.79 3.79 2 6 2H9" />
						<path d="M15 2H18C20.21 2 22 3.79 22 6V9" />
						<path d="M22 15V18C22 20.21 20.21 22 18 22H15" />
						<path d="M9 22H6C3.79 22 2 20.21 2 18V15" />
						<path d="M2 12H22" />
					</svg>
				</div>
				<button type="button" class="start-scan-btn" onclick={startCamera}>
					{$_('screen.qrscan.start_scan')}
				</button>
				<p class="camera-placeholder-hint">{$_('screen.qrscan.scan_region_hint')}</p>
				<button type="button" class="upload-secondary-btn" onclick={triggerFileUpload}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
						<path d="M17 8l-5-5-5 5" />
						<path d="M12 3v12" />
					</svg>
					{$_('screen.qrscan.upload_button')}
				</button>
			</div>

		{:else if scanState === 'requesting'}
			<div class="camera-status requesting-status">
				<div class="spinner"></div>
				<p class="status-text">{$_('screen.qrscan.requesting')}</p>
			</div>

		{:else if scanState === 'denied'}
			<div class="camera-status error-status">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2" stroke-linecap="round">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
				<p class="status-text">{$_('screen.qrscan.permission_denied')}</p>
				<button type="button" class="upload-primary-btn" onclick={triggerFileUpload}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
						<path d="M17 8l-5-5-5 5" />
						<path d="M12 3v12" />
					</svg>
					{$_('screen.qrscan.upload_button')}
				</button>
				<button type="button" class="retry-btn" onclick={handleRetry}>
					{$_('common.retry')}
				</button>
			</div>

		{:else if scanState === 'error' || scanState === 'nocamera'}
			<div class="camera-status error-status">
				<p class="status-text">
					{#if scanState === 'nocamera'}
						{$_('screen.qrscan.no_camera')}
					{:else}
						{$_('screen.qrscan.error_general')}
					{/if}
				</p>
				<button type="button" class="upload-primary-btn" onclick={triggerFileUpload}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
						<path d="M17 8l-5-5-5 5" />
						<path d="M12 3v12" />
					</svg>
					{$_('screen.qrscan.upload_button')}
				</button>
				<button type="button" class="retry-btn" onclick={handleRetry}>
					{$_('common.retry')}
				</button>
			</div>

		{:else if scanState === 'uploading'}
			<div class="camera-status uploading-status">
				{#if uploadPreviewUrl}
					<img src={uploadPreviewUrl} alt="QR preview" class="upload-preview-img" />
				{/if}
				<div class="spinner"></div>
				<p class="status-text">{$_('screen.qrscan.uploading')}</p>
			</div>

		{:else if scanState === 'scanning' || scanState === 'found'}
			<!-- Video feed -->
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoRef}
				class="video-feed"
				autoplay
				playsinline
				muted
			></video>
			<canvas bind:this={canvasRef} class="scan-canvas-hidden" aria-hidden="true"></canvas>

			<!-- Scan instruction text -->
			{#if scanState === 'scanning'}
				<div class="scan-instruction">
					<p>{$_('screen.qrscan.instruction')}</p>
				</div>
			{/if}

			<!-- Scan Region Overlay -->
			<div class="scan-region-overlay">
				<div class="scan-region">
					<!-- Corner brackets -->
					<div class="corner corner-tl"></div>
					<div class="corner corner-tr"></div>
					<div class="corner corner-bl"></div>
					<div class="corner corner-br"></div>

					<!-- Scan line animation (only when scanning) -->
					{#if scanState === 'scanning'}
						<div class="scan-line"></div>
					{/if}

					{#if scanState === 'found'}
						<div class="found-indicator">
							<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
								<path d="M20 6L9 17l-5-5" />
							</svg>
							<span class="found-text">{$_('screen.qrscan.found')}</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Scanning label -->
			{#if scanState === 'scanning'}
				<div class="scanning-label">
					<p>{$_('screen.qrscan.scanning')}</p>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Manual Input Section (always visible) -->
	<div class="manual-section">
		<span class="manual-label">{$_('screen.qrscan.manual_input')}</span>
		<div class="manual-input-row">
			<input
				type="text"
				bind:value={manualInput}
				placeholder="lnbc... / cashuA... / cashuB..."
				class="manual-text-input"
				enterkeyhint="go"
				onkeydown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
			/>
			<button
				type="button"
				class="manual-submit-btn"
				onclick={handleManualSubmit}
				disabled={!manualInput.trim()}
			>
				{$_('common.ok')}
			</button>
		</div>
	</div>

	<!-- Toast -->
	{#if toastVisible}
		<div class="qrscan-toast toast-type-{toastType}" role="alert" aria-live="polite">
			<span class="toast-msg">{toastMessage}</span>
			<button type="button" class="toast-dismiss" aria-label="Dismiss" onclick={dismissToast}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{/if}
</div>

<!-- ─── Styles ─────────────────────────────────────────────── -->
<style>
	/* ─── Overlay ───────────────────────────────────────── */
	.qrscan-overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-sticky, 200);
		background: var(--color-background);
		display: flex;
		flex-direction: column;
		color: var(--color-text);
		font-family: var(--font-family);
	}

	/* ─── Header ────────────────────────────────────────── */
	.qrscan-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-sm) var(--space-md);
		padding-top: calc(var(--space-sm) + env(safe-area-inset-top, 0px));
		min-height: 48px;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.qrscan-back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		padding: 0;
		background: none;
		border: none;
		color: var(--color-text);
		cursor: pointer;
		border-radius: var(--radius-full);
		transition: background var(--transition-fast);
	}

	.qrscan-back-btn:hover,
	.qrscan-back-btn:focus-visible {
		background: var(--color-surface-variant);
	}

	.qrscan-title {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		margin: 0;
		color: var(--color-text);
	}

	.qrscan-header-spacer {
		width: 44px;
	}

	/* ─── Camera Container ────────────────────────────────── */
	.camera-container {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: #000;
		min-height: 0;
	}

	.video-feed {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.scan-canvas-hidden {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		pointer-events: none;
	}

	/* ─── Placeholder / Status States ──────────────────────── */
	.camera-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--space-lg);
		padding: var(--space-xl);
	}

	.camera-placeholder-icon {
		opacity: 0.8;
	}

	.start-scan-btn {
		padding: var(--space-md) var(--space-xl);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--color-primary-contrast, #fff);
		background: var(--color-primary, #00bcd4);
		border: none;
		border-radius: var(--radius-lg);
		cursor: pointer;
		min-width: 200px;
		min-height: 48px;
		transition: background var(--transition-fast), transform var(--transition-fast);
		box-shadow: var(--shadow-md);
	}

	.start-scan-btn:hover,
	.start-scan-btn:focus-visible {
		background: var(--color-primary-hover, #0097a7);
		transform: scale(1.02);
	}

	.start-scan-btn:focus-visible {
		outline: 3px solid var(--color-border-focus);
		outline-offset: 2px;
	}

	.camera-placeholder-hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin: 0;
		text-align: center;
	}

	/* Status overlays */
	.camera-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		gap: var(--space-md);
		padding: var(--space-xl);
	}

	.status-text {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
		margin: 0;
		text-align: center;
	}

	.error-status .status-text {
		color: var(--color-error);
	}

	/* Spinner */
	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.retry-btn {
		padding: var(--space-sm) var(--space-lg);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		color: var(--color-primary-contrast, #fff);
		background: var(--color-primary, #00bcd4);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		min-height: 44px;
		transition: background var(--transition-fast);
	}

	.retry-btn:hover,
	.retry-btn:focus-visible {
		background: var(--color-primary-hover, #0097a7);
	}

	/* ─── Scan Instruction ────────────────────────────────── */
	.scan-instruction {
		position: absolute;
		top: 12px;
		left: 0;
		right: 0;
		text-align: center;
		pointer-events: none;
		z-index: 5;
	}

	.scan-instruction p {
		display: inline-block;
		padding: var(--space-xs) var(--space-lg);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: #ffffff;
		background: rgba(0, 0, 0, 0.55);
		border-radius: var(--radius-full);
		margin: 0;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}

	/* ─── Scan Region Overlay ──────────────────────────────── */
	.scan-region-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.scan-region {
		position: relative;
		width: min(250px, 70vw);
		height: min(250px, 70vw);
		aspect-ratio: 1;
	}

	/* Corner brackets */
	.corner {
		position: absolute;
		width: 24px;
		height: 24px;
		border-color: var(--color-primary, #00bcd4);
		border-style: solid;
		border-width: 0;
	}

	.corner-tl {
		top: 0;
		left: 0;
		border-top-width: 3px;
		border-left-width: 3px;
		border-radius: 4px 0 0 0;
	}

	.corner-tr {
		top: 0;
		right: 0;
		border-top-width: 3px;
		border-right-width: 3px;
		border-radius: 0 4px 0 0;
	}

	.corner-bl {
		bottom: 0;
		left: 0;
		border-bottom-width: 3px;
		border-left-width: 3px;
		border-radius: 0 0 0 4px;
	}

	.corner-br {
		bottom: 0;
		right: 0;
		border-bottom-width: 3px;
		border-right-width: 3px;
		border-radius: 0 0 4px 0;
	}

	/* Scan line animation */
	.scan-line {
		position: absolute;
		left: 0;
		width: 100%;
		height: 2px;
		background: linear-gradient(
			90deg,
			transparent 0%,
			var(--color-primary, #00bcd4) 20%,
			var(--color-primary-light, #4dd0e1) 50%,
			var(--color-primary, #00bcd4) 80%,
			transparent 100%
		);
		box-shadow: 0 0 8px var(--color-primary, #00bcd4), 0 0 16px var(--color-primary-light, #4dd0e1);
		animation: scan-line-move 2s ease-in-out infinite;
	}

	@keyframes scan-line-move {
		0% {
			top: 0;
			opacity: 0.3;
		}
		50% {
			top: calc(100% - 2px);
			opacity: 1;
		}
		100% {
			top: 0;
			opacity: 0.3;
		}
	}

	/* Found indicator */
	.found-indicator {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		background: rgba(0, 188, 212, 0.15);
		border: 2px solid var(--color-success);
		border-radius: var(--radius-md);
		animation: found-pulse 0.6s ease;
	}

	@keyframes found-pulse {
		0% { transform: scale(1.02); }
		50% { transform: scale(0.98); }
		100% { transform: scale(1); }
	}

	.found-text {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-success);
	}

	/* Scanning label */
	.scanning-label {
		position: absolute;
		bottom: 20px;
		left: 0;
		right: 0;
		text-align: center;
		pointer-events: none;
	}

	.scanning-label p {
		display: inline-block;
		padding: var(--space-xs) var(--space-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-primary-contrast, #fff);
		background: rgba(0, 0, 0, 0.55);
		border-radius: var(--radius-full);
		margin: 0;
	}

	/* ─── Manual Input Section ─────────────────────────────── */
	.manual-section {
		padding: var(--space-md);
		padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom, 0px));
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.manual-label {
		display: block;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
		margin-bottom: var(--space-sm);
	}

	.manual-input-row {
		display: flex;
		gap: var(--space-sm);
	}

	.manual-text-input {
		flex: 1;
		padding: var(--space-sm) var(--space-md);
		font-size: var(--font-size-md);
		font-family: var(--font-family-mono);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-background);
		color: var(--color-text);
		outline: none;
		transition: border-color var(--transition-fast);
		min-height: 44px;
	}

	.manual-text-input:focus {
		border-color: var(--color-primary, #00bcd4);
	}

	.manual-text-input::placeholder {
		color: var(--color-text-disabled);
		font-family: var(--font-family-mono);
		font-size: var(--font-size-sm);
	}

	.manual-submit-btn {
		padding: var(--space-sm) var(--space-lg);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-primary-contrast, #fff);
		background: var(--color-primary, #00bcd4);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		min-height: 44px;
		min-width: 60px;
		white-space: nowrap;
		transition: background var(--transition-fast);
	}

	.manual-submit-btn:hover {
		background: var(--color-primary-hover, #0097a7);
	}

	.manual-submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ─── File Upload Fallback ─────────────────────────────── */
	.file-input-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.upload-secondary-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm) var(--space-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text-secondary);
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--transition-fast), border-color var(--transition-fast);
		min-height: 36px;
	}

	.upload-secondary-btn:hover,
	.upload-secondary-btn:focus-visible {
		background: var(--color-surface-variant);
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.upload-primary-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-xl);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		color: var(--color-primary-contrast, #fff);
		background: var(--color-primary, #00bcd4);
		border: none;
		border-radius: var(--radius-lg);
		cursor: pointer;
		min-height: 48px;
		min-width: 200px;
		transition: background var(--transition-fast), transform var(--transition-fast);
		box-shadow: var(--shadow-md);
	}

	.upload-primary-btn:hover,
	.upload-primary-btn:focus-visible {
		background: var(--color-primary-hover, #0097a7);
		transform: scale(1.02);
	}

	.upload-primary-btn:focus-visible {
		outline: 3px solid var(--color-border-focus);
		outline-offset: 2px;
	}

	.upload-preview-img {
		max-width: 80%;
		max-height: 200px;
		object-fit: contain;
		border-radius: var(--radius-md);
		border: 2px solid var(--color-border);
		background: var(--color-surface);
	}

	.uploading-status .spinner {
		margin-top: var(--space-md);
	}

	/* ─── Toast ────────────────────────────────────────────── */
	.qrscan-toast {
		position: absolute;
		bottom: 120px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		box-shadow: var(--shadow-md);
		z-index: 10;
		max-width: calc(100% - 32px);
		animation: toast-slide-up 0.3s ease;
	}

	@keyframes toast-slide-up {
		from { opacity: 0; transform: translateX(-50%) translateY(12px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	.toast-type-info {
		background: var(--color-info-light);
		color: var(--color-info);
		border: 1px solid var(--color-info);
	}

	.toast-type-warning {
		background: var(--color-warning-light);
		color: var(--color-warning);
		border: 1px solid var(--color-warning);
	}

	.toast-type-error {
		background: var(--color-error-light);
		color: var(--color-error);
		border: 1px solid var(--color-error);
	}

	.toast-type-success {
		background: var(--color-success-light);
		color: var(--color-success);
		border: 1px solid var(--color-success);
	}

	.toast-msg {
		flex: 1;
		line-height: var(--line-height-normal);
	}

	.toast-dismiss {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-xs);
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
		min-width: 32px;
		min-height: 32px;
		border-radius: var(--radius-sm);
	}

	.toast-dismiss:hover {
		opacity: 1;
	}

	/* ─── Reduced motion ───────────────────────────────────── */
	@media (prefers-reduced-motion: reduce) {
		.scan-line {
			animation: none;
		}
		.found-indicator {
			animation: none;
		}
		.spinner {
			animation: none;
		}
		.qrscan-toast {
			animation: none;
		}
	}
</style>
