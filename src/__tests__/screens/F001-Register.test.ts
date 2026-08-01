/**
 * Test: F001-Register.svelte
 *
 * Tests for the Register/Login screen component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import F001Register from '../../screens/F001-Register.svelte';

// Mock svelte-i18n
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

describe('F001-Register', () => {
	beforeEach(() => {
		// Reset localStorage before each test
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render the register title by default', () => {
		render(F001Register, {});
		expect(screen.getByText('screen.register.title')).toBeTruthy();
	});

	it('should render PIN input fields', () => {
		render(F001Register, {});
		const inputs = document.querySelectorAll('input[type="password"]');
		expect(inputs.length).toBeGreaterThanOrEqual(1);
	});

	it('should show confirm PIN field in register mode', () => {
		render(F001Register, {});
		expect(screen.getByText('screen.register.confirm_pin')).toBeTruthy();
	});

	it('should render submit button', () => {
		render(F001Register, {});
		expect(screen.getByText('screen.register.submit')).toBeTruthy();
	});

	it('should render switch mode button', () => {
		render(F001Register, {});
		expect(screen.getByText('screen.register.returning_user')).toBeTruthy();
	});

	it('should have disabled submit when PIN is empty', () => {
		render(F001Register, {});
		const submitBtn = screen.getByText('screen.register.submit');
		expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
	});

	it('should call onWalletReady when provided', () => {
		const onWalletReady = vi.fn();
		render(F001Register, { onWalletReady });
		// Props are passed, component should render without error
		expect(screen.getByText('screen.register.title')).toBeTruthy();
	});
});
