<script lang="ts">
	/**
	 * PinDots — visual indicator for 4-digit PIN entry (TASK-209 / D5).
	 *
	 * Renders `total` dots (default 4), with the first `length` dots filled.
	 * Used alongside Keypad for sharded PIN entry — never reveals the actual
	 * digits, only the count entered.
	 *
	 * Props:
	 *   length — number of filled dots (digits entered so far)
	 *   total — total dots (default 4)
	 *   error — render dots in the error color (mismatch / wrong PIN)
	 *   shakeKey — increment to re-trigger the shake animation
	 */
	interface Props {
		length?: number;
		total?: number;
		error?: boolean;
		shakeKey?: number;
	}

	let { length = 0, total = 4, error = false, shakeKey = 0 }: Props = $props();

	let shaking = $state(false);

	$effect(() => {
		if (shakeKey <= 0) return;
		shaking = true;
		const t = setTimeout(() => {
			shaking = false;
		}, 500);
		return () => clearTimeout(t);
	});
</script>

<div
	class="pin-dots"
	class:shaking
	class:error
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={total}
	aria-valuenow={length}
	aria-label={`PIN entry ${length} of ${total} digits`}
>
	{#each Array(total) as _, i}
		<span class="dot" class:filled={i < length}></span>
	{/each}
</div>

<style>
	.pin-dots {
		display: flex;
		gap: var(--space-md);
		justify-content: center;
		align-items: center;
		padding: var(--space-md) 0;
	}

	.dot {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid var(--color-border);
		background: transparent;
		transition: background var(--transition-fast), transform var(--transition-fast),
			border-color var(--transition-fast);
	}

	.dot.filled {
		background: var(--color-primary, #00bcd4);
		border-color: var(--color-primary, #00bcd4);
		transform: scale(1.1);
	}

	.error .dot {
		border-color: var(--color-error);
	}

	.error .dot.filled {
		background: var(--color-error);
		border-color: var(--color-error);
	}

	.shaking {
		animation: pin-shake 0.5s ease-in-out;
	}

	/* WCAG 2.3.3 — disable shake for reduced-motion users */
	@media (prefers-reduced-motion: reduce) {
		.shaking {
			animation: none;
		}

		.dot {
			transition: none;
		}
	}

	@keyframes pin-shake {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-8px);
		}
		40% {
			transform: translateX(8px);
		}
		60% {
			transform: translateX(-6px);
		}
		80% {
			transform: translateX(6px);
		}
	}
</style>
