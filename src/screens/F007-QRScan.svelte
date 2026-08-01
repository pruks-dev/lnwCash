<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { isNativePlatform } from '../lib/platform';

	interface Props {
		onResult?: (result: string) => void;
		onClose?: () => void;
	}

	let { onResult, onClose }: Props = $props();

	let scanning: boolean = $state(false);
	let manualInput: string = $state('');
	let error: string = $state('');
	let cameraUnavailable: boolean = $state(false);
	let permissionDenied: boolean = $state(false);
	let stream: MediaStream | null = $state(null);
	let videoRef: HTMLVideoElement | undefined = $state();
	let nativeBarcodeSupported: boolean = $state(false);

	$effect(() => {
		// Check if native barcode scanner is available (Capacitor)
		nativeBarcodeSupported = isNativePlatform();

		// Check if browser Barcode Detection API is available
		if (!nativeBarcodeSupported && 'BarcodeDetector' in window) {
			nativeBarcodeSupported = true; // treat browser API as "native enough"
		}

		return () => {
			// Cleanup camera stream on unmount
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
			}
		};
	});

	/**
	 * Attempt barcode detection on current video frame using BarcodeDetector API.
	 */
	async function detectBarcodeFromVideo(): Promise<string | null> {
		if (!('BarcodeDetector' in window) || !videoRef) return null;

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const BarcodeDetector = (window as any).BarcodeDetector;
			const detector = new BarcodeDetector({
				formats: ['qr_code', 'aztec', 'code_128', 'ean_13', 'pdf417']
			});
			const barcodes = await detector.detect(videoRef);
			if (barcodes.length > 0) {
				return barcodes[0].rawValue;
			}
		} catch {
			// BarcodeDetector not supported or failed
		}
		return null;
	}

	/**
	 * Start native QR scanner (Capacitor plugin) — launches full native scanning UI.
	 */
	async function startNativeScan() {
		error = '';
		scanning = true;

		try {
			const { BarcodeScanner } = await import('capacitor-barcode-scanner');
			const result = await BarcodeScanner.scan();

			if (result.result && result.code) {
				onResult?.(result.code);
			} else {
				// User cancelled or no barcode found
			}
		} catch (e) {
			if (e instanceof Error && e.message?.includes('camera')) {
				permissionDenied = true;
			} else {
				cameraUnavailable = true;
				console.error('[QRScan] Native scan error:', e);
			}
		} finally {
			scanning = false;
		}
	}

	/**
	 * Start camera-based scan with BarcodeDetector API (web/PWA).
	 */
	async function startWebScan() {
		error = '';
		cameraUnavailable = false;
		permissionDenied = false;

		if (!navigator.mediaDevices?.getUserMedia) {
			cameraUnavailable = true;
			return;
		}

		try {
			scanning = true;
			const mediaStream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' }
			});
			stream = mediaStream;

			// Wait for video element to be ready
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (videoRef) {
				videoRef.srcObject = mediaStream;
				await videoRef.play();
			}

			// Attempt barcode detection on current frame
			const barcodeValue = await detectBarcodeFromVideo();
			if (barcodeValue) {
				onResult?.(barcodeValue);
			}

			scanning = false;
		} catch (e) {
			scanning = false;
			if (e instanceof DOMException && e.name === 'NotAllowedError') {
				permissionDenied = true;
			} else {
				cameraUnavailable = true;
			}
		}
	}

	/**
	 * Unified scan entry point — routes to native or web scanner.
	 */
	async function startScan() {
		if (nativeBarcodeSupported && isNativePlatform()) {
			await startNativeScan();
		} else {
			await startWebScan();
		}
	}

	function handleManualSubmit() {
		if (!manualInput.trim()) return;
		onResult?.(manualInput.trim());
	}

	function handleClose() {
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = null;
		}
		onClose?.();
	}
</script>

<div class="qrscan-screen">
	<div class="header">
		<h2 class="title">{$_('screen.qrscan.title')}</h2>
		<button type="button" class="close-btn" onclick={handleClose}>
			{$_('common.close')}
		</button>
	</div>

	{#if cameraUnavailable || permissionDenied}
		<div class="notice">
			<p>
				{#if permissionDenied}
					{$_('screen.qrscan.permission_denied')}
				{:else}
					{$_('screen.qrscan.no_camera')}
				{/if}
			</p>
		</div>
	{:else}
		<div class="camera-area">
			{#if !stream}
				<button type="button" class="start-scan-btn" onclick={startScan} disabled={scanning}>
					{#if scanning}
						{$_('screen.qrscan.scanning')}
					{:else}
						{$_('common.ok')} — {$_('screen.qrscan.title')}
					{/if}
				</button>
			{/if}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={videoRef}
				class="video-feed"
				class:hidden={!stream}
				autoplay
				playsinline
			></video>
		</div>
	{/if}

	<div class="manual-section">
		<span class="label-text">{$_('screen.qrscan.manual_input')}</span>
		<div class="manual-input-row">
			<input
				type="text"
				bind:value={manualInput}
				placeholder="lnbc... หรือ cashuA..."
				class="text-input"
			/>
			<button
				type="button"
				class="submit-btn"
				onclick={handleManualSubmit}
				disabled={!manualInput.trim()}
			>
				{$_('common.ok')}
			</button>
		</div>
	</div>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style>
	.qrscan-screen {
		max-width: 420px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.title {
		font-size: 1.3rem;
		color: #f7931a;
		margin: 0;
	}

	.close-btn {
		background: none;
		border: 1px solid #ccc;
		color: #666;
		padding: 0.4rem 0.8rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.85rem;
	}

	.notice {
		text-align: center;
		padding: 2rem 1rem;
		background: #fff3cd;
		border-radius: 12px;
		border: 1px solid #ffc107;
		color: #856404;
		margin-bottom: 1rem;
	}

	.camera-area {
		width: 100%;
		height: 200px;
		background: #1a1a2e;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
		overflow: hidden;
		position: relative;
	}

	.start-scan-btn {
		padding: 0.75rem 2rem;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 10px;
		cursor: pointer;
	}

	.start-scan-btn:disabled {
		opacity: 0.6;
	}

	.video-feed {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.video-feed.hidden {
		display: none;
	}

	.manual-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label-text {
		font-size: 0.85rem;
		color: #555;
		font-weight: 600;
	}

	.manual-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.text-input {
		flex: 1;
		padding: 0.7rem 0.85rem;
		font-size: 0.9rem;
		border: 2px solid #e0e0e0;
		border-radius: 10px;
		outline: none;
		font-family: monospace;
		transition: border-color 0.2s;
	}

	.text-input:focus {
		border-color: #f7931a;
	}

	.submit-btn {
		padding: 0.7rem 1.25rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
		background: #f7931a;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		white-space: nowrap;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error-message {
		color: #e74c3c;
		font-size: 0.85rem;
		margin: 0.5rem 0 0;
		padding: 0.5rem;
		background: #fdeaea;
		border-radius: 8px;
	}
</style>
