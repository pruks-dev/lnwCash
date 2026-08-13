/**
 * ProgressStepper tests — TASK-207 (D1) multi-step wizard navigation.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte/svelte5';
import ProgressStepper, { type StepperStep } from '../ProgressStepper.svelte';

afterEach(() => cleanup());

const STEPS: StepperStep[] = [
	{ id: 'welcome', label: 'Welcome' },
	{ id: 'seed', label: 'Recovery Phrase' },
	{ id: 'verify', label: 'Verify' },
	{ id: 'pin', label: 'Set PIN' },
	{ id: 'done', label: 'Done' }
];

describe('ProgressStepper (TASK-207)', () => {
	it('renders all 5 step labels', () => {
		const { container } = render(ProgressStepper, { steps: STEPS, currentIndex: 0 });
		for (const s of STEPS) {
			expect(container.textContent).toContain(s.label);
		}
	});

	it('renders 4+ steps (>= 4)', () => {
		const { container } = render(ProgressStepper, { steps: STEPS, currentIndex: 0 });
		expect(container.querySelectorAll('.stepper-step').length).toBeGreaterThanOrEqual(4);
	});

	it('shows progress indicator matching currentIndex', () => {
		const { container } = render(ProgressStepper, { steps: STEPS, currentIndex: 2 });
		const fill = container.querySelector('.stepper-bar-fill') as HTMLElement;
		// index 2 of 5 → (3/5)*100 = 60%
		expect(fill.style.width).toBe('60%');
	});

	it('back button disabled at first step', () => {
		const { container } = render(ProgressStepper, {
			steps: STEPS,
			currentIndex: 0,
			onBack: vi.fn(),
			onNext: vi.fn()
		});
		const back = container.querySelector('.stepper-btn:not(.stepper-btn-next)') as HTMLButtonElement;
		expect(back.disabled).toBe(true);
	});

	it('next button disabled at last step', () => {
		const { container } = render(ProgressStepper, {
			steps: STEPS,
			currentIndex: 4,
			onBack: vi.fn(),
			onNext: vi.fn()
		});
		const next = container.querySelector('.stepper-btn-next') as HTMLButtonElement;
		expect(next.disabled).toBe(true);
	});

	it('calls onBack and onNext callbacks', async () => {
		const onBack = vi.fn();
		const onNext = vi.fn();
		const { container } = render(ProgressStepper, {
			steps: STEPS,
			currentIndex: 1,
			onBack,
			onNext
		});
		await fireEvent.click(container.querySelector('.stepper-btn:not(.stepper-btn-next)')!);
		expect(onBack).toHaveBeenCalledOnce();
		await fireEvent.click(container.querySelector('.stepper-btn-next')!);
		expect(onNext).toHaveBeenCalledOnce();
	});

	it('next button disabled when canContinue is false', () => {
		const { container } = render(ProgressStepper, {
			steps: STEPS,
			currentIndex: 1,
			canContinue: false,
			onBack: vi.fn(),
			onNext: vi.fn()
		});
		const next = container.querySelector('.stepper-btn-next') as HTMLButtonElement;
		expect(next.disabled).toBe(true);
	});
});
