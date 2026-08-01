/**
 * Test: F004-Receive.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import F004Receive from '../../screens/F004-Receive.svelte';

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

describe('F004-Receive', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render receive title', () => {
		render(F004Receive, {});
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});

	it('should render invoice input', () => {
		render(F004Receive, {});
		expect(screen.getByText('screen.receive.enter_invoice')).toBeTruthy();
	});

	it('should render scan QR button', () => {
		render(F004Receive, {});
		expect(screen.getByText('screen.receive.scan_qr')).toBeTruthy();
	});

	it('should render mint button', () => {
		render(F004Receive, {});
		expect(screen.getByText('screen.receive.mint_button')).toBeTruthy();
	});

	it('should render amount input', () => {
		render(F004Receive, {});
		const amountInputs = document.querySelectorAll('input[type="number"]');
		expect(amountInputs.length).toBeGreaterThanOrEqual(1);
	});

	it('should call onQRScan when scan button clicked', async () => {
		const onQRScan = vi.fn();
		render(F004Receive, { onQRScan });
		const scanBtn = screen.getByText('screen.receive.scan_qr');
		scanBtn.click();
		expect(onQRScan).toHaveBeenCalled();
	});
});
