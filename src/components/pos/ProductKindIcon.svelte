<!--
  TASK-5702-R6 — ProductKindIcon (INTENT-057 BLUEPRINT v3 rev18, strip photos).
  Replaces ProductPhoto (deleted): no <img>, no IndexedDB — the tile always
  renders the solar icon for the product kind (kind-icons map). '' / unknown
  kinds fall back to Box (same tile the picker showed with no photo).
-->
<script lang="ts">
	import Icon from '$lib/components/icons/Icon.svelte';
	import { kindIconFor } from '$lib/pos/kind-icons';

	interface Props {
		/** Stored kind string (free-form legacy ok — unknown renders Box). */
		kind: string;
		/** Icon size in px (default 40, catalog card tile). */
		size?: number;
	}

	let { kind, size = 40 }: Props = $props();
</script>

<span
	class="kind-tile"
	aria-hidden="true"
	data-testid="product-kind-icon"
	data-kind={kind}
>
	<Icon name={kindIconFor(kind)} size={size} />
</span>

<style>
	.kind-tile {
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
