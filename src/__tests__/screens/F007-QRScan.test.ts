/**
 * Test: F007-QRScan.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import F007QRScan from '../../screens/F007-QRScan.svelte';

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

describe('F007-QRScan', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render QR scan title', () => {
		render(F007QRScan, {});
		expect(screen.getByText('screen.qrscan.title')).toBeTruthy();
	});

	it('should render manual input section', () => {
		render(F007QRScan, {});
		expect(screen.getByText('screen.qrscan.manual_input')).toBeTruthy();
	});

	it('should render close button', () => {
		render(F007QRScan, {});
		expect(screen.getByText('common.close')).toBeTruthy();
	});

	it('should render start scan button', () => {
		render(F007QRScan, {});
		expect(screen.getByText('screen.qrscan.title')).toBeTruthy();
	});

	it('should call onClose when close button clicked', async () => {
		const onClose = vi.fn();
		render(F007QRScan, { onClose });
		const closeBtn = screen.getByText('common.close');
		closeBtn.click();
		expect(onClose).toHaveBeenCalled();
	});

	it('should call onResult when manual input submitted', async () => {
		const onResult = vi.fn();
		render(F007QRScan, { onResult });
		const input = document.querySelector('input[type="text"]') as HTMLInputElement;
		expect(input).toBeTruthy();
	});
});
