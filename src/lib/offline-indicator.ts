/**
 * Reactive offline/online status store for UI components.
 *
 * Usage in Svelte 5:
 *   import { isOnline, wasOffline, onConnectivityChange } from '$lib/offline-indicator';
 *
 *   let online = $state(isOnline());
 *   $effect(() => onConnectivityChange(v => online = v));
 */

/**
 * Check current online status.
 */
export function isOnline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine;
}

/**
 * Listen for online/offline events.
 * Returns an unsubscribe function.
 */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
	if (typeof window === 'undefined') return () => {};

	const handler = () => callback(navigator.onLine);
	window.addEventListener('online', handler);
	window.addEventListener('offline', handler);

	return () => {
		window.removeEventListener('online', handler);
		window.removeEventListener('offline', handler);
	};
}

/**
 * Track whether the user has gone offline at least once in this session.
 * Useful for showing a "you were offline" notification.
 */
let _wasOffline: boolean = false;

export function wasOffline(): boolean {
	return _wasOffline;
}

export function resetWasOffline(): void {
	_wasOffline = false;
}

/**
 * Start tracking wasOffline state (call once at app startup).
 * Returns cleanup function.
 */
export function trackWasOffline(): () => void {
	if (typeof window === 'undefined') return () => {};

	const handler = () => {
		if (!navigator.onLine) {
			_wasOffline = true;
		}
	};

	window.addEventListener('offline', handler);
	return () => {
		window.removeEventListener('offline', handler);
	};
}
