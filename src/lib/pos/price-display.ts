/**
 * TASK-5601 — HEAVY per-currency display (INTENT-056 BLUEPRINT-056 v2)
 *
 * Single display contract for catalog / bill / checkout / history /
 * summary: `formatProductPrice(product, pricePerBtc, displayCurrency)`.
 * - Product's native currency MATCHES the view currency → show the stored
 *   native amount (no rate needed — works even when the rate is gone).
 * - Otherwise (SAT-only product, or viewing a foreign currency) → delegate
 *   to formatFiat (currency.ts) — null/bad price renders "– CUR", never a
 *   fabricated number.
 *
 * Fiat rule (hard): the ONLY math-adjacent calls here are formatFiat
 * (currency.ts) for the converted leg. The native leg formats the STORED
 * major amount with Intl using the currency's decimals from convert.ts
 * metadata — presentation only, zero rate arithmetic in this file
 * (no scaling-constant math, no price division/multiplication).
 */

import { CURRENCY_META as CONVERT_META } from '../fiat/convert';
import { formatFiat } from '../fiat/currency';
import type { FiatCurrency } from '../fiat/rates';
import { hasNativePrice, type PosProduct } from './catalog';

/** Stored native amount as "100.00 THB" — no rate involved. Null when SAT-only. */
export function productNativeText(
	product: Pick<PosProduct, 'currency' | 'amount'>
): string | null {
	if (!hasNativePrice(product)) return null;
	const currency = product.currency as FiatCurrency;
	const decimals = CONVERT_META[currency].decimals;
	const formatted = new Intl.NumberFormat(undefined, {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals
	}).format(product.amount as number);
	return `${formatted} ${currency}`;
}

/**
 * Per-currency product price text for every PoS screen.
 * Native match → stored amount text (rate-independent).
 * Anything else → formatFiat(priceSat) in the view currency.
 */
export function formatProductPrice(
	product: Pick<PosProduct, 'priceSat' | 'currency' | 'amount'>,
	pricePerBtc: number | null | undefined,
	displayCurrency: FiatCurrency
): string {
	if (
		isFiatCurrencyMatch(product.currency, displayCurrency) &&
		typeof product.amount === 'number'
	) {
		const native = productNativeText(product);
		if (native !== null) return native;
	}
	return formatFiat(product.priceSat, pricePerBtc, displayCurrency);
}

function isFiatCurrencyMatch(
	productCurrency: PosProduct['currency'],
	displayCurrency: FiatCurrency
): boolean {
	return productCurrency === displayCurrency;
}
