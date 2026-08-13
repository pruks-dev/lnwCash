/**
 * SeedGrid tests — TASK-208 (D4) 12-word recovery phrase grid (3×4, monospace).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, cleanup } from '@testing-library/svelte/svelte5';
import SeedGrid from '../SeedGrid.svelte';

afterEach(() => cleanup());

const WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(
	' '
);

describe('SeedGrid (TASK-208 D4)', () => {
	it('renders 12 words (NOT 24) in a 3-column grid', () => {
		const { container } = render(SeedGrid, { words: WORDS });
		const cells = container.querySelectorAll('.seed-cell');
		expect(cells.length).toBe(12);
		const grid = container.querySelector('.seed-grid') as HTMLElement;
		expect(grid.style.gridTemplateColumns).toContain('repeat(3');
	});

	it('renders 1-based position + word in every cell', () => {
		const { container } = render(SeedGrid, { words: WORDS });
		const cells = Array.from(container.querySelectorAll('.seed-cell'));
		cells.forEach((cell, i) => {
			expect(cell.querySelector('.seed-cell-index')?.textContent?.trim()).toBe(String(i + 1));
			expect(cell.querySelector('.seed-cell-word')?.textContent?.trim()).toBe(WORDS[i]);
		});
	});

	it('styles grid cells with a monospace font (D4)', () => {
		// jsdom does not inject Svelte component styles into <style> tags, so
		// assert the declared stylesheet uses the monospace token + fallback.
		const src = readFileSync(resolve(__dirname, '../SeedGrid.svelte'), 'utf-8');
		expect(src).toContain('--font-family-mono');
		expect(src).toContain('monospace');
	});

	it('renders empty grid when no words provided', () => {
		const { container } = render(SeedGrid, { words: [] });
		expect(container.querySelectorAll('.seed-cell').length).toBe(0);
	});
});
