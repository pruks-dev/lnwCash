/**
 * TASK-5601 — POS catalog domain HEAVY currency (INTENT-056 BLUEPRINT-056 v2)
 *
 * Schema v1 → v2: PosProduct keeps priceSat (single source for math, intact)
 * and GAINS a paired native fiat price (currency + amount) alongside it.
 * - v1 rows (no currency/amount — incl. rev48 convert-at-entry light rows
 *   that stored only priceSat) normalize to { currency: null, amount: null }
 *   with priceSat byte-identical — nothing previously sold is lost.
 * - v2 rows carry the seller's native list price, e.g. { currency:'THB',
 *   amount: 100 } + priceSat (converted at entry via fiatToSats).
 *
 * Pure domain: NO svelte imports, NO localStorage, NO fetch.
 * Persistence lives in src/lib/storage/local.ts (pos:catalog key);
 * this file only owns the in-memory document shape + validation.
 *
 * Fiat rule (hard): ALL fiat<->sats math delegates to the existing fiat
 * stack — fiatToSats / parseFiatAmount (convert.ts) + types (rates.ts).
 * This file contains ZERO rate arithmetic of its own (no scaling-constant
 * math, no division/multiplication by a price — grep gate enforces it).
 * Display formatting that needs a live price lives in price-display.ts
 * (it reuses formatFiat; this file must NOT import currency.ts — that
 * would cycle catalog → currency → storage/local → catalog).
 *
 * Schema versioning: every persisted doc carries `schema`.
 * Readers MUST go through normalizeCatalogDoc() so installs that
 * stored older docs (schema 1 / no schema / missing fields) still load.
 */

import { fiatToSats, parseFiatAmount } from '../fiat/convert';
import { SUPPORTED_CURRENCIES, type FiatCurrency, type RateEntry } from '../fiat/rates';

export const POS_CATALOG_SCHEMA_VERSION = 2;

/** Product category — free-form label, never affects pricing. */
export type PosProductKind = string;

export interface PosProduct {
	/** Stable id (uuid-ish, unique within catalog). */
	id: string;
	/** Display name. */
	name: string;
	/** Unit price in sats (integer > 0). Single source of truth for math. */
	priceSat: number;
	/**
	 * HEAVY v2 native list currency — paired with `amount` (both set or
	 * both null). Null = SAT-only product (all v1 rows migrate here,
	 * priceSat intact). Display screens (catalog/bill/checkout/history/
	 * summary) show the native amount when it matches the view currency.
	 */
	currency?: FiatCurrency | null;
	/**
	 * HEAVY v2 native list amount in major units (e.g. 100 = ฿100).
	 * Paired with `currency`. Converted to priceSat at entry via
	 * fiatToSats (rev48 convert-at-entry, floor/dust policy intact).
	 */
	amount?: number | null;
	/** Category label (e.g. "drink", "snack"). */
	kind: PosProductKind;
	/**
	 * Fiat-flag: when true the seller UI may ALSO show the fiat
	 * equivalent (converted via fiat/* at bill time). Never changes
	 * priceSat — display hint only.
	 */
	fiatPriced: boolean;
	/** On/off sale toggle — off-sale items stay in catalog, excluded from sale. */
	active: boolean;
	/** Device epoch ms of last edit. */
	updatedAt: number;
}

export interface PosCatalogDoc {
	/** Schema version — bump on shape change, keep normalize() backward-compat. */
	schema: number;
	/** Device epoch ms of last mutation. */
	updatedAt: number;
	items: PosProduct[];
}

export interface PosProductInput {
	id: string;
	name: string;
	priceSat: number;
	/** Native list currency — must pair with `amount` (both or neither). */
	currency?: FiatCurrency | null;
	/** Native list amount (major units) — must pair with `currency`. */
	amount?: number | null;
	kind?: PosProductKind;
	fiatPriced?: boolean;
	active?: boolean;
}

export type CatalogErrorCode =
	| 'EMPTY_ID'
	| 'EMPTY_NAME'
	| 'BAD_PRICE'
	| 'BAD_CURRENCY'
	| 'DUPLICATE_ID'
	| 'NOT_FOUND';

export interface CatalogFailure {
	ok: false;
	code: CatalogErrorCode;
	message: string;
}

export interface CatalogOk<T> {
	ok: true;
	value: T;
}

export type CatalogResult<T> = CatalogOk<T> | CatalogFailure;

function fail(code: CatalogErrorCode, message: string): CatalogFailure {
	return { ok: false, code, message };
}

function cleanStr(v: unknown): string {
	return typeof v === 'string' ? v.trim() : '';
}

function isValidPrice(v: unknown): v is number {
	return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isFiatCurrency(v: unknown): v is FiatCurrency {
	return typeof v === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

/**
 * Native pair validator — delegates decimal policy to the fiat stack
 * (parseFiatAmount carries each currency's decimals; this file never
 * hardcodes them). Returns the canonical pair or null when absent.
 * - both missing (null/undefined/'') → { currency: null, amount: null }
 * - both present + currency known + amount finite > 0 + decimals fit
 *   → { currency, amount }
 * - anything else (unpaired, unknown currency, non-positive amount,
 *   too many decimals) → invalid (null).
 */
function resolveNativePair(
	currency: unknown,
	amount: unknown
): { currency: FiatCurrency; amount: number } | { currency: null; amount: null } | null {
	const cMissing = currency === null || currency === undefined || currency === '';
	const aMissing = amount === null || amount === undefined || amount === '';
	if (cMissing && aMissing) return { currency: null, amount: null };
	if (cMissing || aMissing) return null; // unpaired — caller decides (drop pair, keep product)
	if (!isFiatCurrency(currency)) return null;
	if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
	// Decimals policy comes from convert.ts — never hand-rolled here.
	const checked = parseFiatAmount(String(amount), currency);
	if (!checked.ok) return null;
	return { currency, amount };
}

/** True when the product carries a native HEAVY list price. */
export function hasNativePrice(product: Pick<PosProduct, 'currency' | 'amount'>): boolean {
	return (
		isFiatCurrency(product.currency) &&
		typeof product.amount === 'number' &&
		Number.isFinite(product.amount) &&
		product.amount > 0
	);
}

/** Blank catalog (schema-stamped). */
export function emptyCatalog(nowMs: number = Date.now()): PosCatalogDoc {
	return { schema: POS_CATALOG_SCHEMA_VERSION, updatedAt: nowMs, items: [] };
}

/**
 * Normalize unknown persisted data into a valid v2 doc.
 * - null / garbage / wrong shape → empty catalog (never throws)
 * - missing schema (pre-5401 installs) or schema 1 (pre-5601) → stamped v2,
 *   items kept when valid — priceSat NEVER rewritten, only carried over
 * - items missing fields (old entries) → defaults filled, invalid rows dropped
 * - native pair broken (unpaired / unknown currency / bad decimals) →
 *   product KEPT with pair nulled (priceSat intact — migrate never loses
 *   a sellable row over a display-only field)
 */
export function normalizeCatalogDoc(raw: unknown, nowMs: number = Date.now()): PosCatalogDoc {
	if (typeof raw !== 'object' || raw === null) return emptyCatalog(nowMs);
	const doc = raw as Record<string, unknown>;
	const itemsRaw = Array.isArray(doc.items) ? doc.items : [];
	const items: PosProduct[] = [];
	const seen = new Set<string>();
	for (const row of itemsRaw) {
		if (typeof row !== 'object' || row === null) continue;
		const r = row as Record<string, unknown>;
		const id = cleanStr(r.id);
		const name = cleanStr(r.name);
		if (!id || !name || seen.has(id)) continue;
		if (!isValidPrice(r.priceSat)) continue;
		seen.add(id);
		const pair = resolveNativePair(r.currency, r.amount);
		items.push({
			id,
			name,
			priceSat: r.priceSat as number,
			currency: pair === null ? null : pair.currency,
			amount: pair === null ? null : pair.amount,
			kind: cleanStr(r.kind),
			fiatPriced: r.fiatPriced === true,
			active: r.active !== false, // old rows without flag default to on-sale
			updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : nowMs
		});
	}
	return {
		schema: POS_CATALOG_SCHEMA_VERSION,
		updatedAt:
			typeof doc.updatedAt === 'number' && Number.isFinite(doc.updatedAt) ? doc.updatedAt : nowMs,
		items
	};
}

/** Create — id must be unique, name non-empty, priceSat positive integer, pair valid. */
export function addProduct(
	doc: PosCatalogDoc,
	input: PosProductInput,
	nowMs: number = Date.now()
): CatalogResult<PosCatalogDoc> {
	const id = cleanStr(input.id);
	const name = cleanStr(input.name);
	if (!id) return fail('EMPTY_ID', 'product id is empty');
	if (!name) return fail('EMPTY_NAME', 'product name is empty');
	if (!isValidPrice(input.priceSat)) return fail('BAD_PRICE', 'priceSat must be a positive integer');
	if (doc.items.some((p) => p.id === id)) return fail('DUPLICATE_ID', `product id exists: ${id}`);
	const pair = resolveNativePair(input.currency, input.amount);
	if (pair === null)
		return fail(
			'BAD_CURRENCY',
			'currency+amount must pair: both set (known currency, positive amount within decimals) or both absent'
		);
	const product: PosProduct = {
		id,
		name,
		priceSat: input.priceSat,
		currency: pair.currency,
		amount: pair.amount,
		kind: cleanStr(input.kind),
		fiatPriced: input.fiatPriced === true,
		active: input.active !== false,
		updatedAt: nowMs
	};
	return {
		ok: true,
		value: { schema: POS_CATALOG_SCHEMA_VERSION, updatedAt: nowMs, items: [...doc.items, product] }
	};
}

/** Update mutable fields (name/price/kind/fiat-flag/native pair). Id is immutable. */
export function updateProduct(
	doc: PosCatalogDoc,
	id: string,
	patch: Partial<Pick<PosProduct, 'name' | 'priceSat' | 'kind' | 'fiatPriced' | 'currency' | 'amount'>>,
	nowMs: number = Date.now()
): CatalogResult<PosCatalogDoc> {
	const idx = doc.items.findIndex((p) => p.id === id);
	if (idx === -1) return fail('NOT_FOUND', `product not found: ${id}`);
	if (patch.name !== undefined && !cleanStr(patch.name))
		return fail('EMPTY_NAME', 'product name is empty');
	if (patch.priceSat !== undefined && !isValidPrice(patch.priceSat))
		return fail('BAD_PRICE', 'priceSat must be a positive integer');
	// Native pair patches merge with the stored pair: patching one side
	// keeps the other (e.g. { amount: 200 } on (THB,100) → (THB,200)).
	// Clearing needs explicit null/null — a half-cleared pair
	// (e.g. { currency: null } leaving amount set) is rejected so the
	// product never holds half a price.
	const touchesPair = patch.currency !== undefined || patch.amount !== undefined;
	let pair: { currency: FiatCurrency | null; amount: number | null } | null = null;
	if (touchesPair) {
		const cur = doc.items[idx];
		const nextCurrency = patch.currency !== undefined ? patch.currency : (cur.currency ?? null);
		const nextAmount = patch.amount !== undefined ? patch.amount : (cur.amount ?? null);
		const resolved = resolveNativePair(nextCurrency, nextAmount);
		if (resolved === null)
			return fail(
				'BAD_CURRENCY',
				'currency+amount must pair: set both together or clear both with null'
			);
		pair = resolved;
	}
	const items = doc.items.slice();
	const cur = items[idx];
	items[idx] = {
		...cur,
		name: patch.name !== undefined ? cleanStr(patch.name) : cur.name,
		priceSat: patch.priceSat !== undefined ? (patch.priceSat as number) : cur.priceSat,
		currency: pair !== null ? pair.currency : cur.currency,
		amount: pair !== null ? pair.amount : cur.amount,
		kind: patch.kind !== undefined ? cleanStr(patch.kind) : cur.kind,
		fiatPriced: patch.fiatPriced !== undefined ? patch.fiatPriced === true : cur.fiatPriced,
		updatedAt: nowMs
	};
	return {
		ok: true,
		value: { schema: POS_CATALOG_SCHEMA_VERSION, updatedAt: nowMs, items }
	};
}

/** Open/close sale for one product (row stays in catalog). */
export function setProductActive(
	doc: PosCatalogDoc,
	id: string,
	active: boolean,
	nowMs: number = Date.now()
): CatalogResult<PosCatalogDoc> {
	const idx = doc.items.findIndex((p) => p.id === id);
	if (idx === -1) return fail('NOT_FOUND', `product not found: ${id}`);
	const items = doc.items.slice();
	items[idx] = { ...items[idx], active, updatedAt: nowMs };
	return {
		ok: true,
		value: { schema: POS_CATALOG_SCHEMA_VERSION, updatedAt: nowMs, items }
	};
}

/** Hard delete — only for never-sold mistakes; sales log keeps its own bill lines. */
export function removeProduct(doc: PosCatalogDoc, id: string): CatalogResult<PosCatalogDoc> {
	if (!doc.items.some((p) => p.id === id)) return fail('NOT_FOUND', `product not found: ${id}`);
	return {
		ok: true,
		value: {
			schema: POS_CATALOG_SCHEMA_VERSION,
			updatedAt: Date.now(),
			items: doc.items.filter((p) => p.id !== id)
		}
	};
}

export function getProduct(doc: PosCatalogDoc, id: string): PosProduct | null {
	return doc.items.find((p) => p.id === id) ?? null;
}

/** Sellable subset — sale UI must pick from this, never from raw items. */
export function listActive(doc: PosCatalogDoc): PosProduct[] {
	return doc.items.filter((p) => p.active);
}

/**
 * Convert-at-entry for HEAVY native prices (rev48 light behavior, intact):
 * seller types a fiat amount → sats via fiatToSats (convert.ts floor +
 * dust-block + RATE_UNAVAILABLE policy). Callers store the returned sats
 * as priceSat ALONGSIDE the original { currency, amount } — never a
 * separately invented number.
 */
export function resolveNativeSats(
	fiatStr: string,
	currency: FiatCurrency,
	entry: RateEntry
): { ok: true; sats: number } | { ok: false; code: string; message: string } {
	if (entry.price === null) {
		return { ok: false, code: 'UNAVAILABLE', message: 'rate unavailable — fiat mode blocked' };
	}
	const r = fiatToSats(fiatStr, currency, entry.price);
	if (!r.ok) return { ok: false, code: r.code, message: r.message };
	return { ok: true, sats: r.sats };
}
