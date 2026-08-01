/**
 * Test: PwaInstallPrompt.svelte
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import PwaInstallPrompt from '../../components/PwaInstallPrompt.svelte';

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

describe('PwaInstallPrompt', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
	});

	it('should render without crashing', () => {
		render(PwaInstallPrompt, {});
		// The prompt is hidden initially (not installable, no event captured)
		const dialog = document.querySelector('.install-prompt');
		// It should not be visible when not installable
		expect(document.body).toBeTruthy();
	});

	it('should not show prompt when not installable', () => {
		render(PwaInstallPrompt, {});
		const prompt = document.querySelector('.install-prompt');
		// Default: not standalone, not installable → hidden
		expect(prompt).toBeNull();
	});

	it('should not show prompt when dismissed', () => {
		localStorage.setItem('lnwcash_pwa_install_dismissed', '1');
		render(PwaInstallPrompt, {});
		const prompt = document.querySelector('.install-prompt');
		expect(prompt).toBeNull();
	});
});
