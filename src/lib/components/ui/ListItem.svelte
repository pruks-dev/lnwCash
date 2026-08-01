<script lang="ts">
	/**
	 * ListItem — D-004
	 * Single row for lists with leading, trailing, title, subtitle
	 */
	interface Props {
		/** Primary text */
		title?: string;
		/** Secondary text */
		subtitle?: string;
		/** Click handler */
		onclick?: (e: MouseEvent) => void;
		/** Disabled state */
		disabled?: boolean;
		/** Active / highlighted state */
		active?: boolean;
		/** Leading slot (icon, avatar) */
		leading?: import('svelte').Snippet;
		/** Trailing slot (action, info) */
		trailing?: import('svelte').Snippet;
		/** Aria label override */
		ariaLabel?: string;
		children?: import('svelte').Snippet;
	}

	let {
		title = undefined,
		subtitle = undefined,
		onclick,
		disabled = false,
		active = false,
		leading,
		trailing,
		ariaLabel = undefined,
		children
	}: Props = $props();

	const isInteractive = $derived(!!onclick && !disabled);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="list-item"
	class:list-item-interactive={isInteractive}
	class:list-item-active={active}
	class:list-item-disabled={disabled}
	class:list-item-clickable={!!onclick}
	role={isInteractive ? 'button' : undefined}
	tabindex={isInteractive ? 0 : undefined}
	aria-label={ariaLabel}
	aria-disabled={disabled}
	onclick={onclick}
	onkeydown={(e) => {
		if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onclick?.(e as unknown as MouseEvent);
		}
	}}
>
	{#if leading}
		<span class="list-item-leading">
			{@render leading()}
		</span>
	{/if}

	<div class="list-item-body">
		{#if title}
			<span class="list-item-title">{title}</span>
		{/if}
		{#if subtitle}
			<span class="list-item-subtitle">{subtitle}</span>
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</div>

	{#if trailing}
		<span class="list-item-trailing">
			{@render trailing()}
		</span>
	{/if}
</div>

<style>
	.list-item {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-sm) var(--space-md);
		min-height: 48px;
		transition: background var(--transition-fast);
		background: var(--color-surface);
	}

	.list-item-clickable {
		cursor: pointer;
	}

	.list-item-interactive:hover {
		background: var(--color-surface-variant);
	}

	.list-item-interactive:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
		border-radius: var(--radius-sm);
	}

	.list-item-active {
		background: var(--color-surface-variant);
		border-left: 3px solid var(--color-primary);
		padding-left: calc(var(--space-md) - 3px);
	}

	.list-item-disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.list-item-leading,
	.list-item-trailing {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}

	.list-item-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.list-item-title {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-normal);
		color: var(--color-text);
		line-height: var(--line-height-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.list-item-subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		line-height: var(--line-height-tight);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
