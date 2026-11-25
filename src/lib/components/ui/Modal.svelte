<script lang="ts">
	/**
	 * Modal — D-004
	 * Variants: dialog (centered overlay), bottomsheet (slides up from bottom)
	 */
	import { onDestroy } from 'svelte';
	interface Props {
		/** Show/hide modal */
		open?: boolean;
		/** Close handler */
		onclose?: () => void;
		/** Modal title (shown in header) */
		title?: string;
		/** Variant: dialog or bottom sheet */
		variant?: 'dialog' | 'bottomsheet';
		/** Layout: auto (content-sized) or fixed (R7 pinned-scroll: flex-column fixed-height) */
		layout?: 'auto' | 'fixed';
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
		layout = 'auto',
		ariaLabel = undefined,
		ariaDescribedby = undefined,
		children
	}: Props = $props();

	let modalRef: HTMLDivElement | undefined = $state();

	// TASK-5702-R12 exit anim (INTENT-057 BLUEPRINT v3 rev25 ORDER (6):
	// anim ชีทเลื่อนลงตอนปิด — ผ่าน Modal ตัวเดียว). Mounted render splits
	// into show (in DOM) + leaving (exit anim playing): X/backdrop/Escape
	// start `leaving` and call onclose only after the slide-down finishes;
	// a parent-driven open=false (save success, row removed) unmounts at
	// once — no fake delay. Both variants animate (sheet slides down,
	// dialog fades+settles).
	let show = $state(false);
	let leaving = $state(false);
	let leaveTimer: ReturnType<typeof setTimeout> | null = null;

	function clearLeaveTimer(): void {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
		}
	}

	function requestClose() {
		if (leaving) return;
		leaving = true;
		clearLeaveTimer();
		leaveTimer = setTimeout(() => {
			leaveTimer = null;
			onclose?.();
		}, 200);
	}

	$effect(() => {
		if (open) {
			clearLeaveTimer();
			show = true;
			leaving = false;
		} else {
			clearLeaveTimer();
			show = false;
			leaving = false;
		}
	});

	onDestroy(() => clearLeaveTimer());
	let previousFocus: HTMLElement | undefined;

	function handleClose() {
		requestClose();
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

{#if show}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop modal-backdrop-{variant}"
		class:modal-leaving={leaving}
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		role="presentation"
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			bind:this={modalRef}
			class="modal-content modal-{variant} modal-layout-{layout}"
			class:modal-leaving={leaving}
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

	/* TASK-4503 (layout=fixed — R7 pinned-scroll, moved in from mint page
	   :global): flex-column fixed-height + body flex:1 scroll-inside.
	   auto (default) keeps content-sized behavior above — confirm back
	   to auto. Specificity/order: these sit after base rules so equal-
	   weight .modal-layout-fixed beats .modal-content overflow. */
	.modal-layout-fixed {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-dialog.modal-layout-fixed {
		height: min(78vh, 640px);
		max-height: 85vh;
	}

	.modal-layout-fixed .modal-body {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
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

	/* TASK-5702-R12 exit anim (ORDER (6) — slide-down on close, both sheets
	   pass through this one Modal): leaving plays while mounted; onclose
	   fires after 200ms (matches requestClose). */
	.modal-backdrop.modal-leaving {
		animation: backdrop-out 0.2s ease forwards;
	}
	.modal-content.modal-leaving {
		animation: modal-out 0.2s ease forwards;
	}
	.modal-bottomsheet.modal-leaving {
		animation: sheet-out 0.2s ease forwards;
	}

	@keyframes backdrop-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}

	@keyframes modal-out {
		from {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
		to {
			opacity: 0;
			transform: scale(0.95) translateY(10px);
		}
	}

	@keyframes sheet-out {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(100%);
		}
	}

	@media (max-height: 640px) {
		.modal-dialog.modal-layout-fixed {
			height: 88vh;
		}
	}
</style>
