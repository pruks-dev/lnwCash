/**
 * Simple hash-based router for LNWCASH wallet.
 *
 * Route consolidation (D-002): ~9 screens → 6 main routes
 *   #/          → home (dashboard: balance + quick actions + recent tx)
 *   #/receive   → receive (invoice + QR + copy)
 *   #/send      → send (input → confirm → melt)
 *   #/history   → history (tx list with date grouping)
 *   #/settings  → settings (mint, language, theme, about)
 *   #/setup     → setup (register + create wallet)
 *
 * Uses browser hashchange event — no page reloads.
 * Back button support via history.pushState / popstate / hashchange.
 */

export type ScreenKey = 'home' | 'receive' | 'send' | 'history' | 'settings' | 'setup';

const ROUTE_MAP: Record<string, ScreenKey> = {
	'': 'home',
	'/': 'home',
	'/home': 'home',
	'/receive': 'receive',
	'/send': 'send',
	'/history': 'history',
	'/settings': 'settings',
	'/setup': 'setup',
	// Legacy route aliases for backward compatibility
	'/balance': 'home',
	'/pay': 'send',
	'/transfer': 'send'
};

function parseHash(): string {
	const raw = typeof window !== 'undefined' ? window.location.hash.replace(/^#\/?/, '') : '';
	return raw || '';
}

function screenFromHash(hash: string): ScreenKey {
	return ROUTE_MAP[hash] ?? ROUTE_MAP['/' + hash] ?? 'home';
}

/**
 * Get the current screen based on URL hash.
 */
export function getCurrentScreen(): ScreenKey {
	return screenFromHash(parseHash());
}

/**
 * Navigate to a screen by its key.
 * Updates hash (triggers hashchange event).
 */
export function navigateTo(screen: ScreenKey): void {
	if (typeof window === 'undefined') return;
	const currentHash = parseHash();
	const target = screen === 'home' ? '' : '/' + screen;
	if (currentHash === target || (currentHash === '' && screen === 'home')) return;
	window.location.hash = target;
}

/**
 * Navigate to a legacy screen key (for backward compatibility with existing code).
 * Maps old keys to new consolidated routes.
 */
export function navigateToLegacy(screen: 'balance' | 'receive' | 'pay' | 'transfer' | 'history'): void {
	const map: Record<string, ScreenKey> = {
		balance: 'home',
		receive: 'receive',
		pay: 'send',
		transfer: 'send',
		history: 'history'
	};
	navigateTo(map[screen] ?? 'home');
}

/**
 * Go back to the previous screen using browser history.
 */
export function navigateBack(): void {
	if (typeof window === 'undefined') return;
	window.history.back();
}

/**
 * Register a callback to be called when the route changes.
 * Returns an unsubscribe function.
 */
export function onRouteChange(callback: (screen: ScreenKey) => void): () => void {
	if (typeof window === 'undefined') return () => {};

	const handler = () => {
		callback(screenFromHash(parseHash()));
	};

	window.addEventListener('hashchange', handler);

	// Initial call (deferred to next microtask to allow UI to mount)
	setTimeout(() => handler(), 0);

	return () => {
		window.removeEventListener('hashchange', handler);
	};
}
