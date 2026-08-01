<script lang="ts">
	/**
	 * Modal — D-004
	 * Variants: dialog (centered overlay), bottomsheet (slides up from bottom)
	 */
	interface Props {
		/** Show/hide modal */
		open?: boolean;
		/** Close handler */
		onclose?: () => void;
		/** Modal title (shown in header) */
		title?: string;
		/** Variant: dialog or bottom sheet */
		variant?: 'dialog' | 'bottomsheet';
		/** Aria label for the dialog */
		ariaLabel?: string;
		/** Aria describedby id */
		ariaDescribedby?: string;
		children?: import('svelte').Snippet;
	}

	let {
		open = false,
		onclose,
		title = undefined,
		variant = 'dialog',
		ariaLabel = undefined,
		ariaDescribedby = undefined,
		children
	}: Props = $props();

	let modalRef: HTMLDivElement | undefined = $state();
	let previousFocus: HTMLElement | undefined;

	function handleClose() {
		onclose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	$effect(() => {
		if (open) {
			previousFocus = document.activeElement as HTMLElement;
			document.body.style.overflow = 'hidden';
			// Focus modal after animation
			setTimeout(() => modalRef?.focus(), 100);
		} else {
			document.body.style.overflow = '';
			previousFocus?.focus();
		}
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop modal-backdrop-{variant}"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="presentation"
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			bind:this={modalRef}
			class="modal-content modal-{variant}"
			role="dialog"
			aria-modal="true"
			aria-label={ariaLabel ?? title ?? 'Dialog'}
			aria-describedby={ariaDescribedby}
			tabindex={-1}
		>
			{#if title || onclose}
				<div class="modal-header">
					<h2 class="modal-title">{title ?? ''}</h2>
					{#if onclose}
						<button
							type="button"
							class="modal-close"
							aria-label="Close dialog"
							onclick={handleClose}
						>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					{/if}
				</div>
			{/if}

			<div class="modal-body" id={ariaDescribedby}>
				{#if children}
					{@render children()}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal-backdrop);
		background: var(--color-overlay);
		display: flex;
		animation: backdrop-in 0.2s ease;
	}

	.modal-backdrop-dialog {
		align-items: center;
		justify-content: center;
		padding: var(--space-md);
	}

	.modal-backdrop-bottomsheet {
		align-items: flex-end;
		justify-content: center;
	}

	.modal-content {
		background: var(--color-surface);
		color: var(--color-text);
		max-height: 85vh;
		overflow-y: auto;
		outline: none;
	}

	.modal-dialog {
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 420px;
		box-shadow: var(--shadow-lg);
		animation: dialog-in 0.25s ease;
	}

	.modal-bottomsheet {
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		width: 100%;
		max-width: 480px;
		padding-bottom: env(safe-area-inset-bottom, 0);
		animation: sheet-in 0.3s ease;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-md) var(--space-sm);
		border-bottom: 1px solid var(--color-divider);
	}

	.modal-title {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: none;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		flex-shrink: 0;
	}

	.modal-close:hover {
		background: var(--color-surface-variant);
	}

	.modal-close:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.modal-body {
		padding: var(--space-md);
	}

	@keyframes backdrop-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes dialog-in {
		from {
			opacity: 0;
			transform: scale(0.95) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	@keyframes sheet-in {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}
</style>
