/**
 * Test: ui/Input.svelte — D-004
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Input from '../../../lib/components/ui/Input.svelte';

describe('Input', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render input element', () => {
		const { container } = render(Input, { type: 'text' });
		const input = container.querySelector('input');
		expect(input).toBeTruthy();
		expect(input?.type).toBe('text');
	});

	it('should render number input type', () => {
		const { container } = render(Input, { type: 'number' });
		const input = container.querySelector('input');
		expect(input?.type).toBe('number');
	});

	it('should render label when provided', () => {
		render(Input, { type: 'text', label: 'Username' });
		expect(screen.getByText('Username')).toBeTruthy();
	});

	it('should show required asterisk when required', () => {
		const { container } = render(Input, { type: 'text', label: 'Email', required: true });
		const required = container.querySelector('.input-required');
		expect(required).toBeTruthy();
	});

	it('should render error message when error prop is set', () => {
		render(Input, { type: 'text', error: 'This field is required' });
		expect(screen.getByText('This field is required')).toBeTruthy();
	});

	it('should not show error when no error', () => {
		const { container } = render(Input, { type: 'text' });
		const errorText = container.querySelector('.input-error-text');
		expect(errorText).toBeNull();
	});

	it('should set aria-invalid on error', () => {
		const { container } = render(Input, { type: 'text', error: 'Invalid input' });
		const input = container.querySelector('input');
		expect(input?.getAttribute('aria-invalid')).toBe('true');
	});

	it('should be disabled when disabled prop set', () => {
		const { container } = render(Input, { type: 'text', disabled: true });
		const input = container.querySelector('input');
		expect(input?.disabled).toBe(true);
	});

	it('should apply placeholder attribute', () => {
		const { container } = render(Input, { type: 'text', placeholder: 'Enter value...' });
		const input = container.querySelector('input');
		expect(input?.getAttribute('placeholder')).toBe('Enter value...');
	});

	it('should handle input events', async () => {
		const onInput = vi.fn();
		const { container } = render(Input, { type: 'text', oninput: onInput });
		const input = container.querySelector('input')!;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onInput).toHaveBeenCalledTimes(1);
	});
});
