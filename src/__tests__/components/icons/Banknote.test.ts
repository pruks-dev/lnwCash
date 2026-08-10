/**
 * Test: icons/Banknote.svelte — TASK-157
 * Iconly 3.0 Bold Banknote (rectangle + circles)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Banknote from '../../../lib/components/icons/Banknote.svelte';

describe('Banknote Icon (TASK-157)', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render SVG element', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});

	it('should render at default 24x24 size', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('height')).toBe('24');
	});

	it('should render with custom size', () => {
		const { container } = render(Banknote, { size: 32 });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('32');
		expect(svg?.getAttribute('height')).toBe('32');
	});

	it('should use currentColor for stroke', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('currentColor');
	});

	it('should have aria-hidden attribute', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('should have role img', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('role')).toBe('img');
	});

	it('should have viewBox 0 0 24 24', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
	});

	it('should have fill=none', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('fill')).toBe('none');
	});

	it('should have stroke-width=2', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke-width')).toBe('2');
	});

	it('should have round linecap and linejoin', () => {
		const { container } = render(Banknote, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke-linecap')).toBe('round');
		expect(svg?.getAttribute('stroke-linejoin')).toBe('round');
	});

	it('should render icon (SVG exists, viewBox correct, paths present)', () => {
		const { container } = render(Banknote, {});
		// Robust presence + name assertions (v23): geometry-agnostic
		expect(container.querySelector('svg')).toBeTruthy();
		expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
		expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
	});

	it('should NOT contain emoji in SVG', () => {
		const { container } = render(Banknote, {});
		const html = container.innerHTML;
		expect(html).not.toContain('⚡');
		expect(html).not.toContain('⚠️');
	});

	it('should apply custom color', () => {
		const { container } = render(Banknote, { color: '#00bcd4' });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('#00bcd4');
	});

	it('should apply additional class', () => {
		const { container } = render(Banknote, { class: 'text-accent' });
		const svg = container.querySelector('svg');
		expect(svg?.classList.contains('text-accent')).toBe(true);
	});
});
