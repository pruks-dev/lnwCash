<script lang="ts">
	/**
	 * Toggle — D-004
	 * Accessible switch built on a native checkbox (`role="switch"`).
	 *
	 * - Keyboard accessible (Space/Enter toggles the underlying checkbox).
	 * - `focus-visible` ring is drawn on the track.
	 * - Respects `prefers-reduced-motion` (thumb slide disabled).
	 *
	 * The `checked`/`onchange` contract mirrors the native checkbox so existing
	 * handlers (e.g. Settings `handlePinShuffleToggle`) keep working unchanged.
	 */
	interface Props {
		/** Whether the switch is on */
		checked?: boolean;
		/** Change handler (receives the native input `Event`) */
		onchange?: (e: Event) => void;
		/** Accessible label (required — the track/thumb are aria-hidden) */
		ariaLabel?: string;
		/** Disabled state */
		disabled?: boolean;
	}

	let {
		checked = false,
		onchange,
		ariaLabel = undefined,
		disabled = false
	}: Props = $props();
</script>

<label class="toggle" class:toggle-disabled={disabled}>
	<input
		type="checkbox"
		role="switch"
		class="toggle-input"
		{checked}
		{disabled}
		aria-label={ariaLabel}
		aria-checked={checked}
		onchange={onchange}
	/>
	<span class="toggle-track" aria-hidden="true">
		<span class="toggle-thumb"></span>
	</span>
</label>

<style>
	.toggle {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	/* Visually-hidden-but-focusable checkbox overlays the track so that
	   pointer + keyboard input both land on the native control. */
	.toggle-input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
		z-index: 1;
	}

	.toggle-track {
		display: inline-flex;
		align-items: center;
		width: 46px;
		height: 26px;
		padding: 3px;
		box-sizing: border-box;
		border-radius: var(--radius-full);
		background: var(--color-border);
		transition: background var(--transition-fast);
	}

	.toggle-thumb {
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		background: var(--color-surface);
		box-shadow: var(--shadow-sm);
		transition: transform var(--transition-fast);
	}

	.toggle-input:checked + .toggle-track {
		background: var(--color-primary);
	}

	.toggle-input:checked + .toggle-track .toggle-thumb {
		transform: translateX(20px);
	}

	.toggle-input:focus-visible + .toggle-track {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.toggle-disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.toggle-disabled .toggle-input {
		cursor: not-allowed;
	}

	@media (prefers-reduced-motion: reduce) {
		.toggle-track,
		.toggle-thumb {
			transition: none;
		}
	}
</style>
