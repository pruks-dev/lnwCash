<script lang="ts">
	/**
	 * Caption — Typography component
	 * Small supporting text (labels, hints, metadata)
	 */
	interface Props {
		/** Text color */
		color?: 'secondary' | 'disabled' | 'text';
		/** Text alignment */
		align?: 'left' | 'center' | 'right';
		/** Uppercase? */
		uppercase?: boolean;
		/** Truncate with ellipsis? */
		truncate?: boolean;
		/** Slot */
		children?: import('svelte').Snippet;
	}

	let {
		color = 'secondary',
		align = 'left',
		uppercase = false,
		truncate = false,
		children
	}: Props = $props();
</script>

<span
	class="caption"
	data-color={color}
	data-align={align}
	class:uppercase
	class:truncate
>
	{#if children}{@render children()}{/if}
</span>

<style>
	.caption {
		margin: 0;
		padding: 0;
		font-family: var(--font-family);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-normal);
		line-height: var(--line-height-normal);
	}

	[data-color='text'] { color: var(--color-text); }
	[data-color='secondary'] { color: var(--color-text-secondary); }
	[data-color='disabled'] { color: var(--color-text-disabled); }

	[data-align='left'] { text-align: left; }
	[data-align='center'] { text-align: center; }
	[data-align='right'] { text-align: right; }

	.uppercase {
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
