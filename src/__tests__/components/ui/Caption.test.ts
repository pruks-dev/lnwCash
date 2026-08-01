/**
 * Test: ui/Caption.svelte — D-007 Typography
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Caption from '../../../lib/components/ui/Caption.svelte';

describe('Caption', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render span element', () => {
		const { container } = render(Caption, {});
		const span = container.querySelector('span.caption');
		expect(span).toBeTruthy();
	});

	it('should have secondary color by default', () => {
		const { container } = render(Caption, {});
		const span = container.querySelector('.caption');
		expect(span?.getAttribute('data-color')).toBe('secondary');
	});

	it('should set color via prop', () => {
		const { container } = render(Caption, { color: 'disabled' });
		const span = container.querySelector('.caption');
		expect(span?.getAttribute('data-color')).toBe('disabled');
	});

	it('should add uppercase class when uppercase prop is true', () => {
		const { container } = render(Caption, { uppercase: true });
		expect(container.querySelector('.uppercase')).toBeTruthy();
	});

	it('should add truncate class when truncate is true', () => {
		const { container } = render(Caption, { truncate: true });
		expect(container.querySelector('.truncate')).toBeTruthy();
	});
});
