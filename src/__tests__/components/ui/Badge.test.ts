/**
 * Test: ui/Badge.svelte — D-004
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Badge from '../../../lib/components/ui/Badge.svelte';

describe('Badge', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render badge with default variant', () => {
		const { container } = render(Badge, { variant: 'default' });
		const badge = container.querySelector('.badge');
		expect(badge).toBeTruthy();
		expect(badge?.classList.contains('badge-default')).toBe(true);
	});

	it('should render success variant', () => {
		const { container } = render(Badge, { variant: 'success' });
		const badge = container.querySelector('.badge');
		expect(badge?.classList.contains('badge-success')).toBe(true);
	});

	it('should render error variant', () => {
		const { container } = render(Badge, { variant: 'error' });
		const badge = container.querySelector('.badge');
		expect(badge?.classList.contains('badge-error')).toBe(true);
	});

	it('should render warning variant', () => {
		const { container } = render(Badge, { variant: 'warning' });
		const badge = container.querySelector('.badge');
		expect(badge?.classList.contains('badge-warning')).toBe(true);
	});

	it('should render dot mode without text', () => {
		const { container } = render(Badge, { variant: 'success', dot: true });
		const badge = container.querySelector('.badge');
		expect(badge?.classList.contains('badge-dot')).toBe(true);
	});

	it('should have role status', () => {
		const { container } = render(Badge, { variant: 'default' });
		const badge = container.querySelector('.badge');
		expect(badge?.getAttribute('role')).toBe('status');
	});

	it('should set aria-label when provided', () => {
		const { container } = render(Badge, { variant: 'default', ariaLabel: '3 notifications' });
		const badge = container.querySelector('.badge');
		expect(badge?.getAttribute('aria-label')).toBe('3 notifications');
	});
});
