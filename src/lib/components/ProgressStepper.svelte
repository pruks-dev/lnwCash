<script lang="ts">
	/**
	 * ProgressStepper — multi-step wizard navigation (TASK-207 / D1).
	 *
	 * Presentational stepper: step indicators + progress bar + back/forward
	 * controls. Navigation logic lives in the parent (Setup.svelte) — this
	 * component only renders state and emits onBack / onNext callbacks.
	 *
	 * Props:
	 *   steps        — ordered steps [{ id, label }]
	 *   currentIndex — 0-based index of the active step
	 *   canContinue  — whether the "next" action is allowed (e.g. seed written down)
	 *   onBack       — back callback (button hidden/disabled at first step)
	 *   onNext       — next callback (button hidden/disabled at last step)
	 *   backLabel / nextLabel — localized button labels
	 */
	export interface StepperStep {
		id: string;
		label: string;
	}

	interface Props {
		steps?: StepperStep[];
		currentIndex?: number;
		canContinue?: boolean;
		onBack?: () => void;
		onNext?: () => void;
		backLabel?: string;
		nextLabel?: string;
	}

	let {
		steps = [],
		currentIndex = 0,
		canContinue = true,
		onBack,
		onNext,
		backLabel = 'Back',
		nextLabel = 'Next'
	}: Props = $props();

	const total = $derived(steps.length);
	const clampedIndex = $derived(Math.max(0, Math.min(currentIndex, total - 1)));
	const progress = $derived(total > 0 ? Math.round(((clampedIndex + 1) / total) * 100) : 0);
	const atFirst = $derived(clampedIndex <= 0);
	const atLast = $derived(clampedIndex >= total - 1);
</script>

<div class="progress-stepper" role="navigation" aria-label="Setup progress">
	<div class="stepper-steps">
		{#each steps as s, i (s.id)}
			<div
				class="stepper-step"
				class:active={i === clampedIndex}
				class:done={i < clampedIndex}
				aria-current={i === clampedIndex ? 'step' : undefined}
			>
				<span class="stepper-dot" aria-hidden="true">{i + 1}</span>
				<span class="stepper-label">{s.label}</span>
			</div>
		{/each}
	</div>

	<div class="stepper-bar" aria-hidden="true">
		<div class="stepper-bar-fill" style:width="{progress}%"></div>
	</div>

	<div class="stepper-controls">
		{#if onBack}
			<button type="button" class="stepper-btn" onclick={onBack} disabled={atFirst}>
				<span class="stepper-btn-arrow" aria-hidden="true">←</span>{backLabel}
			</button>
		{/if}
		{#if onNext}
			<button type="button" class="stepper-btn stepper-btn-next" onclick={onNext} disabled={atLast || !canContinue}>
				{nextLabel}<span class="stepper-btn-arrow" aria-hidden="true">→</span>
			</button>
		{/if}
	</div>
</div>

<style>
	.progress-stepper {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: 100%;
	}

	.stepper-steps {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-xs);
	}

	.stepper-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}

	.stepper-dot {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--color-text-secondary, #888);
		background: var(--color-surface-variant, #f0f0f0);
		border: 1.5px solid var(--color-border, #e0e0e0);
		transition: all var(--transition-fast, 0.2s);
	}

	.stepper-label {
		font-size: 0.68rem;
		font-weight: 500;
		color: var(--color-text-secondary, #888);
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 100%;
	}

	.stepper-step.active .stepper-dot {
		background: var(--color-primary, #00bcd4);
		border-color: var(--color-primary, #00bcd4);
		color: var(--color-primary-contrast, #ffffff);
	}

	.stepper-step.active .stepper-label {
		color: var(--color-text, #1a1a2e);
		font-weight: 600;
	}

	.stepper-step.done .stepper-dot {
		background: var(--color-primary-light, #4dd0e1);
		border-color: var(--color-primary-light, #4dd0e1);
		color: #fff;
	}

	.stepper-bar {
		height: 4px;
		width: 100%;
		background: var(--color-surface-variant, #f0f0f0);
		border-radius: var(--radius-full, 999px);
		overflow: hidden;
	}

	.stepper-bar-fill {
		height: 100%;
		background: var(--color-primary, #f7931a);
		border-radius: var(--radius-full, 999px);
		transition: width 0.3s ease;
	}

	/* WCAG 2.3.3 — disable width animation for reduced-motion users */
	@media (prefers-reduced-motion: reduce) {
		.stepper-bar-fill {
			transition: none;
		}

		.stepper-dot,
		.stepper-btn {
			transition: none;
		}
	}

	.stepper-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.stepper-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0.5rem 0.875rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-secondary, #555);
		background: transparent;
		border: 1px solid var(--color-border, #e0e0e0);
		border-radius: var(--radius-md, 10px);
		cursor: pointer;
		transition: all var(--transition-fast, 0.2s);
	}

	.stepper-btn:hover:not(:disabled) {
		background: var(--color-surface-variant, #f0f0f0);
	}

	.stepper-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.stepper-btn-next {
		color: var(--color-primary-contrast, #ffffff);
		background: var(--color-primary, #00bcd4);
		border-color: var(--color-primary, #00bcd4);
	}

	.stepper-btn-next:hover:not(:disabled) {
		background: var(--color-primary-light);
		border-color: var(--color-primary-light);
		color: var(--color-text);
	}

	.stepper-btn-next:active:not(:disabled) {
		background: var(--color-primary-light);
		border-color: var(--color-primary-light);
		color: var(--color-text);
	}

	.stepper-btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.stepper-btn-arrow {
		font-size: 0.9rem;
		line-height: 1;
	}
</style>
