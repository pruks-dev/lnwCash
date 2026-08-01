/**
 * Test: ui/Divider.svelte — D-004
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Divider from '../../../lib/components/ui/Divider.svelte';

describe('Divider', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render horizontal divider by default', () => {
		const { container } = render(Divider, {});
		const divider = container.querySelector('.divider');
		expect(divider).toBeTruthy();
		expect(divider?.classList.contains('divider-h')).toBe(true);
	});

	it('should render with role separator (horizontal)', () => {
		const { container } = render(Divider, {});
		const divider = container.querySelector('[role="separator"]');
		expect(divider).toBeTruthy();
		expect(divider?.getAttribute('aria-orientation')).toBe('horizontal');
	});

	it('should render vertical variant', () => {
		const { container } = render(Divider, { orientation: 'vertical' });
		const divider = container.querySelector('.divider');
		expect(divider?.classList.contains('divider-v')).toBe(true);
	});

	it('should render vertical with correct aria-orientation', () => {
		const { container } = render(Divider, { orientation: 'vertical' });
		const divider = container.querySelector('[role="separator"]');
		expect(divider?.getAttribute('aria-orientation')).toBe('vertical');
	});

	it('should render label when provided', () => {
		const { container } = render(Divider, { label: 'OR' });
		const label = container.querySelector('.divider-label');
		expect(label).toBeTruthy();
		expect(label?.textContent).toBe('OR');
	});
});
