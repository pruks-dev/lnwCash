<script lang="ts">
	/**
	 * SeedVerifyQuiz — random 3-word verification quiz (TASK-208 / D4).
	 *
	 * Picks 3 random positions from the recovery phrase (CSPRNG) and asks the
	 * user to type each requested word ("Word #N"). When all three answers are
	 * filled in, they are checked automatically:
	 *   - all correct  → onComplete(true)
	 *   - any wrong    → failed state + retry button (re-randomizes the quiz)
	 *
	 * Props:
	 *   words           — the full ordered phrase (12 words)
	 *   onComplete      — called with `true` on pass, `false` on fail
	 *   onRetry         — optional, called after the quiz re-randomizes
	 *   prompt / wordLabelPrefix / wrongLabel / retryLabel — localized strings
	 */
	import { onMount } from 'svelte';

	interface Props {
		words?: string[];
		onComplete?: (passed: boolean) => void;
		onRetry?: () => void;
		prompt?: string;
		wordLabelPrefix?: string;
		wrongLabel?: string;
		retryLabel?: string;
	}

	let {
		words = [],
		onComplete,
		onRetry,
		prompt = 'Confirm your recovery phrase',
		wordLabelPrefix = 'Word #',
		wrongLabel = 'Incorrect — try again',
		retryLabel = 'Try again'
	}: Props = $props();

	interface QuizItem {
		position: number; // 1-based
		word: string;
	}

	let quiz: QuizItem[] = $state([]);
	let answers: string[] = $state([]);
	let failed: boolean = $state(false);

	/** CSPRNG random index in [0, n). */
	function randomIndex(n: number): number {
		const buf = new Uint32Array(1);
		try {
			crypto.getRandomValues(buf);
		} catch {
			return Math.floor(Math.random() * n);
		}
		return buf[0] % n;
	}

	/** Pick 3 distinct random positions (1-based) from the phrase. */
	function buildQuiz() {
		const total = words.length;
		const count = Math.min(3, total);
		if (total === 0) {
			quiz = [];
			answers = [];
			return;
		}
		const positions = new Set<number>();
		while (positions.size < count) {
			positions.add(randomIndex(total) + 1);
		}
		quiz = Array.from(positions).map((p) => ({
			position: p,
			word: words[p - 1] ?? ''
		}));
		answers = quiz.map(() => '');
		failed = false;
	}

	onMount(buildQuiz);

	function normalize(s: string): string {
		return s.trim().toLowerCase();
	}

	function onInput(i: number, e: Event) {
		answers[i] = (e.target as HTMLInputElement).value;
		failed = false;
		if (answers.every((a) => normalize(a) !== '')) {
			check();
		}
	}

	function check() {
		const ok = quiz.every((q, i) => normalize(answers[i]) === normalize(q.word));
		if (ok) {
			onComplete?.(true);
		} else {
			failed = true;
			onComplete?.(false);
		}
	}

	function retry() {
		buildQuiz();
		onRetry?.();
	}
</script>

<div class="verify-quiz">
	<p class="verify-quiz-prompt">{prompt}</p>

	{#each quiz as q, i (q.position)}
		<div class="verify-quiz-item">
			<label class="verify-quiz-label" for={`quiz-${q.position}`}>{wordLabelPrefix}{q.position}</label>
			<input
				id={`quiz-${q.position}`}
				class="verify-quiz-input"
				type="text"
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
				value={answers[i]}
				aria-invalid={failed}
				oninput={(e) => onInput(i, e)}
			/>
		</div>
	{/each}

	{#if failed}
		<p class="verify-quiz-error" role="alert">{wrongLabel}</p>
		<button type="button" class="verify-quiz-retry" onclick={retry}>{retryLabel}</button>
	{/if}
</div>

<style>
	.verify-quiz {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.verify-quiz-prompt {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-align: center;
	}

	.verify-quiz-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.verify-quiz-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
	}

	.verify-quiz-input {
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		font-family: var(--font-family-mono, ui-monospace, monospace);
		font-size: var(--font-size-md);
		color: var(--color-text);
		background: var(--color-surface);
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		outline: none;
	}

	.verify-quiz-input:focus {
		border-color: var(--color-border-focus);
		box-shadow: 0 0 0 3px rgba(0, 188, 212, 0.15);
	}

	.verify-quiz-input[aria-invalid='true'] {
		border-color: var(--color-error);
	}

	.verify-quiz-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-error);
		text-align: center;
	}

	.verify-quiz-retry {
		padding: 0.5rem 0.875rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #fff;
		background: var(--color-primary, #f7931a);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
	}
</style>
