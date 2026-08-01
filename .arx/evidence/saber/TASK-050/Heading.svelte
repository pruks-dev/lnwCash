<script lang="ts">
	/**
	 * Heading — Typography component
	 * Renders h1-h6 with responsive sizing via CSS tokens
	 */
	interface Props {
		/** Heading level (h1-h6) */
		level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
		/** Text alignment */
		align?: 'left' | 'center' | 'right';
		/** Truncate with ellipsis? */
		truncate?: boolean;
		/** Optional id */
		id?: string;
		/** Slot */
		children?: import('svelte').Snippet;
	}

	let {
		level = 'h1',
		align = 'left',
		truncate = false,
		id = undefined,
		children
	}: Props = $props();
</script>

{#if level === 'h1'}
	<h1 {id} class="heading heading-h1" data-align={align} class:truncate>
		{#if children}{@render children()}{/if}
	</h1>
{:else if level === 'h2'}
	<h2 {id} class="heading heading-h2" data-align={align} class:truncate>
		{#if children}{@render children()}{/if}
	</h2>
{:else if level === 'h3'}
	<h3 {id} class="heading heading-h3" data-align={align} class:truncate>
		{#if children}{@render children()}{/if}
	</h3>
{:else if level === 'h4'}
	<h4 {id} class="heading heading-h4" data-align={align} class:truncate>
		{#if children}{@render children()}{/if}
	</h4>
{:else if level === 'h5'}
	<h5 {id} class="heading heading-h5" data-align={align} class:truncate>
		{#if children}{@render children()}{/if}
	</h5>
{:else}
	<h6 {id} class="heading heading-h6" data-align={align} class:truncate>
		{#if children}{@render children()}{/if}
	</h6>
{/if}

<style>
	.heading {
		margin: 0;
		padding: 0;
		font-family: var(--font-family);
		font-weight: var(--font-weight-bold);
		color: var(--color-text);
		line-height: var(--line-height-tight);
		letter-spacing: -0.01em;
	}

	.heading[data-align='left'] { text-align: left; }
	.heading[data-align='center'] { text-align: center; }
	.heading[data-align='right'] { text-align: right; }

	.heading-h1 { font-size: var(--font-size-3xl); }
	.heading-h2 { font-size: var(--font-size-2xl); }
	.heading-h3 { font-size: var(--font-size-xl); }
	.heading-h4 { font-size: var(--font-size-lg); }
	.heading-h5 { font-size: var(--font-size-md); font-weight: var(--font-weight-semibold); }
	.heading-h6 { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); text-transform: uppercase; letter-spacing: 0.04em; }

	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Responsive: clamp headings on small screens */
	@media (max-width: 480px) {
		.heading-h1 { font-size: clamp(1.5rem, 5vw, var(--font-size-3xl)); }
		.heading-h2 { font-size: clamp(1.25rem, 4vw, var(--font-size-2xl)); }
		.heading-h3 { font-size: clamp(1.1rem, 3.5vw, var(--font-size-xl)); }
	}
</style>
