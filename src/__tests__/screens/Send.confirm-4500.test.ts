/**
 * Test: Send.svelte confirm block — TASK-4500 (INTENT-045 BLUEPRINT-045 v3)
 * FIX: title-move + phrase-out + warning-row removal (measure-first, no CSS cut)
 *
 * Scope: source-level regression guard for the confirm block only.
 * - Modal must carry title={$_('screen.send.confirm_title')} (header, not body H3)
 * - No duplicate <Heading> with confirm_title inside confirm-dialog
 * - No 'irreversible' string anywhere in Send.svelte UI
 * - Confirm button reuses screen.send.confirm_send (no new key)
 * - danger-btn + Cancel wiring intact (money path untouched)
 * - TASK-4502: orphan sweep executed (2 keys removed from TH+EN = 4 keys);
 *   key-name absence is proven by repo-wide grep sweep (evidence file),
 *   not by string literals here (keeps the sweep grep at zero).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sendPath = resolve(here, '../../screens/Send.svelte');
const src = readFileSync(sendPath, 'utf-8');

// Isolate the confirm block: from CONFIRMATION DIALOG marker to closing </Modal>
const marker = 'CONFIRMATION DIALOG';
const markerIdx = src.indexOf(marker);
const modalCloseIdx = src.indexOf('</Modal>', markerIdx);
const confirmBlock = src.slice(markerIdx, modalCloseIdx);

describe('Send confirm block (TASK-4500) — title-move + phrase-out', () => {
	it('Modal carries title prop with confirm_title (header owns the title)', () => {
		expect(confirmBlock).toContain("title={$_('screen.send.confirm_title')}");
	});

	it('has NO duplicate Heading h3 with confirm_title (removed :1282)', () => {
		expect(confirmBlock).not.toMatch(/<Heading[^>]*>.*confirm_title/s);
	});

	it('contains ZERO occurrences of "irreversible" (phrase-out)', () => {
		expect(src).not.toContain('irreversible');
	});


	it('confirm button reuses screen.send.confirm_send key (no new key)', () => {
		expect(confirmBlock).toContain("$_('screen.send.confirm_send')");
	});

	it('danger-btn + Cancel stay wired (money path untouched)', () => {
		expect(confirmBlock).toContain('class="danger-btn"');
		expect(confirmBlock).toContain('onclick={executeLightningSend}');
		expect(confirmBlock).toContain('onclick={cancelConfirm}');
		expect(confirmBlock).toContain("$_('common.cancel')");
	});

	it('fee/total conditional block intact (no logic touched)', () => {
		expect(confirmBlock).toContain('{#if lightningFee > 0}');
		expect(confirmBlock).toContain('lightningTotal');
	});
});
