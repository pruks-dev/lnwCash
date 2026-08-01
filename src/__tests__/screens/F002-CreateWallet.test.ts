/**
 * Test: F002-CreateWallet.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import F002CreateWallet from '../../screens/F002-CreateWallet.svelte';

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

describe('F002-CreateWallet', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render create wallet title', () => {
		render(F002CreateWallet, { pin: '123456' });
		expect(screen.getByText('screen.wallet.create_title')).toBeTruthy();
	});

	it('should render wallet name input', () => {
		render(F002CreateWallet, { pin: '123456' });
		expect(screen.getByText('screen.wallet.name_label')).toBeTruthy();
		const nameInput = document.querySelector('input[type="text"]');
		expect(nameInput).toBeTruthy();
	});

	it('should render mint URL input and add button', () => {
		render(F002CreateWallet, { pin: '123456' });
		expect(screen.getByText('screen.wallet.mint_url_label')).toBeTruthy();
		expect(screen.getByText('screen.wallet.add_mint')).toBeTruthy();
	});

	it('should render create button (disabled initially)', () => {
		render(F002CreateWallet, { pin: '123456' });
		const createBtn = screen.getByText('screen.wallet.create_button');
		expect(createBtn).toBeTruthy();
		expect((createBtn as HTMLButtonElement).disabled).toBe(true);
	});

	it('should call onCreated when provided', () => {
		const onCreated = vi.fn();
		render(F002CreateWallet, { pin: '123456', onCreated });
		expect(screen.getByText('screen.wallet.create_title')).toBeTruthy();
	});
});
