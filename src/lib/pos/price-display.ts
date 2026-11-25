/**
 * TASK-5601 — HEAVY per-currency display (INTENT-056 BLUEPRINT-056 v2)
 * TASK-5710 — v3 truth display (INTENT-057 BLUEPRINT v3 rev5):
 *   products carry { currency, amount } truth (no stored sats). SAT truth
 *   renders from the amount directly (no rate); fiat truth renders the
 *   stored major amount when the view matches, else resolves sats LIVE via
 *   fiatToSats (convert.ts floor + dust-block) and formats via formatFiat.
 *   Dead rate where conversion is needed → "– CUR", never fabricated.
 *
 * Single display contract for catalog / bill / checkout / history /
 * summary: `formatProductPrice(product, pricePerBtc, displayCurrency)`.
 *
 * Fiat rule (hard): the ONLY math-adjacent calls here are fiatToSats
 * (convert.ts) + formatFiat (currency.ts) for the converted leg. The
 * native leg formats the STORED major amount with Intl using the
 * currency's decimals from convert.ts metadata — presentation only, zero
 * rate arithmetic in this file (no scaling-constant math, no price
 * division/multiplication).
 */

import { CURRENCY_META as CONVERT_META, fiatToSats } from '../fiat/convert';
import { formatFiat } from '../fiat/currency';
import type { FiatCurrency } from '../fiat/rates';
import { hasNativePrice, type PosProduct } from './catalog';

/** Stored truth as display text — no rate involved. SAT → "2,000 SAT". */
export function productNativeText(
	product: Pick<PosProduct, 'currency' | 'amount'>
): string | null {
	if (product.currency === 'SAT') {
		if (typeof product.amount !== 'number' || !Number.isInteger(product.amount) || product.amount <= 0)
			return null;
		return `${product.amount.toLocaleString('en-US')} SAT`;
	}
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
 * Truth match (fiat product viewed in its own currency, or SAT viewed in
 * SAT terms) → stored truth text (rate-independent).
 * SAT truth viewed in fiat → formatFiat(amount) (rate live, "– CUR" when dead).
 * Fiat truth viewed in a foreign currency → live fiatToSats resolve, then
 * formatFiat (dead rate or dust → "– CUR", never fabricated).
 */
export function formatProductPrice(
	product: Pick<PosProduct, 'currency' | 'amount'>,
	pricePerBtc: number | null | undefined,
	displayCurrency: FiatCurrency
): string {
	// Fiat truth viewed in its own currency — stored amount, no rate needed.
	if (
		isFiatCurrencyMatch(product.currency, displayCurrency) &&
		typeof product.amount === 'number'
	) {
		const native = productNativeText(product);
		if (native !== null) return native;
	}
	// SAT truth has no conversion of its own — fiat view converts the amount.
	if (product.currency === 'SAT' && typeof product.amount === 'number') {
		if (!Number.isInteger(product.amount) || product.amount <= 0) return `– ${displayCurrency}`;
		return formatFiat(product.amount, pricePerBtc, displayCurrency);
	}
	// Fiat truth in a foreign view — resolve sats live, then format.
	if (typeof product.amount === 'number' && typeof product.currency === 'string') {
		const cur = product.currency as FiatCurrency;
		const r = fiatToSats(String(product.amount), cur, pricePerBtc ?? null);
		if (r.ok) return formatFiat(r.sats, pricePerBtc, displayCurrency);
	}
	return `– ${displayCurrency}`;
}

function isFiatCurrencyMatch(
	productCurrency: PosProduct['currency'],
	displayCurrency: FiatCurrency
): boolean {
	return productCurrency === displayCurrency;
}
