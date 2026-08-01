/**
 * Test: F006-Transfer.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import F006Transfer from '../../screens/F006-Transfer.svelte';

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

describe('F006-Transfer', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render transfer title', () => {
		render(F006Transfer, {});
		expect(screen.getByText('screen.transfer.title')).toBeTruthy();
	});

	it('should render send and receive tabs', () => {
		render(F006Transfer, {});
		expect(screen.getByText('screen.transfer.tab_send')).toBeTruthy();
		expect(screen.getByText('screen.transfer.tab_receive')).toBeTruthy();
	});

	it('should show send amount input by default (send tab)', () => {
		render(F006Transfer, {});
		expect(screen.getByText('screen.transfer.send_amount')).toBeTruthy();
	});

	it('should show send button by default', () => {
		render(F006Transfer, {});
		expect(screen.getByText('screen.transfer.send_button')).toBeTruthy();
	});

	it('should switch to receive tab when clicked', async () => {
		render(F006Transfer, {});
		const receiveTab = screen.getByText('screen.transfer.tab_receive');
		await fireEvent.click(receiveTab);
		expect(screen.getByText('screen.transfer.paste_token')).toBeTruthy();
		expect(screen.getByText('screen.transfer.receive_button')).toBeTruthy();
	});

	it('should accept defaultMintUrl prop', () => {
		render(F006Transfer, { defaultMintUrl: 'https://mint.example.com' });
		expect(screen.getByText('screen.transfer.title')).toBeTruthy();
	});
});
