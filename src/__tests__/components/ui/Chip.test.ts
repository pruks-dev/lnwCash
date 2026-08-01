/**
 * Test: ui/Chip.svelte — D-004
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Chip from '../../../lib/components/ui/Chip.svelte';

describe('Chip', () => {
	afterEach(() => {
		cleanup();
	});

	it('should render chip with default variant', () => {
		const { container } = render(Chip, { variant: 'default' });
		const chip = container.querySelector('.chip');
		expect(chip).toBeTruthy();
		expect(chip?.classList.contains('chip-default')).toBe(true);
	});

	it('should render active variant', () => {
		const { container } = render(Chip, { variant: 'active' });
		const chip = container.querySelector('.chip');
		expect(chip?.classList.contains('chip-active')).toBe(true);
	});

	it('should set role to button when onclick provided', () => {
		const onClick = vi.fn();
		const { container } = render(Chip, { variant: 'default', onclick: onClick });
		const chip = container.querySelector('.chip');
		expect(chip?.getAttribute('role')).toBe('button');
	});

	it('should handle click events', () => {
		const onClick = vi.fn();
		const { container } = render(Chip, { variant: 'default', onclick: onClick });
		const chip = container.querySelector('.chip')!;
		chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('should render removable chip with remove button', () => {
		const onRemove = vi.fn();
		const { container } = render(Chip, { variant: 'default', removable: true, onremove: onRemove });
		const removeBtn = container.querySelector('.chip-remove');
		expect(removeBtn).toBeTruthy();
	});

	it('should call onremove when remove button clicked', () => {
		const onRemove = vi.fn();
		const { container } = render(Chip, { variant: 'default', removable: true, onremove: onRemove });
		const removeBtn = container.querySelector('.chip-remove')!;
		removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(onRemove).toHaveBeenCalledTimes(1);
	});

	it('should apply disabled class', () => {
		const { container } = render(Chip, { variant: 'default', disabled: true });
		const chip = container.querySelector('.chip');
		expect(chip?.classList.contains('chip-disabled')).toBe(true);
	});
});
