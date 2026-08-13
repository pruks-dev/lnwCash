/**
 * SeedVerifyQuiz tests — TASK-208 (D4) random 3-word verification quiz.
 *
 * The quiz picks 3 random positions from the phrase on mount. Tests read each
 * input's deterministic id (`quiz-{position}`) to discover the requested word
 * position, then type the correct (or wrong) answer.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte/svelte5';
import SeedVerifyQuiz from '../SeedVerifyQuiz.svelte';

afterEach(() => cleanup());

const WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(
	' '
);

/** Read the 3 quiz inputs and return [{ position, input }]. */
function quizInputs(container: HTMLElement) {
	return Array.from(container.querySelectorAll('.verify-quiz-input') as NodeListOf<HTMLInputElement>).map(
		(input) => {
			const m = input.id.match(/quiz-(\d+)/);
			expect(m, `input id ${input.id}`).toBeTruthy();
			return { position: Number(m![1]), input };
		}
	);
}

/** Answer all 3 inputs with the correct word for their position. */
async function answerCorrectly(container: HTMLElement) {
	for (const { position, input } of quizInputs(container)) {
		await fireEvent.input(input, { target: { value: WORDS[position - 1] } });
	}
}

describe('SeedVerifyQuiz (TASK-208 D4)', () => {
	it('renders exactly 3 quiz inputs with distinct positions in 1..12', () => {
		const { container } = render(SeedVerifyQuiz, { words: WORDS });
		const items = quizInputs(container);
		expect(items.length).toBe(3);
		const positions = items.map((q) => q.position);
		expect(new Set(positions).size).toBe(3);
		for (const p of positions) {
			expect(p).toBeGreaterThanOrEqual(1);
			expect(p).toBeLessThanOrEqual(12);
		}
	});

	it('calls onComplete(true) when all 3 words are correct', async () => {
		const onComplete = vi.fn();
		const { container } = render(SeedVerifyQuiz, { words: WORDS, onComplete });
		await answerCorrectly(container);
		expect(onComplete).toHaveBeenCalledWith(true);
	});

	it('calls onComplete(false) and shows error + retry on wrong answer', async () => {
		const onComplete = vi.fn();
		const { container } = render(SeedVerifyQuiz, { words: WORDS, onComplete });
		const items = quizInputs(container);
		// Answer the first input correctly, the rest with a wrong word.
		for (let i = 0; i < items.length; i++) {
			const { position, input } = items[i];
			const value = i === 0 ? WORDS[position - 1] : 'zzzzz';
			await fireEvent.input(input, { target: { value } });
		}
		expect(onComplete).toHaveBeenCalledWith(false);
		expect(container.querySelector('.verify-quiz-error')).toBeTruthy();
		expect(container.querySelector('.verify-quiz-retry')).toBeTruthy();
	});

	it('re-randomizes and clears answers on retry', async () => {
		const onRetry = vi.fn();
		const { container } = render(SeedVerifyQuiz, { words: WORDS, onRetry });
		const items = quizInputs(container);
		// Fail: answer everything wrong
		for (const { input } of items) {
			await fireEvent.input(input, { target: { value: 'zzzzz' } });
		}
		expect(container.querySelector('.verify-quiz-retry')).toBeTruthy();
		await fireEvent.click(container.querySelector('.verify-quiz-retry')!);
		expect(onRetry).toHaveBeenCalledOnce();
		// Answers cleared + error cleared
		const after = quizInputs(container);
		expect(after.every(({ input }) => input.value === '')).toBe(true);
		expect(container.querySelector('.verify-quiz-error')).toBeFalsy();
	});

	it('does not call onComplete until all 3 answers are filled', async () => {
		const onComplete = vi.fn();
		const { container } = render(SeedVerifyQuiz, { words: WORDS, onComplete });
		const items = quizInputs(container);
		await fireEvent.input(items[0].input, { target: { value: WORDS[items[0].position - 1] } });
		expect(onComplete).not.toHaveBeenCalled();
	});
});
