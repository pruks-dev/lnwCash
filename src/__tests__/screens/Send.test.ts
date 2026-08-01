/**
 * Test: Send.svelte — TASK-051 Send screen
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Send from '../../screens/Send.svelte';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: { subscribe(fn: (val: string) => void) { fn('en'); return () => {}; }, set() {} },
		init() {}, register() {},
		getLocaleFromNavigator() { return 'en'; }
	};
});

describe('Send (TASK-051)', () => {
	beforeEach(() => { localStorage.clear(); });
	afterEach(() => { cleanup(); });

	it('should render send title', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.title')).toBeTruthy();
	});

	it('should show invoice input label', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.invoice_label')).toBeTruthy();
	});

	it('should show amount input label', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.amount_label')).toBeTruthy();
	});

	it('should show pay button', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.pay_button')).toBeTruthy();
	});

	it('should show paste invoice button', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.paste_invoice')).toBeTruthy();
	});

	it('should show scan qr button', () => {
		render(Send, {});
		expect(screen.getByText('screen.send.scan_qr')).toBeTruthy();
	});

	it('should render with QR scan callback', () => {
		const onQRScan = vi.fn();
		render(Send, { onQRScan });
		expect(screen.getByText('screen.send.title')).toBeTruthy();
	});
});
