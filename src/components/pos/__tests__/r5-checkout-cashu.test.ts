/**
 * TASK-5417 R5-only — NEW test (no reuse of 5402..5415 suites).
 * S4 checkout-Cashu: composite §B S4 + risk-a 3-state.
 * - UNDER: pill-warn + shortfall line + Scan another (bill stays open, NOT recorded)
 * - EXACT: pill-ok + Confirm
 * - OVER: pill-cashu (record-only, no change) + Confirm
 * - idle: camera box + Scan QR ghost + paste fallback; invalid warn-degrades
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import PosCheckoutCashu from '../PosCheckoutCashu.svelte';

vi.mock('svelte-i18n', () => ({
	_: {
		subscribe(fn: (v: (k: string) => string) => void) {
			fn((k: string) => k);
			return () => {};
		}
	}
}));

function props(over: Record<string, unknown> = {}) {
	return {
		totalSat: 7700,
		receivedSat: 0,
		state: 'idle' as const,
		pasted: '',
		onPasted: vi.fn(),
		onScan: vi.fn(),
		onSubmitToken: vi.fn(),
		onScanAnother: vi.fn(),
		onConfirm: vi.fn(),
		onBack: vi.fn(),
		...over
	};
}

afterEach(() => cleanup());

describe('R5 S4 checkout-Cashu 3-state', () => {
	it('idle: square camera preview + paste buttons + prompt', async () => {
		const p = props();
		render(PosCheckoutCashu, { props: p });
		expect(screen.getByTestId('cashu-qr')).toBeTruthy();
		// rev33: scan ghost cut; rev34: textarea cut — buttons-only paste.
		expect(screen.queryByTestId('cashu-scan')).toBeNull();
		expect(screen.queryByTestId('cashu-paste')).toBeNull();
		expect(screen.getByTestId('cashu-paste-btn')).toBeTruthy();
		expect(screen.getByTestId('cashu-submit')).toBeTruthy();
		expect(screen.getByTestId('cashu-amount').textContent).toContain('7,700');
	});

	it('invalid token warn-degrades (no crash, stays on screen)', () => {
		render(PosCheckoutCashu, { props: props({ state: 'invalid' }) });
		expect(screen.getByTestId('cashu-invalid').textContent).toContain('pos.cashu.invalid');
		// rev34: paste buttons (no textarea) stay mounted on invalid.
		expect(screen.getByTestId('cashu-paste-btn')).toBeTruthy();
		expect(screen.getByTestId('cashu-submit')).toBeTruthy();
		expect(screen.queryByTestId('cashu-paste')).toBeNull();
	});

	it('UNDER: pill-warn + shortfall + Scan another, NO confirm (bill stays open)', async () => {
		const p = props({ state: 'under', receivedSat: 5000 });
		const { container } = render(PosCheckoutCashu, { props: p });
		const pill = screen.getByTestId('cashu-pill-under');
		expect(pill.className).toContain('pill-warn');
		expect(pill.textContent).toContain('pos.cashu.under');
		expect(screen.getByTestId('cashu-amount').textContent).toContain('5,000');
		expect(container.querySelector('[data-testid="cashu-confirm"]')).toBeNull();
		await fireEvent.click(screen.getByTestId('cashu-scan-another'));
		expect(p.onScanAnother).toHaveBeenCalledTimes(1);
	});

	it('EXACT: pill-ok + Confirm → Success', async () => {
		const p = props({ state: 'exact', receivedSat: 7700 });
		render(PosCheckoutCashu, { props: p });
		const pill = screen.getByTestId('cashu-pill-exact');
		expect(pill.className).toContain('pill-ok');
		expect(pill.textContent).toContain('7,700 = 7,700');
		await fireEvent.click(screen.getByTestId('cashu-confirm'));
		expect(p.onConfirm).toHaveBeenCalledTimes(1);
	});

	it('OVER: pill-cashu record-only + Confirm (no change in v1)', async () => {
		const p = props({ state: 'over', receivedSat: 10000 });
		const { container } = render(PosCheckoutCashu, { props: p });
		const pill = screen.getByTestId('cashu-pill-over');
		expect(pill.className).toContain('pill-cashu');
		expect(pill.textContent).toContain('pos.cashu.over');
		expect(container.textContent).toContain('No auto-change-token in v1');
		await fireEvent.click(screen.getByTestId('cashu-confirm'));
		expect(p.onConfirm).toHaveBeenCalledTimes(1);
	});
});
