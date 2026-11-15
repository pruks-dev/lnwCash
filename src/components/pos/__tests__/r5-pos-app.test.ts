/**
 * TASK-5417 R5-only — NEW test (no reuse of 5402..5415 suites).
 * PosApp integration with injected money deps (hermetic — no mint, no network):
 * - boots seeded catalog (3 items) + empty bill CTA disabled
 * - +Add × N → Bill label count/total → S2 lines + total RIGHT
 * - LN: quote → polling → PAID → write-first record → Success (Paid+method pills,
 *   New sale) → New sale clears to catalog
 * - LN EXPIRED → back-to-bill single CTA, quote abandoned, NO auto-requote
 * - Cashu UNDER → pill-warn + bill open + NO sale recorded;
 *   keep adding → EXACT → Confirm → sale recorded (write-first)
 * - Cashu OVER → pill-cashu + Confirm → sale recorded (record-only)
 * - history view shows Today + rows
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import PosApp from '../PosApp.svelte';
import { getPosSales } from '$lib/storage/local';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

const RATE = { price: 3000000, currency: 'THB' as const };

function deps(over: Record<string, unknown> = {}) {
	return {
		getRate: vi.fn(async () => ({ ...RATE })),
		createQuote: vi.fn(async () => ({ quoteId: 'q1', invoice: 'lnbc7700test' })),
		getQuoteState: vi.fn(async () => 'PAID'),
		completeLn: vi.fn(async () => 'q1'),
		receiveToken: vi.fn(async () => 7700),
		pollIntervalMs: 5,
		...over
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

// Rev34 buttons-only paste: the till "types" by putting the token on the
// clipboard, then the Paste button auto-submits (no textarea, no typing).
function mockClipboard(text: string): void {
	Object.defineProperty(navigator, 'clipboard', {
		value: { readText: vi.fn(async () => text) },
		configurable: true
	});
}

afterEach(() => cleanup());

async function addTwoTeas() {
	const incs = screen.getAllByTestId('catalog-inc');
	await fireEvent.click(incs[0]);
	await fireEvent.click(incs[0]);
}

describe('R5 PosApp — catalog → bill', () => {
	it('boots seeded catalog with fiat rows + disabled empty Bill', () => {
		render(PosApp, { props: deps() });
		expect(screen.getAllByTestId('catalog-row')).toHaveLength(3);
		expect(screen.getAllByTestId('catalog-fiat')).toHaveLength(3);
		const bill = screen.getByTestId('catalog-bill') as HTMLButtonElement;
		expect(bill.disabled).toBe(true);
	});

	it('add → Bill label → S2 with lines + RIGHT total + bare pair', async () => {
		render(PosApp, { props: deps() });
		await addTwoTeas();
		const bill = screen.getByTestId('catalog-bill');
		expect(bill.textContent).toContain('2 items');
		expect(bill.textContent).toContain('4,200 SAT');
		await fireEvent.click(bill);
		expect(screen.getByTestId('bill-line')).toBeTruthy();
		expect(screen.getByTestId('bill-total').getAttribute('data-bill-total')).toBe('r5');
		expect(screen.getByTestId('bill-charge-ln')).toBeTruthy();
		expect(screen.getByTestId('bill-charge-cashu')).toBeTruthy();
		expect(screen.queryByTestId('bill-confirm')).toBeNull();
	});
});

describe('R5 PosApp — LN happy path write-first', () => {
	it('PAID → record persisted THEN success with pills + New sale → clears', async () => {
		const d = deps();
		render(PosApp, { props: d });
		await addTwoTeas();
		await fireEvent.click(screen.getByTestId('catalog-bill'));
		await fireEvent.click(screen.getByTestId('bill-charge-ln'));
		await waitFor(() => expect(screen.getByTestId('success-pills')).toBeTruthy(), { timeout: 2000 });
		expect(d.completeLn).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('success-paid-pill')).toBeTruthy();
		expect(screen.getByTestId('success-method-pill').textContent).toContain('pos.success.method_lightning');
		expect(screen.getByTestId('success-amount').textContent).toContain('4,200');
		// write-first: sale on disk before screen
		const stored = getPosSales();
		expect(stored).toHaveLength(1);
		expect(stored[0].method).toBe('lightning');
		expect(stored[0].refId).toBe('q1');
		expect(stored[0].totalSat).toBe(4200);
		// New sale → fresh catalog, empty bill
		await fireEvent.click(screen.getByTestId('success-new-sale'));
		expect(screen.getByTestId('catalog-bill')).toBeTruthy();
		expect((screen.getByTestId('catalog-bill') as HTMLButtonElement).disabled).toBe(true);
	});
});

describe('R5 PosApp — LN expired (DEV-4)', () => {
	it('EXPIRED → single Back-to-bill, quote abandoned, no auto-requote', async () => {
		const d = deps({ getQuoteState: vi.fn(async () => 'EXPIRED') });
		render(PosApp, { props: d });
		await addTwoTeas();
		await fireEvent.click(screen.getByTestId('catalog-bill'));
		await fireEvent.click(screen.getByTestId('bill-charge-ln'));
		await waitFor(() => expect(screen.getByTestId('ln-back-to-bill')).toBeTruthy(), { timeout: 2000 });
		expect(d.completeLn).not.toHaveBeenCalled();
		expect(getPosSales()).toHaveLength(0);
		const callsBefore = (d.createQuote as ReturnType<typeof vi.fn>).mock.calls.length;
		await fireEvent.click(screen.getByTestId('ln-back-to-bill'));
		// bill intact, same amount, no new quote until user taps Charge again
		expect(screen.getByTestId('bill-total-amount').textContent).toContain('4,200');
		expect((d.createQuote as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
	});
});

describe('R5 PosApp — Cashu 3-state (no stuck funds, no early write)', () => {
	it('UNDER → warn pill + bill open + NOTHING recorded; then EXACT → sale', async () => {
		const amounts = [1000, 1100]; // 2100 tea: 1000 under, +1100 exact
		let i = 0;
		const d = deps({ receiveToken: vi.fn(async () => amounts[i++] ?? 0) });
		render(PosApp, { props: d });
		await fireEvent.click(screen.getAllByTestId('catalog-inc')[0]); // 2100
		await fireEvent.click(screen.getByTestId('catalog-bill'));
		await fireEvent.click(screen.getByTestId('bill-charge-cashu'));
		// token 1 → UNDER
		screen.getByTestId('cashu-paste-card'); // paste buttons present
		expect(document.querySelector('textarea')).toBeNull(); // rev34: no typing box
		await fireEvent.click(screen.getByTestId('cashu-submit')); // empty paste — ignored path
		mockClipboard('tok1000');
		await fireEvent.click(screen.getByTestId('cashu-paste-btn')); // clipboard + auto-submit
		await waitFor(() => expect(screen.getByTestId('cashu-pill-under')).toBeTruthy(), { timeout: 2000 });
		expect(getPosSales()).toHaveLength(0); // NOT recorded while under
		// scan another → back to idle, bill still open
		await fireEvent.click(screen.getByTestId('cashu-scan-another'));
		expect(screen.getByTestId('cashu-paste-btn')).toBeTruthy();
		// token 2 → EXACT 2100
		mockClipboard('tok1100');
		await fireEvent.click(screen.getByTestId('cashu-paste-btn')); // clipboard + auto-submit
		await waitFor(() => expect(screen.getByTestId('cashu-pill-exact')).toBeTruthy(), { timeout: 2000 });
		await fireEvent.click(screen.getByTestId('cashu-confirm'));
		await waitFor(() => expect(screen.getByTestId('success-pills')).toBeTruthy(), { timeout: 2000 });
		const stored = getPosSales();
		expect(stored).toHaveLength(1);
		expect(stored[0].method).toBe('cashu');
		expect(stored[0].totalSat).toBe(2100);
	});

	it('OVER → pill-cashu + Confirm → record-only sale', async () => {
		const d = deps({ receiveToken: vi.fn(async () => 5000) });
		render(PosApp, { props: d });
		await fireEvent.click(screen.getAllByTestId('catalog-inc')[0]); // 2100
		await fireEvent.click(screen.getByTestId('catalog-bill'));
		await fireEvent.click(screen.getByTestId('bill-charge-cashu'));
		mockClipboard('tok5000');
		await fireEvent.click(screen.getByTestId('cashu-paste-btn')); // clipboard + auto-submit
		await waitFor(() => expect(screen.getByTestId('cashu-pill-over')).toBeTruthy(), { timeout: 2000 });
		await fireEvent.click(screen.getByTestId('cashu-confirm'));
		await waitFor(() => expect(screen.getByTestId('success-pills')).toBeTruthy(), { timeout: 2000 });
		expect(getPosSales()).toHaveLength(1);
	});
});

describe('R5 PosApp — history', () => {
	it('Today card + rows after a sale; filter tabs present', async () => {
		const d = deps();
		render(PosApp, { props: d });
		await addTwoTeas();
		await fireEvent.click(screen.getByTestId('catalog-bill'));
		await fireEvent.click(screen.getByTestId('bill-charge-ln'));
		await waitFor(() => expect(screen.getByTestId('success-pills')).toBeTruthy(), { timeout: 2000 });
		await fireEvent.click(screen.getByTestId('success-new-sale'));
		await fireEvent.click(screen.getByTestId('catalog-open-history'));
		expect(screen.getByTestId('history-today')).toBeTruthy();
		expect(screen.getByTestId('history-today-total').textContent).toContain('4,200 SAT total');
		expect(screen.getAllByTestId('history-row')).toHaveLength(1);
		expect(screen.getByTestId('history-tabs')).toBeTruthy();
	});
});
