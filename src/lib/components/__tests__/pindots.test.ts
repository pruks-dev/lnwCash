/**
 * PinDots tests — TASK-209 (D5) 4-digit PIN indicator.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte/svelte5';
import PinDots from '../PinDots.svelte';

afterEach(() => cleanup());

describe('PinDots (TASK-209 D5)', () => {
	it('renders 4 dots by default', () => {
		const { container } = render(PinDots, {});
		expect(container.querySelectorAll('.dot').length).toBe(4);
	});

	it('fills dots up to the entered length', () => {
		const { container } = render(PinDots, { length: 2, total: 4 });
		expect(container.querySelectorAll('.dot').length).toBe(4);
		expect(container.querySelectorAll('.dot.filled').length).toBe(2);
	});

	it('renders a custom total', () => {
		const { container } = render(PinDots, { length: 1, total: 6 });
		expect(container.querySelectorAll('.dot').length).toBe(6);
		expect(container.querySelectorAll('.dot.filled').length).toBe(1);
	});

	it('exposes progress via aria attributes', () => {
		const { container } = render(PinDots, { length: 3, total: 4 });
		const bar = container.querySelector('.pin-dots')!;
		expect(bar.getAttribute('role')).toBe('progressbar');
		expect(bar.getAttribute('aria-valuemax')).toBe('4');
		expect(bar.getAttribute('aria-valuenow')).toBe('3');
	});

	it('applies error class when error', () => {
		const { container } = render(PinDots, { error: true });
		expect(container.querySelector('.pin-dots')!.classList.contains('error')).toBe(true);
	});

	it('shakes when shakeKey is non-zero', () => {
		const { container } = render(PinDots, { shakeKey: 1 });
		expect(container.querySelector('.pin-dots')!.classList.contains('shaking')).toBe(true);
	});

	it('does not shake with shakeKey = 0', () => {
		const { container } = render(PinDots, { shakeKey: 0 });
		expect(container.querySelector('.pin-dots')!.classList.contains('shaking')).toBe(false);
	});
});
