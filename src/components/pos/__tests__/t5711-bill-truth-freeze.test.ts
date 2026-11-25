/**
 * TASK-5711 — bill/history/summary สูตรใหม่ truth-currency
 * (INTENT-057 BLUEPRINT v3: bill ตามสูตรใหม่ 5710 domain + 5702 Manage).
 * Run scoped ONLY (L-P033 — never bare vitest).
 *
 * - 5711-1 live bill: fiat row shows truth + live sats from ONE bill entry
 *   (buildBill agreement — same rate for the whole bill, fiatToSats only).
 * - 5711-2 freeze: history/success render the stored snapshot verbatim
 *   (fiat text + frozen totals) and import NOTHING from fiat/* (no recompute).
 * - 5711-3 offline banner: RATE_UNAVAILABLE → banner + BOTH charge buttons
 *   blocked, never invented; SAT-only still bills rateless (PosApp level).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import PosBill from '../PosBill.svelte';
import PosHistory from '../PosHistory.svelte';
import PosSuccess from '../PosSuccess.svelte';
import PosApp from '../PosApp.svelte';
import type { BillLine } from '$lib/pos/cart';
import type { SaleRecord } from '$lib/pos/sales-log';
import { emptyCart, addToCart, buildBill } from '$lib/pos/cart';
import { setPosCatalog } from '$lib/storage/local';
import { emptyCatalog, addProduct } from '$lib/pos/catalog';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

const PRICE = 3_000_000; // THB/BTC — 1 sat = 0.03 THB
const entryOf = (price: number | null) => ({
	price,
	asOf: Date.now(),
	where: 'cache' as const,
	stale: false,
	expired: false
});
const leftFor = (sats: number) => `${((sats * PRICE) / 100_000_000).toFixed(2)} THB`;
const rightFor = (sats: number) => `≈ ${leftFor(sats)}`;

function here(): string {
	return dirname(fileURLToPath(import.meta.url));
}
function srcOf(name: string): string {
	return readFileSync(resolve(here(), `../${name}.svelte`), 'utf8');
}

function billProps(over: Record<string, unknown> = {}) {
	return {
		lines: [] as BillLine[],
		totalSat: 0,
		fiatText: '',
		fiatLeftFor: leftFor,
		fiatRightFor: rightFor,
		onInc: vi.fn(),
		onDec: vi.fn(),
		onChargeLn: vi.fn(),
		onChargeCashu: vi.fn(),
		onBack: vi.fn(),
		...over
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

afterEach(() => cleanup());

// ─── 5711-1 live bill: truth + live sats, one entry for the whole bill ───

describe('5711-1 live bill rows (truth + live sats, single entry)', () => {
	it('fiat row shows the set price + live sats resolved by buildBill (same entry)', () => {
		let c = emptyCart();
		const tea = { id: 'tea', name: 'Thai Tea', currency: 'SAT' as const, amount: 2100, active: true };
		const cake = { id: 'cake', name: 'Cake', currency: 'THB' as const, amount: 100, active: true };
		const r1 = addToCart(c, tea, 1);
		expect(r1.ok).toBe(true);
		if (r1.ok) c = r1.value;
		const r2 = addToCart(c, cake, 1);
		expect(r2.ok).toBe(true);
		if (r2.ok) c = r2.value;
		const b = buildBill(c, { currency: 'THB', entry: entryOf(PRICE) });
		expect(b.ok).toBe(true);
		if (!b.ok) return;
		// single entry: SAT row untouched by rate, fiat row via fiatToSats floor
		const teaRow = b.value.lines.find((l) => l.productId === 'tea')!;
		const cakeRow = b.value.lines.find((l) => l.productId === 'cake')!;
		expect(teaRow.unitSats).toBe(2100);
		expect(teaRow.rate).toBeNull();
		expect(cakeRow.rate).toBe(PRICE);
		render(PosBill, {
			props: billProps({
				lines: b.value.lines,
				totalSat: b.value.totalSat,
				fiatText: b.value.fiat.text
			})
		});
		const subs = screen.getAllByTestId('bill-line');
		expect(subs).toHaveLength(2);
		// SAT row: sats verbatim (truth == sats, no rate leg)
		expect(subs[0].textContent).toContain('2,100 SAT');
		// fiat row: set price prefix + live sats in parens (same entry)
		const cakeText = subs[1].textContent ?? '';
		expect(cakeText).toContain('100');
		expect(cakeText).toContain('THB');
		expect(cakeText).toContain(`${cakeRow.unitSats.toLocaleString('en-US')} SAT`);
		expect(screen.getByTestId('bill-total-amount').textContent).toBe(
			b.value.totalSat.toLocaleString('en-US')
		);
	});

	it('no banner + charge enabled when the live bill resolves', () => {
		let c = emptyCart();
		const r = addToCart(c, { id: 't', name: 'T', currency: 'SAT', amount: 9, active: true }, 1);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		c = r.value;
		const b = buildBill(c, { currency: 'THB', entry: entryOf(PRICE) });
		expect(b.ok).toBe(true);
		if (!b.ok) return;
		render(PosBill, { props: billProps({ lines: b.value.lines, totalSat: b.value.totalSat, fiatText: b.value.fiat.text }) });
		expect(screen.queryByTestId('bill-rate-banner')).toBeNull();
		expect((screen.getByTestId('bill-charge-ln') as HTMLButtonElement).disabled).toBe(false);
		expect((screen.getByTestId('bill-charge-cashu') as HTMLButtonElement).disabled).toBe(false);
	});
});

// ─── 5711-2 freeze: history/success read the snapshot, never recompute ───

function frozenSale(over: Partial<SaleRecord> = {}): SaleRecord {
	return {
		id: 'sale_frozen_1',
		createdAtIso: '2026-11-10T10:00:00.000+07:00',
		createdAtMs: new Date(2026, 10, 10, 10, 0, 0).getTime(),
		totalSat: 6300,
		fiat: { currency: 'THB', pricePerBtc: 3000000, amount: 189, text: '189.00 THB' },
		method: 'lightning',
		refId: 'mint-q9',
		lines: [
			{
				productId: 'latte',
				name: 'Latte',
				currency: 'SAT',
				amount: 2100,
				unitSats: 2100,
				qty: 3,
				lineTotalSat: 6300,
				rate: null,
				lineId: 'latte',
				modifier: '',
				modifierLabel: '',
				note: ''
			}
		],
		...over
	};
}

function historyProps(over: Record<string, unknown> = {}) {
	return {
		sales: [frozenSale()],
		filter: 'all' as const,
		onFilter: vi.fn(),
		todayLabel: 'Today',
		todayCount: 1,
		todayTotalSat: 6300,
		todayLn: 6300,
		todayCashu: 0,
		onBack: vi.fn(),
		...over
	};
}

describe('5711-2 freeze (history/success read the snapshot)', () => {
	it('history row shows frozen total + frozen fiat text verbatim', () => {
		render(PosHistory, { props: historyProps() });
		expect(screen.getAllByTestId('history-row')).toHaveLength(1);
		expect(screen.getByTestId('history-fiat').textContent).toBe('189.00 THB');
	});

	it('legacy bill row (pre-v3 stored-sats shape, normalized) keeps its total', () => {
		// What normalizeSaleLine produces for a pre-v3 row with
		// unitPriceSat=400 ×2: SAT freeze { amount 400, unitSats 400 }.
		const legacy = frozenSale({
			id: 'sale_legacy_1',
			totalSat: 800,
			fiat: { currency: 'THB', pricePerBtc: null, amount: null, text: '' },
			method: 'cashu',
			refId: 'cashu:1:800',
			lines: [
				{
					productId: 'old',
					name: 'Old item',
					currency: 'SAT',
					amount: 400,
					unitSats: 400,
					qty: 2,
					lineTotalSat: 800,
					rate: null,
					lineId: 'old',
					modifier: '',
					modifierLabel: '',
					note: ''
				}
			]
		});
		render(PosHistory, { props: historyProps({ sales: [legacy] }) });
		expect(screen.getAllByTestId('history-row')).toHaveLength(1);
		expect(screen.getAllByTestId('history-row')[0].textContent).toContain('800 SAT');
		// no fiat snapshot on the legacy row → no fiat div (never invented)
		expect(screen.queryByTestId('history-fiat')).toBeNull();
	});

	it('success screen shows frozen total + frozen fiat (no recompute)', () => {
		const sale = frozenSale();
		render(PosSuccess, {
			props: {
				sale,
				filter: 'all' as const,
				onFilter: vi.fn(),
				todayCount: 1,
				todayTotalSat: 6300,
				visibleSales: [sale],
				onNewSale: vi.fn(),
				onBack: vi.fn()
			}
		});
		expect(screen.getByTestId('success-amount').textContent).toContain('6,300');
		expect(screen.getByTestId('success-fiat').textContent).toBe('189.00 THB');
		expect(screen.getByTestId('success-row-fiat').textContent).toBe('189.00 THB');
	});

	it('history/success import NOTHING from fiat/* (freeze is structural)', () => {
		for (const name of ['PosHistory', 'PosSuccess']) {
			const src = srcOf(name);
			expect(src, `${name} must not recompute fiat`).not.toContain('lib/fiat/');
		}
	});
});

// ─── 5711-3 offline banner: block fiat, never invent; SAT-only sells ───

describe('5711-3 offline banner (RATE_UNAVAILABLE blocks fiat)', () => {
	it('banner shows + BOTH charge buttons disabled (component level)', () => {
		render(PosBill, { props: billProps({ rateUnavailable: true }) });
		expect(screen.getByTestId('bill-rate-banner')).toBeTruthy();
		expect((screen.getByTestId('bill-charge-ln') as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByTestId('bill-charge-cashu') as HTMLButtonElement).disabled).toBe(true);
	});

	it('PosApp: SAT-only cart + dead rate → NO banner, bill works (rateless)', async () => {
		render(PosApp, {
			props: {
				getRate: async () => ({ price: null, currency: 'THB' as const }),
				createQuote: async () => ({ quoteId: 'q', invoice: 'lnbc1test' }),
				getQuoteState: async () => 'UNPAID',
				completeLn: async () => 'q',
				receiveToken: async () => 0,
				pollIntervalMs: 5
			}
		});
		// seeded SAT catalog (Thai Tea 2100, no presets) -- R10 rev23:
		// tap opens the note-only popup (no chips), bare Add -> cart
		await fireEvent.click(screen.getAllByTestId('catalog-row')[0]);
		expect(screen.getByTestId('modifier-popup')).toBeTruthy();
		expect(screen.queryAllByTestId('modifier-chip')).toHaveLength(0);
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(screen.queryByTestId('modifier-popup')).toBeNull();
		await fireEvent.click(screen.getByTestId('catalog-bill'));
		expect(screen.queryByTestId('bill-rate-banner')).toBeNull();
		expect(screen.getByTestId('bill-total-amount').textContent).toContain('2,100');
		expect((screen.getByTestId('bill-charge-ln') as HTMLButtonElement).disabled).toBe(false);
	});

	it('PosApp: fiat cart + dead rate → banner + blocked, nothing invented', async () => {
		let d = emptyCatalog(Date.now());
		const r = addProduct(
			d,
			{ id: 'thb-tea', name: 'THB Tea', currency: 'THB', amount: 100, kind: 'drink', active: true },
			Date.now()
		);
		expect(r.ok).toBe(true);
		if (r.ok) setPosCatalog(r.value);
		render(PosApp, {
			props: {
				getRate: async () => ({ price: null, currency: 'THB' as const }),
				createQuote: async () => ({ quoteId: 'q', invoice: 'lnbc1test' }),
				getQuoteState: async () => 'UNPAID',
				completeLn: async () => 'q',
				receiveToken: async () => 0,
				pollIntervalMs: 5
			}
		});
		// R10 rev23: preset-less product -- tap opens note-only popup
		await fireEvent.click(screen.getAllByTestId('catalog-row')[0]);
		expect(screen.getByTestId('modifier-popup')).toBeTruthy();
		expect(screen.queryAllByTestId('modifier-chip')).toHaveLength(0);
		await fireEvent.click(screen.getByTestId('popup-add'));
		expect(screen.queryByTestId('modifier-popup')).toBeNull();
		await fireEvent.click(screen.getByTestId('catalog-bill'));
		expect(screen.getByTestId('bill-rate-banner')).toBeTruthy();
		expect((screen.getByTestId('bill-charge-ln') as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByTestId('bill-charge-cashu') as HTMLButtonElement).disabled).toBe(true);
		// blocked bill shows no invented total
		expect(screen.getByTestId('bill-total-amount').textContent).toBe('0');
	});
});
