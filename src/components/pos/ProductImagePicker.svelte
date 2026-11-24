<!--
  TASK-5602 — ProductImagePicker (INTENT-056 BLUEPRINT-056-v2)
  Thin picker wrapper over $lib/pos/image-store.ts:
  - file picker: <input type="file" accept="image/*"> (gallery/files)
  - capture: second <input capture="environment"> (camera on mobile)
  - picked File → downscaleImageBlob (≤512px) → saveProductImage BEFORE put
  - no photo = untouched = parent renders solar <Icon name="Box"> fallback
  Icons: Icon.svelte ONLY (Plus for add-photo button, Box for fallback).
  NEVER hand-drawn SVG here.
-->
<script lang="ts">
	import Icon from '$lib/components/icons/Icon.svelte';
	import { savePickedFile } from '$lib/pos/image-store';

	interface Props {
		productId: string;
		/** When true show camera (capture) button alongside file button. */
		allowCapture?: boolean;
		/** Current object URL or '' — parent owns URL lifecycle. */
		imageUrl?: string;
		onSaved?: (productId: string, url: string) => void;
		onError?: (message: string) => void;
	}

	let {
		productId,
		allowCapture = true,
		imageUrl = '',
		onSaved,
		onError
	}: Props = $props();

	let fileInput: HTMLInputElement | null = null;
	let captureInput: HTMLInputElement | null = null;
	let busy = $state(false);

	async function handleFile(file: File | null, via: 'file' | 'capture') {
		if (!file) return; // user cancelled — keep fallback, store nothing
		if (!file.type.startsWith('image/')) {
			onError?.('not an image file');
			return;
		}
		busy = true;
		try {
			const res = await savePickedFile(productId, file);
			if (!res.ok) {
				onError?.(res.message);
				return;
			}
			const url = URL.createObjectURL(res.value.blob);
			onSaved?.(productId, url);
		} catch (e) {
			onError?.(e instanceof Error ? e.message : `pick via ${via} failed`);
		} finally {
			busy = false;
			if (fileInput) fileInput.value = '';
			if (captureInput) captureInput.value = '';
		}
	}
</script>

<div class="img-picker" data-product={productId}>
	{#if imageUrl}
		<img class="img-photo" src={imageUrl} alt="" loading="lazy" />
	{:else}
		<!-- solar fallback: Box (solar:box-linear) via Icon.svelte only -->
		<span class="img-fallback" aria-hidden="true">
			<Icon name="Box" size={32} />
		</span>
	{/if}
	<div class="img-actions">
		<button
			type="button"
			class="img-btn"
			disabled={busy}
			aria-label="add photo from files"
			onclick={() => fileInput?.click()}
		>
			<Icon name="Plus" size={16} />
		</button>
		{#if allowCapture}
			<button
				type="button"
				class="img-btn"
				disabled={busy}
				aria-label="take photo"
				onclick={() => captureInput?.click()}
			>
				<Icon name="Scan" size={16} />
			</button>
		{/if}
	</div>
	<!-- gallery/files picker -->
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		hidden
		onchange={(e) => handleFile((e.target as HTMLInputElement).files?.[0] ?? null, 'file')}
	/>
	<!-- camera capture picker (mobile: opens camera directly) -->
	{#if allowCapture}
		<input
			bind:this={captureInput}
			type="file"
			accept="image/*"
			capture="environment"
			hidden
			onchange={(e) => handleFile((e.target as HTMLInputElement).files?.[0] ?? null, 'capture')}
		/>
	{/if}
</div>

<style>
	.img-picker {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.img-photo {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border-radius: 8px;
	}
	.img-fallback {
		width: 48px;
		height: 48px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		background: var(--pos-fallback-bg, #f1f5f9);
		color: var(--pos-fallback-fg, #64748b);
	}
	.img-actions {
		display: flex;
		gap: 4px;
	}
	.img-btn {
		min-width: 44px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
	}
</style>
