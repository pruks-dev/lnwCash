/**
 * UnlockPrompt tests — TASK-216 (F-027-002 / F-027-008).
 *
 * Closes the lockout bypass: the unlock (re-auth) surface must be rate-limited
 * by the shared lockout counter, and the PIN field must be 4 digits (not 6).
 *
 * Coverage:
 *   - lockout blocks unlock attempts (submit-time re-check → no unlockWallet call)
 *   - failure → recordFailure() → locked state shown (countdown) + further attempts blocked
 *   - success → recordSuccess() resets the counter before onunlock()
 *   - 4-digit maxlength on the PIN input
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte/svelte5';
import UnlockPrompt from '../UnlockPrompt.svelte';
import { InvalidPinError } from '$lib/wallet/errors';
import type { LockoutStatus } from '$lib/wallet/lockout';

// ─── Mocks (hoisted so vi.mock can reference them) ───────────

const mocks = vi.hoisted(() => ({
	unlockWallet: vi.fn(),
	getLockoutStatus: vi.fn(),
	recordFailure: vi.fn(),
	recordSuccess: vi.fn()
}));

vi.mock('$lib/wallet/state', () => ({
	unlockWallet: mocks.unlockWallet
}));

vi.mock('$lib/wallet/lockout', () => ({
	getLockoutStatus: mocks.getLockoutStatus,
	recordFailure: mocks.recordFailure,
	recordSuccess: mocks.recordSuccess
}));

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	},
	locale: {
		subscribe(fn: (val: string) => void) {
			fn('en');
			return () => {};
		},
		set() {}
	},
	init() {},
	register() {},
	getLocaleFromNavigator() {
		return 'en';
	}
}));

// ─── Helpers ────────────────────────────────────────────────

function makeStatus(overrides: Partial<LockoutStatus> = {}): LockoutStatus {
	return {
		attempts: 0,
		maxAttempts: 10,
		locked: false,
		lockUntil: 0,
		remainingMs: 0,
		level: 'none',
		...overrides
	};
}

/** A soft-locked status (5 minutes remaining). */
function softLocked(): LockoutStatus {
	return makeStatus({
		attempts: 5,
		locked: true,
		level: 'soft',
		lockUntil: Date.now() + 5 * 60 * 1000,
		remainingMs: 5 * 60 * 1000
	});
}

function pinInput(): HTMLInputElement {
	return document.querySelector('input[type="password"]') as HTMLInputElement;
}

function confirmButton(): HTMLButtonElement {
	return screen.getByRole('button', { name: 'common.confirm' }) as HTMLButtonElement;
}

async function renderAndType(pin: string) {
	const onunlock = vi.fn();
	const oncancel = vi.fn();
	const utils = render(UnlockPrompt, { open: true, onunlock, oncancel });
	// Wait for the initial lockout refresh ($effect → getLockoutStatus).
	await waitFor(() => expect(mocks.getLockoutStatus).toHaveBeenCalled());
	const input = pinInput();
	await fireEvent.input(input, { target: { value: pin } });
	return { onunlock, oncancel, ...utils };
}

// ─── Tests ──────────────────────────────────────────────────

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	mocks.getLockoutStatus.mockResolvedValue(makeStatus());
	mocks.recordFailure.mockResolvedValue(makeStatus());
	mocks.recordSuccess.mockResolvedValue(undefined);
	mocks.unlockWallet.mockResolvedValue({} as never);
});

afterEach(() => {
	cleanup();
});

describe('UnlockPrompt (TASK-216 — lockout wiring)', () => {
	it('renders the PIN input with 4-digit maxlength (F-027-008)', async () => {
		render(UnlockPrompt, { open: true, onunlock: vi.fn(), oncancel: vi.fn() });
		await waitFor(() => expect(mocks.getLockoutStatus).toHaveBeenCalled());
		expect(pinInput().getAttribute('maxlength')).toBe('4');
	});

	it('blocks the submit (no unlockWallet) when lockout is active', async () => {
		// Mount: not locked. Submit-time: locked (rate-limited).
		mocks.getLockoutStatus
			.mockResolvedValueOnce(makeStatus())
			.mockResolvedValue(softLocked());

		await renderAndType('1234');

		await fireEvent.click(confirmButton());
		await waitFor(() => expect(screen.getByText('unlock.locked_soft')).toBeTruthy());

		// unlockWallet must never be reached while locked.
		expect(mocks.unlockWallet).not.toHaveBeenCalled();
		// Confirm is now disabled.
		expect(confirmButton().disabled).toBe(true);
	});

	it('locks after repeated failures and blocks re-auth (soft lockout)', async () => {
		// Faithful in-memory lockout fake: getLockoutStatus and recordFailure
		// share the same counter so the persisted lock is visible on the next read.
		let count = 0;
		let lockUntil = 0;
		const status = (): LockoutStatus => {
			const locked = lockUntil > Date.now();
			return {
				attempts: count,
				maxAttempts: 10,
				locked,
				lockUntil,
				remainingMs: locked ? lockUntil - Date.now() : 0,
				level: locked ? (count >= 10 ? 'hard' : 'soft') : 'none'
			};
		};
		mocks.getLockoutStatus.mockImplementation(async () => status());
		mocks.recordFailure.mockImplementation(async () => {
			count += 1;
			lockUntil =
				count >= 10
					? Date.now() + 60 * 60 * 1000
					: count >= 5
						? Date.now() + 5 * 60 * 1000
						: 0;
			return status();
		});
		mocks.unlockWallet.mockRejectedValue(new InvalidPinError());

		await renderAndType('9999');

		// 4 failures — still unlocked.
		for (let i = 0; i < 4; i++) {
			await fireEvent.click(confirmButton());
			await waitFor(() => expect(mocks.recordFailure).toHaveBeenCalledTimes(i + 1));
		}
		expect(confirmButton().disabled).toBe(false);

		// 5th failure → soft lock.
		await fireEvent.click(confirmButton());
		await waitFor(() => expect(mocks.recordFailure).toHaveBeenCalledTimes(5));
		expect(mocks.unlockWallet).toHaveBeenCalledTimes(5);
		await waitFor(() => expect(screen.getByText('unlock.locked_soft')).toBeTruthy());
		expect(confirmButton().disabled).toBe(true);
		expect(pinInput().disabled).toBe(true);

		// Further attempts are blocked by the submit-time lockout re-check.
		mocks.unlockWallet.mockClear();
		await fireEvent.click(confirmButton());
		expect(mocks.unlockWallet).not.toHaveBeenCalled();
	});

	it('shows hard-lock message for the hard tier', async () => {
		mocks.getLockoutStatus.mockResolvedValue(
			makeStatus({
				attempts: 10,
				locked: true,
				level: 'hard',
				lockUntil: Date.now() + 60 * 60 * 1000,
				remainingMs: 60 * 60 * 1000
			})
		);
		render(UnlockPrompt, { open: true, onunlock: vi.fn(), oncancel: vi.fn() });
		await waitFor(() => expect(screen.getByText('unlock.locked_hard')).toBeTruthy());
	});

	it('records failure but stays unlocked (wrong PIN) when below threshold', async () => {
		mocks.unlockWallet.mockRejectedValue(new InvalidPinError());
		mocks.recordFailure.mockResolvedValue(makeStatus({ attempts: 2 }));

		await renderAndType('0000');
		await fireEvent.click(confirmButton());

		await waitFor(() => expect(mocks.recordFailure).toHaveBeenCalledOnce());
		// Error shown, no lock message, still enabled.
		expect(screen.getByText('screen.register.error_wrong_pin')).toBeTruthy();
		expect(screen.queryByText('unlock.locked_soft')).toBeNull();
		expect(confirmButton().disabled).toBe(false);
	});

	it('resets the counter on success before onunlock()', async () => {
		mocks.unlockWallet.mockResolvedValue({} as never);

		const { onunlock } = await renderAndType('1234');
		await fireEvent.click(confirmButton());

		await waitFor(() => expect(mocks.recordSuccess).toHaveBeenCalledOnce());
		expect(mocks.unlockWallet).toHaveBeenCalledWith('1234');
		expect(onunlock).toHaveBeenCalledOnce();
		// recordSuccess is invoked (order) before onunlock.
		const successOrder = mocks.recordSuccess.mock.invocationCallOrder[0];
		const unlockOrder = onunlock.mock.invocationCallOrder[0];
		expect(successOrder).toBeLessThan(unlockOrder);
	});
});
