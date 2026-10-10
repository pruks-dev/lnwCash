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

describe('SeedGrid (TASK-1801 — seed เต็มคำ, mockup ชุด A APPROVED)', () => {
	const src = () =>
		readFileSync(resolve(__dirname, '../SeedGrid.svelte'), 'utf-8');

	// ดึงเฉพาะ seed zone (บล็อก <style>) มาตรวจ — ห้ามมี nowrap/ellipsis ตัดคำ
	const seedZone = () => {
		const m = src().match(/<style>([\s\S]*)<\/style>/);
		return m ? m[1] : '';
	};

	it('seed zone ไม่มี nowrap/ellipsis — คำบอส: “ควรหาวิธียังไงก็ได้ให้สามารถแสดงได้เต็มคำ”', () => {
		const zone = seedZone();
		expect(zone).not.toContain('nowrap');
		expect(zone).not.toContain('text-overflow');
		expect(zone).not.toContain('ellipsis');
	});

	it('word ใช้ wrap+break+min-width:0 (white-space normal + overflow-wrap anywhere)', () => {
		const zone = seedZone();
		expect(zone).toContain('white-space: normal');
		expect(zone).toContain('overflow-wrap: anywhere');
		expect(zone).toContain('word-break: break-word');
		expect(zone).toContain('min-width: 0');
	});

	it('@media (max-width:400px) ลดเหลือ 2 คอลัมน์ — columns prop default 3 ไม่เปลี่ยน', () => {
		const zone = seedZone();
		expect(zone).toContain('@media (max-width: 400px)');
		expect(zone).toContain('repeat(2, minmax(0, 1fr))');
		// prop default ยัง 3 — CSS คุมจอแคบเท่านั้น
		expect(src()).toContain('columns = 3');
		const { container } = render(SeedGrid, { words: WORDS });
		const grid = container.querySelector('.seed-grid') as HTMLElement;
		expect(grid.style.gridTemplateColumns).toContain('repeat(3');
	});
});
