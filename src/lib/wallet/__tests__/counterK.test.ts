/**
 * counter_k tracking tests (NUT-13 per-keyset counters).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
	getCounterK,
	setCounterK,
	incrementCounterK,
	resetCounterK,
	getAllCounters,
	clearAllCounters,
	STORAGE_KEY
} from '../counterK';

const KS_A = '01' + 'aa'.repeat(32);
const KS_B = '01' + 'bb'.repeat(32);

describe('counter_k tracking (NUT-13)', () => {
	beforeEach(() => {
		localStorage.removeItem(STORAGE_KEY);
	});

	it('should default to 0 for unseen keysets', () => {
		expect(getCounterK(KS_A)).toBe(0);
		expect(getCounterK(KS_B)).toBe(0);
	});

	it('should set and read an explicit counter', () => {
		setCounterK(KS_A, 42);
		expect(getCounterK(KS_A)).toBe(42);
	});

	it('should increment a counter and return the new value', () => {
		expect(incrementCounterK(KS_A)).toBe(1);
		expect(incrementCounterK(KS_A)).toBe(2);
		expect(incrementCounterK(KS_A, 8)).toBe(10);
		expect(getCounterK(KS_A)).toBe(10);
	});

	it('should track counters independently per keyset', () => {
		incrementCounterK(KS_A, 3);
		incrementCounterK(KS_B, 7);
		expect(getCounterK(KS_A)).toBe(3);
		expect(getCounterK(KS_B)).toBe(7);
	});

	it('should clamp negative values to 0', () => {
		setCounterK(KS_A, -5);
		expect(getCounterK(KS_A)).toBe(0);
	});

	it('should floor non-integer values', () => {
		setCounterK(KS_A, 3.7);
		expect(getCounterK(KS_A)).toBe(3);
	});

	it('should reset a single keyset counter', () => {
		setCounterK(KS_A, 9);
		setCounterK(KS_B, 5);
		resetCounterK(KS_A);
		expect(getCounterK(KS_A)).toBe(0);
		expect(getCounterK(KS_B)).toBe(5);
	});

	it('should return all counters via getAllCounters', () => {
		setCounterK(KS_A, 1);
		setCounterK(KS_B, 2);
		const all = getAllCounters();
		expect(all[KS_A]).toBe(1);
		expect(all[KS_B]).toBe(2);
	});

	it('should persist counters across calls (same localStorage key)', () => {
		incrementCounterK(KS_A, 5);
		// new read (no module cache) still sees the value
		expect(getCounterK(KS_A)).toBe(5);
		const raw = localStorage.getItem(STORAGE_KEY);
		expect(raw).toBeTruthy();
		expect(JSON.parse(raw as string)[KS_A]).toBe(5);
	});

	it('clearAllCounters should wipe everything', () => {
		setCounterK(KS_A, 10);
		setCounterK(KS_B, 20);
		clearAllCounters();
		expect(getAllCounters()).toEqual({});
		expect(getCounterK(KS_A)).toBe(0);
	});

	it('should survive malformed stored JSON', () => {
		localStorage.setItem(STORAGE_KEY, 'not-json{');
		expect(getCounterK(KS_A)).toBe(0);
	});
});
