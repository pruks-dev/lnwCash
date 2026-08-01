/**
 * Test: F005-Pay.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import F005Pay from '../../screens/F005-Pay.svelte';

vi.mock('svelte-i18n', () => {
	return {
		_: {
			subscribe(fn: (val: (key: string) => string) => void) {
				fn((k: string) => k);
				return () => {};
			}
		},
		locale: {
			subscribe(fn: (val: string) => void) {
				fn('th');
				return () => {};
			},
			set() {}
		},
		init() {},
		register() {},
		getLocaleFromNavigator() {
			return 'th';
		}
	};
});

describe('F005-Pay', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render pay title', () => {
		render(F005Pay, {});
		expect(screen.getByText('screen.pay.title')).toBeTruthy();
	});

	it('should render invoice input', () => {
		render(F005Pay, {});
		expect(screen.getByText('screen.pay.enter_invoice')).toBeTruthy();
	});

	it('should render scan QR button', () => {
		render(F005Pay, {});
		expect(screen.getByText('screen.pay.scan_qr')).toBeTruthy();
	});

	it('should render pay button', () => {
		render(F005Pay, {});
		expect(screen.getByText('screen.pay.pay_button')).toBeTruthy();
	});

	it('should render amount input', () => {
		render(F005Pay, {});
		const amountInputs = document.querySelectorAll('input[type="number"]');
		expect(amountInputs.length).toBeGreaterThanOrEqual(1);
	});

	it('should call onQRScan when scan button clicked', async () => {
		const onQRScan = vi.fn();
		render(F005Pay, { onQRScan });
		const scanBtn = screen.getByText('screen.pay.scan_qr');
		scanBtn.click();
		expect(onQRScan).toHaveBeenCalled();
	});
});
