/**
 * TASK-5462 rev47 history_badge_r47 — NEW scoped tests (all fresh, no reuse).
 *
 * PoS history badge = wallet History tx-protocol-badge เต็ม
 * (Lightning/Cashu สี/ไซส์ xs) — short LN pill REMOVED.
 * Covers BOTH PoS history surfaces:
 *   A. R5 component  src/components/pos/PosHistory.svelte (pill → badge)
 *   B. screen        src/screens/PosHistory.svelte (method text → badge)
 *   C. CSS parity    verbatim vs src/screens/History.svelte (read-only reuse)
 *   D. i18n pins     screen.history.protocol_* only (no invented keys)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import R5PosHistory from '../PosHistory.svelte';
import ScreenPosHistory from '../../../screens/PosHistory.svelte';
import type { SaleRecord } from '$lib/pos/sales-log';
import { formatDeviceDateTime } from '$lib/pos/record-sale';
import { navigateTo } from '$lib/router';
import { getPosSales } from '$lib/storage/local';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string, opts?: unknown) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	};
	return {
		_: store,
		locale: {
			subscribe(fn: (val: string) => void) { fn('en'); return () => {}; },
			set() {}
		},
		init() {}, register() {},
		getLocaleFromNavigator: () => 'en'
	};
});

vi.mock('$lib/router', () => ({
	navigateTo: vi.fn()
}));

vi.mock('$lib/storage/local', () => ({
	getPosSales: vi.fn(() => [] as SaleRecord[])
}));

// ─── source-text helpers (parity = verbatim reuse, not fork) ───
const R5 = 'src/components/pos/PosHistory.svelte';
const SCR = 'src/screens/PosHistory.svelte';
const WALLET = 'src/screens/History.svelte';

function read(p: string): string {
	return fs.readFileSync(path.resolve(p), 'utf8');
}
/** strip HTML + CSS comments so rev notes can't false-positive */
function codeOf(src: string): string {
	return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
function styleOf(src: string): string {
	const m = codeOf(src).match(/<style>([\s\S]*)<\/style>/);
	return m ? m[1] : '';
}
function markupOf(src: string): string {
	return codeOf(src).replace(/<style>[\s\S]*<\/style>/, '').replace(/<script[\s\S]*?<\/script>/, '');
}

function mkSale(
	id: string,
	ms: number,
	method: SaleRecord['method'],
	totalSat: number,
	refId: string
): SaleRecord {
	return {
		id,
		createdAtIso: 'device-local',
		createdAtMs: ms,
		totalSat,
		fiat: { currency: 'THB', pricePerBtc: 1_700_000, amount: null, text: '' },
		method,
		refId,
		lines: [{ productId: 'p1', name: 'Thai Tea', unitPriceSat: totalSat, qty: 1, lineTotalSat: totalSat }]
	};
}

const LN_MS = new Date(2026, 10, 10, 10, 0, 0, 0).getTime();
const CASHU_MS = new Date(2026, 10, 10, 11, 30, 0, 0).getTime();

function r5Props(over: Record<string, unknown> = {}) {
	return {
		sales: [mkSale('sale-ln', LN_MS, 'lightning', 7700, 'mint-q1'), mkSale('sale-cashu', CASHU_MS, 'cashu', 1500, 'cashu:1:1500')],
		filter: 'all' as const,
		onFilter: vi.fn(),
		todayLabel: 'Today',
		todayCount: 2,
		todayTotalSat: 9200,
		todayLn: 7700,
		todayCashu: 1500,
		onBack: vi.fn(),
		onWalletLink: vi.fn(),
		...over
	};
}

describe('TASK-5462 rev47 history-badge (NEW)', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	// ─── A. R5 component: full wallet badge, short pill gone ───
	it('a-1: LN row = tx-protocol-badge protocol-lightning (FULL key, not LN)', () => {
		const { container } = render(R5PosHistory, { props: r5Props() });
		const rows = screen.getAllByTestId('history-row');
		expect(rows).toHaveLength(2);
		const lnBadge = rows[0].querySelector('.tx-protocol-badge.protocol-lightning');
		expect(lnBadge).toBeTruthy();
		expect(lnBadge!.textContent).toContain('screen.history.protocol_lightning');
		expect(container.querySelector('.pill-ln')).toBeNull();
	});

	it('a-2: Cashu row = tx-protocol-badge protocol-cashu (FULL key)', () => {
		render(R5PosHistory, { props: r5Props() });
		const rows = screen.getAllByTestId('history-row');
		const cashuBadge = rows[1].querySelector('.tx-protocol-badge.protocol-cashu');
		expect(cashuBadge).toBeTruthy();
		expect(cashuBadge!.textContent).toContain('screen.history.protocol_cashu');
		expect(rows[1].querySelector('.pill-cashu')).toBeNull();
	});

	it('a-3: NO short pill anywhere (no .pill*, no bare LN text node)', () => {
		const { container } = render(R5PosHistory, { props: r5Props() });
		expect(container.querySelector('.pill')).toBeNull();
		expect(container.querySelector('.pill-ln')).toBeNull();
		expect(container.querySelector('.pill-cashu')).toBeNull();
		const badges = screen.getAllByTestId('history-protocol-badge');
		expect(badges).toHaveLength(2);
		for (const b of badges) {
			expect(b.textContent!.trim()).not.toBe('LN');
			expect(b.className).toContain('tx-protocol-badge');
		}
	});

	it('a-4: rows keep amount + device-local time + ref + wallet link-by-id', async () => {
		const p = r5Props();
		render(R5PosHistory, { props: p });
		const rows = screen.getAllByTestId('history-row');
		expect(rows[0].textContent).toContain('7,700 SAT');
		expect(rows[0].textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
		expect(rows[0].textContent).not.toContain('Z');
		expect(rows[0].textContent).toContain('mint-q1');
		expect(rows[1].textContent).toContain('cashu:1:1500');
		const links = screen.getAllByTestId('history-wallet-link');
		expect(links).toHaveLength(2);
		await fireEvent.click(links[0]);
		expect(p.onWalletLink).toHaveBeenCalledWith('mint-q1');
	});

	// ─── B. #/pos-history screen: method text → full wallet badge ───
	it('b-1: sale rows show FULL badges (lightning + cashu), no pos.method_* keys', () => {
		vi.mocked(getPosSales).mockReturnValue([
			mkSale('sale-b-ln', LN_MS, 'lightning', 2000, 'lnbc_b'),
			mkSale('sale-b-cashu', CASHU_MS, 'cashu', 1000, 'token_a')
		]);
		const { container } = render(ScreenPosHistory, {});
		const ln = container.querySelector('.tx-protocol-badge.protocol-lightning');
		const cashu = container.querySelector('.tx-protocol-badge.protocol-cashu');
		expect(ln).toBeTruthy();
		expect(cashu).toBeTruthy();
		expect(ln!.textContent).toContain('screen.history.protocol_lightning');
		expect(cashu!.textContent).toContain('screen.history.protocol_cashu');
		// invented-key era is over: no raw pos.method_* text anywhere
		expect(container.textContent).not.toContain('pos.method_lightning');
		expect(container.textContent).not.toContain('pos.method_cashu');
	});

	it('b-2: rows keep device-local datetime + ref + wallet link → history', async () => {
		vi.mocked(getPosSales).mockReturnValue([mkSale('sale-w', LN_MS, 'lightning', 700, 'lnbc_w')]);
		const { container } = render(ScreenPosHistory, {});
		expect(container.textContent).toContain(formatDeviceDateTime(LN_MS));
		expect(screen.getByText('pos.history.ref: lnbc_w')).toBeTruthy();
		const links = screen.getAllByRole('button', { name: 'pos.history.wallet_link' });
		expect(links.length).toBe(1);
		await fireEvent.click(links[0]);
		expect(navigateTo).toHaveBeenCalledWith('history');
	});

	it('b-3: empty log keeps the 5402 empty state (no badge rendered)', () => {
		vi.mocked(getPosSales).mockReturnValue([]);
		const { container } = render(ScreenPosHistory, {});
		expect(screen.getByText('pos.history.empty')).toBeTruthy();
		expect(container.querySelector('.tx-protocol-badge')).toBeNull();
	});

	// ─── C. CSS parity: verbatim wallet values, no fork ───
	it('c-1: R5 style carries the wallet badge declarations verbatim', () => {
		const wallet = styleOf(read(WALLET));
		const r5 = styleOf(read(R5));
		const needles = [
			'background: rgba(0, 188, 212, 0.25)',
			'color: var(--color-primary);',
			'background: rgba(124, 58, 237, 0.22)',
			'background: rgba(38, 198, 218, 0.18)',
			'color: var(--color-primary-light);',
			'background: rgba(183, 148, 244, 0.18)',
			'color: var(--color-protocol-lightning);',
			'font-size: var(--font-size-xs);',
			'padding: 1px 6px;',
			'border-radius: var(--radius-sm);'
		];
		for (const n of needles) {
			expect(wallet).toContain(n);
			expect(r5).toContain(n);
		}
		expect(r5).not.toContain('.pill-ln');
		expect(r5).not.toContain('.pill-cashu');
	});

	it('c-2: screen style carries the wallet badge declarations verbatim', () => {
		const wallet = styleOf(read(WALLET));
		const scr = styleOf(read(SCR));
		const needles = [
			'.tx-protocol-badge.protocol-lightning',
			'.tx-protocol-badge.protocol-cashu',
			'background: rgba(0, 188, 212, 0.25)',
			'background: rgba(124, 58, 237, 0.22)',
			'background: rgba(38, 198, 218, 0.18)',
			'background: rgba(183, 148, 244, 0.18)',
			'font-size: var(--font-size-xs);',
			'padding: 1px 6px;',
			'border-radius: var(--radius-sm);'
		];
		for (const n of needles) {
			expect(wallet).toContain(n);
			expect(scr).toContain(n);
		}
	});

	it('c-3: markup uses badge classes + pinned keys only (no LN short, no invented keys)', () => {
		for (const p of [R5, SCR]) {
			const m = markupOf(read(p));
			expect(m).toContain('tx-protocol-badge');
			expect(m).toContain('screen.history.protocol_lightning');
			expect(m).toContain('screen.history.protocol_cashu');
			expect(m).not.toContain('pill-ln');
			expect(m).not.toContain('pos.method_lightning');
			expect(m).not.toContain('pos.method_cashu');
		}
		// short-LN text node is gone from R5 markup (comment stripped before match)
		expect(markupOf(read(R5))).not.toContain('>LN<');
	});

	// ─── D. i18n pins exist (TH + EN), PoS invents nothing ───
	it('d-1: protocol pins resolve to full names in TH + EN', () => {
		for (const f of ['src/locales/th.json', 'src/locales/en.json']) {
			const loc = JSON.parse(read(f));
			expect(loc['screen.history.protocol_lightning']).toBe('Lightning');
			expect(loc['screen.history.protocol_cashu']).toBe('Cashu');
		}
	});
});
