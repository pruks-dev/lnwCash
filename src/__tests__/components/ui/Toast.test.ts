/**
 * Test: ui/Toast.svelte — D-004
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Toast from '../../../lib/components/ui/Toast.svelte';

describe('Toast', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render when visible is true', () => {
		const { container } = render(Toast, { message: 'Hello', visible: true });
		const toast = container.querySelector('.toast');
		expect(toast).toBeTruthy();
	});

	it('should not render when visible is false', () => {
		const { container } = render(Toast, { message: 'Hello', visible: false });
		const toast = container.querySelector('.toast');
		expect(toast).toBeNull();
	});

	it('should show message text', () => {
		render(Toast, { message: 'Transaction complete', visible: true });
		expect(screen.getByText('Transaction complete')).toBeTruthy();
	});

	it('should render success type with correct class', () => {
		const { container } = render(Toast, { message: 'Done', visible: true, type: 'success' });
		const toast = container.querySelector('.toast');
		expect(toast?.classList.contains('toast-success')).toBe(true);
	});

	it('should render error type with correct class', () => {
		const { container } = render(Toast, { message: 'Error', visible: true, type: 'error' });
		const toast = container.querySelector('.toast');
		expect(toast?.classList.contains('toast-error')).toBe(true);
	});

	it('should render warning type with correct class', () => {
		const { container } = render(Toast, { message: 'Warning', visible: true, type: 'warning' });
		const toast = container.querySelector('.toast');
		expect(toast?.classList.contains('toast-warning')).toBe(true);
	});

	it('should have role alert', () => {
		const { container } = render(Toast, { message: 'Alert', visible: true });
		const toast = container.querySelector('.toast');
		expect(toast?.getAttribute('role')).toBe('alert');
	});

	it('should have aria-live polite', () => {
		const { container } = render(Toast, { message: 'Live', visible: true });
		const toast = container.querySelector('.toast');
		expect(toast?.getAttribute('aria-live')).toBe('polite');
	});
});
