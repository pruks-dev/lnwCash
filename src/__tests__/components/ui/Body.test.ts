/**
 * Test: ui/Body.svelte — D-007 Typography
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Body from '../../../lib/components/ui/Body.svelte';

describe('Body', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render p tag by default', () => {
		const { container } = render(Body, {});
		const p = container.querySelector('p');
		expect(p).toBeTruthy();
	});

	it('should render span when inline is true', () => {
		const { container } = render(Body, { inline: true });
		expect(container.querySelector('span')).toBeTruthy();
		expect(container.querySelector('p')).toBeNull();
	});

	it('should apply size-md class by default', () => {
		const { container } = render(Body, {});
		expect(container.querySelector('.body-md')).toBeTruthy();
	});

	it('should apply size-sm class', () => {
		const { container } = render(Body, { size: 'sm' });
		expect(container.querySelector('.body-sm')).toBeTruthy();
	});

	it('should apply size-lg class', () => {
		const { container } = render(Body, { size: 'lg' });
		expect(container.querySelector('.body-lg')).toBeTruthy();
	});

	it('should set weight via data attribute', () => {
		const { container } = render(Body, { weight: 'bold' });
		const p = container.querySelector('p');
		expect(p?.getAttribute('data-weight')).toBe('bold');
	});

	it('should set color via data attribute', () => {
		const { container } = render(Body, { color: 'secondary' });
		const p = container.querySelector('p');
		expect(p?.getAttribute('data-color')).toBe('secondary');
	});
});
