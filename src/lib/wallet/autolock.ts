/**
 * AutoLockTimer — idle-timeout based wallet auto-lock.
 *
 * TASK-210: Auto-lock the wallet after a configurable idle timeout.
 *
 * Idle detection events:
 *   - `mousemove` / `keydown` / `touchstart` (user activity)
 *   - `visibilitychange` → reset when the document becomes visible again
 *
 * Lock action (fired when the idle timeout elapses):
 *   1. clearSessionPin()  — drop the session PIN so auto-unlock won't re-open
 *   2. lockWallet()       — clear the in-memory private key + set LOCKED
 *   3. navigateTo('home') — leave any sensitive screen
 *   4. showToast(...)     — inform the user
 *
 * In-flight transaction guard (mint/melt):
 *   - beginTransactionGuard() / endTransactionGuard() reference-count in-flight
 *     operations. While count > 0 the timeout is DEFERRED (re-checked every
 *     GRACE_MS) so the wallet is never locked mid-mint/melt.
 *   - withTransactionGuard() wraps an async fn with try/finally guard.
 *
 * Timeout config is persisted under `lnwcash_autolock_timeout` (minutes).
 * Default 5 minutes. `0` = "Never" (auto-lock disabled).
 */
import { clearSessionPin, lockWallet, isUnlocked } from './state';
import { navigateTo } from '$lib/router';
import { showToast } from '$lib/stores/toast';
import { writable } from 'svelte/store';
import {
	getAutolockTimeoutMinutes,
	setAutolockTimeoutMinutes,
	DEFAULT_AUTOLOCK_TIMEOUT_MINUTES
} from './storage';

// ─── Config ─────────────────────────────────────────────────

/** Auto-lock timeout options (minutes). `0` = "Never" (disabled). */
export const AUTOLOCK_OPTIONS: readonly number[] = [1, 5, 15, 30, 60, 0];

/** Re-check interval (ms) while a transaction is in flight before locking. */
const GRACE_MS = 1000;

/** Toast message shown when the wallet is auto-locked. */
export const AUTOLOCK_TOAST_MESSAGE = 'Wallet auto-locked due to inactivity';

/** TASK-218: Pre-lock countdown — warning shown this long before the lock fires. */
export const PRE_LOCK_WARNING_MS = 10_000;

/** TASK-218: Toast message shown during the pre-lock countdown. */
export const AUTOLOCK_WARNING_TOAST_MESSAGE = 'Wallet will auto-lock soon — move to cancel';

/**
 * TASK-218: Reactive lock signal.
 *
 * Flipped to `true` whenever the wallet locks (auto or manual). App.svelte
 * subscribes to this store so it can redirect to the unlock screen
 * immediately, without requiring a page refresh.
 *
 * `lockWallet()` in state.ts only writes plain localStorage (no Svelte store),
 * so this store is the reactive bridge — it is set by `performLock()` here,
 * NOT by modifying state.ts internals.
 */
export const walletLockedStore = writable<boolean>(false);

// ─── Timer state (module singleton) ─────────────────────────

let started = false;
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let currentTimeoutMs = minutesToMs(getAutolockTimeoutMinutes());

/** Reference count of in-flight transactions (mint/melt). */
let inFlightCount = 0;

/** TASK-218: whether the pre-lock countdown warning has already fired. */
let warningShown = false;

function minutesToMs(minutes: number): number {
	return minutes > 0 ? minutes * 60 * 1000 : 0;
}

function normalizeMinutes(minutes: number): number {
	if (!Number.isFinite(minutes)) return DEFAULT_AUTOLOCK_TIMEOUT_MINUTES;
	return Math.max(0, Math.round(minutes));
}

// ─── Lock action ────────────────────────────────────────────

function performLock(): void {
	clearSessionPin();
	lockWallet();
	walletLockedStore.set(true);
	navigateTo('home');
	showToast(AUTOLOCK_TOAST_MESSAGE, 'info');
}

// ─── Internal scheduling ────────────────────────────────────

function schedule(ms: number): void {
	if (timeoutHandle !== null) clearTimeout(timeoutHandle);
	timeoutHandle = null;
	if (ms <= 0) return;
	timeoutHandle = setTimeout(handleTimeout, ms);
}

function handleTimeout(): void {
	timeoutHandle = null;
	if (!isUnlocked()) return; // already locked / no wallet — nothing to do
	if (inFlightCount > 0) {
		// Defer — NEVER lock while a mint/melt is in flight.
		schedule(GRACE_MS);
		return;
	}
	// TASK-218: Pre-lock countdown — warn the user before locking so the
	// lock isn't instantaneous. Second timeout elapse (after the warning
	// window with no activity) actually performs the lock.
	if (!warningShown) {
		warningShown = true;
		showToast(AUTOLOCK_WARNING_TOAST_MESSAGE, 'info');
		schedule(PRE_LOCK_WARNING_MS);
		return;
	}
	performLock();
}

function onActivity(): void {
	if (!started) return;
	warningShown = false;
	if (currentTimeoutMs > 0 && isUnlocked()) {
		schedule(currentTimeoutMs);
	}
}

function onVisibilityChange(): void {
	if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
		onActivity();
	}
}

// ─── Public API ─────────────────────────────────────────────

/** Manually reset the idle timer (e.g. after programmatic navigation). */
export function resetIdleTimer(): void {
	onActivity();
}

/**
 * TASK-218: Manually lock the wallet immediately (Settings "lock now" button).
 *
 * Clears the session PIN, locks the wallet, signals the reactive
 * `walletLockedStore`, redirects home and shows the lock toast — exactly the
 * same lock path as the idle timeout, but user-triggered.
 */
export function lockNow(): void {
	performLock();
}

/**
 * Start listening for idle events and arm the timeout.
 * Idempotent — safe to call multiple times.
 * Only arms when the wallet is currently unlocked.
 */
export function startAutoLock(): void {
	if (typeof window === 'undefined') return;
	warningShown = false;
	if (started) {
		if (currentTimeoutMs > 0 && isUnlocked()) schedule(currentTimeoutMs);
		return;
	}
	started = true;
	window.addEventListener('mousemove', onActivity);
	window.addEventListener('keydown', onActivity);
	window.addEventListener('touchstart', onActivity);
	document.addEventListener('visibilitychange', onVisibilityChange);
	if (currentTimeoutMs > 0 && isUnlocked()) schedule(currentTimeoutMs);
}

/** Stop listening and clear any pending timeout. */
export function stopAutoLock(): void {
	if (typeof window === 'undefined') return;
	if (!started) return;
	started = false;
	window.removeEventListener('mousemove', onActivity);
	window.removeEventListener('keydown', onActivity);
	window.removeEventListener('touchstart', onActivity);
	document.removeEventListener('visibilitychange', onVisibilityChange);
	if (timeoutHandle !== null) clearTimeout(timeoutHandle);
	timeoutHandle = null;
}

/**
 * Reset timer state to defaults: stop listeners, clear the in-flight guard,
 * and reload the timeout from storage. Used by tests / teardown.
 */
export function resetAutoLock(): void {
	stopAutoLock();
	inFlightCount = 0;
	warningShown = false;
	walletLockedStore.set(false);
	currentTimeoutMs = minutesToMs(getAutolockTimeoutMinutes());
}

/** Read the configured auto-lock timeout (minutes). */
export function getAutolockTimeout(): number {
	return getAutolockTimeoutMinutes();
}

/**
 * Set + persist the auto-lock timeout (minutes) and apply it immediately.
 * `0` disables auto-lock ("Never"); any positive value arms the timer.
 */
export function setAutolockTimeout(minutes: number): void {
	const normalized = normalizeMinutes(minutes);
	setAutolockTimeoutMinutes(normalized);
	currentTimeoutMs = minutesToMs(normalized);
	if (normalized === 0) {
		stopAutoLock();
	} else {
		startAutoLock();
	}
}

// ─── In-flight transaction guard (mint/melt) ────────────────

/** Mark the start of an in-flight transaction (reference-counted). */
export function beginTransactionGuard(): void {
	inFlightCount += 1;
}

/** Mark the end of an in-flight transaction (reference-counted). */
export function endTransactionGuard(): void {
	if (inFlightCount > 0) inFlightCount -= 1;
}

/** Whether a mint/melt transaction is currently in flight. */
export function isTransactionInFlight(): boolean {
	return inFlightCount > 0;
}

/**
 * Wrap an async operation (e.g. mint/melt) so auto-lock is suspended
 * for its entire duration — even if it throws.
 */
export async function withTransactionGuard<T>(fn: () => Promise<T>): Promise<T> {
	beginTransactionGuard();
	try {
		return await fn();
	} finally {
		endTransactionGuard();
	}
}
