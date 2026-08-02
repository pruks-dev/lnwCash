<script lang="ts">
	/**
	 * Fab — TASK-056 (D) + TASK-061 Iconly integration
	 * Floating Action Button: center-docked QR Scan
	 *
	 * Static positioned above bottom nav bar, centered horizontally.
	 * Scale + fade animation on mount.
	 * Uses Iconly Scan icon component (TASK-061).
	 */
	import { _ } from 'svelte-i18n';
	import Scan from '$lib/components/icons/Scan.svelte';

	interface Props {
		/** Click handler for QR scan action */
		onclick?: () => void;
	}

	let { onclick }: Props = $props();
</script>

<button
	class="fab"
	type="button"
	onclick={onclick}
	aria-label={$_('screen.qrscan.title')}
>
	<Scan size={28} color="#ffffff" />
</button>

<style>
	.fab {
		/* Positioning — center-docked above bottom nav */
		position: fixed;
		bottom: calc(24px + env(safe-area-inset-bottom, 0px));
		left: 50%;
		transform: translateX(-50%);
		z-index: calc(var(--z-sticky) + 10);

		/* Sizing & Shape */
		width: 56px;
		height: 56px;
		border-radius: var(--radius-full);
		border: none;

		/* Colors */
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		box-shadow: var(--shadow-lg);

		/* Interaction */
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		-webkit-tap-highlight-color: transparent;

		/* Transition: scale + fade on mount */
		animation: fab-enter var(--transition-normal) ease-out;

		/* Touch target (WCAG 2.5.5) */
		min-width: 44px;
		min-height: 44px;
	}

	.fab:hover {
		background: var(--color-primary-hover);
	}

	.fab:active {
		transform: translateX(-50%) scale(0.92);
	}

	.fab:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 4px;
	}

	@keyframes fab-enter {
		from {
			transform: translateX(-50%) scale(0);
			opacity: 0;
		}
		to {
			transform: translateX(-50%) scale(1);
			opacity: 1;
		}
	}

	/* Reduced motion — respect user preference */
	@media (prefers-reduced-motion: reduce) {
		.fab {
			animation: none;
		}
	}
</style>
