/**
 * Test: Modal layout prop — TASK-4503 (INTENT-045 BLUEPRINT-045 v3, ทาง ข)
 * FIX-FORWARD: layout ('auto' | 'fixed', default 'auto') —
 * auto = content-sized (confirm กลับ auto ~205px),
 * fixed = R7 pinned-scroll (mint Add Mint Modal ส่ง layout="fixed").
 * Mint page :global(.modal-dialog)/:global(.modal-body) ต้องเป็น 0
 * (ย้ายเข้า fixed branch ของ Modal แล้ว).
 *
 * SCOPED file-only (L-P033): render Modal จริง (no mock) + source-grep
 * เฉพาะ mint +page.svelte ที่แตะโดยตรง.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Modal from '../../../lib/components/ui/Modal.svelte';

const here = dirname(fileURLToPath(import.meta.url));
const mintPath = resolve(here, '../../../routes/settings/mint/+page.svelte');
const mintSrc = readFileSync(mintPath, 'utf-8');

describe('Modal layout prop (TASK-4503)', () => {
	afterEach(() => {
		cleanup();
	});

	it('defaults to auto: content-sized class, no fixed-height class', () => {
		const { container } = render(Modal, { open: true, title: 'Confirm' });
		const content = container.querySelector('.modal-content');
		expect(content).toBeTruthy();
		expect(content?.classList.contains('modal-layout-auto')).toBe(true);
		expect(content?.classList.contains('modal-layout-fixed')).toBe(false);
	});

	it('layout="fixed": pinned-scroll class on dialog', () => {
		const { container } = render(Modal, {
			open: true,
			title: 'Add mint',
			variant: 'dialog',
			layout: 'fixed'
		});
		const content = container.querySelector('.modal-content');
		expect(content?.classList.contains('modal-dialog')).toBe(true);
		expect(content?.classList.contains('modal-layout-fixed')).toBe(true);
		expect(content?.classList.contains('modal-layout-auto')).toBe(false);
	});

	it('layout="fixed" works with bottomsheet variant too (class binding orthogonal)', () => {
		const { container } = render(Modal, {
			open: true,
			title: 'Sheet',
			variant: 'bottomsheet',
			layout: 'fixed'
		});
		const content = container.querySelector('.modal-content');
		expect(content?.classList.contains('modal-bottomsheet')).toBe(true);
		expect(content?.classList.contains('modal-layout-fixed')).toBe(true);
	});

	it('renders nothing when closed (open=false)', () => {
		const { container } = render(Modal, { open: false, title: 'Hidden' });
		expect(container.querySelector('.modal-content')).toBeNull();
	});
});

describe('mint Add Mint Modal (TASK-4503) — fixed wiring, :global sweep', () => {
	it('Add Mint Modal sends layout="fixed"', () => {
		const modalIdx = mintSrc.indexOf('<Modal');
		expect(modalIdx).toBeGreaterThan(-1);
		const block = mintSrc.slice(modalIdx, mintSrc.indexOf('>', modalIdx));
		expect(block).toContain('layout="fixed"');
		expect(block).toContain('variant="dialog"');
	});

	it('ZERO :global(.modal-dialog) in mint page (moved into Modal fixed branch)', () => {
		expect(mintSrc).not.toContain(':global(.modal-dialog)');
	});

	it('ZERO :global(.modal-body) in mint page (moved into Modal fixed branch)', () => {
		expect(mintSrc).not.toContain(':global(.modal-body)');
	});
});
