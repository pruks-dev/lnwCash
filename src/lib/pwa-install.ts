/**
 * PWA install prompt manager.
 *
 * Captures the `beforeinstallprompt` event and provides it to
 * the PwaInstallPrompt component.
 *
 * Features:
 * - Track installability (browser supports PWA install)
 * - Capture beforeinstallprompt event
 * - Show prompt via component
 * - Persist "dismissed" state in localStorage
 * - Detect if already installed (standalone mode)
 */

const DISMISS_KEY = 'lnwcash_pwa_install_dismissed';

/**
 * Check if the app is running in standalone mode (already installed).
 */
export function isStandalone(): boolean {
	if (typeof window === 'undefined') return true; // SSR: assume installed (hide prompt)
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
	// Also check for iOS standalone
	const isIOSStandalone = 'standalone' in navigator && (navigator as Record<string, unknown>).standalone === true;
	return isStandalone || isIOSStandalone;
}

/**
 * Check if the install prompt has been dismissed by the user.
 */
export function isInstallDismissed(): boolean {
	try {
		return localStorage.getItem(DISMISS_KEY) === '1';
	} catch {
		return false;
	}
}

/**
 * Persist the dismissed state so we don't show the prompt again.
 */
export function dismissInstall(): void {
	try {
		localStorage.setItem(DISMISS_KEY, '1');
	} catch {
		// Ignore storage errors
	}
}

/**
 * Reset the dismissed state (e.g., after some time or manually).
 */
export function resetInstallDismissed(): void {
	try {
		localStorage.removeItem(DISMISS_KEY);
	} catch {
		// Ignore storage errors
	}
}

// ─── In-memory store for the beforeinstallprompt event ────────

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let _deferredPrompt: BeforeInstallPromptEvent | null = null;
let _canInstall: boolean = false;
let _listeners: Array<(canInstall: boolean) => void> = [];

/**
 * Subscribe to installability changes. Returns unsubscribe function.
 */
export function onCanInstallChange(callback: (canInstall: boolean) => void): () => void {
	_listeners.push(callback);
	// Fire immediately with current state
	callback(_canInstall);
	return () => {
		_listeners = _listeners.filter(l => l !== callback);
	};
}

function notify() {
	for (const listener of _listeners) {
		try { listener(_canInstall); } catch { /* ignore */ }
	}
}

/**
 * Initialize the PWA install prompt listener.
 * Call once at app startup.
 *
 * Returns a cleanup function.
 */
export function initPwaInstall(): () => void {
	if (typeof window === 'undefined') return () => {};

	const onBeforeInstall = (e: Event) => {
		e.preventDefault();
		_deferredPrompt = e as BeforeInstallPromptEvent;
		_canInstall = true;
		notify();
	};

	const onAppInstalled = () => {
		_deferredPrompt = null;
		_canInstall = false;
		notify();
	};

	window.addEventListener('beforeinstallprompt', onBeforeInstall);
	window.addEventListener('appinstalled', onAppInstalled);

	return () => {
		window.removeEventListener('beforeinstallprompt', onBeforeInstall);
		window.removeEventListener('appinstalled', onAppInstalled);
	};
}

/**
 * Trigger the install prompt.
 * Returns true if the prompt was shown and accepted.
 */
export async function triggerInstall(): Promise<boolean> {
	if (!_deferredPrompt) return false;

	try {
		await _deferredPrompt.prompt();
		const result = await _deferredPrompt.userChoice;
		_deferredPrompt = null;
		_canInstall = false;
		notify();
		return result.outcome === 'accepted';
	} catch {
		_deferredPrompt = null;
		_canInstall = false;
		notify();
		return false;
	}
}

/**
 * Check if install prompt is available right now.
 */
export function canInstallNow(): boolean {
	return _canInstall && _deferredPrompt !== null;
}
