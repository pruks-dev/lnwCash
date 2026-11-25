/**
 * TASK-5468 rev50 toggle_notify — FRESH suite (no import from any prior test).
 * Scope: Settings toggle notifies App INSTANTLY — no route change.
 *
 * Contract under test (INTENT-054 BLUEPRINT-054 v4 rev50):
 *  1. setPosEnabled(true/false) writes own key AND pushes posEnabledStore
 *     AND dispatches window CustomEvent lnwcash:pos-toggle in the SAME tick.
 *  2. An App-style subscriber (store.subscribe + window event listener)
 *     flips its local showPos synchronously — proof that BottomNav can
 *     change without any navigation / route change / hash change.
 *  3. Settings UI toggle click persists + notifies (ON→OFF→ON sequence).
 *  4. BottomNav: showPos=false → 2 tabs, showPos=true → 3 tabs (PoS last).
 *
 * Toggle transport only — no money/logic asserted here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import Settings from '../../../screens/Settings.svelte';
import BottomNav from '../../BottomNav.svelte';
import {
	getPosEnabled,
	setPosEnabled,
	posEnabledStore,
	POS_TOGGLE_EVENT
} from '$lib/pos-ui';
import { get } from 'svelte/store';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) {
				fn('en');
				return () => {};
			},
			set() {}
		},
		init() {},
		register() {},
		getLocaleFromNavigator() {
			return 'en';
		}
	};
});

vi.mock('$lib/storage/local', () => ({
	getSettings: vi.fn(() => ({ language: 'en', theme: 'light', default_mint: '', pin_shuffle: false })),
	setSettings: vi.fn(),
	getPosCatalog: vi.fn(() => null),
	setPosCatalog: vi.fn(() => true),
	getPosSales: vi.fn(() => []),
	setPosSales: vi.fn(() => true)
}));

vi.mock('$lib/wallet/autolock', () => ({
	getAutolockTimeout: vi.fn(() => 5),
	setAutolockTimeout: vi.fn(),
	startAutoLock: vi.fn(),
	lockNow: vi.fn(),
	AUTOLOCK_OPTIONS: [1, 5, 15, 30, 60, 0]
}));

beforeEach(() => {
	window.localStorage.clear();
	vi.clearAllMocks();
	window.location.hash = '';
	// Reset the reactive flag via the real API (also proves the notify path).
	setPosEnabled(false);
	// Drain the reset event so each test starts with a clean listener slate.
	vi.restoreAllMocks?.();
});

afterEach(() => cleanup());

describe('t5468 rev50 — setPosEnabled notifies synchronously (no route change)', () => {
	it('default OFF: storage empty, store false', () => {
		expect(getPosEnabled()).toBe(false);
		expect(get(posEnabledStore)).toBe(false);
		expect(window.localStorage.getItem('lnwcash_pos_enabled')).toBeNull();
	});

	it('setPosEnabled(true): storage + store flip in the same tick', () => {
		let seenByStore: boolean | null = null;
		const unsub = posEnabledStore.subscribe((v) => {
			seenByStore = v;
		});
		setPosEnabled(true);
		expect(window.localStorage.getItem('lnwcash_pos_enabled')).toBe('1');
		expect(getPosEnabled()).toBe(true);
		expect(get(posEnabledStore)).toBe(true);
		expect(seenByStore).toBe(true);
		unsub();
	});

	it('setPosEnabled dispatches window event with { enabled } synchronously', () => {
		const seen: unknown[] = [];
		const onEvt = (e: Event) => {
			seen.push((e as CustomEvent).detail);
		};
		window.addEventListener(POS_TOGGLE_EVENT, onEvt);
		setPosEnabled(true);
		expect(seen).toEqual([{ enabled: true }]);
		setPosEnabled(false);
		expect(seen).toEqual([{ enabled: true }, { enabled: false }]);
		window.removeEventListener(POS_TOGGLE_EVENT, onEvt);
	});

	it('App-style subscriber flips showPos instantly, hash untouched', () => {
		// Mimics the App.svelte rev50 $effect: store + event → local showPos.
		let showPos = getPosEnabled();
		const unsub = posEnabledStore.subscribe((v: boolean) => {
			showPos = v;
		});
		const onEvt = (e: Event) => {
			const d = (e as CustomEvent).detail as { enabled?: unknown };
			showPos = d.enabled === true;
		};
		window.addEventListener(POS_TOGGLE_EVENT, onEvt);
		const hashBefore = window.location.hash;

		setPosEnabled(true);
		expect(showPos).toBe(true);
		expect(window.location.hash).toBe(hashBefore);

		setPosEnabled(false);
		expect(showPos).toBe(false);
		expect(window.location.hash).toBe(hashBefore);

		window.removeEventListener(POS_TOGGLE_EVENT, onEvt);
		unsub();
	});

	it('ON→OFF→ON sequence stays consistent across storage/store/event', () => {
		const events: boolean[] = [];
		const onEvt = (e: Event) => {
			events.push(((e as CustomEvent).detail as { enabled: boolean }).enabled);
		};
		window.addEventListener(POS_TOGGLE_EVENT, onEvt);
		setPosEnabled(true);
		setPosEnabled(false);
		setPosEnabled(true);
		expect(getPosEnabled()).toBe(true);
		expect(get(posEnabledStore)).toBe(true);
		expect(events).toEqual([true, false, true]);
		window.removeEventListener(POS_TOGGLE_EVENT, onEvt);
	});
});

describe('t5468 rev50 — Settings toggle click notifies (fresh UI)', () => {
	it('click ON: persists + store true + event true, no navigation', async () => {
		const events: boolean[] = [];
		const onEvt = (e: Event) => {
			events.push(((e as CustomEvent).detail as { enabled: boolean }).enabled);
		};
		window.addEventListener(POS_TOGGLE_EVENT, onEvt);
		const hashBefore = window.location.hash;

		render(Settings, {});
		const toggle = screen.getByRole('switch', { name: 'pos.settings.enable' }) as HTMLInputElement;
		expect(toggle.checked).toBe(false);
		await fireEvent.click(toggle);

		expect(window.localStorage.getItem('lnwcash_pos_enabled')).toBe('1');
		expect(getPosEnabled()).toBe(true);
		expect(get(posEnabledStore)).toBe(true);
		expect(events).toContain(true);
		expect(window.location.hash).toBe(hashBefore);
		window.removeEventListener(POS_TOGGLE_EVENT, onEvt);
	});

	it('click ON then OFF: store follows, event pair [true,false]', async () => {
		const events: boolean[] = [];
		const onEvt = (e: Event) => {
			events.push(((e as CustomEvent).detail as { enabled: boolean }).enabled);
		};
		window.addEventListener(POS_TOGGLE_EVENT, onEvt);

		render(Settings, {});
		const toggle = screen.getByRole('switch', { name: 'pos.settings.enable' }) as HTMLInputElement;
		await fireEvent.click(toggle);
		expect(get(posEnabledStore)).toBe(true);
		await fireEvent.click(toggle);
		expect(getPosEnabled()).toBe(false);
		expect(get(posEnabledStore)).toBe(false);
		expect(events).toEqual([true, false]);
		window.removeEventListener(POS_TOGGLE_EVENT, onEvt);
	});
});

describe('t5468 rev50 — BottomNav reflects the notified flag (2↔3 tabs)', () => {
	it('showPos=false → 2 tabs (Home, History)', () => {
		const { container } = render(BottomNav, {
			props: { active: 'home', onNavigate: vi.fn(), showPos: false }
		});
		const labels = [...container.querySelectorAll('.nav-item-label')].map((e) => e.textContent);
		expect(labels).toHaveLength(2);
		expect(labels[0]).toContain('nav.home');
		expect(labels[1]).toContain('nav.history');
	});

	it('showPos=true → 3 tabs, PoS 3rd/last, Shop svg', () => {
		const onNavigate = vi.fn();
		const { container } = render(BottomNav, {
			props: { active: 'home', onNavigate, showPos: true }
		});
		const labels = [...container.querySelectorAll('.nav-item-label')].map((e) => e.textContent);
		expect(labels).toHaveLength(3);
		expect(labels[2]).toContain('nav.pos');
		const items = container.querySelectorAll('.nav-item');
		expect(items[2].querySelector('svg')).toBeTruthy();
	});

	it('end-to-end slice: store value drives BottomNav prop with no route change', () => {
		// App binds <BottomNav showPos={posEnabled}> where posEnabled mirrors
		// the store. Proof: toggling the store changes what App would pass.
		let appShowPos = false;
		const unsub = posEnabledStore.subscribe((v: boolean) => {
			appShowPos = v;
		});
		const hashBefore = window.location.hash;

		setPosEnabled(true);
		expect(appShowPos).toBe(true);
		const on = render(BottomNav, {
			props: { active: 'home', onNavigate: vi.fn(), showPos: appShowPos }
		});
		expect(on.container.querySelectorAll('.nav-item-label')).toHaveLength(3);
		on.unmount();
		cleanup();

		setPosEnabled(false);
		expect(appShowPos).toBe(false);
		const off = render(BottomNav, {
			props: { active: 'home', onNavigate: vi.fn(), showPos: appShowPos }
		});
		expect(off.container.querySelectorAll('.nav-item-label')).toHaveLength(2);
		expect(window.location.hash).toBe(hashBefore);
		unsub();
	});
});
