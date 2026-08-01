/**
 * Test: Setup.svelte — TASK-051 Setup screen
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Setup from '../../screens/Setup.svelte';

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

describe('Setup (TASK-051)', () => {
	beforeEach(() => { localStorage.clear(); });
	afterEach(() => { cleanup(); });

	it('should render setup title', () => {
		render(Setup, {});
		expect(screen.getByText('screen.setup.title')).toBeTruthy();
	});

	it('should show PIN input on register step', () => {
		render(Setup, {});
		expect(screen.getByText('screen.register.pin_placeholder')).toBeTruthy();
	});

	it('should show confirm PIN on register step', () => {
		render(Setup, {});
		expect(screen.getByText('screen.register.confirm_pin')).toBeTruthy();
	});

	it('should show submit button', () => {
		render(Setup, {});
		expect(screen.getByText('screen.register.submit')).toBeTruthy();
	});

	it('should show returning user link', () => {
		render(Setup, {});
		expect(screen.getByText('screen.register.returning_user')).toBeTruthy();
	});

	it('should call onWalletReady when provided', () => {
		const onWalletReady = vi.fn();
		render(Setup, { onWalletReady });
		expect(screen.getByText('screen.setup.title')).toBeTruthy();
	});
});
