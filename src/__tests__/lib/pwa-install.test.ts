/**
 * Test: pwa-install.ts — PWA install prompt manager
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isStandalone,
	isInstallDismissed,
	dismissInstall,
	resetInstallDismissed,
	initPwaInstall,
	onCanInstallChange,
	triggerInstall,
	canInstallNow,
} from '../../lib/pwa-install';

describe('pwa-install', () => {
	beforeEach(() => {
		localStorage.clear();
		resetInstallDismissed();
		// Mock matchMedia for jsdom
		if (!window.matchMedia) {
			Object.defineProperty(window, 'matchMedia', {
				value: vi.fn().mockImplementation((query: string) => ({
					matches: false,
					media: query,
					onchange: null,
					addListener: vi.fn(),
					removeListener: vi.fn(),
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					dispatchEvent: vi.fn(),
				})),
				writable: true,
				configurable: true,
			});
		}
	});

	describe('isStandalone', () => {
		it('should return false for normal browser', () => {
			// Default test environment — not standalone
			expect(isStandalone()).toBe(false);
		});
	});

	describe('install dismissed state', () => {
		it('should return false by default', () => {
			expect(isInstallDismissed()).toBe(false);
		});

		it('should persist dismissed state', () => {
			dismissInstall();
			expect(isInstallDismissed()).toBe(true);
		});

		it('should reset dismissed state', () => {
			dismissInstall();
			expect(isInstallDismissed()).toBe(true);
			resetInstallDismissed();
			expect(isInstallDismissed()).toBe(false);
		});
	});

	describe('onCanInstallChange', () => {
		it('should call callback immediately with current state', () => {
			const callback = vi.fn();
			const cleanup = onCanInstallChange(callback);
			expect(callback).toHaveBeenCalledWith(false); // Initially not installable
			cleanup();
		});

		it('should return unsubscribe function', () => {
			const callback = vi.fn();
			const unsubscribe = onCanInstallChange(callback);
			expect(typeof unsubscribe).toBe('function');
			unsubscribe();
		});
	});

	describe('initPwaInstall', () => {
		it('should return a cleanup function', () => {
			const cleanup = initPwaInstall();
			expect(typeof cleanup).toBe('function');
			cleanup();
		});

		it('should not be installable initially', () => {
			expect(canInstallNow()).toBe(false);
		});
	});

	describe('triggerInstall', () => {
		it('should return false when no prompt available', async () => {
			// No beforeinstallprompt event has been fired
			const result = await triggerInstall();
			expect(result).toBe(false);
		});
	});
});
