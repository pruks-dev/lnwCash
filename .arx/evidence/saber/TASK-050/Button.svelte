<script lang="ts">
	/**
	 * Button — D-004
	 * Variants: primary, secondary, ghost, icon
	 * States: default, hover, active, loading, disabled
	 */
	interface Props {
		/** Visual variant */
		variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
		/** Size */
		size?: 'sm' | 'md' | 'lg';
		/** HTML button type */
		type?: HTMLButtonElement['type'];
		/** Disabled state */
		disabled?: boolean;
		/** Loading state — shows spinner, disables interaction */
		loading?: boolean;
		/** Accesible label (required for icon variant) */
		ariaLabel?: string;
		/** Click handler */
		onclick?: (e: MouseEvent) => void;
		/** Slot content */
		children?: import('svelte').Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		loading = false,
		ariaLabel = undefined,
		onclick,
		children
	}: Props = $props();

	const isDisabled = $derived(disabled || loading);
</script>

<button
	{type}
	class="btn btn-{variant} btn-{size}"
	class:btn-loading={loading}
	class:btn-disabled={isDisabled}
	disabled={isDisabled}
	aria-label={ariaLabel}
	aria-busy={loading}
	onclick={onclick}
>
	{#if loading}
		<span class="btn-spinner" aria-hidden="true">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" opacity="0.3" />
				<path d="M8 2a6 6 0 0 1 5.2 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
		</span>
	{/if}
	<span class="btn-content" class:btn-content-hidden={loading}>
		{#if children}
			{@render children()}
		{/if}
	</span>
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		border: 1.5px solid transparent;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		transition: all var(--transition-fast);
		position: relative;
		white-space: nowrap;
		text-decoration: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}

	.btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* Sizes */
	.btn-sm {
		padding: var(--space-xs) var(--space-sm);
		font-size: var(--font-size-xs);
		border-radius: var(--radius-sm);
		min-height: 32px;
	}
	.btn-md {
		padding: var(--space-sm) var(--space-md);
		font-size: var(--font-size-sm);
		min-height: 40px;
	}
	.btn-lg {
		padding: var(--space-sm) var(--space-lg);
		font-size: var(--font-size-md);
		min-height: 48px;
	}

	/* Primary variant */
	.btn-primary {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		border-color: var(--color-primary);
	}
	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
		border-color: var(--color-primary-hover);
	}
	.btn-primary:active:not(:disabled) {
		background: var(--color-primary-dark);
		border-color: var(--color-primary-dark);
	}

	/* Secondary variant */
	.btn-secondary {
		background: transparent;
		color: var(--color-primary);
		border-color: var(--color-primary);
	}
	.btn-secondary:hover:not(:disabled) {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
	}
	.btn-secondary:active:not(:disabled) {
		background: var(--color-primary-dark);
		border-color: var(--color-primary-dark);
		color: var(--color-primary-contrast);
	}

	/* Ghost variant */
	.btn-ghost {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: transparent;
	}
	.btn-ghost:hover:not(:disabled) {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}
	.btn-ghost:active:not(:disabled) {
		background: var(--color-border);
	}

	/* Icon variant */
	.btn-icon {
		background: transparent;
		color: var(--color-text-secondary);
		border-color: transparent;
		padding: var(--space-sm);
		border-radius: var(--radius-full);
		min-width: 40px;
		min-height: 40px;
	}
	.btn-icon.btn-sm {
		padding: var(--space-xs);
		min-width: 32px;
		min-height: 32px;
	}
	.btn-icon.btn-lg {
		padding: var(--space-md);
		min-width: 48px;
		min-height: 48px;
	}
	.btn-icon:hover:not(:disabled) {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}
	.btn-icon:active:not(:disabled) {
		background: var(--color-border);
	}

	/* Disabled */
	.btn-disabled,
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		pointer-events: none;
	}

	/* Loading */
	.btn-loading {
		cursor: wait;
	}

	.btn-content-hidden {
		visibility: hidden;
	}

	.btn-spinner {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: btn-spin 0.8s linear infinite;
	}

	@keyframes btn-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
