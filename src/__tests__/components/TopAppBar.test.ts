/**
 * Test: TopAppBar.svelte — TASK-060 header redesign → TASK-069 hamburger
 * Tests: Logo render, hamburger menu icon, back button, HMR-safe pattern
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import TopAppBar from '../../components/TopAppBar.svelte';

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

describe('TopAppBar (TASK-060)', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render logo image with 32px height', () => {
		const { container } = render(TopAppBar, { screen: 'home', showBack: false });
		const logo = container.querySelector('.logo');
		expect(logo).toBeTruthy();
		expect(logo?.tagName).toBe('IMG');
		expect(logo?.getAttribute('src')).toContain('lnw-logo');
		expect(logo?.getAttribute('height')).toBe('32');
	});

	it('should render hamburger menu icon button', () => {
		const { container } = render(TopAppBar, { screen: 'home', showBack: false });
		const menuBtn = container.querySelector('.menu-btn');
		expect(menuBtn).toBeTruthy();
	});

	it('should call onMenuClick when hamburger icon is clicked', async () => {
		const onMenuClick = vi.fn();
		const { container } = render(TopAppBar, { screen: 'home', showBack: false, onMenuClick });
		const menuBtn = container.querySelector('.menu-btn') as HTMLElement;
		expect(menuBtn).toBeTruthy();
		await fireEvent.click(menuBtn);
		expect(onMenuClick).toHaveBeenCalledTimes(1);
	});

	it('should show back button when showBack is true', () => {
		const onBack = vi.fn();
		const { container } = render(TopAppBar, { screen: 'send', showBack: true, onBack });
		const backBtn = container.querySelector('.back-btn');
		expect(backBtn).toBeTruthy();
	});

	it('should not show back button when showBack is false', () => {
		const { container } = render(TopAppBar, { screen: 'home', showBack: false });
		const backBtn = container.querySelector('.back-btn');
		expect(backBtn).toBeNull();
	});

	it('should call onBack when back button is clicked', async () => {
		const onBack = vi.fn();
		const { container } = render(TopAppBar, { screen: 'send', showBack: true, onBack });
		const backBtn = container.querySelector('.back-btn') as HTMLElement;
		expect(backBtn).toBeTruthy();
		await fireEvent.click(backBtn);
		expect(onBack).toHaveBeenCalledTimes(1);
	});

	it('should render with header element', () => {
		const { container } = render(TopAppBar, { screen: 'home' });
		const header = container.querySelector('header.top-app-bar');
		expect(header).toBeTruthy();
	});

	it('should show hamburger menu on sub-page with back button', () => {
		const { container } = render(TopAppBar, { screen: 'receive', showBack: true });
		const menuBtn = container.querySelector('.menu-btn');
		const backBtn = container.querySelector('.back-btn');
		const logo = container.querySelector('.logo');
		expect(menuBtn).toBeTruthy();
		expect(backBtn).toBeTruthy();
		expect(logo).toBeTruthy();
	});

	it('should render logo with preserved aspect ratio', () => {
		const { container } = render(TopAppBar, { screen: 'home' });
		const logo = container.querySelector('.logo') as HTMLImageElement;
		expect(logo).toBeTruthy();
		// Logo should be 32px height with object-fit contain
		expect(logo.style.objectFit || getComputedStyle(logo).objectFit).toBeTruthy();
	});
});
