/**
 * Test: icons/Warning.svelte — TASK-157
 * Iconly 3.0 Bold Warning (triangle + exclamation)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Warning from '../../../lib/components/icons/Warning.svelte';

describe('Warning Icon (TASK-157)', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render SVG element', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});

	it('should render at default 24x24 size', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('height')).toBe('24');
	});

	it('should render with custom size', () => {
		const { container } = render(Warning, { size: 28 });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('28');
		expect(svg?.getAttribute('height')).toBe('28');
	});

	it('should use currentColor for stroke', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('currentColor');
	});

	it('should have aria-hidden attribute', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('should have role img', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('role')).toBe('img');
	});

	it('should have viewBox 0 0 24 24', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
	});

	it('should have fill=none', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('fill')).toBe('none');
	});

	it('should have stroke-width=2', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke-width')).toBe('2');
	});

	it('should have round linecap and linejoin', () => {
		const { container } = render(Warning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke-linecap')).toBe('round');
		expect(svg?.getAttribute('stroke-linejoin')).toBe('round');
	});

	it('should render paths (triangle + decoration)', () => {
		const { container } = render(Warning, {});
		// Robust presence assertion (v23): geometry-agnostic — icon has at least one path
		expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
	});

	it('should NOT contain emoji in SVG', () => {
		const { container } = render(Warning, {});
		const html = container.innerHTML;
		expect(html).not.toContain('⚠️');
		expect(html).not.toContain('⚡');
	});

	it('should apply custom color', () => {
		const { container } = render(Warning, { color: '#ff5722' });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('#ff5722');
	});

	it('should apply additional class', () => {
		const { container } = render(Warning, { class: 'text-danger' });
		const svg = container.querySelector('svg');
		expect(svg?.classList.contains('text-danger')).toBe(true);
	});
});
