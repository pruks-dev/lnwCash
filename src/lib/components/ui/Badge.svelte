<script lang="ts">
	/**
	 * Badge — D-004
	 * Small label for status, counts, categories
	 */
	interface Props {
		/** Color variant */
		variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
		/** Size */
		size?: 'sm' | 'md';
		/** Dot-only mode (no text) */
		dot?: boolean;
		/** Aria label (for dot mode) */
		ariaLabel?: string;
		children?: import('svelte').Snippet;
	}

	let {
		variant = 'default',
		size = 'md',
		dot = false,
		ariaLabel = undefined,
		children
	}: Props = $props();
</script>

<span
	class="badge badge-{variant} badge-{size}"
	class:badge-dot={dot}
	role="status"
	aria-label={ariaLabel}
>
	{#if children && !dot}
		{@render children()}
	{/if}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-family);
		font-weight: var(--font-weight-semibold);
		border-radius: var(--radius-full);
		white-space: nowrap;
		letter-spacing: 0.02em;
	}

	.badge-sm {
		padding: 2px 6px;
		font-size: 10px;
		line-height: 1.4;
	}

	.badge-md {
		padding: 2px 8px;
		font-size: var(--font-size-xs);
		line-height: 1.4;
	}

	.badge-dot {
		width: 8px;
		height: 8px;
		padding: 0;
		border-radius: var(--radius-full);
	}

	.badge-default {
		background: var(--color-surface-variant);
		color: var(--color-text-secondary);
	}

	.badge-success {
		background: var(--color-success-light);
		color: var(--color-success);
	}

	.badge-warning {
		background: var(--color-warning-light);
		color: var(--color-warning);
	}

	.badge-error {
		background: var(--color-error-light);
		color: var(--color-error);
	}

	.badge-info {
		background: var(--color-info-light);
		color: var(--color-info);
	}
</style>
