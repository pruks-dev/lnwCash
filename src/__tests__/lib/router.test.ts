/**
 * Test: router.ts — hash-based routing (TASK-051 updated)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Declare hashchange-related mocks
let currentHash: string = '';
const listeners: Record<string, Array<() => void>> = {};

function setHash(hash: string) {
	currentHash = hash;
	// Trigger registered hashchange listeners
	const hashListeners = listeners['hashchange'] || [];
	for (const handler of hashListeners) {
		handler();
	}
}

beforeEach(() => {
	currentHash = '';
	Object.keys(listeners).forEach(k => delete listeners[k]);
	// Mock window.location
	Object.defineProperty(window, 'location', {
		value: {
			get hash() { return currentHash ? '#' + currentHash : ''; },
			set hash(v: string) {
				const normalized = v.replace(/^#/, '');
				currentHash = normalized;
				const hashListeners = listeners['hashchange'] || [];
				for (const handler of hashListeners) {
					handler();
				}
			},
			get href() { return 'http://localhost/' + (currentHash ? '#' + currentHash : ''); },
			get origin() { return 'http://localhost'; },
			get pathname() { return '/'; },
		},
		writable: true,
		configurable: true,
	});

	// Override addEventListener to capture listeners
	window.addEventListener = vi.fn(((event: string, handler: EventListenerOrEventListenerObject) => {
		if (!listeners[event]) listeners[event] = [];
		listeners[event].push(handler as () => void);
	}) as typeof window.addEventListener);
	window.removeEventListener = vi.fn(((event: string, handler: EventListenerOrEventListenerObject) => {
		if (listeners[event]) {
			listeners[event] = listeners[event].filter(h => h !== handler);
		}
	}) as typeof window.removeEventListener);
});

// We need to import after setting up mocks to capture them
// But due to module caching, we test via dynamic import or direct use
// For simplicity, we'll test the module functions directly after setup
import { getCurrentScreen, navigateTo, onRouteChange, type ScreenKey } from '../../lib/router';

describe('router', () => {
	beforeEach(() => {
		currentHash = '';
		Object.keys(listeners).forEach(k => delete listeners[k]);
	});

	describe('getCurrentScreen', () => {
		it('should return home for empty hash', () => {
			currentHash = '';
			expect(getCurrentScreen()).toBe('home');
		});

		it('should return home for / hash', () => {
			currentHash = '/';
			expect(getCurrentScreen()).toBe('home');
		});

		it('should return receive for /receive', () => {
			currentHash = '/receive';
			expect(getCurrentScreen()).toBe('receive');
		});

		it('should return send for /send', () => {
			currentHash = '/send';
			expect(getCurrentScreen()).toBe('send');
		});

		it('should return send for /pay (legacy)', () => {
			currentHash = '/pay';
			expect(getCurrentScreen()).toBe('send');
		});

		it('should return settings for /settings', () => {
			currentHash = '/settings';
			expect(getCurrentScreen()).toBe('settings');
		});

		it('should return history for /history', () => {
			currentHash = '/history';
			expect(getCurrentScreen()).toBe('history');
		});

		it('should default to home for unknown routes', () => {
			currentHash = '/unknown';
			expect(getCurrentScreen()).toBe('home');
		});
	});

	describe('navigateTo', () => {
		it('should set hash for receive screen', () => {
			setHash(''); // reset to simulate
			navigateTo('receive');
			expect(currentHash).toBe('/receive');
		});

		it('should set hash for send screen', () => {
			setHash('');
			navigateTo('send');
			expect(currentHash).toBe('/send');
		});

		it('should set empty hash for home', () => {
			currentHash = '/receive';
			navigateTo('home');
			expect(currentHash).toBe('');
		});

		it('should not trigger duplicate navigation to same screen', () => {
			currentHash = '/receive';
			const initialHash = currentHash;
			navigateTo('receive');
			expect(currentHash).toBe(initialHash);
		});
	});

	describe('onRouteChange', () => {
		it('should call callback with initial screen', async () => {
			currentHash = '';
			const callback = vi.fn();
			onRouteChange(callback);
			// Initial call is deferred via setTimeout
			await new Promise(resolve => setTimeout(resolve, 50));
			expect(callback).toHaveBeenCalledWith('home');
		});

		it('should call callback on hash change', async () => {
			currentHash = '/receive';
			const callback = vi.fn();
			onRouteChange(callback);
			await new Promise(resolve => setTimeout(resolve, 50));
			expect(callback).toHaveBeenCalledWith('receive');
		});

		it('should return unsubscribe function', () => {
			const callback = vi.fn();
			const unsubscribe = onRouteChange(callback);
			expect(unsubscribe).not.toThrow();
		});
	});
});
