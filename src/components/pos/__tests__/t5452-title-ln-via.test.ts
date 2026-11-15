/**
 * TASK-5452 rev42 title_ln_via_r42 — FRESH suite (no reuse of 5402..5450 suites).
 *
 * Pins (fixforward over the 5450 short-title pin):
 *  1. title_ln EN "Pay via Lightning" / TH "ชำระเงินด้วย Lightning"
 *     — full Pay-via form, equal to title_cashu ("Pay via Cashu" /
 *     "ชำระเงินด้วย Cashu"). Short "Pay" / "ชำระเงิน" is BANNED.
 *  2. Rendered LN checkout header (h2) shows the via-pin per locale,
 *     same shape as the Cashu checkout header (parity, drift 0).
 *  3. Banned copies appear nowhere in pos.* values (either locale):
 *     no bare-header short pin, no Charge/Pay with/เก็บเงิน.
 *
 * Uses REAL svelte-i18n (both dictionaries registered, locale switched) —
 * never the key-echo mock.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { register, init, locale, waitLocale } from 'svelte-i18n';
import enDict from '../../../locales/en.json';
import thDict from '../../../locales/th.json';
import PosCheckoutLn from '../PosCheckoutLn.svelte';
import PosCheckoutCashu from '../PosCheckoutCashu.svelte';

const en = enDict as Record<string, string>;
const th = thDict as Record<string, string>;

register('en', () => Promise.resolve(enDict));
register('th', () => Promise.resolve(thDict));

async function useLocale(l: 'en' | 'th'): Promise<void> {
	locale.set(l);
	await waitLocale(l);
	await tick();
}

beforeAll(async () => {
	init({ fallbackLocale: 'en', initialLocale: 'en' });
	await waitLocale();
});

afterEach(async () => {
	cleanup();
	await useLocale('en');
});

function lnProps() {
	return {
		totalSat: 7700,
		invoice: 'lnbc7700n1ptest5452',
		state: 'polling' as const,
		onCopy: vi.fn(),
		onCancel: vi.fn(),
		onBackToBill: vi.fn(),
		onBack: vi.fn()
	};
}

function cashuProps() {
	return {
		totalSat: 7700,
		receivedSat: 5000,
		state: 'under' as const,
		pasted: '',
		onPasted: vi.fn(),
		onSubmitToken: vi.fn(),
		onScanAnother: vi.fn(),
		onConfirm: vi.fn(),
		onBack: vi.fn()
	};
}

// ─── 1. dictionary pins ───

describe('5452-1 title_ln via pins (dictionary)', () => {
	it('EN title_ln is Pay via Lightning (short Pay gone)', () => {
		expect(en['pos.checkout.title_ln']).toBe('Pay via Lightning');
	});

	it('TH title_ln is ชำระเงินด้วย Lightning (short ชำระเงิน gone)', () => {
		expect(th['pos.checkout.title_ln']).toBe('ชำระเงินด้วย Lightning');
	});

	it('title_ln mirrors title_cashu shape per locale (Pay via X / ชำระเงินด้วย X)', () => {
		expect(en['pos.checkout.title_cashu']).toBe('Pay via Cashu');
		expect(th['pos.checkout.title_cashu']).toBe('ชำระเงินด้วย Cashu');
		expect(en['pos.checkout.title_ln'].replace('Lightning', 'Cashu')).toBe(
			en['pos.checkout.title_cashu']
		);
		expect(th['pos.checkout.title_ln'].replace('Lightning', 'Cashu')).toBe(
			th['pos.checkout.title_cashu']
		);
	});
});

// ─── 2. rendered headers per locale (LN == Cashu shape) ───

describe('5452-2 rendered checkout headers', () => {
	it('EN: LN header renders Pay via Lightning, Cashu header Pay via Cashu', async () => {
		await useLocale('en');
		render(PosCheckoutLn, { props: lnProps() });
		expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe(
			'Pay via Lightning'
		);
		cleanup();
		render(PosCheckoutCashu, { props: cashuProps() });
		expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe(
			'Pay via Cashu'
		);
	});

	it('TH: LN header renders ชำระเงินด้วย Lightning, Cashu header ชำระเงินด้วย Cashu', async () => {
		await useLocale('th');
		render(PosCheckoutLn, { props: lnProps() });
		expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe(
			'ชำระเงินด้วย Lightning'
		);
		cleanup();
		render(PosCheckoutCashu, { props: cashuProps() });
		expect(screen.getByRole('heading', { level: 2 }).textContent?.trim()).toBe(
			'ชำระเงินด้วย Cashu'
		);
	});
});

// ─── 3. banned copies ───

describe('5452-3 banned copies', () => {
	it('short/banned copies appear nowhere in pos.* values (either locale)', () => {
		for (const [name, dict] of [
			['en', en],
			['th', th]
		] as const) {
			for (const [k, v] of Object.entries(dict)) {
				if (!k.startsWith('pos.')) continue;
				expect(v, `${name}.${k}`).not.toContain('Charge');
				expect(v, `${name}.${k}`).not.toContain('Pay with');
				expect(v, `${name}.${k}`).not.toContain('เก็บเงิน');
			}
			// exact short pins banned (via-full only)
			expect(dict['pos.checkout.title_ln'], name).not.toBe('Pay');
			expect(dict['pos.checkout.title_ln'], name).not.toBe('ชำระเงิน');
		}
	});
});
