<script lang="ts">
	/**
	 * Toast — D-004
	 * Transient notification that auto-dismisses
	 */
	interface Props {
		/** Toast message */
		message: string;
		/** Type determines icon + color */
		type?: 'info' | 'success' | 'error' | 'warning';
		/** Show/hide */
		visible?: boolean;
		/** Auto-dismiss duration in ms (0 = no auto-dismiss) */
		duration?: number;
		/** Close handler */
		onclose?: () => void;
		/** Action button label */
		actionLabel?: string;
		/** Action handler */
		onaction?: () => void;
	}

	let {
		message,
		type = 'info',
		visible = true,
		duration = 4000,
		onclose,
		actionLabel = undefined,
		onaction
	}: Props = $props();

	$effect(() => {
		if (visible && duration > 0) {
			const timer = setTimeout(() => {
				onclose?.();
			}, duration);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if visible}
	<div
		class="toast toast-{type}"
		class:toast-enter={visible}
		role="alert"
		aria-live="polite"
	>
		<span class="toast-icon" aria-hidden="true">
			{#if type === 'success'}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<path d="M20 6L9 17l-5-5" />
				</svg>
			{:else if type === 'error'}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
			{:else if type === 'warning'}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
					<line x1="12" y1="9" x2="12" y2="13" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
			{:else}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="16" x2="12" y2="12" />
					<line x1="12" y1="8" x2="12.01" y2="8" />
				</svg>
			{/if}
		</span>

		<span class="toast-message">{message}</span>

		{#if actionLabel && onaction}
			<button type="button" class="toast-action" onclick={onaction}>
				{actionLabel}
			</button>
		{/if}

		{#if onclose}
			<button type="button" class="toast-close" aria-label="Dismiss" onclick={onclose}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		{/if}
	</div>
{/if}

<style>
	.toast {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		box-shadow: var(--shadow-md);
		max-width: 360px;
		animation: toast-in 0.3s ease;
	}

	.toast-info {
		background: var(--color-surface-raised);
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}

	.toast-success {
		background: var(--color-success-light);
		color: var(--color-success);
	}

	.toast-error {
		background: var(--color-error-light);
		color: var(--color-error);
	}

	.toast-warning {
		background: var(--color-warning-light);
		color: var(--color-warning);
	}

	.toast-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.toast-message {
		flex: 1;
		line-height: var(--line-height-normal);
	}

	.toast-action {
		padding: var(--space-xs) var(--space-sm);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		font-family: var(--font-family);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.toast-action:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.toast-close {
		display: flex;
		align-items: center;
		padding: var(--space-xs);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		cursor: pointer;
		opacity: 0.7;
	}

	.toast-close:hover {
		opacity: 1;
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
