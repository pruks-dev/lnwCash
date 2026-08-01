/**
 * Test: icons/Icon.svelte — D-005 Icon Wrapper
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
});
