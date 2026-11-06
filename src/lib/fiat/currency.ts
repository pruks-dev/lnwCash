/**
 * TASK-5002 (INTENT-050 / BLUEPRINT-050 v2 + MOCKUP R2 APPROVED rev13)
 *
 * Fiat-currency glue for Home + Settings:
 *  - per-currency metadata (symbol / decimals / English name) — symbols and
 *    English proper names are universal, NOT i18n keys; display names ARE
 *    i18n (screen.settings.fiat_name_* TH/EN parity)
 *  - persist: lnwcash_settings.fiat_currency (default THB), validated —
 *    unknown codes fall back to THB, never persisted blindly
 *  - sats → fiat math + Intl formatting (JPY/KRW 0 decimals, rest 2 —
 *    per mockup R2 spec) — price null/undefined renders "– CUR", never a
 *    fabricated number (L-P021)
 *  - cross-screen reactivity: Settings writes dispatch
 *    FIAT_CURRENCY_EVENT (+ storage event for cross-tab); Home listens
 *
 * Forbidden: hardcoded rates (L-P021), Bitkub direct-from-browser (CORS).
 */

import { getSettings, setSettings } from '$lib/storage/local';
import { SUPPORTED_CURRENCIES, type FiatCurrency } from './rates';

export type { FiatCurrency };
export { SUPPORTED_CURRENCIES };

/** Default currency when nothing valid is stored (mockup R2: THB). */
export const DEFAULT_FIAT_CURRENCY: FiatCurrency = 'THB';

/** Window event Settings dispatches after persisting a new currency. */
export const FIAT_CURRENCY_EVENT = 'lnwcash:fiat-currency';

/** Satoshis per bitcoin — unit conversion only, not a rate. */
export const SATS_PER_BTC = 100_000_000;

export interface CurrencyMeta {
	/** Universal glyph shown in summary + row badge (not translated). */
	symbol: string;
	/** Fraction digits for Intl formatting (mockup R2 spec). */
	decimals: 0 | 2;
	/** English proper name — reused verbatim in the TH sub-line (mockup R2). */
	enName: string;
}

/** R2 setting list — THB default first (matches SUPPORTED_CURRENCIES order). */
export const CURRENCY_META: Record<FiatCurrency, CurrencyMeta> = {
	THB: { symbol: '฿', decimals: 2, enName: 'Thai Baht' },
	USD: { symbol: '$', decimals: 2, enName: 'US Dollar' },
	EUR: { symbol: '€', decimals: 2, enName: 'Euro' },
	JPY: { symbol: '¥', decimals: 0, enName: 'Japanese Yen' },
	GBP: { symbol: '£', decimals: 2, enName: 'British Pound' },
	CNY: { symbol: '¥', decimals: 2, enName: 'Chinese Yuan' },
	KRW: { symbol: '₩', decimals: 0, enName: 'South Korean Won' },
	SGD: { symbol: 'S$', decimals: 2, enName: 'Singapore Dollar' },
	AUD: { symbol: 'A$', decimals: 2, enName: 'Australian Dollar' },
	MYR: { symbol: 'RM', decimals: 2, enName: 'Malaysian Ringgit' }
};

export function isFiatCurrency(value: unknown): value is FiatCurrency {
	return (
		typeof value === 'string' &&
		(SUPPORTED_CURRENCIES as readonly string[]).includes(value)
	);
}

/** Validated read — unknown/missing codes fall back to THB (never crash). */
export function getFiatCurrency(): FiatCurrency {
	try {
		const raw = getSettings().fiat_currency;
		if (isFiatCurrency(raw)) return raw;
	} catch {
		// private-mode / unavailable storage → default below
	}
	return DEFAULT_FIAT_CURRENCY;
}

/**
 * Persist + notify. Invalid codes are ignored (reader falls back to THB).
 * Same-tab listeners get FIAT_CURRENCY_EVENT; other tabs get 'storage'.
 */
export function setFiatCurrency(currency: FiatCurrency): void {
	if (!isFiatCurrency(currency)) return;
	try {
		setSettings({ fiat_currency: currency });
	} catch {
		// storage unavailable — still notify in-memory listeners
	}
	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent<FiatCurrency>(FIAT_CURRENCY_EVENT, { detail: currency })
		);
	}
}

/** sats → fiat units at a live BTC price. Pure math, no fetching. */
export function satsToFiat(sats: number, pricePerBtc: number): number {
	return (sats * pricePerBtc) / SATS_PER_BTC;
}

/**
 * Single-line fiat text for Home (mockup R2: "570.94 THB" — no ≈, no rate
 * line, no time/source). Null/undefined/invalid price → "– CUR" (rates.ts
 * contract — never a fabricated number).
 */
export function formatFiat(
	sats: number,
	pricePerBtc: number | null | undefined,
	currency: FiatCurrency
): string {
	if (
		typeof pricePerBtc !== 'number' ||
		!Number.isFinite(pricePerBtc) ||
		pricePerBtc <= 0
	) {
		return `– ${currency}`;
	}
	const meta = CURRENCY_META[currency];
	const formatted = new Intl.NumberFormat(undefined, {
		minimumFractionDigits: meta.decimals,
		maximumFractionDigits: meta.decimals
	}).format(satsToFiat(sats, pricePerBtc));
	return `${formatted} ${currency}`;
}
