<script lang="ts">
	/**
	 * QRDisplay — Displays QR code as SVG for Lightning invoices / Cashu tokens (TASK-066, TASK-151)
	 *
	 * Props:
	 *   data — string to encode in QR (bolt11 invoice, cashu token, etc.)
	 *   size — display size in pixels (default: 256)
	 *   label — optional label below QR
	 *   showActions — show share/copy buttons (default: true)
	 */
	import { _ } from 'svelte-i18n';
	import QRCode from 'qrcode';
	import Copy from '$lib/components/icons/Copy.svelte';

	interface Props {
		data: string;
		size?: number;
		label?: string;
		showActions?: boolean;
	}

	let { data, size = 256, label = undefined, showActions = true }: Props = $props();

	let dataUri = $state('');
	let copied = $state(false);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	function handleCopy() {
		if (!data) return;
		navigator.clipboard.writeText(data).then(() => {
			copied = true;
			clearTimeout(toastTimer);
			toastTimer = setTimeout(() => {
				copied = false;
			}, 2000);
		}).catch(() => {
			// Clipboard API not available — fallback silent
		});
	}

	async function handleShare() {
		if (!data) return;
		if (navigator.share) {
			try {
				await navigator.share({ text: data });
			} catch {
				// User cancelled or share failed — fallback to copy
			}
		} else {
			handleCopy();
		}
	}

	$effect(() => {
		if (data) {
			QRCode.toDataURL(data, {
				width: size,
				margin: 4,
				errorCorrectionLevel: 'L',
				color: { dark: '#000000', light: '#ffffff' }
			}).then((uri: string) => {
				dataUri = uri;
			}).catch(() => {
				dataUri = '';
			});
		} else {
			dataUri = '';
		}
	});
</script>

{#if data}
	<div class="qr-container">
		<div class="qr-image-wrapper">
			{#if dataUri}
				<img
					src={dataUri}
					alt="QR Code"
					class="qr-image"
				/>
			{:else}
				<div
					class="qr-placeholder"
				>
					<span class="qr-placeholder-text">QR</span>
				</div>
			{/if}
			{#if copied}
				<div class="qr-copied-toast" role="status">{$_('screen.qrdisplay.copied')}</div>
			{/if}
		</div>
		{#if label}
			<span class="qr-label">{label}</span>
		{/if}
		{#if showActions}
			<div class="qr-actions">
				<button type="button" class="qr-action-btn" onclick={handleCopy} title={$_('common.copy')}>
					<Copy size={18} />
					<span>{$_('common.copy')}</span>
				</button>
				{#if typeof navigator !== 'undefined' && 'share' in navigator}
					<button type="button" class="qr-action-btn" onclick={handleShare} title={$_('common.share')}>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="18" cy="5" r="3" />
							<circle cx="6" cy="12" r="3" />
							<circle cx="18" cy="19" r="3" />
							<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
							<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
						</svg>
						<span>{$_('common.share')}</span>
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.qr-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
		overflow: hidden;
		width: 100%;
	}

	.qr-image-wrapper {
		position: relative;
		width: 100%;
		padding: var(--space-sm);
		background: #ffffff;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		line-height: 0;
		box-sizing: border-box;
		max-width: 100%;
	}

	.qr-image {
		display: block;
		image-rendering: pixelated;
		width: 100%;
		max-width: 100%;
		aspect-ratio: 1;
		object-fit: contain;
	}

	.qr-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		aspect-ratio: 1;
	}

	.qr-placeholder-text {
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-disabled);
	}

	.qr-copied-toast {
		position: absolute;
		bottom: var(--space-sm);
		left: 50%;
		transform: translateX(-50%);
		padding: var(--space-xs) var(--space-md);
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		font-size: var(--font-size-xs);
		font-family: var(--font-family);
		border-radius: var(--radius-full);
		white-space: nowrap;
		z-index: 2;
		animation: qr-toast-fade 0.25s ease;
	}

	@keyframes qr-toast-fade {
		from { opacity: 0; transform: translateX(-50%) translateY(4px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}

	.qr-actions {
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
		width: 100%;
	}

	.qr-action-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm) var(--space-md);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		min-height: 40px;
		transition: background var(--transition-fast), border-color var(--transition-fast);
	}

	.qr-action-btn:hover,
	.qr-action-btn:focus-visible {
		background: var(--color-surface-variant);
		border-color: var(--color-primary);
	}

	.qr-action-btn:focus-visible {
		outline: 2px solid var(--color-border-focus);
		outline-offset: 2px;
	}

	.qr-label {
		font-family: var(--font-family-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		word-break: break-all;
		text-align: center;
		max-width: 100%;
		padding: 0 var(--space-sm);
	}
</style>
