/**
 * AutoLockTimer tests — TASK-210.
 *
 * Covers:
 *  - default timeout = 5 min
 *  - idle timeout triggers lock (clearSessionPin + lockWallet + navigate + toast)
 *  - activity resets the timer (mousemove/keydown/touchstart/visibilitychange)
 *  - configurable timeout (1/5/15/30/60) + persistence
 *  - "Never" (0) disables auto-lock
 *  - in-flight transaction guard: NO lock while mint/melt is in flight
 *  - stopAutoLock() stops the timer
 *  - no-op when wallet is already locked
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock navigation + toast (the lock action calls these).
vi.mock('$lib/router', () => ({ navigateTo: vi.fn() }));
vi.mock('$lib/stores/toast', () => ({ showToast: vi.fn() }));

import { navigateTo } from '$lib/router';
import { showToast } from '$lib/stores/toast';

import {
	createWallet,
	unlockWallet,
	lockWallet,
	isUnlocked,
	storeSessionPin,
	getSessionPin
} from '../state';
import {
	clearAllWalletData,
	getAutolockTimeoutMinutes,
	setAutolockTimeoutMinutes
} from '../storage';
import { deleteProofDB, resetProofDB } from '../proofsDb';
import {
	AUTOLOCK_OPTIONS,
	AUTOLOCK_TOAST_MESSAGE,
	startAutoLock,
	stopAutoLock,
	resetIdleTimer,
	setAutolockTimeout,
	getAutolockTimeout,
	beginTransactionGuard,
	endTransactionGuard,
	isTransactionInFlight,
	withTransactionGuard,
	resetAutoLock
} from '../autolock';

const TEST_PIN = '123456';
const TEST_NAME = 'Test Wallet';
const MINUTE = 60 * 1000;

async function createUnlockedWallet(): Promise<void> {
	await createWallet(TEST_PIN, TEST_NAME);
	await unlockWallet(TEST_PIN);
	storeSessionPin(TEST_PIN);
}

describe('AutoLockTimer (TASK-210)', () => {
	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		localStorage.clear();
		sessionStorage.clear();
		vi.clearAllMocks();
		resetAutoLock();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	afterEach(async () => {
		resetAutoLock();
		vi.clearAllTimers();
		vi.useRealTimers();
		await clearAllWalletData();
		await deleteProofDB();
		resetProofDB();
	});

	describe('timeout config', () => {
		it('defaults to 5 minutes when unset', () => {
			expect(getAutolockTimeoutMinutes()).toBe(5);
			expect(getAutolockTimeout()).toBe(5);
		});

		it('exposes options [1, 5, 15, 30, 60, 0]', () => {
			expect(AUTOLOCK_OPTIONS).toEqual([1, 5, 15, 30, 60, 0]);
		});

		it('persists a new timeout via setAutolockTimeout', () => {
			setAutolockTimeout(15);
			expect(getAutolockTimeout()).toBe(15);
			expect(getAutolockTimeoutMinutes()).toBe(15);
			// raw value persisted under the migration key
			expect(localStorage.getItem('lnwcash_autolock_timeout')).toBe('15');
		});

		it('persists "Never" as 0', () => {
			setAutolockTimeout(0);
			expect(getAutolockTimeout()).toBe(0);
			expect(getAutolockTimeoutMinutes()).toBe(0);
		});

		it('falls back to default when stored value is invalid', () => {
			setAutolockTimeoutMinutes(5);
			localStorage.setItem('lnwcash_autolock_timeout', '"garbage"');
			expect(getAutolockTimeoutMinutes()).toBe(5);
		});
	});

	describe('idle timeout → lock', () => {
		it('locks after default 5 min idle', async () => {
			await createUnlockedWallet();
			expect(isUnlocked()).toBe(true);

			startAutoLock();
			vi.advanceTimersByTime(5 * MINUTE);

			expect(isUnlocked()).toBe(false);
			expect(getSessionPin()).toBeNull();
		});

		it('lock action calls navigateTo + showToast', async () => {
			await createUnlockedWallet();
			startAutoLock();
			vi.advanceTimersByTime(5 * MINUTE);

			expect(navigateTo).toHaveBeenCalledWith('home');
			expect(showToast).toHaveBeenCalledWith(AUTOLOCK_TOAST_MESSAGE, 'info');
		});

		it('does NOT lock before the timeout elapses', async () => {
			await createUnlockedWallet();
			startAutoLock();
			vi.advanceTimersByTime(5 * MINUTE - 1);
			expect(isUnlocked()).toBe(true);
		});

		it('respects a custom 1-minute timeout', async () => {
			await createUnlockedWallet();
			setAutolockTimeout(1);
			startAutoLock();

			vi.advanceTimersByTime(1 * MINUTE - 1);
			expect(isUnlocked()).toBe(true);

			vi.advanceTimersByTime(1);
			expect(isUnlocked()).toBe(false);
		});
	});

	describe('activity resets the timer', () => {
		it('resetIdleTimer() postpones the lock', async () => {
			await createUnlockedWallet();
			startAutoLock();

			vi.advanceTimersByTime(4 * MINUTE);
			resetIdleTimer();
			vi.advanceTimersByTime(4 * MINUTE);
			expect(isUnlocked()).toBe(true); // only 4 min since reset

			vi.advanceTimersByTime(1 * MINUTE + 1);
			expect(isUnlocked()).toBe(false);
		});

		it('mousemove event resets the timer', async () => {
			await createUnlockedWallet();
			startAutoLock();

			vi.advanceTimersByTime(4 * MINUTE);
			window.dispatchEvent(new MouseEvent('mousemove'));
			vi.advanceTimersByTime(4 * MINUTE);
			expect(isUnlocked()).toBe(true);

			vi.advanceTimersByTime(1 * MINUTE + 1);
			expect(isUnlocked()).toBe(false);
		});

		it('keydown event resets the timer', async () => {
			await createUnlockedWallet();
			startAutoLock();

			vi.advanceTimersByTime(4 * MINUTE);
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
			vi.advanceTimersByTime(4 * MINUTE);
			expect(isUnlocked()).toBe(true);
		});

		it('touchstart event resets the timer', async () => {
			await createUnlockedWallet();
			startAutoLock();

			vi.advanceTimersByTime(4 * MINUTE);
			window.dispatchEvent(new Event('touchstart'));
			vi.advanceTimersByTime(4 * MINUTE);
			expect(isUnlocked()).toBe(true);
		});
	});

	describe('visibilitychange', () => {
		it('resets the timer when document becomes visible', async () => {
			await createUnlockedWallet();
			startAutoLock();

			vi.advanceTimersByTime(4 * MINUTE);
			Object.defineProperty(document, 'visibilityState', {
				configurable: true,
				value: 'visible'
			});
			document.dispatchEvent(new Event('visibilitychange'));
			vi.advanceTimersByTime(4 * MINUTE);
			expect(isUnlocked()).toBe(true);

			vi.advanceTimersByTime(1 * MINUTE + 1);
			expect(isUnlocked()).toBe(false);
		});
	});

	describe('"Never" (0) disables auto-lock', () => {
		it('never locks while disabled', async () => {
			await createUnlockedWallet();
			setAutolockTimeout(0);
			startAutoLock();

			vi.advanceTimersByTime(60 * MINUTE);
			expect(isUnlocked()).toBe(true);
		});
	});

	describe('in-flight transaction guard', () => {
		it('does NOT lock while a transaction is in flight', async () => {
			await createUnlockedWallet();
			startAutoLock();

			beginTransactionGuard();
			expect(isTransactionInFlight()).toBe(true);

			vi.advanceTimersByTime(10 * MINUTE);
			expect(isUnlocked()).toBe(true); // deferred — no lock mid-tx
			expect(navigateTo).not.toHaveBeenCalled();

			endTransactionGuard();
		});

		it('locks shortly after the transaction finishes', async () => {
			await createUnlockedWallet();
			startAutoLock();

			beginTransactionGuard();
			vi.advanceTimersByTime(10 * MINUTE);
			expect(isUnlocked()).toBe(true);

			endTransactionGuard();
			expect(isTransactionInFlight()).toBe(false);

			// After the grace interval, the deferred lock fires.
			vi.advanceTimersByTime(1000 + 1);
			expect(isUnlocked()).toBe(false);
		});

		it('endTransactionGuard is safe to call without begin', () => {
			endTransactionGuard();
			expect(isTransactionInFlight()).toBe(false);
		});

		it('withTransactionGuard wraps an async fn and releases on throw', async () => {
			await createUnlockedWallet();
			startAutoLock();

			await expect(
				withTransactionGuard(async () => {
					expect(isTransactionInFlight()).toBe(true);
					throw new Error('mint failed');
				})
			).rejects.toThrow('mint failed');

			expect(isTransactionInFlight()).toBe(false);
		});

		it('withTransactionGuard returns the fn result', async () => {
			const result = await withTransactionGuard(async () => 42);
			expect(result).toBe(42);
			expect(isTransactionInFlight()).toBe(false);
		});
	});

	describe('lifecycle', () => {
		it('stopAutoLock() prevents locking', async () => {
			await createUnlockedWallet();
			startAutoLock();
			stopAutoLock();

			vi.advanceTimersByTime(60 * MINUTE);
			expect(isUnlocked()).toBe(true);
		});

		it('does nothing when wallet is already locked', async () => {
			await createWallet(TEST_PIN, TEST_NAME);
			lockWallet();
			startAutoLock();

			vi.advanceTimersByTime(60 * MINUTE);
			expect(isUnlocked()).toBe(false);
			expect(navigateTo).not.toHaveBeenCalled();
			expect(showToast).not.toHaveBeenCalled();
		});

		it('startAutoLock is idempotent', async () => {
			await createUnlockedWallet();
			startAutoLock();
			startAutoLock();
			startAutoLock();

			vi.advanceTimersByTime(5 * MINUTE);
			expect(isUnlocked()).toBe(false);
		});
	});
});
