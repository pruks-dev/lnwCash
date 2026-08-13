<script lang="ts">
	/**
	 * Keypad — 4-digit PIN entry keypad (TASK-209 / D5, TASK-220).
	 *
	 * Standard phone keypad order (1-9, 0 at bottom) by default.
	 * TASK-220: optional `shuffle` prop — when true the layout is Fisher-Yates
	 * shuffled using a CSPRNG (`crypto.getRandomValues`). Default OFF per
	 * Commander directive 2026-08-13 (usability > shoulder-surfing; lockout
	 * rate-limit remains the primary brute-force control).
	 *
	 * Unlike `Numpad` (used for amount entry on Receive/Send), this keypad has
	 * NO decimal point and NO confirm button — digits + backspace only.
	 *
	 * Props:
	 *   disabled — disable all buttons
	 *   shuffle — (default false) randomize keypad layout via CSPRNG
	 *   onDigit — called with the pressed digit (0-9)
	 *   onBackspace — called when backspace is pressed
	 */
	interface Props {
		disabled?: boolean;
		shuffle?: boolean;
		onDigit?: (digit: string) => void;
		onBackspace?: () => void;
	}

	let { disabled = false, shuffle = false, onDigit, onBackspace }: Props = $props();

	// Canonical order (1-9, 0 at bottom) used when shuffle is off.
	const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

	let layout = $state([...DIGITS]);

	// TASK-220: Fisher-Yates shuffle using a CSPRNG (crypto.getRandomValues).
	// Returns a fresh permutation of DIGITS. When `shuffle` is false/undefined
	// the layout stays fixed (1-9 + 0).
	function shuffledLayout(): string[] {
		const arr = [...DIGITS];
		const rand = new Uint32Array(arr.length);
		crypto.getRandomValues(rand);
		for (let i = arr.length - 1; i > 0; i--) {
			const j = rand[i] % (i + 1);
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	// Reshuffle whenever the `shuffle` prop flips (and on mount).
	$effect(() => {
		layout = shuffle ? shuffledLayout() : [...DIGITS];
	});

	function press(digit: string) {
		if (disabled) return;
		onDigit?.(digit);
	}

	function backspace() {
		if (disabled) return;
		onBackspace?.();
	}
</script>

<div class="keypad" class:keypad-disabled={disabled} role="group" aria-label="PIN keypad">
	<div class="keypad-row">
		{#each layout.slice(0, 3) as d}
			<button type="button" class="key-btn" disabled={disabled} aria-label={d} onclick={() => press(d)}>{d}</button>
		{/each}
	</div>
	<div class="keypad-row">
		{#each layout.slice(3, 6) as d}
			<button type="button" class="key-btn" disabled={disabled} aria-label={d} onclick={() => press(d)}>{d}</button>
		{/each}
	</div>
	<div class="keypad-row">
		{#each layout.slice(6, 9) as d}
			<button type="button" class="key-btn" disabled={disabled} aria-label={d} onclick={() => press(d)}>{d}</button>
		{/each}
	</div>
	<div class="keypad-row">
		<span class="keypad-spacer" aria-hidden="true"></span>
		<button type="button" class="key-btn" disabled={disabled} aria-label={layout[9]} onclick={() => press(layout[9])}>{layout[9]}</button>
		<button type="button" class="key-btn key-backspace" disabled={disabled} aria-label="Backspace" onclick={backspace}>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
				<line x1="18" y1="9" x2="12" y2="15"/>
				<line x1="12" y1="9" x2="18" y2="15"/>
			</svg>
		</button>
	</div>
</div>

<style>
	.keypad {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		width: 100%;
		max-width: 360px;
		margin: 0 auto;
		padding: var(--space-sm) 0;
	}

	.keypad-disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.keypad-row {
		display: flex;
		gap: var(--space-sm);
		justify-content: center;
	}

	.keypad-spacer {
		flex: 1;
	}

	.key-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 56px;
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-family);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: background var(--transition-fast), transform var(--transition-fast);
		-webkit-tap-highlight-color: transparent;
		user-select: none;
		box-shadow: var(--shadow-sm);
	}

	.key-btn:hover:not(:disabled) {
		background: var(--color-surface-variant);
	}

	.key-btn:active:not(:disabled) {
		transform: scale(0.95);
		background: var(--color-border);
	}

	.key-btn:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}

	.key-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.key-backspace {
		color: var(--color-text-secondary);
		background: var(--color-surface-variant);
	}

	/* WCAG 2.3.3 — respect reduced-motion (no press scale / hover shifts) */
	@media (prefers-reduced-motion: reduce) {
		.key-btn {
			transition: none;
		}

		.key-btn:active:not(:disabled) {
			transform: none;
		}
	}
</style>
