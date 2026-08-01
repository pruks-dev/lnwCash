/**
 * Platform detection utilities for Capacitor native vs Web/PWA.
 *
 * Used to decide whether to use native plugins (QR scanner, secure storage)
 * or browser/polyfill fallbacks.
 */

/**
 * Check if the app is running on a native Capacitor platform (Android/iOS).
 * In tests (jsdom), Capacitor is not available → returns false.
 */
export function isNativePlatform(): boolean {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (typeof window === 'undefined') return false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const Capacitor = (window as any).Capacitor;
		return Capacitor?.isNativePlatform?.() ?? false;
	} catch {
		return false;
	}
}

/**
 * Check if the app is running on Android specifically.
 */
export function isAndroidPlatform(): boolean {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (typeof window === 'undefined') return false;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const Capacitor = (window as any).Capacitor;
		return Capacitor?.getPlatform?.() === 'android';
	} catch {
		return false;
	}
}

/**
 * Returns the current platform name: 'android', 'ios', 'web', or 'unknown'.
 */
export function getPlatform(): string {
	if (isAndroidPlatform()) return 'android';
	if (isNativePlatform()) {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (window as any).Capacitor?.getPlatform?.() ?? 'web';
		} catch {
			return 'web';
		}
	}
	return 'web';
}
