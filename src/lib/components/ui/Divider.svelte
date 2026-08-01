<script lang="ts">
	/**
	 * Divider — D-004
	 * Horizontal or vertical separator with optional label
	 */
	interface Props {
		/** Orientation */
		orientation?: 'horizontal' | 'vertical';
		/** Optional label in the middle */
		label?: string;
		/** Inset spacing from edges */
		inset?: boolean;
	}

	let {
		orientation = 'horizontal',
		label = undefined,
		inset = false
	}: Props = $props();
</script>

{#if orientation === 'horizontal'}
	<div
		class="divider divider-h"
		class:divider-inset={inset}
		class:divider-labeled={!!label}
		role="separator"
		aria-orientation="horizontal"
	>
		{#if label}
			<span class="divider-label">{label}</span>
		{/if}
	</div>
{:else}
	<div
		class="divider divider-v"
		role="separator"
		aria-orientation="vertical"
	></div>
{/if}

<style>
	.divider {
		display: flex;
		align-items: center;
		color: var(--color-divider);
	}

	.divider-h {
		width: 100%;
		height: 1px;
		background: var(--color-divider);
		margin: var(--space-md) 0;
	}

	.divider-v {
		width: 1px;
		height: 100%;
		background: var(--color-divider);
		margin: 0 var(--space-sm);
	}

	.divider-inset {
		margin-left: var(--space-lg);
		margin-right: var(--space-lg);
		width: calc(100% - var(--space-2xl));
	}

	.divider-labeled {
		height: auto;
		background: none;
		text-align: center;
	}

	.divider-labeled::before,
	.divider-labeled::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-divider);
	}

	.divider-label {
		padding: 0 var(--space-md);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}
</style>
