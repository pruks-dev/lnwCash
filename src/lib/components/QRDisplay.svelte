<script lang="ts">
	/**
	 * QRDisplay — Displays QR code as SVG for Lightning invoices / Cashu tokens (TASK-066)
	 *
	 * Props:
	 *   data — string to encode in QR (bolt11 invoice, cashu token, etc.)
	 *   size — display size in pixels (default: 200)
	 *   label — optional label below QR
	 */
	import { generateQrSvg } from '$lib/util/qrcode';

	interface Props {
		data: string;
		size?: number;
		label?: string;
	}

	let { data, size = 200, label = undefined }: Props = $props();

	let svgContent: string = $derived.by(() => {
		if (!data) return '';
		try {
			return generateQrSvg(data, { moduleSize: Math.max(2, Math.floor(size / 40)) });
		} catch {
			return '';
		}
	});

	let dataUri: string = $derived.by(() => {
		if (!svgContent) return '';
		return 'data:image/svg+xml,' + encodeURIComponent(svgContent);
	});
</script>

{#if data}
	<div class="qr-container">
		<div class="qr-image-wrapper">
			{#if dataUri}
				<img src={dataUri} alt="QR Code" class="qr-image" style="width:{size}px;height:{size}px" />
			{:else}
				<div class="qr-placeholder" style="width:{size}px;height:{size}px">
					<span class="qr-placeholder-text">QR</span>
				</div>
			{/if}
		</div>
		{#if label}
			<span class="qr-label">{label}</span>
		{/if}
	</div>
{/if}

<style>
	.qr-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-sm);
	}

	.qr-image-wrapper {
		padding: var(--space-sm);
		background: #ffffff;
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		line-height: 0;
	}

	.qr-image {
		display: block;
		image-rendering: pixelated;
	}

	.qr-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
	}

	.qr-placeholder-text {
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		color: var(--color-text-disabled);
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
