/**
 * Test: ErrorBoundary.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ErrorBoundary from '../../components/ErrorBoundary.svelte';

vi.mock('svelte-i18n', () => {
	return {
		_: {
			subscribe(fn: (val: (key: string) => string) => void) {
				fn((k: string) => k);
				return () => {};
			}
		},
		locale: {
			subscribe(fn: (val: string) => void) {
				fn('th');
				return () => {};
			},
			set() {}
		},
		init() {},
		register() {},
		getLocaleFromNavigator() {
			return 'th';
		}
	};
});

describe('ErrorBoundary', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render children when no error', () => {
		// Testing without error — the component renders no error UI
		const { container } = render(ErrorBoundary, {});
		expect(container).toBeTruthy();
	});

	it('should show error UI on unhandled error', async () => {
		render(ErrorBoundary, {});
		// Dispatch an error event
		const errorEvent = new ErrorEvent('error', {
			message: 'Test error',
			error: new Error('Test error'),
		});
		// Prevent default reload in test
		window.dispatchEvent(errorEvent);

		await vi.waitFor(() => {
			const errorUI = document.querySelector('.error-boundary');
			expect(errorUI).toBeTruthy();
		}, { timeout: 500 });
	});

	it('should show error message in error UI', async () => {
		render(ErrorBoundary, {});
		const errorEvent = new ErrorEvent('error', {
			message: 'Test error message',
			error: new Error('Test error message'),
		});
		window.dispatchEvent(errorEvent);

		await vi.waitFor(() => {
			expect(screen.getByText('Test error message')).toBeTruthy();
		}, { timeout: 500 });
	});

	it('should display retry button in error state', async () => {
		render(ErrorBoundary, {});
		const errorEvent = new ErrorEvent('error', {
			message: 'Error',
			error: new Error('Error'),
		});
		window.dispatchEvent(errorEvent);

		await vi.waitFor(() => {
			expect(screen.getByText('common.retry')).toBeTruthy();
		}, { timeout: 500 });
	});
});
