/**
 * Test: icons/Icon.svelte — D-005 Icon Wrapper
 * Extended for TASK-157 (Lightning, Banknote, Warning)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Icon from '../../../lib/components/icons/Icon.svelte';

describe('Icon Wrapper', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render SVG for Wallet icon', () => {
		const { container } = render(Icon, { name: 'Wallet' });
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});

	it('should render SVG for Send icon', () => {
		const { container } = render(Icon, { name: 'Send' });
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});

	it('should render SVG for Receive icon', () => {
		const { container } = render(Icon, { name: 'Receive' });
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});

	it('should render at custom size', () => {
		const { container } = render(Icon, { name: 'Check', size: 28 });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('28');
	});

	it('should render all known icon names', () => {
		const names = ['Wallet', 'Receive', 'Send', 'Swap', 'History', 'Settings',
			'Scan', 'Mint', 'Check', 'Copy', 'Close',
			'ArrowLeft', 'ArrowRight', 'Plus', 'Minus'] as const;

		for (const name of names) {
			const { container } = render(Icon, { name });
			expect(container.querySelector('svg')).toBeTruthy();
			cleanup();
		}
	});

	it('should pass class to icon', () => {
		const { container } = render(Icon, { name: 'Close', class: 'text-red' });
		const svg = container.querySelector('svg');
		expect(svg?.classList.contains('text-red')).toBe(true);
	});

	// ── TASK-157: 3 new icons registered in IconName + iconMap ──

	it('should render Lightning icon (TASK-157)', () => {
		const { container } = render(Icon, { name: 'Lightning' });
		// Robust presence + viewBox assertions (v23): geometry-agnostic
		expect(container.querySelector('svg')).toBeTruthy();
		expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
	});

	it('should render Banknote icon (TASK-157)', () => {
		const { container } = render(Icon, { name: 'Banknote' });
		// Robust presence assertion (v23): geometry-agnostic
		expect(container.querySelector('svg')).toBeTruthy();
		expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
		expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
	});

	it('should render Warning icon (TASK-157)', () => {
		const { container } = render(Icon, { name: 'Warning' });
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
		const paths = container.querySelectorAll('path');
		expect(paths.length).toBeGreaterThanOrEqual(1);
	});

	it('should pass size to Lightning (TASK-157)', () => {
		const { container } = render(Icon, { name: 'Lightning', size: 36 });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('36');
	});

	it('should pass color to Warning (TASK-157)', () => {
		const { container } = render(Icon, { name: 'Warning', color: '#f7931a' });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('#f7931a');
	});
});
