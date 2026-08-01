<script lang="ts">
	/**
	 * Card — D-004
	 * Variants: basic (flat card), interactive (hoverable, clickable)
	 */
	interface Props {
		variant?: 'basic' | 'interactive';
		/** Optional padding override using space token (default: md) */
		padding?: 'sm' | 'md' | 'lg' | 'none';
		/** Click handler (interactive variant) */
		onclick?: (e: MouseEvent) => void;
		/** Aria role override */
		role?: string;
		children?: import('svelte').Snippet;
	}

	let {
		variant = 'basic',
		padding = 'md',
		onclick,
		role,
		children
	}: Props = $props();

	const isInteractive = $derived(variant === 'interactive');
	const effectiveRole = $derived(role ?? (isInteractive ? 'button' : undefined));
	const effectiveTabindex = $derived(isInteractive ? 0 : undefined);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="card card-{variant} card-padding-{padding}"
	role={effectiveRole}
	tabindex={effectiveTabindex}
	onclick={onclick}
	onkeydown={(e) => {
		if (isInteractive && onclick && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onclick(e as unknown as MouseEvent);
		}
	}}
>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		color: var(--color-text);
		transition: all var(--transition-fast);
		overflow: hidden;
	}

	.card-padding-sm { padding: var(--space-sm); }
	.card-padding-md { padding: var(--space-md); }
	.card-padding-lg { padding: var(--space-lg); }
	.card-padding-none { padding: 0; }

	/* Interactive variant */
	.card-interactive {
		cursor: pointer;
		box-shadow: var(--shadow-sm);
	}

	.card-interactive:hover {
		box-shadow: var(--shadow-md);
		border-color: var(--color-primary-light);
		transform: translateY(-1px);
	}

	.card-interactive:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.card-interactive:active {
		transform: translateY(0);
		box-shadow: var(--shadow-sm);
	}

	/* Basic — subtle shadow */
	.card-basic {
		box-shadow: var(--shadow-sm);
	}
</style>
