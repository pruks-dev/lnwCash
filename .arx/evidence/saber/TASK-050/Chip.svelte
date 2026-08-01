<script lang="ts">
	/**
	 * Chip — D-004
	 * Compact element for filters, tags, selections
	 */
	interface Props {
		/** Visual variant */
		variant?: 'default' | 'active' | 'outlined';
		/** Removable — shows X icon */
		removable?: boolean;
		/** Click handler */
		onclick?: (e: MouseEvent) => void;
		/** Remove handler (only when removable) */
		onremove?: (e: MouseEvent) => void;
		/** Disabled state */
		disabled?: boolean;
		/** Aria label */
		ariaLabel?: string;
		children?: import('svelte').Snippet;
	}

	let {
		variant = 'default',
		removable = false,
		onclick,
		onremove,
		disabled = false,
		ariaLabel = undefined,
		children
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<span
	class="chip chip-{variant}"
	class:chip-disabled={disabled}
	class:chip-clickable={!!onclick}
	role={onclick ? 'button' : 'status'}
	tabindex={onclick && !disabled ? 0 : undefined}
	aria-label={ariaLabel}
	onclick={onclick}
	onkeydown={(e) => {
		if (onclick && !disabled && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onclick(e as unknown as MouseEvent);
		}
	}}
>
	<span class="chip-content">
		{#if children}
			{@render children()}
		{/if}
	</span>
	{#if removable}
		<button
			type="button"
			class="chip-remove"
			aria-label="Remove"
			onclick={(e) => {
				e.stopPropagation();
				onremove?.(e);
			}}
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	{/if}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-sm);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		border-radius: var(--radius-full);
		border: 1.5px solid transparent;
		transition: all var(--transition-fast);
		white-space: nowrap;
	}

	.chip-default {
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
		border-color: transparent;
	}

	.chip-active {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		border-color: var(--color-primary);
	}

	.chip-outlined {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: var(--color-border);
	}

	.chip-clickable {
		cursor: pointer;
	}

	.chip-clickable:hover:not(.chip-disabled) {
		background: var(--color-primary-light);
		color: var(--color-primary-contrast);
		border-color: var(--color-primary-light);
	}

	.chip-clickable:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.chip-disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.chip-content {
		display: inline;
	}

	.chip-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
	}

	.chip-remove:hover {
		opacity: 1;
	}

	.chip-remove:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 2px;
		border-radius: var(--radius-full);
	}
</style>
