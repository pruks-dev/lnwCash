/**
 * Test: icons/Wallet.svelte — D-005
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Wallet from '../../../lib/components/icons/Wallet.svelte';

describe('Wallet Icon', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render SVG element', () => {
		const { container } = render(Wallet, {});
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});

	it('should render at default 24x24 size', () => {
		const { container } = render(Wallet, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('height')).toBe('24');
	});

	it('should render with custom size', () => {
		const { container } = render(Wallet, { size: 32 });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('32');
		expect(svg?.getAttribute('height')).toBe('32');
	});

	it('should use currentColor for stroke', () => {
		const { container } = render(Wallet, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('currentColor');
	});

	it('should have aria-hidden attribute', () => {
		const { container } = render(Wallet, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('should have role img', () => {
		const { container } = render(Wallet, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('role')).toBe('img');
	});

	it('should have viewBox', () => {
		const { container } = render(Wallet, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
	});

	it('should apply additional class', () => {
		const { container } = render(Wallet, { class: 'text-primary' });
		const svg = container.querySelector('svg');
		expect(svg?.classList.contains('text-primary')).toBe(true);
	});
});
