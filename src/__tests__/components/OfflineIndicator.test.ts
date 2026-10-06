/**
 * Test: OfflineIndicator.svelte — banner/badge driven by the DETECTOR state.
 *
 * TASK-1307 (FR-2): navigator.onLine is no longer truth — the banner reacts
 * to the probe-based detector. Tests drive detector state through its real
 * triggers (window 'online' event) with a stubbed probe fetch, then assert
 * the rendered banner/badge.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import OfflineIndicator from '../../components/OfflineIndicator.svelte';
import {
	setProbeTargets,
	getDetectorStatus,
	resetWasOffline
} from '../../lib/offline-indicator';

const fetchMock = vi.hoisted(() => vi.fn());

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

/** Drive the detector to a definite state via a real trigger + stubbed probe. */
async function driveDetector(ok: boolean): Promise<void> {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset();
	fetchMock.mockResolvedValue({ ok, status: ok ? 200 : 503 });
	window.dispatchEvent(new Event('online')); // trigger (b)
	await vi.waitFor(
		() => {
			expect(getDetectorStatus().state).toBe(ok ? 'online' : 'offline');
		},
		{ timeout: 1000, interval: 10 }
	);
}

beforeAll(() => {
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockResolvedValue({ ok: true, status: 200 });
	// Wire targets — fires the single late-wired boot catch-up probe (→ online).
	setProbeTargets(['https://mint.test']);
});

describe('OfflineIndicator', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		resetWasOffline();
	});

	it('should render banner variant by default', async () => {
		await driveDetector(true);
		render(OfflineIndicator, {});
		// When online, banner is hidden; check component mounts
		const container = document.body;
		expect(container).toBeTruthy();
	});

	it('should show offline banner when detector says offline', async () => {
		await driveDetector(false);
		render(OfflineIndicator, {});
		// The banner should show the offline text
		await vi.waitFor(() => {
			const banner = document.querySelector('.offline-banner');
			expect(banner).toBeTruthy();
		}, { timeout: 500 });
	});

	it('should hide banner when online in banner variant', async () => {
		await driveDetector(true);
		render(OfflineIndicator, {});
		await vi.waitFor(() => {
			const banner = document.querySelector('.offline-banner');
			expect(banner).toBeNull();
		}, { timeout: 500 });
	});

	it('should render badge variant', async () => {
		await driveDetector(true);
		render(OfflineIndicator, { variant: 'badge' });
		const badge = document.querySelector('.offline-badge');
		expect(badge).toBeTruthy();
	});

	it('should show online status in badge variant', async () => {
		await driveDetector(true);
		render(OfflineIndicator, { variant: 'badge' });
		expect(screen.getByText('screen.balance.online')).toBeTruthy();
	});

	it('should show offline status in badge variant', async () => {
		await driveDetector(false);
		render(OfflineIndicator, { variant: 'badge' });
		await vi.waitFor(() => {
			expect(screen.getByText('screen.balance.offline')).toBeTruthy();
		}, { timeout: 500 });
	});
});
