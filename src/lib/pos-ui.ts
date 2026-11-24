/**
 * TASK-5417 — PoS UI glue (INTENT-054 R5-only rebuild).
 *
 * NOT domain (src/lib/pos/** stays untouched — this file only USES it).
 * NOT wallet (no wallet imports here — money calls live in PosApp with
 * read-only imports of Receive/mint/tokenStore patterns).
 *
 * - PoS enable flag: own localStorage key (WalletSettings untouched).
 * - fiatRowText(): every catalog/bill row shows fiat via the REAL fiat
 *   stack (satsToFiat + formatFiat + rates.ts entry). Null/invalid price
 *   → "– CUR" (never fabricated, L-P021).
 */
import { formatFiat } from './fiat/currency';
import type { FiatCurrency, RateEntry } from './fiat/rates';
import { hasNativePrice } from './pos/catalog';
import { get, writable, type Readable } from 'svelte/store';
import * as svelteI18n from 'svelte-i18n';

const POS_ENABLED_KEY = 'lnwcash_pos_enabled';

/**
 * TASK-5468 rev50 toggle_notify — reactive PoS flag.
 * Settings toggle must notify App instantly (no route change):
 * setPosEnabled writes localStorage AND pushes to posEnabledStore AND
 * dispatches a window CustomEvent so App updates showPos in the same tick.
 * Money/logic untouched — toggle transport only.
 */
export const POS_TOGGLE_EVENT = 'lnwcash:pos-toggle';
export const posEnabledStore = writable<boolean>(false);

export function getPosEnabled(): boolean {
	try {
		return window.localStorage.getItem(POS_ENABLED_KEY) === '1';
	} catch {
		return false;
	}
}

export function setPosEnabled(on: boolean): void {
	try {
		if (on) window.localStorage.setItem(POS_ENABLED_KEY, '1');
		else window.localStorage.removeItem(POS_ENABLED_KEY);
	} catch {
		// private-mode storage — PoS stays hidden, never crashes
	}
	// TASK-5468 rev50: notify App instantly — store + DOM event, same tick.
	// Toggle-only: no money/logic touched.
	try {
		posEnabledStore.set(on);
	} catch {
		/* store unavailable — storage write above is the source of truth */
	}
	try {
		if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
			window.dispatchEvent(new CustomEvent(POS_TOGGLE_EVENT, { detail: { enabled: on } }));
		}
	} catch {
		/* event unavailable — store subscription still covers App */
	}
}

// TASK-5468 rev50: boot-sync the store from storage (after defs — no TDZ).
// Module import = single sync; every later setPosEnabled pushes + event.
try {
	posEnabledStore.set(getPosEnabled());
} catch {
	/* storage unavailable — stays false */
}

/**
 * One-line fiat suffix for a sats row, e.g. "≈ 63.00 THB".
 * Rate unavailable → "– CUR" (fiatBlocked, never faked).
 * rev27 (catalog-eye): the "· R=<price>" sample-rate suffix is GONE —
 * rows wrap this in parens: "200 SAT (≈ 63.00 THB)".
 */
export function fiatRowText(
	sats: number,
	currency: FiatCurrency,
	entry: RateEntry | null | undefined
): string {
	const price = entry?.price;
	if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
		return `– ${currency}`;
	}
	return `≈ ${formatFiat(sats, price, currency)}`;
}

/**
 * Live PoS locale ('th' when the app runs Thai, else 'en').
 *
 * TASK-5450 rev41 manage_th_btn_r41: Bill CTA + count badge + every other
 * "N items" string binds to the locale (TH pin: N รายการ). One-shot read of
 * the live svelte-i18n locale store; falls back to 'en' when the store is
 * unavailable (unit/key-echo mocks, un-initialised i18n). Unit-pin
 * convenience only — components use subscribePosLocale (reactive) and pass
 * the result explicitly, because a one-shot get() inside a template
 * expression is NOT a reactive dependency (Svelte would never re-run it on
 * a language switch).
 */
function posLocale(): 'th' | 'en' {
	try {
		const maybe = svelteI18n as unknown as Record<string, unknown>;
		const store = maybe['locale'] as Readable<unknown> | undefined;
		if (!store || typeof store.subscribe !== 'function') return 'en';
		const v = get(store);
		return typeof v === 'string' && v.toLowerCase().startsWith('th') ? 'th' : 'en';
	} catch {
		return 'en';
	}
}

/**
 * Reactive locale bridge for PoS components (rev41).
 *
 * Call inside $effect and keep the value in $state, then pass it as the
 * `locale` override to countItemsText/billCtaText/catalogCountText:
 *
 *   let posLoc = $state('en');
 *   $effect(() => subscribePosLocale((v) => { posLoc = v; }));
 *
 * No-op when the svelte-i18n locale store is unavailable (unit/key-echo
 * mocks) — the state stays 'en' so EN snapshots stay byte-identical.
 */
export function subscribePosLocale(cb: (locale: string) => void): () => void {
	const noop = () => {};
	try {
		const maybe = svelteI18n as unknown as Record<string, unknown>;
		const store = maybe['locale'] as Readable<unknown> | undefined;
		if (!store || typeof store.subscribe !== 'function') return noop;
		return store.subscribe((v: unknown) => {
			cb(typeof v === 'string' && v ? v : 'en');
		});
	} catch {
		return noop;
	}
}

/**
 * "N items" (EN) / "N รายการ" (TH) — catalog count badge + bill total line.
 * rev41 locale-bound (was EN-only hardcode). Optional `locale` override is
 * for unit pins; components omit it so the live locale applies.
 */
export function countItemsText(n: number, locale?: string): string {
	const loc = (locale ?? posLocale()).toLowerCase();
	if (loc.startsWith('th')) return `${n} รายการ`;
	return `${n} item${n === 1 ? '' : 's'}`;
}

/** Catalog header count via countItemsText — R5 catalog point 3. */
export function catalogCountText(n: number, locale?: string): string {
	return countItemsText(n, locale);
}

/**
 * TASK-5603 — native list-price text for HEAVY v2 products
 * (INTENT-056 BLUEPRINT-056 v2, approved mockup 1/3).
 *
 * "฿45.00" form (currency symbol via Intl currency style, pinned th-TH so
 * the text is byte-identical on every device — matches the approved mockup
 * `฿45.00 (≈ 143 SAT)`). Presentation ONLY: Intl's currency style carries
 * each currency's own decimals — zero rate arithmetic in this file.
 * Non-finite amount → empty string (caller falls back to the SAT leg).
 */
export function nativePriceText(amount: number, currency: FiatCurrency): string {
	if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return '';
	try {
		return new Intl.NumberFormat('th-TH', { style: 'currency', currency }).format(amount);
	} catch {
		return `${amount} ${currency}`;
	}
}

/**
 * TASK-5603 approved card price (INTENT-056 BLUEPRINT-056 v2, mockup 1/3).
 * - HEAVY native product viewed in its own currency → native first:
 *   `฿45.00 (≈ 143 SAT)` (native leg is rate-independent — works even when
 *   the rate is gone).
 * - otherwise → SAT first: `200 SAT (≈ 63.00 THB)` (converted leg via
 *   fiatRowText — fiat stack only, zero rate math here).
 */
export function catalogPriceText(
	p: { priceSat: number; currency?: FiatCurrency | null; amount?: number | null },
	rateCurrency: FiatCurrency,
	ratePrice: number | null
): string {
	if (hasNativePrice(p) && p.currency === rateCurrency && typeof p.amount === 'number') {
		const native = nativePriceText(p.amount, p.currency as FiatCurrency);
		if (native) return `${native} (≈ ${p.priceSat.toLocaleString('en-US')} SAT)`;
	}
	return `${p.priceSat.toLocaleString('en-US')} SAT (${fiatRowText(p.priceSat, rateCurrency, { price: ratePrice } as never)})`;
}

/** Success/history method filter — R5 S5 tab-bar (mirrors History.svelte). */
export type PosFilter = 'all' | 'lightning' | 'cashu';

/**
 * Bill CTA label — rev41 locale-bound (was EN-only):
 * EN "Order N items T SAT (fiat)" / TH "คำสั่งซื้อ N รายการ T SAT (fiat)"
 * — no •/· separators. Optional `locale` override is for unit pins;
 * components omit it so the live locale applies (called inline in the
 * template so a locale switch re-renders with the right language).
 */
export function billCtaText(n: number, totalSat: number, fiat: string, locale?: string): string {
	const loc = (locale ?? posLocale()).toLowerCase();
	const total = totalSat.toLocaleString('en-US');
	if (loc.startsWith('th')) return `คำสั่งซื้อ ${n} รายการ ${total} SAT (${fiat})`;
	return `Order ${n} item${n === 1 ? '' : 's'} ${total} SAT (${fiat})`;
}
