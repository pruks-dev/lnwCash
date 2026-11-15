/**
 * TASK-5417 R5-only — NEW test (no reuse of 5402..5415 suites).
 * S5 success + S6 history: composite §B S5 + landscape S5-land.
 * - Success: Paid pill + method pill, 48px amount, txRef + persisted-FIRST note,
 *   New sale (DEV-6 fix), tab-bar All/Lightning/Cashu (DEV-7 fix), Today card
 * - History: Today card (count/total/method split) + tabs + rows
 *   (amount + device-local time + method pill + ref) + wallet link-by-id
 *   + empty state; NO wallet-store imports in the render path
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PosSuccess from '../PosSuccess.svelte';
import PosHistory from '../PosHistory.svelte';
import type { SaleRecord } from '$lib/pos/sales-log';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

const saleLn: SaleRecord = {
	id: 'sale_1',
	createdAtIso: '2026-11-10T10:00:00.000+07:00',
	createdAtMs: new Date(2026, 10, 10, 10, 0, 0).getTime(),
	totalSat: 7700,
	fiat: { currency: 'THB', pricePerBtc: 3000000, amount: 231, text: '231.00 THB' },
	method: 'lightning',
	refId: 'mint-q1',
	lines: []
};
const saleCashu: SaleRecord = { ...saleLn, id: 'sale_2', method: 'cashu', refId: 'cashu:1:7700' };

afterEach(() => cleanup());

describe('R5 S5 success (DEV-6 + DEV-7 fixes)', () => {
	function successProps(over: Record<string, unknown> = {}) {
		return {
			sale: saleLn,
			filter: 'all' as const,
			onFilter: vi.fn(),
			todayCount: 1,
			todayTotalSat: 7700,
			visibleSales: [saleLn],
			onNewSale: vi.fn(),
			onBack: vi.fn(),
			...over
		};
	}

	it('Paid pill + LN method pill above 48px amount (F3 carries forward)', () => {
		const { container } = render(PosSuccess, { props: successProps() });
		expect(screen.getByTestId('success-paid-pill').textContent).toContain('pos.success.title');
		expect(screen.getByTestId('success-method-pill').textContent).toContain('pos.success.method_lightning');
		expect(screen.getByTestId('success-amount').textContent).toContain('7,700');
		expect(screen.getByTestId('success-amount').className).toContain('amount-value');
		expect(container.querySelector('.pill-ok')).toBeTruthy();
		expect(container.querySelector('.pill-ln')).toBeTruthy();
		// 48px comes from .amount-value in <style>; static proof in mockup-compare-R5-only.md
	});

	it('Cashu method pill variant', () => {
		render(PosSuccess, { props: successProps({ sale: saleCashu }) });
		expect(screen.getByTestId('success-method-pill').textContent).toContain('pos.success.method_cashu');
	});

	it('txRef + persisted-FIRST note', () => {
		render(PosSuccess, { props: successProps() });
		expect(screen.getByTestId('success-ref').textContent).toContain('mint-q1');
		expect(screen.getByTestId('success-ref').textContent).toContain('persisted FIRST');
	});

	it('New sale button (DEV-6 fix — not Back-to-bill)', async () => {
		const p = successProps();
		render(PosSuccess, { props: p });
		expect(screen.getByTestId('success-new-sale').textContent).toContain('pos.success.new_sale');
		await fireEvent.click(screen.getByTestId('success-new-sale'));
		expect(p.onNewSale).toHaveBeenCalledTimes(1);
	});

	it('filter tabs All/Lightning/Cashu ON Success (DEV-7 fix)', async () => {
		const p = successProps();
		render(PosSuccess, { props: p });
		expect(screen.getByTestId('success-tabs')).toBeTruthy();
		await fireEvent.click(screen.getByTestId('filter-cashu'));
		expect(p.onFilter).toHaveBeenCalledWith('cashu');
		await fireEvent.click(screen.getByTestId('filter-lightning'));
		expect(p.onFilter).toHaveBeenCalledWith('lightning');
	});

	it('Today card with count + total', () => {
		render(PosSuccess, { props: successProps() });
		expect(screen.getByTestId('success-today')).toBeTruthy();
		expect(screen.getByTestId('success-today-total').textContent).toContain('7,700 SAT total');
	});
});

describe('R5 S6 history/summary', () => {
	function historyProps(over: Record<string, unknown> = {}) {
		return {
			sales: [saleLn, saleCashu],
			filter: 'all' as const,
			onFilter: vi.fn(),
			todayLabel: 'Today',
			todayCount: 2,
			todayTotalSat: 15400,
			todayLn: 7700,
			todayCashu: 7700,
			onBack: vi.fn(),
			onWalletLink: vi.fn(),
			...over
		};
	}

	it('Today card + rows with method pills + refs + device-local time', () => {
		render(PosHistory, { props: historyProps() });
		expect(screen.getByTestId('history-today-total').textContent).toContain('15,400 SAT total');
		const rows = screen.getAllByTestId('history-row');
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('mint-q1');
		expect(rows[1].textContent).toContain('cashu:1:7700');
		// device-local time, never UTC "Z"
		expect(rows[0].textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
		expect(rows[0].textContent).not.toContain('Z');
	});

	it('filter tabs call back with method', async () => {
		const p = historyProps();
		render(PosHistory, { props: p });
		await fireEvent.click(screen.getByTestId('history-filter-cashu'));
		expect(p.onFilter).toHaveBeenCalledWith('cashu');
	});

	it('wallet link is link-by-id (passes refId, never wallet objects)', async () => {
		const p = historyProps();
		render(PosHistory, { props: p });
		const links = screen.getAllByTestId('history-wallet-link');
		expect(links).toHaveLength(2);
		await fireEvent.click(links[0]);
		expect(p.onWalletLink).toHaveBeenCalledWith('mint-q1');
	});

	it('empty state', () => {
		render(PosHistory, { props: historyProps({ sales: [] }) });
		expect(screen.getByTestId('history-empty')).toBeTruthy();
	});
});
