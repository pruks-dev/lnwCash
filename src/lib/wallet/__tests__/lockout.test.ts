/**
 * Lockout rate-limiting tests — TASK-209 (D5).
 *
 * Verifies:
 *   - 5 failures → 5-minute lock (soft)
 *   - 10 failures → 1-hour lock (hard)
 *   - attempt counter is AES-GCM encrypted (NOT plaintext localStorage)
 *   - success resets the counter
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	SOFT_LOCK_THRESHOLD,
	HARD_LOCK_THRESHOLD,
	SOFT_LOCK_DURATION_MS,
	HARD_LOCK_DURATION_MS,
	MAX_ATTEMPTS,
	computeLockoutLevel,
	computeLockUntil,
	nextLockoutAfterFailure,
	toStatus,
	getLockoutStatus,
	recordFailure,
	recordSuccess,
	resetLockout
} from '../lockout';

const NOW = 1_700_000_000_000; // fixed epoch ms for deterministic tests
const COUNTER_STORAGE_KEY = 'lnwcash_lockout_counter';

describe('lockout pure logic', () => {
	it('computes lock tier from failure count', () => {
		expect(computeLockoutLevel(0)).toBe('none');
		expect(computeLockoutLevel(4)).toBe('none');
		expect(computeLockoutLevel(SOFT_LOCK_THRESHOLD)).toBe('soft');
		expect(computeLockoutLevel(9)).toBe('soft');
		expect(computeLockoutLevel(HARD_LOCK_THRESHOLD)).toBe('hard');
		expect(computeLockoutLevel(99)).toBe('hard');
	});

	it('5 failures → lock 5 minutes (OWASP)', () => {
		let state = { count: 0, lockUntil: 0 };
		for (let i = 0; i < SOFT_LOCK_THRESHOLD; i++) {
			state = nextLockoutAfterFailure(state, NOW);
		}
		expect(state.count).toBe(SOFT_LOCK_THRESHOLD);
		expect(state.lockUntil).toBe(NOW + SOFT_LOCK_DURATION_MS);
		expect(computeLockUntil(SOFT_LOCK_THRESHOLD, NOW)).toBe(NOW + SOFT_LOCK_DURATION_MS);
	});

	it('10 failures → lock 1 hour (OWASP)', () => {
		let state = { count: 0, lockUntil: 0 };
		for (let i = 0; i < HARD_LOCK_THRESHOLD; i++) {
			state = nextLockoutAfterFailure(state, NOW);
		}
		expect(state.count).toBe(HARD_LOCK_THRESHOLD);
		expect(state.lockUntil).toBe(NOW + HARD_LOCK_DURATION_MS);
		expect(computeLockUntil(HARD_LOCK_THRESHOLD, NOW)).toBe(NOW + HARD_LOCK_DURATION_MS);
	});

	it('fewer than 5 failures → no lock', () => {
		expect(computeLockUntil(4, NOW)).toBe(0);
		const status = toStatus({ count: 4, lockUntil: 0 }, NOW);
		expect(status.locked).toBe(false);
		expect(status.remainingMs).toBe(0);
	});
});

describe('lockout persistence (encrypted counter)', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it('records failures and reports lock status with remaining time', async () => {
		let status = await recordFailure(NOW);
		for (let i = 1; i < SOFT_LOCK_THRESHOLD; i++) {
			status = await recordFailure(NOW);
		}
		expect(status.locked).toBe(true);
		expect(status.level).toBe('soft');
		expect(status.remainingMs).toBe(SOFT_LOCK_DURATION_MS);
		expect(status.attempts).toBe(SOFT_LOCK_THRESHOLD);

		// Check persisted status reads back the same lock
		const read = await getLockoutStatus(NOW);
		expect(read.locked).toBe(true);
		expect(read.lockUntil).toBe(NOW + SOFT_LOCK_DURATION_MS);
	});

	it('escalates to 1-hour lock at 10 failures', async () => {
		let status = await recordFailure(NOW);
		for (let i = 1; i < HARD_LOCK_THRESHOLD; i++) {
			status = await recordFailure(NOW);
		}
		expect(status.locked).toBe(true);
		expect(status.level).toBe('hard');
		expect(status.lockUntil).toBe(NOW + HARD_LOCK_DURATION_MS);
		expect(status.remainingMs).toBe(HARD_LOCK_DURATION_MS);
	});

	it('lock expires after its duration', async () => {
		for (let i = 0; i < SOFT_LOCK_THRESHOLD; i++) {
			await recordFailure(NOW);
		}
		const duringLock = await getLockoutStatus(NOW);
		expect(duringLock.locked).toBe(true);

		const afterExpiry = await getLockoutStatus(NOW + SOFT_LOCK_DURATION_MS + 1);
		expect(afterExpiry.locked).toBe(false);
		expect(afterExpiry.remainingMs).toBe(0);
	});

	it('recordSuccess resets the counter', async () => {
		for (let i = 0; i < HARD_LOCK_THRESHOLD; i++) {
			await recordFailure(NOW);
		}
		await recordSuccess();
		const status = await getLockoutStatus(NOW);
		expect(status.attempts).toBe(0);
		expect(status.locked).toBe(false);
		expect(status.level).toBe('none');
	});

	it('resetLockout behaves like recordSuccess', async () => {
		for (let i = 0; i < SOFT_LOCK_THRESHOLD; i++) {
			await recordFailure(NOW);
		}
		await resetLockout();
		const status = await getLockoutStatus(NOW);
		expect(status.attempts).toBe(0);
		expect(status.locked).toBe(false);
	});

	it('CRITICAL: attempt counter is AES-GCM encrypted, NOT plaintext', async () => {
		for (let i = 0; i < 3; i++) {
			await recordFailure(NOW);
		}

		const raw = localStorage.getItem(COUNTER_STORAGE_KEY);
		expect(raw).toBeTruthy();

		// Must be an EncryptedKey shape (salt + iv + data)
		const parsed = JSON.parse(raw!) as Record<string, unknown>;
		expect(typeof parsed.salt).toBe('string');
		expect(typeof parsed.iv).toBe('string');
		expect(typeof parsed.data).toBe('string');
		expect(typeof parsed.iterations).toBe('number');

		// Must NOT leak the plaintext counter or its field names
		expect(raw).not.toContain('"count"');
		expect(raw).not.toContain('"lockUntil"');
		expect(raw).not.toContain('"3"'); // the plaintext failure count is 3
		// Ciphertext is base64url
		expect(parsed.data as string).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});
