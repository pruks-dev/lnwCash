/**
 * TASK-5405 (INTENT-054, HISTORY-SUMMARY) — paid-success screen (#/pos follow-up).
 *
 * Covers (display-only: the record arrives already persisted via recordSale):
 *   - renders total SAT + method label + device-local time + ref id.
 *   - back button returns to pos; history button goes to pos-history.
 *   - lightning vs cashu labels resolve per method.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PosSuccess from '../../components/PosSuccess.svelte';
import type { SaleRecord } from '$lib/pos/sales-log';
import { formatDeviceDateTime } from '$lib/pos/record-sale';
import { navigateTo } from '$lib/router';

vi.mock('svelte-i18n', () => {
	const store = {
		subscribe(fn: (val: (key: string) => string) => void) {
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

function sale(over: Partial<SaleRecord> = {}): SaleRecord {
	return {
		id: 'sale_1790000000000_fix001',
		createdAtIso: '2026-09-17T12:00:00.000+07:00',
		createdAtMs: new Date(2026, 10, 10, 9, 30, 0, 0).getTime(),
		totalSat: 2200,
		fiat: { currency: 'THB', pricePerBtc: 1_700_000, amount: 0.0374, text: '0.04 THB' },
		method: 'cashu',
		refId: 'token_abc123',
		lines: [{ productId: 'p1', name: 'Thai Tea', unitPriceSat: 1100, qty: 2, lineTotalSat: 2200 }],
		...over
	};
}

describe('TASK-5405 paid-success screen', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	afterEach(() => { cleanup(); });

	it('renders total + method + device time + ref (cashu)', () => {
		const s = sale();
		render(PosSuccess, { sale: s });
		// TASK-5411 R5: pos.success.title now appears twice (heading + Paid
		// pill) and the method key twice (pill + facts row).
		expect(screen.getAllByText('pos.success.title').length).toBe(2);
		expect(screen.getByText(`2200 screen.balance.sats`)).toBeTruthy();
		expect(screen.getAllByText('pos.method_cashu').length).toBe(2);
		expect(screen.getByText(formatDeviceDateTime(s.createdAtMs))).toBeTruthy();
		expect(screen.getByText('token_abc123')).toBeTruthy();
	});

	it('ships R5 status pills: Paid (pill-ok) + method (pill-cashu/ln)', () => {
		const { container } = render(PosSuccess, { sale: sale() });
		const pills = container.querySelectorAll('.status-pills .pill');
		expect(pills.length).toBe(2);
		expect(pills[0].className).toContain('pill-ok');
		expect(pills[1].className).toContain('pill-cashu');
		const { container: ln } = render(PosSuccess, {
			sale: sale({ method: 'lightning', refId: 'lnbc_xyz' })
		});
		const lnPills = ln.querySelectorAll('.status-pills .pill');
		expect(lnPills[1].className).toContain('pill-ln');
	});

	it('resolves the lightning method label', () => {
		render(PosSuccess, { sale: sale({ method: 'lightning', refId: 'lnbc_xyz' }) });
		expect(screen.getAllByText('pos.method_lightning').length).toBeGreaterThan(0);
		expect(screen.queryByText('pos.method_cashu')).toBeNull();
	});

	it('back → pos, history → pos-history (5402 routes untouched)', async () => {
		render(PosSuccess, { sale: sale() });
		await fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
		expect(navigateTo).toHaveBeenCalledWith('pos');
		await fireEvent.click(screen.getByRole('button', { name: 'pos.history_link' }));
		expect(navigateTo).toHaveBeenCalledWith('pos-history');
	});
});
