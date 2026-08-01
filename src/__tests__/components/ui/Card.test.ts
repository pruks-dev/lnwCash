/**
 * Test: ui/Card.svelte — D-004
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import Card from '../../../lib/components/ui/Card.svelte';

describe('Card', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render basic variant', () => {
		const { container } = render(Card, { variant: 'basic' });
		const card = container.querySelector('.card');
		expect(card).toBeTruthy();
		expect(card?.classList.contains('card-basic')).toBe(true);
	});

	it('should render interactive variant with cursor pointer', () => {
		const { container } = render(Card, { variant: 'interactive' });
		const card = container.querySelector('.card');
		expect(card).toBeTruthy();
		expect(card?.classList.contains('card-interactive')).toBe(true);
	});

	it('should set role to button for interactive variant', () => {
		const { container } = render(Card, { variant: 'interactive' });
		const card = container.querySelector('.card');
		expect(card?.getAttribute('role')).toBe('button');
	});

	it('should not set role for basic variant', () => {
		const { container } = render(Card, { variant: 'basic' });
		const card = container.querySelector('.card');
		expect(card?.hasAttribute('role')).toBe(false);
	});

	it('should apply padding class', () => {
		const { container } = render(Card, { variant: 'basic', padding: 'lg' });
		const card = container.querySelector('.card');
		expect(card?.classList.contains('card-padding-lg')).toBe(true);
	});
});
