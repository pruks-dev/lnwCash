/**
 * Test: Receive.svelte — TASK-051 Receive screen
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Receive from '../../screens/Receive.svelte';

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

describe('Receive (TASK-051)', () => {
	beforeEach(() => { localStorage.clear(); });
	afterEach(() => { cleanup(); });

	it('should render receive title', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});

	it('should show lightning invoice section', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.lightning_invoice')).toBeTruthy();
	});

	it('should show amount input label', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.amount')).toBeTruthy();
	});

	it('should show mint button', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.mint_button')).toBeTruthy();
	});

	it('should show scan qr button', () => {
		render(Receive, {});
		expect(screen.getByText('screen.receive.scan_qr')).toBeTruthy();
	});

	it('should render with QR scan callback', () => {
		const onQRScan = vi.fn();
		render(Receive, { onQRScan });
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});

	it('should render with default mint url', () => {
		render(Receive, { defaultMintUrl: 'https://test.mint' });
		expect(screen.getByText('screen.receive.title')).toBeTruthy();
	});
});
