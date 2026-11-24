<!--
  TASK-5603 — ProductPhoto (INTENT-056 BLUEPRINT-056 v2, approved mockup 1/3).
  Card photo 4:3 — loads the product blob from the TASK-5602 pos-images
  IndexedDB store (getProductImage) into an object URL; no photo stored =
  solar fallback tile (Icon.svelte Box ONLY — never hand-drawn).
  Self-loading: parent passes productId (+tick to refresh after a picker
  save); object URLs are revoked on change/destroy (no leak).
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/icons/Icon.svelte';
	import { getProductImage } from '$lib/pos/image-store';

	interface Props {
		productId: string;
		alt: string;
		/** Bump to re-read the store (e.g. right after a picker save). */
		tick?: number;
	}

	let { productId, alt, tick = 0 }: Props = $props();

	let url = $state('');
	let loadedFor = '';

	async function load(id: string): Promise<void> {
		if (id === loadedFor) return;
		loadedFor = id;
		if (url) {
			try {
				URL.revokeObjectURL(url);
			} catch {
				// ignore revoke errors in test envs
			}
			url = '';
		}
		if (!id) return;
		try {
			const blob = await getProductImage(id);
			// A newer productId may have won the race while we awaited.
			if (loadedFor !== id) return;
			if (blob) url = URL.createObjectURL(blob);
		} catch {
			url = '';
		}
	}

	$effect(() => {
		void tick;
		loadedFor = '';
		void load(productId);
	});

	onDestroy(() => {
		if (url) {
			try {
				URL.revokeObjectURL(url);
			} catch {
				// ignore revoke errors in test envs
			}
			url = '';
		}
	});
</script>

{#if url}
	<img class="card-photo" src={url} {alt} loading="lazy" data-testid="product-photo" data-photo-for={productId} />
{:else}
	<span class="card-fallback" aria-hidden="true" data-testid="product-fallback" data-fallback-for={productId}>
		<Icon name="Box" size={40} />
	</span>
{/if}

<style>
	.card-photo {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		display: block;
	}
	.card-fallback {
		width: 100%;
		aspect-ratio: 4 / 3;
		border-radius: var(--radius-md);
		background: var(--color-surface-variant);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
	}
</style>
