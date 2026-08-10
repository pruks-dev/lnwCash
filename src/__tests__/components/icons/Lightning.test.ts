/**
 * Test: icons/Lightning.svelte — TASK-157
 * Iconly 3.0 Bold Lightning bolt (zigzag)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Lightning from '../../../lib/components/icons/Lightning.svelte';

describe('Lightning Icon (TASK-157)', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render SVG element', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg).toBeTruthy();
	});

	it('should render at default 24x24 size', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('24');
		expect(svg?.getAttribute('height')).toBe('24');
	});

	it('should render with custom size', () => {
		const { container } = render(Lightning, { size: 32 });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('width')).toBe('32');
		expect(svg?.getAttribute('height')).toBe('32');
	});

	it('should use currentColor for stroke', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('currentColor');
	});

	it('should have aria-hidden attribute', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('should have role img', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('role')).toBe('img');
	});

	it('should have viewBox 0 0 24 24', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
	});

	it('should have fill=none', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('fill')).toBe('none');
	});

	it('should have stroke-width=2', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke-width')).toBe('2');
	});

	it('should have round linecap and linejoin', () => {
		const { container } = render(Lightning, {});
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke-linecap')).toBe('round');
		expect(svg?.getAttribute('stroke-linejoin')).toBe('round');
	});

	it('should have path data (not empty)', () => {
		const { container } = render(Lightning, {});
		const path = container.querySelector('path');
		expect(path).toBeTruthy();
		const d = path?.getAttribute('d');
		expect(d).toBeTruthy();
		expect(d?.length).toBeGreaterThan(10);
	});

	it('should NOT contain emoji in SVG', () => {
		const { container } = render(Lightning, {});
		const html = container.innerHTML;
		expect(html).not.toContain('⚡');
		expect(html).not.toContain('⚠️');
	});

	it('should apply custom color', () => {
		const { container } = render(Lightning, { color: '#ff0000' });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('stroke')).toBe('#ff0000');
	});

	it('should apply additional class', () => {
		const { container } = render(Lightning, { class: 'text-primary' });
		const svg = container.querySelector('svg');
		expect(svg?.classList.contains('text-primary')).toBe(true);
	});
});
