/**
 * Test: ui/Button.svelte — D-004
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Button from '../../../lib/components/ui/Button.svelte';

describe('Button', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render button element', () => {
		const { container } = render(Button, { variant: 'primary' });
		const btn = container.querySelector('button');
		expect(btn).toBeTruthy();
		expect(btn?.getAttribute('type')).toBe('button');
	});

	it('should render primary variant with correct class', () => {
		const { container } = render(Button, { variant: 'primary' });
		const btn = container.querySelector('button');
		expect(btn?.classList.contains('btn-primary')).toBe(true);
	});

	it('should render secondary variant with correct class', () => {
		const { container } = render(Button, { variant: 'secondary' });
		const btn = container.querySelector('button');
		expect(btn?.classList.contains('btn-secondary')).toBe(true);
	});

	it('should render ghost variant with correct class', () => {
		const { container } = render(Button, { variant: 'ghost' });
		const btn = container.querySelector('button');
		expect(btn?.classList.contains('btn-ghost')).toBe(true);
	});

	it('should render icon variant with correct class', () => {
		const { container } = render(Button, { variant: 'icon' });
		const btn = container.querySelector('button');
		expect(btn?.classList.contains('btn-icon')).toBe(true);
	});

	it('should be disabled when disabled prop is true', () => {
		const { container } = render(Button, { variant: 'primary', disabled: true });
		const btn = container.querySelector('button');
		expect(btn?.disabled).toBe(true);
	});

	it('should show aria-busy when loading', () => {
		const { container } = render(Button, { variant: 'primary', loading: true });
		const btn = container.querySelector('button');
		expect(btn?.getAttribute('aria-busy')).toBe('true');
	});

	it('should set aria-label when provided', () => {
		const { container } = render(Button, { variant: 'icon', ariaLabel: 'Close menu' });
		const btn = container.querySelector('button');
		expect(btn?.getAttribute('aria-label')).toBe('Close menu');
	});

	it('should handle click events', async () => {
		const onClick = vi.fn();
		const { container } = render(Button, { variant: 'primary', onclick: onClick });
		const btn = container.querySelector('button')!;
		btn.click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('should not fire click when disabled', () => {
		const onClick = vi.fn();
		const { container } = render(Button, { variant: 'primary', disabled: true, onclick: onClick });
		const btn = container.querySelector('button')!;
		btn.click();
		expect(onClick).not.toHaveBeenCalled();
	});

	it('should render size sm correctly', () => {
		const { container } = render(Button, { variant: 'primary', size: 'sm' });
		const btn = container.querySelector('button');
		expect(btn?.classList.contains('btn-sm')).toBe(true);
	});

	it('should render size lg correctly', () => {
		const { container } = render(Button, { variant: 'primary', size: 'lg' });
		const btn = container.querySelector('button');
		expect(btn?.classList.contains('btn-lg')).toBe(true);
	});
});
