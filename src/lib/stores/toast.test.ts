/**
 * Test: toast store — TASK Toast Notification
 *
 * Acceptance Criteria:
 * 1. toastMessage เริ่มต้นเป็น ''
 * 2. toastType เริ่มต้นเป็น 'info'
 * 3. showToast ตั้งค่า message และ type ได้
 * 4. showToast clear หลังจาก 4000ms
 * 5. showToast ครั้งต่อไปยกเลิก timer ก่อนหน้า
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { toastMessage, toastType, showToast } from './toast';

describe('toast store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Reset stores to initial state
		toastMessage.set('');
		toastType.set('info');
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts with empty message', () => {
		expect(get(toastMessage)).toBe('');
	});

	it('starts with info type', () => {
		expect(get(toastType)).toBe('info');
	});

	it('sets message and type on showToast', () => {
		showToast('Test message', 'success');
		expect(get(toastMessage)).toBe('Test message');
		expect(get(toastType)).toBe('success');
	});

	it('defaults type to info when not specified', () => {
		showToast('Info message');
		expect(get(toastType)).toBe('info');
		expect(get(toastMessage)).toBe('Info message');
	});

	it('sets error type correctly', () => {
		showToast('Error!', 'error');
		expect(get(toastType)).toBe('error');
	});

	it('clears message after 4000ms', () => {
		showToast('Will clear', 'success');
		expect(get(toastMessage)).toBe('Will clear');

		vi.advanceTimersByTime(3999);
		expect(get(toastMessage)).toBe('Will clear'); // ยังไม่ clear

		vi.advanceTimersByTime(1);
		expect(get(toastMessage)).toBe(''); // clear แล้ว
	});

	it('cancels previous timer on new showToast', () => {
		showToast('First', 'info');
		vi.advanceTimersByTime(2000);

		showToast('Second', 'success');
		expect(get(toastMessage)).toBe('Second');
		expect(get(toastType)).toBe('success');

		// ผ่านไปอีก 3999ms — first timer ถูก cancel แล้ว, second ยังไม่หมด
		vi.advanceTimersByTime(3999);
		expect(get(toastMessage)).toBe('Second');

		// ครบ 4000ms ของ second
		vi.advanceTimersByTime(1);
		expect(get(toastMessage)).toBe('');
	});
});
