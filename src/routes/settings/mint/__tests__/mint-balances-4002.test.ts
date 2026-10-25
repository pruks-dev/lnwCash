// @ts-nocheck — test file using @testing-library/svelte v5 with Svelte 5
// Snippet types are branded symbols; runtime behavior is correct via vitest
/**
 * TASK-4002 (INTENT-040, BLUEPRINT-040 v1) — per-mint spendable badges
 *
 * Tests for: mint balances on settings/mint/+page.svelte
 * (active-card badge + every list-row badge).
 *
 * SPENDABLE-ONLY proof strategy: NO mocks on $lib/wallet/balance or proofsDb —
 * the component reads the REAL getMintBalances() over fake-indexeddb seeded
 * with spendable + pending_normalize + quarantined + spent proofs.
 * Displayed numbers must equal the spendable subset exactly; pending/failed
 * amounts must never appear (INTENT-015).
 *
 * AC:
 *   - active card badge == spendable balance of active mint
 *   - every list row badge == spendable balance of that mint
 *   - mint with no proofs shows 0
 *   - loading shows skeleton pill first, then badges
 *   - DB error hides badges (never a wrong number), page still renders
 *   - many mints (6) each correct — single batched read, no network
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen, fireEvent } from '@testing-library/svelte/svelte5';
import MintSettings from '../+page.svelte';
import type { MintConfig } from '$lib/wallet/config';
import type { TokenProof } from '$lib/types';
import {
	addProofs,
	clearProofs,
	makeLocalId,
	markPendingNormalizeByProof,
	markQuarantined,
	markSpent
} from '$lib/wallet/proofsDb';
import { getMintBalances as realGetMintBalances } from '$lib/wallet/balance';
import * as balanceModule from '$lib/wallet/balance';

// Import mocked modules for R3 modal/discover control (same mocks as above)
import { validateMintUrl } from '$lib/wallet/mint-validation';
import { discoverMints } from '$lib/nostr/mint-discover';
// R3 rev39+rev40: source-CSS proof — jsdom vitest ไม่ inject Svelte scoped
// <style> (STYLE_TAGS=0 พิสูจน์ R2 แล้ว) กฏ ellipsis/max-width จึง assert ผ่าน
// source (?raw) + built-CSS grep ใน balance-proof.txt แทน computed style
import pageSource from '../+page.svelte?raw';

const MINT_A = 'https://mint-a.example';
const MINT_B = 'https://mint-b.example';
const MINT_C = 'https://mint-c-noproofs.example';
const DEFAULT_URL = 'https://mint.lnw.cash';

function mintConfig(url: string, name: string): MintConfig {
	return {
		url,
		name,
		pubkey: '03d0e4cda0f937bde65b9d160b58febe04bd229243ea45e390ce80252504e1176e',
		version: 'Nutshell/0.20.1',
		supported_nuts: ['04', '05', '07', '08'],
		cached_endpoints: [],
		ttl: 604800,
		last_info_fetch: Date.now()
	};
}

let mockMints: MintConfig[] = [];

function resetMocks(): void {
	mockMints = [mintConfig(DEFAULT_URL, 'Default Mint'), mintConfig(MINT_A, 'Mint A')];
	vi.clearAllMocks();
}

// ─── Mock Modules (same surface as +page.test.ts; balance NOT mocked) ──

vi.mock('svelte-i18n', () => {
	const { writable } = require('svelte/store');
	const _store = writable((key: string) => key);
	return {
		_: _store,
		get $_() {
			let current: (key: string) => string = (k: string) => k;
			_store.subscribe((fn: (key: string) => string) => { current = fn; })();
			return current;
		}
	};
});

vi.mock('$lib/wallet/discovery', () => ({
	discoverMintEndpoints: vi.fn(),
	DiscoveryError: class extends Error {
		constructor(msg: string, public mintUrl: string) {
			super(msg);
			this.name = 'DiscoveryError';
		}
	}
}));

vi.mock('$lib/wallet/mint-validation', () => ({
	validateMintUrl: vi.fn()
}));

vi.mock('$lib/nostr/mint-discover', async (importOriginal) => {
	const orig = await importOriginal<typeof import('$lib/nostr/mint-discover')>();
	return {
		...orig,
		discoverMints: vi.fn(async () => [])
	};
});

vi.mock('$lib/wallet/store', () => ({
	getAllMintConfigs: vi.fn(() => [...mockMints]),
	removeMintConfig: vi.fn(),
	getDefaultMintUrl: vi.fn(() => DEFAULT_URL),
	getMintConfig: vi.fn((url: string) => mockMints.find((m) => m.url === url)),
	setMintConfig: vi.fn(),
	clearMintConfigs: vi.fn(),
	isMintConfigStale: vi.fn(() => false),
	getOrCreateMintConfig: vi.fn(),
	getActiveMintUrl: vi.fn(() => {
		const stored = localStorage.getItem('lnwcash_active_mint');
		if (stored && mockMints.some((m) => m.url === stored)) return stored;
		return mockMints[0]?.url ?? DEFAULT_URL;
	}),
	setActiveMintUrl: vi.fn((url: string) => {
		localStorage.setItem('lnwcash_active_mint', url);
	})
}));

// ─── Proof seeding (REAL proofsDb) ─────────────────────────────

let proofSeq = 0;
function proof(amount: number): TokenProof {
	proofSeq += 1;
	return {
		id: `keyset4002-${proofSeq}`,
		amount,
		secret: `secret-4002-${proofSeq}-abcdefghijklmnopqrstuvwxyz`,
		C: `C-4002-${proofSeq}`
	};
}

async function seedSpendableOnly(): Promise<void> {
	// Mint A (will be ACTIVE): spendable 1000 + 500 = 1500
	const aSpend = [proof(1000), proof(500)];
	// pending (offline passthrough, awaits T3) — user's money but NOT spendable
	const aPending = [proof(9999)];
	// quarantined (mint double-spent reject — dead coins)
	const aQuar = [proof(8888)];
	// spent (audit trail)
	const aSpent = [proof(7777)];
	await addProofs([...aSpend, ...aPending, ...aQuar, ...aSpent], MINT_A, 'ks-a');
	await markPendingNormalizeByProof(aPending);
	await markQuarantined(aQuar.map((p) => makeLocalId(p)));
	await markSpent(aSpent.map((p) => makeLocalId(p)));

	// Mint B: spendable 250 + pending 4444
	const bSpend = [proof(250)];
	const bPending = [proof(4444)];
	await addProofs([...bSpend, ...bPending], MINT_B, 'ks-b');
	await markPendingNormalizeByProof(bPending);

	// Mint C: no proofs at all → badge 0
}

// ─── Tests ─────────────────────────────────────────────────────

describe('TASK-4002 mint balances (SPENDABLE-ONLY badges)', () => {
	beforeEach(async () => {
		resetMocks();
		localStorage.clear();
		proofSeq = 0;
		await clearProofs();
		await seedSpendableOnly();
	});

	afterEach(async () => {
		await clearProofs();
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('sanity: REAL getMintBalances returns spendable-only numbers', async () => {
		const list = await realGetMintBalances();
		const byUrl = Object.fromEntries(list.map((b) => [b.mintUrl, b.amount]));
		expect(byUrl[MINT_A]).toBe(1500);
		expect(byUrl[MINT_B]).toBe(250);
		expect(byUrl[MINT_C]).toBeUndefined();
	});

	it('active card badge shows spendable balance of the active mint', async () => {
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		const { container } = render(MintSettings);

		await waitFor(() => {
			const card = container.querySelector('.mint-name-row .bal-badge');
			expect(card?.textContent).toContain('1,500');
		});

		const card = container.querySelector('.mint-name-row .bal-badge');
		expect(card?.textContent).toContain('screen.balance.sats');
		// pending/quarantined/spent amounts must never leak into the UI
		expect(container.textContent).not.toContain('9,999');
		expect(container.textContent).not.toContain('8,888');
		expect(container.textContent).not.toContain('7,777');
	});

	it('every list row shows its own mint spendable balance + url full', async () => {
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		mockMints = [mintConfig(MINT_A, 'Mint A'), mintConfig(MINT_B, 'Mint B')];
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.textContent).toContain('250');
		});

		// B row: row-top (name + badge) above full url
		const rows = Array.from(container.querySelectorAll('.mint-list .list-item'));
		expect(rows.length).toBe(1);
		const rowTop = rows[0].querySelector('.row-top');
		expect(rowTop?.querySelector('.row-name')?.textContent).toContain('Mint B');
		expect(rowTop?.querySelector('.bal-badge')?.textContent).toContain('250');
		expect(rows[0].querySelector('.row-url')?.textContent).toContain(MINT_B);
		// trailing keeps ONLY the remove ghost (no balance moved there)
		expect(rows[0].querySelector('.list-item-trailing .bal-badge')).toBeNull();
		expect(container.textContent).not.toContain('4,444');
	});

	it('mint with no proofs shows 0 sats (not hidden, not stale)', async () => {
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		mockMints = [mintConfig(MINT_A, 'Mint A'), mintConfig(MINT_C, 'Mint C')];
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.mint-name-row .bal-badge')?.textContent).toContain(
				'1,500'
			);
		});

		const cRow = Array.from(container.querySelectorAll('.mint-list .list-item')).find((r) =>
			r.textContent?.includes('Mint C')
		);
		expect(cRow?.querySelector('.bal-badge')?.textContent).toMatch(/0\s*screen\.balance\.sats/);
	});

	it('loading shows skeleton pills first, then real badges', async () => {
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		const { container } = render(MintSettings);

		// Synchronous post-render: IndexedDB read cannot have resolved yet
		expect(container.querySelectorAll('.bal-badge.bal-skeleton').length).toBeGreaterThan(0);

		await waitFor(() => {
			expect(container.querySelectorAll('.bal-badge.bal-skeleton').length).toBe(0);
			expect(container.querySelector('.mint-name-row .bal-badge')?.textContent).toContain(
				'1,500'
			);
		});
	});

	it('DB error hides badges (never a wrong number), page still renders', async () => {
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		vi.spyOn(balanceModule, 'getMintBalances').mockRejectedValueOnce(new Error('db down'));
		const { container } = render(MintSettings);

		await waitFor(() => {
			// loading finished (skeletons gone) but no badge on error
			expect(container.querySelectorAll('.bal-badge.bal-skeleton').length).toBe(0);
		});
		expect(container.querySelectorAll('.bal-badge').length).toBe(0);
		// page content itself unaffected
		expect(container.textContent).toContain('Mint A');
		expect(container.textContent).toContain('NUT-04');
	});

	it('many mints (6) each show their own spendable badge — batched, offline-safe', async () => {
		const urls = Array.from({ length: 6 }, (_, i) => `https://many-${i}.example`);
		mockMints = [mintConfig(MINT_A, 'Mint A'), ...urls.map((u, i) => mintConfig(u, `Many ${i}`))];
		for (let i = 0; i < urls.length; i++) {
			await addProofs([proof(100 * (i + 1))], urls[i], `ks-many-${i}`);
		}
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.textContent).toContain('600');
		});

		for (let i = 0; i < urls.length; i++) {
			const row = Array.from(container.querySelectorAll('.mint-list .list-item')).find((r) =>
				r.textContent?.includes(`Many ${i}`)
			);
			expect(row?.querySelector('.bal-badge')?.textContent).toContain(
				new Intl.NumberFormat().format(100 * (i + 1))
			);
		}
		// active card still the active mint's own balance
		expect(container.querySelector('.mint-name-row .bal-badge')?.textContent).toContain('1,500');
	});

	it('R5 rev48: active card has NO remove — side keeps Badge active only (even non-default)', async () => {
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		mockMints = [mintConfig(DEFAULT_URL, 'Default Mint'), mintConfig(MINT_A, 'Mint A')];
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.mint-name-row .bal-badge')?.textContent).toContain(
				'1,500'
			);
		});

		// header single row: left logo+name/url + right Badge active ONLY (R5: remove gone from card)
		const head = container.querySelector('.active-head');
		expect(head).not.toBeNull();
		expect(head?.querySelector('.active-id .active-mint-text')).not.toBeNull();
		const side = head?.querySelector('.active-side');
		expect(side?.textContent).toContain('mint.settings.active');
		// active mint must never be removable from the card — no button at all (handler stays for list)
		expect(head?.querySelector('button')).toBeNull();
		expect(side?.querySelector('button')).toBeNull();
		// bottom-left actions block removed (R2 moved it into the header, R5 removed the button)
		expect(container.querySelector('.active-mint-actions')).toBeNull();
		// Badge active no longer sits inside mint-name-row (moved to side)
		expect(head?.querySelector('.mint-name-row')?.textContent).not.toContain(
			'mint.settings.active'
		);
	});

	it('R5 rev48: default active card (mint.lnw.cash) — Badge only, no remove (same as every active)', async () => {
		localStorage.setItem('lnwcash_active_mint', DEFAULT_URL);
		mockMints = [mintConfig(DEFAULT_URL, 'Default Mint'), mintConfig(MINT_A, 'Mint A')];
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.active-head')).not.toBeNull();
		});

		const side = container.querySelector('.active-head .active-side');
		expect(side?.textContent).toContain('mint.settings.active');
		// default remove hidden same as before — side keeps Badge only
		expect(side?.querySelector('button')).toBeNull();
		expect(container.querySelector('.active-mint-actions')).toBeNull();
	});

	it('R2 rev36: long name/url truncated (ellipsis) — card + list keep full value in title', async () => {
		const LONG_CARD_NAME = 'Mint with an extremely long display name that must not push the card wider ' + 'n'.repeat(80);
		const LONG_ROW_NAME = 'Another ridiculously long mint name for the list row ' + 'm'.repeat(80);
		const LONG_ROW_URL = 'https://very-long-mint-hostname-that-keeps-going.example/' + 'p'.repeat(100);
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		mockMints = [mintConfig(MINT_A, LONG_CARD_NAME), mintConfig(LONG_ROW_URL, LONG_ROW_NAME)];
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.mint-name-row .bal-badge')).not.toBeNull();
		});

		// card: full text preserved in title (display truncated by CSS ellipsis —
		// jsdom vitest does not inject Svelte scoped <style> (STYLE_TAGS=0), so the
		// ellipsis rules themselves are proven via source+built-CSS grep in
		// balance-proof.txt; here we lock the structure that makes them apply)
		const cardName = container.querySelector('.active-head .mint-name');
		expect(cardName?.textContent).toContain(LONG_CARD_NAME);
		expect(cardName?.getAttribute('title')).toBe(LONG_CARD_NAME);
		const cardUrl = container.querySelector('.active-head .mint-url');
		expect(cardUrl?.getAttribute('title')).toBe(MINT_A);
		// shrink chain intact: every flex ancestor down to the text exists
		// (.active-head/.active-id/.active-mint-text/.mint-name-row all min-width 0 in CSS)
		expect(container.querySelector('.active-head .active-id')).not.toBeNull();
		expect(container.querySelector('.active-head .active-mint-text')).not.toBeNull();
		expect(container.querySelector('.active-head .mint-name-row')).not.toBeNull();

		// list row: same treatment (copied from ListItem title/subtitle)
		const row = Array.from(container.querySelectorAll('.mint-list .list-item')).find((r) =>
			r.textContent?.includes(LONG_ROW_NAME)
		);
		expect(row).not.toBeUndefined();
		const rowName = row?.querySelector('.row-name');
		expect(rowName?.getAttribute('title')).toBe(LONG_ROW_NAME);
		const rowUrl = row?.querySelector('.row-url');
		expect(rowUrl?.getAttribute('title')).toBe(LONG_ROW_URL);
		// row-top shrink chain intact (min-width 0 in CSS — badge flex-shrink 0 stays right)
		expect(row?.querySelector('.row-top')).not.toBeNull();
	});
});

// ─── R3 rev39+rev40 REWORK ─────────────────────────────────────
// Commander verbatim: "ผมอยากได้แบบ setting" + "ประเด็นหลักคือ การต้องโดนตัด
// จากด้านขวาได้ให้ padding หรือ margin ขวายังมีผล"
// (1) กรอบ mint 480 เท่า setting (2) ชื่อ/url ทุกจุด ellipsis+nowrap+min-width 0
// (3) floors ผ่อนเหลือขั้นต่ำ (spacer/bal/label/actions คงขั้นต่ำกันเละ ไม่ค้ำบวม)
// + 4 คอมโบ TH/EN × light/dark (reuse keys + tokens ล้วน — ไม่มี key/สีใหม่)
// NOTE: jsdom ไม่ inject Svelte scoped <style> (STYLE_TAGS=0 พิสูจน์ R2 แล้ว)
// กฏ CSS จึง assert ผ่าน source (?raw) ที่นี่ + built-CSS grep ใน proof;
// ฝั่ง DOM ล็อกโครงสร้างที่ทำให้กฏมีผล (title เก็บเต็ม + chain ครบ).
function cssBlock(selector: string): string {
	const esc = selector.replace(/\./g, '\\.');
	const m = (pageSource as string).match(new RegExp('[^{}]*' + esc + '\\s*\\{[^}]*\\}'));
	return m?.[0] ?? '';
}

describe('TASK-4002 R4 rev42+rev44 (no nested frame + relaxed floors; rev39/40 + R2/R1 carry)', () => {
	beforeEach(async () => {
		resetMocks();
		localStorage.clear();
		proofSeq = 0;
		await clearProofs();
		await seedSpendableOnly();
	});

	afterEach(async () => {
		await clearProofs();
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('R4-1: no nested frame — padding 0 + max-width none, outer settings-screen owns 480', () => {
		const block = cssBlock('.mint-settings');
		expect(block).toContain('padding: 0');
		expect(block).toContain('max-width: none');
		// ไม่เบิ้ลกรอบนอก (Settings.svelte:843-846 คุม 480/auto/md เอง): กรอบในไม่มี 480/600px + ไม่มี padding md
		expect(pageSource as string).not.toContain('max-width: 480px');
		expect(pageSource as string).not.toContain('max-width: 600px');
		expect(block).not.toContain('padding: var(--space-md)');
		// R6 rev51 SUPERSEDE (chromium พิสูจน์): margin 0 auto ที่ R4 ใส่มาคือ floor
		// ตัวจริง — auto margin ยกเลิก stretch ของ column item (.mint-settings กว้างเท่า
		// max-content ชื่อยาว = doc 1763px ที่ viewport 390) เอา auto ออกเหลือ margin 0
		// (stretch กลับมาเต็มกรอบนอกเหมือน setting — ปุ่ม add จัดกลางในตัวเองอยู่แล้ว)
		expect(block).not.toContain('margin: 0 auto');
		expect(block).toContain('margin: 0');
	});

	it('R3-2: every name/url point cuts from the right (ellipsis + nowrap + min-width 0)', () => {
		for (const sel of [
			'.mint-name',
			'.mint-url',
			'.row-name',
			'.row-url',
			'.discover-name',
			'.discover-url',
			'.validated-name'
		]) {
			const block = cssBlock(sel);
			expect(block, sel + ' rule exists').not.toBe('');
			expect(block, sel + ' min-width 0').toContain('min-width: 0');
			expect(block, sel + ' ellipsis').toContain('text-overflow: ellipsis');
			expect(block, sel + ' nowrap').toContain('white-space: nowrap');
			expect(block, sel + ' clip').toContain('overflow: hidden');
		}
	});

	it('R5 rev48: .row-spacer gone (element+CSS) — default row reserves nothing, only ellipsis guards the right', () => {
		// ผ่อน: chain พวกนี้หดได้ (min-width 0) ไม่ค้ำขวา
		expect(cssBlock('.detail-row')).toContain('min-width: 0');
		expect(cssBlock('.detail-value')).toContain('min-width: 0');
		expect(cssBlock('.nuts-list')).toContain('min-width: 0');
		expect(cssBlock('.mint-actions')).toContain('min-width: 0');
		expect(cssBlock('.validated-head')).toContain('min-width: 0');
		expect(cssBlock('.discover-info')).toContain('min-width: 0');
		// R4 ผ่อน: label 7rem/100px→0 (จอแคบหดได้ — ellipsis รับแทน)
		expect(cssBlock('.detail-label')).toContain('min-width: 0');
		// R5 rev48: .row-spacer ถอดทิ้งทั้ง element+CSS — ไม่มี CSS rule ไม่มี element
		// (คอมเมนต์ R5 อ้างชื่อไว้เป็นหลักฐานได้ แต่ rule/element ต้องเป็น 0)
		expect(pageSource as string).not.toMatch(/\.row-spacer\s*\{/);
		expect(pageSource as string).not.toContain('class="row-spacer"');
		// floor เก่าต้องหายจากทั้งไฟล์ (rule เท่านั้น — cssBlock กลืนคอมเมนต์ R4 ที่มีคำอธิบาย 7rem ได้)
		expect(pageSource as string).not.toContain('min-width: 7rem');
		expect(pageSource as string).not.toContain('min-width: 100px');
		expect(pageSource as string).not.toContain('min-width: 3.5rem');
		expect(pageSource as string).not.toContain('min-height: 2.75rem');
		// list 56→48 = ค่า ListItem จริง (แถวเตี้ยลงเท่ามาตรฐาน ไม่ค้ำจอแคบ)
		expect(cssBlock('.discover-row')).toContain('min-height: 48px');
		expect(pageSource as string).not.toContain('min-height: 56px');
		// คงขั้นต่ำกันเละ (ไม่ค้ำบวม): badge shrink-0 (R1) + label shrink-0 — padding ขวามีผลเสมอ
		expect(cssBlock('.bal-badge')).toContain('flex-shrink: 0');
		expect(cssBlock('.detail-label')).toContain('flex-shrink: 0');
		// R4 เพิ่ม key/สี ใหม่ = 0 (4 คอมโบ TH/EN×light/dark ผ่าน reuse + tokens + build เดียว)
		expect(pageSource as string).not.toMatch(/\$_\('mint\.settings\.(validated|ellipsis|frame)/);
	});

	it('R5 rev48: list remove stays (non-default rows) + default row has no spacer element', async () => {
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		mockMints = [mintConfig(DEFAULT_URL, 'Default Mint'), mintConfig(MINT_A, 'Mint A'), mintConfig(MINT_B, 'Mint B')];
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.mint-name-row .bal-badge')).toBeTruthy();
		});

		// list shows DEFAULT (default) + B (custom); A is active (card, no remove)
		const rows = Array.from(container.querySelectorAll('.mint-list .list-item'));
		expect(rows.length).toBe(2);
		// non-default row B keeps its ghost remove (ลบใน list คง + handler เดิม)
		const rowB = rows.find((r) => r.textContent?.includes('Mint B'));
		expect(
			rowB?.querySelector('button[aria-label="mint.settings.remove ' + MINT_B + '"]')
		).not.toBeNull();
		// default row: no remove AND no spacer element (R5: แถว default ไม่ต้องจองที่)
		const rowDefault = rows.find((r) => r.textContent?.includes('Default Mint'));
		expect(rowDefault?.querySelector('button')).toBeNull();
		expect(rowDefault?.querySelector('.row-spacer')).toBeNull();
		expect(container.querySelector('.row-spacer')).toBeNull();
	});

	it('R3-4: validated preview long name keeps full value in title (DOM)', async () => {
		const LONG_NAME = 'Preview mint with a very long display name that must clip ' + 'v'.repeat(80);
		const LONG_URL = 'https://preview-long.example';
		(validateMintUrl as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			success: true,
			config: { ...mintConfig(LONG_URL, LONG_NAME), last_info_fetch: Date.now() },
			nuts: ['04']
		});
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.mint-name-row .bal-badge')).not.toBeNull();
		});

		await fireEvent.click(screen.getByText(/mint\.settings\.add/));
		const urlInput = container.querySelector('input[type="text"]') as HTMLInputElement;
		expect(urlInput).toBeTruthy();
		await fireEvent.input(urlInput, { target: { value: LONG_URL } });
		await fireEvent.click(screen.getByText('mint.settings.validate'));

		await waitFor(() => {
			expect(container.querySelector('.validated-name')?.getAttribute('title')).toBe(
				LONG_NAME
			);
		});
		// full text preserved in DOM (CSS ellipsis clips visually — source+built CSS proven in R3-2/proof)
		expect(container.querySelector('.validated-name')?.textContent).toContain(LONG_NAME);
	});

	it('R3-5: discover long name/url rows keep full values (DOM)', async () => {
		const LONG_D_NAME = 'Discover mint with an extremely long name ' + 'd'.repeat(80);
		const LONG_D_HOST = 'very-long-discover-hostname-that-keeps-going.example';
		const LONG_D_URL = 'https://' + LONG_D_HOST;
		(discoverMints as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
			{
				url: LONG_D_URL,
				name: LONG_D_NAME,
				icon_url: '',
				nuts: ['04'],
				network: '',
				reviewCount: 0,
				uniqueReviewers: 0,
				rating: null,
				ratingCount: 0,
				infoOk: true,
				relaysSeen: [],
				score: 0
			}
		]);
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.mint-name-row .bal-badge')).not.toBeNull();
		});

		await fireEvent.click(screen.getByText(/mint\.settings\.add/));
		// singleList แสดง top-N + more/less (R5) — กด Show more ให้แถวเราออกมา
		await waitFor(() => {
			expect(container.textContent).toContain('Discover Mints');
		});
		const moreBtn = screen.queryByText(/Show more/);
		if (moreBtn) await fireEvent.click(moreBtn);
		await waitFor(() => {
			expect(container.textContent).toContain(LONG_D_NAME);
		});

		const rows = Array.from(container.querySelectorAll('.discover-row'));
		const hit = rows.find((r) => r.textContent?.includes(LONG_D_NAME));
		expect(hit).not.toBeUndefined();
		// full name in aria-label (never lost to clipping)
		expect(hit?.getAttribute('aria-label')).toContain(LONG_D_NAME);
		// url row keeps full host text (CSS ellipsis clips visually)
		expect(hit?.querySelector('.discover-url')?.textContent).toContain(LONG_D_HOST);
		expect(hit?.querySelector('.discover-name')?.textContent).toContain(LONG_D_NAME);
	});
});

// R6 rev51: source-CSS proof — ลอก ListItem (setting) ตรงๆ + floor สุดท้ายหาย
import listItemSource from '$lib/components/ui/ListItem.svelte?raw';

function cssBlockIn(src: string, selector: string): string {
	const esc = selector.replace(/\./g, '\\.');
	const m = src.match(new RegExp('[^{}]*' + esc + '\\s*\\{[^}]*\\}'));
	return m?.[0] ?? '';
}

describe('TASK-4002 R6 rev51 (floor <390px — chrome คงที่หดได้ ลอก ListItem setting)', () => {
	beforeEach(async () => {
		resetMocks();
		localStorage.clear();
		proofSeq = 0;
		await clearProofs();
		await seedSpendableOnly();
	});

	afterEach(async () => {
		await clearProofs();
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it('R6-1: skeleton floor gone — min-width 3rem (rule) หาย, เหลือ min-width 0 + width 3rem + shrink 1', () => {
		// floor เดียวที่เหลือตาม Commander verbatim (<390px ไม่หด) คือ skeleton:
		// rule min-width: 3rem ต้องหายจากทั้งไฟล์ (คอมเมนต์ R6 เขียนแบบไม่มี colon
		// "min-width 3rem → 0" — อ้างชื่อได้อย่างเดียวเหมือน R5 row-spacer)
		expect(pageSource as string).not.toContain('min-width: 3rem');
		const sk = cssBlock('.bal-skeleton');
		expect(sk, '.bal-skeleton rule exists').not.toBe('');
		expect(sk).toContain('min-width: 0');
		expect(sk).toContain('width: 3rem');
		expect(sk).toContain('flex-shrink: 1');
		// sr-only ใน skeleton ถอดแล้ว (role=status+aria-label คง — abs-pos ดัน scroll +10px)
		expect(pageSource as string).not.toMatch(/bal-skeleton"[\s\S]{0,200}sr-only/);
	});

	it('R6-2: chrome คงที่หดได้ — logo 36/badge/bal-badge nowrap + trailing shrink-0 (ลอก ListItem)', () => {
		// อ้างอิงตรง: ListItem ตัวจริง — trailing shrink-0 + body min-width 0 +
		// gap md + padding sm md (ลอกค่านี้ ไม่ประดิษฐ์ใหม่)
		const liTrail = cssBlockIn(listItemSource as string, '.list-item-trailing');
		expect(liTrail).toContain('flex-shrink: 0');
		const liBody = cssBlockIn(listItemSource as string, '.list-item-body');
		expect(liBody).toContain('min-width: 0');
		const li = cssBlockIn(listItemSource as string, '.list-item');
		expect(li).toContain('gap: var(--space-md)');
		expect(li).toContain('padding: var(--space-sm) var(--space-md)');
		// ฝั่ง mint page: logo 36 + shrink-0 ทุกวง (card/list/discover/preview)
		for (const sel of ['.active-logo', '.active-fallback', '.mint-logo', '.mint-fallback']) {
			const b = cssBlock(sel);
			expect(b, sel + ' rule exists').not.toBe('');
			expect(b, sel + ' 36px').toContain('width: 36px');
			expect(b, sel + ' shrink-0').toContain('flex-shrink: 0');
		}
		// Badge active + bal-badge: nowrap ไม่ตัดกลาง + shrink-0 ไม่โดนบีบ
		expect(cssBlock('.bal-badge')).toContain('white-space: nowrap');
		expect(cssBlock('.bal-badge')).toContain('flex-shrink: 0');
		// chrome ขวา: active-side + list trailing คงที่เหมือน ListItem trailing
		expect(cssBlock('.active-side')).toContain('flex-shrink: 0');
		expect(cssBlock('.mint-actions')).toContain('flex-shrink: 0');
	});

	it('R6-3: text chain ทุกจุด min-width 0 + ellipsis + max-width 100% (320px ไม่ล้นขวา)', () => {
		for (const sel of ['.active-id', '.active-mint-text', '.mint-name-row', '.row-top']) {
			const b = cssBlock(sel);
			expect(b, sel + ' rule exists').not.toBe('');
			expect(b, sel + ' min-width 0').toContain('min-width: 0');
		}
		// row รับ badge: max-width 100% + overflow hidden (R6 เติมให้ mint-name-row ลอก R3)
		expect(cssBlock('.mint-name-row')).toContain('max-width: 100%');
		expect(cssBlock('.row-top')).toContain('max-width: 100%');
		// ปลาย chain เดิม (R3-2) ยังครบ — ชื่อ/url ตัดขวา ไม่ดัน
		for (const sel of ['.mint-name', '.mint-url', '.row-url']) {
			const b = cssBlock(sel);
			expect(b, sel + ' ellipsis').toContain('text-overflow: ellipsis');
			expect(b, sel + ' nowrap').toContain('white-space: nowrap');
		}
	});

	it('R6-4: DOM — ชื่อยาว active card + list row ค่าเต็มใน title, badge อยู่ row เดียวกับชื่อ', async () => {
		const LONG = 'Mint ยาวมากที่ต้องหดตาม viewport ' + 'ก'.repeat(100);
		const LONG_URL = 'https://very-long-mint-hostname-that-keeps-going.example/cashu';
		localStorage.setItem('lnwcash_active_mint', MINT_A);
		mockMints = [mintConfig(DEFAULT_URL, 'Default Mint'), mintConfig(MINT_A, LONG), mintConfig(LONG_URL, LONG)];
		const { container } = render(MintSettings);

		await waitFor(() => {
			expect(container.querySelector('.mint-name-row .bal-badge')).not.toBeNull();
		});

		// active card: ชื่อเต็มใน title + badge อยู่ row เดียวกับ h2
		const cardName = container.querySelector('.active-head .mint-name');
		expect(cardName?.getAttribute('title')).toBe(LONG);
		expect(cardName?.closest('.mint-name-row')?.querySelector('.bal-badge')).not.toBeNull();
		expect(container.querySelector('.active-head .mint-url')?.getAttribute('title')).toBe(MINT_A);
		// list row: ชื่อเต็มใน title + url เต็มใน title + badge อยู่ .row-top เดียวกัน
		// (active = MINT_A แล้ว — แถวในลิสต์คือ Default + LONG_URL: หาแถว LONG_URL ตรงๆ)
		const longRow = Array.from(container.querySelectorAll('.mint-list .list-item')).find((r) =>
			r.querySelector('.row-url')?.getAttribute('title') === LONG_URL
		);
		expect(longRow, 'LONG_URL row exists in list').not.toBeUndefined();
		const rowName = longRow?.querySelector('.row-name');
		expect(rowName?.getAttribute('title')).toBe(LONG);
		expect(rowName?.closest('.row-top')?.querySelector('.bal-badge')).not.toBeNull();
		expect(longRow?.querySelector('.row-url')?.getAttribute('title')).toBe(LONG_URL);
	});

	it('R6-6: column floor 3 จุด (ราก <390px ไม่หด — chromium พิสูจน์): settings/list-item/card หดได้', () => {
		// กลไก: flex item ที่เป็น column (min-width auto) หดต่ำกว่า min-content ไม่ได้ —
		// ชื่อยาว nowrap ดันทั้งการ์ด 1747px (docScrollW จริงก่อนแก้) ต้อง min-width 0 ทุกชั้น
		expect(cssBlock('.mint-settings')).toContain('min-width: 0');
		// margin auto ฆ่า stretch (column item กว้างเท่า max-content — doc 1763px) — ต้องไม่มี auto
		expect(cssBlock('.mint-settings')).not.toContain('margin: 0 auto');
		// card/list/add-section (column items ของ .mint-settings) — Card shared ไม่แตะ ใช้ :global
		expect(pageSource as string).toContain('.mint-settings > :global(.card)');
		expect(cssBlock('.add-mint-section')).toContain('min-width: 0');
		// .mint-list อยู่ใน selector รวม (card/list/add-section) — ยืนยันผ่าน block รวม
		const colFloor =
			(pageSource as string).match(/\.mint-settings > :global\(\.card\),[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
		expect(colFloor).toContain('.mint-list');
		expect(colFloor).toContain('min-width: 0');
		// list-item (column item ของ .mint-list) — ListItem.svelte ไม่แตะ ใช้ :global เดิม
		// (มี 2 rules: border เดิม + min-width 0 ใหม่ — ต้องมีอย่างน้อย 1 block ที่มี)
		const liBlocks = Array.from(
			(pageSource as string).matchAll(/[^{}]*\.mint-list :global\(\.list-item\)\s*\{[^}]*\}/g)
		).map((m) => m[0]);
		expect(liBlocks.length).toBeGreaterThan(0);
		expect(liBlocks.some((b) => b.includes('min-width: 0'))).toBe(true);
	});

	it('R6-5: 4 คอมโบ TH/EN×light/dark — key ใหม่ 0 + hex ใหม่ 0 (R6 แตะแค่ CSS)', () => {
		const keys = Array.from((pageSource as string).matchAll(/\$_\('([^']*)'\)/g)).map((m) => m[1]);
		expect(keys.length).toBeGreaterThan(0);
		const allowed = new Set([
			'common.cancel',
			'common.error',
			'common.loading',
			'mint.settings.active',
			'mint.settings.add',
			'mint.settings.addMint',
			'mint.settings.empty',
			'mint.settings.remove',
			'mint.settings.supportedNuts',
			'mint.settings.title',
			'mint.settings.url',
			'mint.settings.validate',
			'mint.settings.validating',
			'mint.settings.version',
			'screen.balance.online',
			'screen.balance.refresh',
			'screen.balance.sats'
		]);
		for (const k of keys) expect(allowed.has(k), 'unexpected i18n key: ' + k).toBe(true);
		expect(pageSource as string).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	});
});
