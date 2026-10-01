/**
 * Theme Store — TASK-052 (A)
 * Svelte writable store for theme state (light / dark / system)
 * Handles system preference detection + localStorage persistence
 */
import { writable, derived } from 'svelte/store';
import { getSettings, setSettings } from '$lib/storage/local';
import type { ThemeMode } from '$lib/types';

/** Resolved (applied) theme: always 'light' or 'dark' */
export type ResolvedTheme = 'light' | 'dark';

function getSystemPreference(): ResolvedTheme {
	if (typeof window !== 'undefined' && window.matchMedia) {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}
	return 'light';
}

function loadInitialMode(): ThemeMode {
	try {
		return getSettings().theme || 'system';
	} catch {
		return 'system';
	}
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
	if (mode === 'system') return getSystemPreference();
	return mode;
}

export function applyThemeDom(theme: ResolvedTheme) {
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-theme', theme);
		// TASK-1101 (INTENT-009): upsert meta[name=theme-color] — light #fafafa / dark #12121a
		let meta = document.querySelector('meta[name="theme-color"]');
		if (!meta) { meta = document.createElement('meta'); document.head.appendChild(meta); meta.setAttribute('name', 'theme-color'); }
		meta.setAttribute('content', theme === 'dark' ? '#12121a' : '#fafafa');
	}
}

// ─── Store ───────────────────────────────────────────────────

/** User-selected theme mode */
export const themeMode = writable<ThemeMode>(loadInitialMode());

/** Resolved theme actually applied to DOM */
export const resolvedTheme = derived<typeof themeMode, ResolvedTheme>(
	themeMode,
	($mode, set) => {
		const resolved = resolveTheme($mode);
		applyThemeDom(resolved);
		set(resolved);
	}
);

// ─── Actions ──────────────────────────────────────────────────

export function setTheme(mode: ThemeMode) {
	themeMode.set(mode);
	try {
		setSettings({ theme: mode });
	} catch {
		// localStorage unavailable — no-op
	}
}

/**
 * Listen for OS-level theme changes when mode === 'system'.
 * Returns cleanup function.
 */
export function initSystemThemeListener(): () => void {
	if (typeof window === 'undefined' || !window.matchMedia) return () => {};

	const mq = window.matchMedia('(prefers-color-scheme: dark)');

	function handleChange() {
		const currentMode = loadInitialMode();
		if (currentMode === 'system') {
			// Re-resolve by triggering store update
			themeMode.update((m) => m); // force derived recompute
			applyThemeDom(getSystemPreference());
		}
	}

	mq.addEventListener('change', handleChange);
	return () => mq.removeEventListener('change', handleChange);
}

/**
 * Apply theme on app initialization.
 * Call once from main.ts / App.svelte.
 */
export function initTheme(): () => void {
	const mode = loadInitialMode();
	const resolved = resolveTheme(mode);
	applyThemeDom(resolved);
	themeMode.set(mode);
	return initSystemThemeListener();
}
