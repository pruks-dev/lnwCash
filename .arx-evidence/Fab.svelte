<script lang="ts">
	/**
	 * Fab — TASK-056 (D)
	 * Floating Action Button: center-docked QR Scan
	 *
	 * Static positioned above bottom nav bar, centered horizontally.
	 * Scale + fade animation on mount.
	 * SVG QR icon inline (Iconly icons coming in TASK-061).
	 */
	import { _ } from 'svelte-i18n';

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
	<!-- Inline SVG QR scan icon -->
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M3 7V5a2 2 0 0 1 2-2h2" />
		<path d="M17 3h2a2 2 0 0 1 2 2v2" />
		<path d="M21 17v2a2 2 0 0 1-2 2h-2" />
		<path d="M7 21H5a2 2 0 0 1-2-2v-2" />
		<line x1="3" y1="12" x2="21" y2="12" />
	</svg>
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
