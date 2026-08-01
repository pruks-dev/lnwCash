<script lang="ts">
	/**
	 * Body — Typography component
	 * Body text with size variants
	 */
	interface Props {
		/** Size variant */
		size?: 'sm' | 'md' | 'lg';
		/** Font weight override */
		weight?: 'normal' | 'medium' | 'semibold' | 'bold';
		/** Text color override */
		color?: 'text' | 'secondary' | 'disabled';
		/** Text alignment */
		align?: 'left' | 'center' | 'right';
		/** Truncate with ellipsis? */
		truncate?: boolean;
		/** Render as inline span (default: p) */
		inline?: boolean;
		/** Slot */
		children?: import('svelte').Snippet;
	}

	let {
		size = 'md',
		weight = 'normal',
		color = 'text',
		align = 'left',
		truncate = false,
		inline = false,
		children
	}: Props = $props();
</script>

{#if inline}
	<span
		class="body body-{size}"
		data-weight={weight}
		data-color={color}
		data-align={align}
		class:truncate
	>
		{#if children}{@render children()}{/if}
	</span>
{:else}
	<p
		class="body body-{size}"
		data-weight={weight}
		data-color={color}
		data-align={align}
		class:truncate
	>
		{#if children}{@render children()}{/if}
	</p>
{/if}

<style>
	.body {
		margin: 0;
		padding: 0;
		font-family: var(--font-family);
		line-height: var(--line-height-normal);
	}

	/* Sizes */
	.body-sm {
		font-size: var(--font-size-sm);
	}

	.body-md {
		font-size: var(--font-size-md);
	}

	.body-lg {
		font-size: var(--font-size-lg);
	}

	/* Weights */
	[data-weight='normal'] { font-weight: var(--font-weight-normal); }
	[data-weight='medium'] { font-weight: var(--font-weight-medium); }
	[data-weight='semibold'] { font-weight: var(--font-weight-semibold); }
	[data-weight='bold'] { font-weight: var(--font-weight-bold); }

	/* Colors */
	[data-color='text'] { color: var(--color-text); }
	[data-color='secondary'] { color: var(--color-text-secondary); }
	[data-color='disabled'] { color: var(--color-text-disabled); }

	/* Alignment */
	[data-align='left'] { text-align: left; }
	[data-align='center'] { text-align: center; }
	[data-align='right'] { text-align: right; }

	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
