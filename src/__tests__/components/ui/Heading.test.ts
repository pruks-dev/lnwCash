/**
 * Test: ui/Heading.svelte — D-007 Typography
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Heading from '../../../lib/components/ui/Heading.svelte';

describe('Heading', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render h1 by default', () => {
		const { container } = render(Heading, {});
		const h1 = container.querySelector('h1');
		expect(h1).toBeTruthy();
	});

	it('should render h2 when level is h2', () => {
		const { container } = render(Heading, { level: 'h2' });
		const h2 = container.querySelector('h2');
		expect(h2).toBeTruthy();
		expect(container.querySelector('h1')).toBeNull();
	});

	it('should render h3 when level is h3', () => {
		const { container } = render(Heading, { level: 'h3' });
		const h3 = container.querySelector('h3');
		expect(h3).toBeTruthy();
	});

	it('should render h4 when level is h4', () => {
		const { container } = render(Heading, { level: 'h4' });
		expect(container.querySelector('h4')).toBeTruthy();
	});

	it('should render h5 when level is h5', () => {
		const { container } = render(Heading, { level: 'h5' });
		expect(container.querySelector('h5')).toBeTruthy();
	});

	it('should render h6 when level is h6', () => {
		const { container } = render(Heading, { level: 'h6' });
		expect(container.querySelector('h6')).toBeTruthy();
	});

	it('should apply heading-h1 class for h1', () => {
		const { container } = render(Heading, { level: 'h1' });
		expect(container.querySelector('.heading-h1')).toBeTruthy();
	});

	it('should set text alignment via data attribute', () => {
		const { container } = render(Heading, { level: 'h1', align: 'center' });
		const h1 = container.querySelector('h1');
		expect(h1?.getAttribute('data-align')).toBe('center');
	});

	it('should set id when provided', () => {
		const { container } = render(Heading, { level: 'h1', id: 'page-title' });
		expect(container.querySelector('#page-title')).toBeTruthy();
	});
});
