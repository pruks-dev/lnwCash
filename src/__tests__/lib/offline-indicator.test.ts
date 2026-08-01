/**
 * Test: offline-indicator.ts — connectivity tracking
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isOnline,
	onConnectivityChange,
	wasOffline,
	resetWasOffline,
	trackWasOffline
} from '../../lib/offline-indicator';

describe('offline-indicator', () => {
	beforeEach(() => {
		resetWasOffline();
		// Set navigator.onLine to default
		Object.defineProperty(navigator, 'onLine', {
			value: true,
			writable: true,
			configurable: true,
		});
	});

	describe('isOnline', () => {
		it('should return true when navigator.onLine is true', () => {
			expect(isOnline()).toBe(true);
		});

		it('should return false when navigator.onLine is false', () => {
			Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
			expect(isOnline()).toBe(false);
		});
	});

	describe('onConnectivityChange', () => {
		it('should return a cleanup function', () => {
			const callback = vi.fn();
			const cleanup = onConnectivityChange(callback);
			expect(typeof cleanup).toBe('function');
			cleanup();
		});

		it('should call callback with online status on online event', () => {
			const callback = vi.fn();
			const cleanup = onConnectivityChange(callback);
			// Set navigator.onLine to true, dispatch online
			Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
			window.dispatchEvent(new Event('online'));
			expect(callback).toHaveBeenCalledWith(true);
			cleanup();
		});

		it('should call callback with offline status on offline event', () => {
			const callback = vi.fn();
			const cleanup = onConnectivityChange(callback);
			// Set navigator.onLine to false, dispatch offline
			Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
			window.dispatchEvent(new Event('offline'));
			expect(callback).toHaveBeenCalledWith(false);
			cleanup();
		});
	});

	describe('wasOffline / trackWasOffline', () => {
		it('should initially return false', () => {
			resetWasOffline();
			expect(wasOffline()).toBe(false);
		});

		it('should track that user went offline', () => {
			resetWasOffline();
			const cleanup = trackWasOffline();
			// Set navigator.onLine to false and dispatch offline
			Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
			window.dispatchEvent(new Event('offline'));
			expect(wasOffline()).toBe(true);
			cleanup();
		});

		it('should reset when resetWasOffline is called', () => {
			resetWasOffline();
			const cleanup = trackWasOffline();
			Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
			window.dispatchEvent(new Event('offline'));
			expect(wasOffline()).toBe(true);
			resetWasOffline();
			expect(wasOffline()).toBe(false);
			cleanup();
		});
	});
});
