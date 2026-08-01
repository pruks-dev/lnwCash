/**
 * Test: F009-LanguageSwitch.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import F009LanguageSwitch from '../../screens/F009-LanguageSwitch.svelte';

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

describe('F009-LanguageSwitch', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render language switch title', () => {
		render(F009LanguageSwitch, {});
		expect(screen.getByText('screen.language.title')).toBeTruthy();
	});

	it('should render Thai and English buttons', () => {
		render(F009LanguageSwitch, {});
		expect(screen.getByText('screen.language.th')).toBeTruthy();
		expect(screen.getByText('screen.language.en')).toBeTruthy();
	});

	it('should call onLanguageChanged when language selected', async () => {
		const onLanguageChanged = vi.fn();
		render(F009LanguageSwitch, { onLanguageChanged });
		const enBtn = screen.getByText('screen.language.en');
		enBtn.click();
		expect(onLanguageChanged).toHaveBeenCalledWith('en');
	});

	it('should switch language to th', async () => {
		const onLanguageChanged = vi.fn();
		render(F009LanguageSwitch, { onLanguageChanged });
		const thBtn = screen.getByText('screen.language.th');
		thBtn.click();
		expect(onLanguageChanged).toHaveBeenCalledWith('th');
	});
});
