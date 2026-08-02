/**
 * Test: TASK-061 — Iconly 3.0 Integration
 * Tests for all 16 icon components + FAB Scan integration
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Icon from '../../../lib/components/icons/Icon.svelte';
import ArrowLeft from '../../../lib/components/icons/ArrowLeft.svelte';
import ArrowRight from '../../../lib/components/icons/ArrowRight.svelte';
import Check from '../../../lib/components/icons/Check.svelte';
import Close from '../../../lib/components/icons/Close.svelte';
import Copy from '../../../lib/components/icons/Copy.svelte';
import History from '../../../lib/components/icons/History.svelte';
import Mint from '../../../lib/components/icons/Mint.svelte';
import Minus from '../../../lib/components/icons/Minus.svelte';
import Plus from '../../../lib/components/icons/Plus.svelte';
import Receive from '../../../lib/components/icons/Receive.svelte';
import Scan from '../../../lib/components/icons/Scan.svelte';
import Send from '../../../lib/components/icons/Send.svelte';
import Settings from '../../../lib/components/icons/Settings.svelte';
import Swap from '../../../lib/components/icons/Swap.svelte';
import Wallet from '../../../lib/components/icons/Wallet.svelte';

const allIcons = {
	ArrowLeft, ArrowRight, Check, Close, Copy, History, Mint,
	Minus, Plus, Receive, Scan, Send, Settings, Swap, Wallet
} as const;

const iconNames = Object.keys(allIcons) as Array<keyof typeof allIcons>;

describe('TASK-061 — Iconly 3.0 Integration', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render all 15 icon components with SVG element', () => {
		for (const name of iconNames) {
			const Component = allIcons[name];
			const { container } = render(Component, {});
			const svg = container.querySelector('svg');
			expect(svg, `${name}: SVG element should exist`).toBeTruthy();
			expect(svg?.getAttribute('viewBox'), `${name}: viewBox`).toBe('0 0 24 24');
			expect(svg?.getAttribute('stroke'), `${name}: stroke=currentColor`).toBe('currentColor');
			expect(svg?.getAttribute('stroke-width'), `${name}: stroke-width=2`).toBe('2');
			expect(svg?.getAttribute('aria-hidden'), `${name}: aria-hidden`).toBe('true');
			expect(svg?.getAttribute('role'), `${name}: role=img`).toBe('img');
			cleanup();
		}
	});

	it('should render all icons through Icon wrapper', () => {
		const names = iconNames;
		for (const name of names) {
			const { container } = render(Icon, { name });
			expect(container.querySelector('svg'), `Icon ${name}`).toBeTruthy();
			cleanup();
		}
	});

	it('should support size prop at 16, 20, 24, 28, 32', () => {
		const sizes = [16, 20, 24, 28, 32];
		for (const s of sizes) {
			const { container } = render(Wallet, { size: s });
			const svg = container.querySelector('svg');
			expect(svg?.getAttribute('width'), `size=${s} width`).toBe(String(s));
			expect(svg?.getAttribute('height'), `size=${s} height`).toBe(String(s));
			cleanup();
		}
	});

	it('should support color prop (currentColor by default, explicit color)', () => {
		// Default: currentColor
		const { container: c1 } = render(Scan, {});
		expect(c1.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
		cleanup();

		// Explicit color
		const { container: c2 } = render(Scan, { color: '#ff0000' });
		expect(c2.querySelector('svg')?.getAttribute('stroke')).toBe('#ff0000');
		cleanup();

		// FAB white
		const { container: c3 } = render(Scan, { size: 28, color: '#ffffff' });
		expect(c3.querySelector('svg')?.getAttribute('stroke')).toBe('#ffffff');
		expect(c3.querySelector('svg')?.getAttribute('width')).toBe('28');
		cleanup();
	});

	it('should render Scan icon at 28px with white color (FAB use case)', () => {
		const { container } = render(Scan, { size: 28, color: '#ffffff' });
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
		expect(svg?.getAttribute('width')).toBe('28');
		expect(svg?.getAttribute('height')).toBe('28');
		expect(svg?.getAttribute('stroke')).toBe('#ffffff');
		// Verify scan paths
		const paths = svg?.querySelectorAll('path');
		expect(paths?.length).toBeGreaterThanOrEqual(4);
	});

	it('should have Iconly Bold style characteristics (stroke-width=2, round caps)', () => {
		// Test representative icons
		const comps = [ArrowLeft, Check, Scan, Wallet, Settings];
		for (const Comp of comps) {
			const { container } = render(Comp, {});
			const svg = container.querySelector('svg');
			expect(svg?.getAttribute('stroke-width'), 'stroke-width=2').toBe('2');
			expect(svg?.getAttribute('stroke-linecap'), 'stroke-linecap=round').toBe('round');
			expect(svg?.getAttribute('stroke-linejoin'), 'stroke-linejoin=round').toBe('round');
			expect(svg?.getAttribute('fill'), 'fill=none').toBe('none');
			cleanup();
		}
	});

	it('should apply additional class prop (backward compatible)', () => {
		const { container } = render(Scan, { class: 'icon-large text-white' });
		const svg = container.querySelector('svg');
		expect(svg?.classList.contains('icon-large')).toBe(true);
		expect(svg?.classList.contains('text-white')).toBe(true);
	});

	it('should render Icon.svelte with color prop pass-through', () => {
		const { container } = render(Icon, { name: 'Wallet', color: '#00ff00' });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('#00ff00');
	});
});
