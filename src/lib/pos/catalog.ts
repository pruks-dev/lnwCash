/**
 * TASK-5710 — POS catalog domain v3 pricing rupture (INTENT-057 BLUEPRINT v3 rev5).
 *
 * RUPTURE (Commander ORDER): priceSat is NO LONGER a stored field. The
 * seller's set price — { currency, amount } — is the single truth:
 * - currency 'SAT' + integer amount = SAT-denominated product.
 *   Resolves with NO rate touch (SAT path never reads rates).
 * - fiat currency (THB/…/MYR) + major-unit amount = fiat-denominated
 *   product. Resolves to sats LIVE in buildBill via fiatToSats
 *   (convert.ts floor + dust-block intact).
 *
 * Sats are therefore a COMPUTED value at bill time, never a stored one.
 * Old bills never recompute: sales-log freezes the resolved sats + the
 * rate used + the original truth pair per row.
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
 * stored older docs (schema 1/2 / no schema / missing fields) still load.
 * ---- MIGRATE NOTE (v1/v2 → v3) ----
 * The ONLY place the retired stored-sats field is read is the
 * normalize() migrate path below (clearly marked MIGRATE): it converts
 * legacy rows into truth pairs and then DROPS the old field — the live
 * shape never carries it. Grep gate: stored-sats references are allowed
 * ONLY inside the MIGRATE-marked lines of normalizeCatalogDoc().
 */

import { parseFiatAmount } from '../fiat/convert';
import { SUPPORTED_CURRENCIES, type FiatCurrency } from '../fiat/rates';

export const POS_CATALOG_SCHEMA_VERSION = 3;

/** Product category — free-form label, never affects pricing. */
export type PosProductKind = string;

/**
 * TASK-5702 — per-product option presets (INTENT-057 BLUEPRINT v3 Manage B).
 * Seller-edited template chips shown as the starting set at sale time
 * (e.g. ["sweet-normal","sweet-less"]). Pure data — the sale popup keeps
 * its own global default until a later task wires per-product sets in.
 * Max 20 entries, each trimmed non-empty, capped at 40 chars.
 */
export const POS_PRESET_MAX = 20;
export const POS_PRESET_LEN = 40;

export function cleanPresets(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	const out: string[] = [];
	for (const e of v) {
		if (typeof e !== 'string') continue;
		const t = e.trim();
		if (!t) continue;
		if (out.includes(t)) continue;
		out.push(t.slice(0, POS_PRESET_LEN));
		if (out.length >= POS_PRESET_MAX) break;
	}
	return out;
}

/**
 * Truth currency: a fiat code from rates.ts, or 'SAT' for
 * SAT-denominated products (SAT is a denomination, not a rate input).
 */
export type PosCurrency = FiatCurrency | 'SAT';

export function isPosCurrency(v: unknown): v is PosCurrency {
	return v === 'SAT' || (typeof v === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(v));
}

export function isFiatCurrency(v: unknown): v is FiatCurrency {
	return typeof v === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(v);
}

export interface PosProduct {
	/** Stable id (uuid-ish, unique within catalog). */
	id: string;
	/** Display name. */
	name: string;
	/**
	 * v3 TRUTH — the price the seller set. SAT = integer sats (no rate
	 * involved); fiat = major units in `currency` (resolved to sats live
	 * at bill time via fiatToSats — never stored as sats).
	 */
	currency: PosCurrency;
	/** Truth amount: integer sats for SAT, major units (e.g. 100 = ฿100) for fiat. */
	amount: number;
	/** Category label (e.g. "drink", "snack"). */
	kind: PosProductKind;
	/**
	 * Fiat-flag: when true the seller UI may ALSO show the fiat
	 * equivalent (converted via fiat/* at bill time). Display hint only.
	 */
	fiatPriced: boolean;
	/** 5702 presets — seller-edited option templates (see cleanPresets). */
	presets: string[];
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
	/** Truth pair — REQUIRED in v3 (no stored-sats field exists anymore). */
	currency: PosCurrency;
	/** Truth amount — integer sats for SAT, major units for fiat. */
	amount: number;
	kind?: PosProductKind;
	fiatPriced?: boolean;
	active?: boolean;
	/** 5702 presets — optional at entry, cleaned + defaulted to []. */
	presets?: string[];
}

export type CatalogErrorCode =
	| 'EMPTY_ID'
	| 'EMPTY_NAME'
	| 'BAD_CURRENCY'
	| 'BAD_AMOUNT'
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

function isValidSatAmount(v: unknown): v is number {
	return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/**
 * Truth-amount policy per denomination. Fiat decimal rules come from the
 * fiat stack (parseFiatAmount carries each currency's decimals — never
 * hand-rolled here). SAT amounts must be positive integers (dust policy
 * lives at resolve time in cart.ts via fiatToSats, not at entry).
 */
export function isValidTruthAmount(currency: PosCurrency, amount: unknown): amount is number {
	if (currency === 'SAT') return isValidSatAmount(amount);
	if (!isFiatCurrency(currency)) return false;
	if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return false;
	const checked = parseFiatAmount(String(amount), currency);
	return checked.ok;
}

/** True when the product carries a fiat truth price (SAT products return false). */
export function hasNativePrice(product: Pick<PosProduct, 'currency' | 'amount'>): boolean {
	return (
		isFiatCurrency(product.currency) &&
		typeof product.amount === 'number' &&
		Number.isFinite(product.amount) &&
		product.amount > 0 &&
		parseFiatAmount(String(product.amount), product.currency as FiatCurrency).ok
	);
}

/** Blank catalog (schema-stamped). */
export function emptyCatalog(nowMs: number = Date.now()): PosCatalogDoc {
	return { schema: POS_CATALOG_SCHEMA_VERSION, updatedAt: nowMs, items: [] };
}

/**
 * Normalize unknown persisted data into a valid v3 doc.
 * - null / garbage / wrong shape → empty catalog (never throws)
 * - MIGRATE v1 (stored-sats-only rows) → { SAT, amount = old sats } intact
 * - MIGRATE v2 (stored-sats + fiat pair) → valid pair kept, old sats field
 *   DROPPED; broken pair falls back to { SAT, amount = old sats } so the
 *   row stays sellable; rows with neither are dropped
 * - v3 rows (currency + amount, no stored sats) → kept when the truth pair
 *   validates, dropped otherwise
 * - items missing fields (old entries) → defaults filled, invalid rows dropped
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
		seen.add(id);
		// v3 truth pair first (current shape — no stored sats involved).
		let currency: PosCurrency | null = null;
		let amount: number | null = null;
		if (isPosCurrency(r.currency) && typeof r.amount === 'number') {
			const cur = r.currency as PosCurrency;
			if (isValidTruthAmount(cur, r.amount)) {
				currency = cur;
				amount = r.amount as number;
			}
		}
		// MIGRATE-BEGIN (v1/v2 stored-sats compat — the only place the
		// retired stored-sats field may be read; it is converted to a
		// truth pair and never carried forward).
		if (currency === null || amount === null) {
			const legacySats = r.priceSat;
			if (typeof legacySats === 'number' && Number.isInteger(legacySats) && legacySats > 0) {
				currency = 'SAT';
				amount = legacySats;
			} else {
				continue; // no truth pair and no sellable legacy price — drop
			}
		}
		// MIGRATE-END
		items.push({
			id,
			name,
			currency: currency as PosCurrency,
			amount: amount as number,
			kind: cleanStr(r.kind),
			fiatPriced: r.fiatPriced === true,
			presets: cleanPresets(r.presets),
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

/** Create — id must be unique, name non-empty, truth pair must validate. */
export function addProduct(
	doc: PosCatalogDoc,
	input: PosProductInput,
	nowMs: number = Date.now()
): CatalogResult<PosCatalogDoc> {
	const id = cleanStr(input.id);
	const name = cleanStr(input.name);
	if (!id) return fail('EMPTY_ID', 'product id is empty');
	if (!name) return fail('EMPTY_NAME', 'product name is empty');
	if (!isPosCurrency(input.currency)) return fail('BAD_CURRENCY', 'currency must be SAT or a known fiat code');
	if (!isValidTruthAmount(input.currency, input.amount))
		return fail('BAD_AMOUNT', 'amount must be a positive integer (SAT) or fit the currency decimals (fiat)');
	if (doc.items.some((p) => p.id === id)) return fail('DUPLICATE_ID', `product id exists: ${id}`);
	const product: PosProduct = {
		id,
		name,
		currency: input.currency,
		amount: input.amount,
		kind: cleanStr(input.kind),
		fiatPriced: input.fiatPriced === true,
		presets: cleanPresets(input.presets),
		active: input.active !== false,
		updatedAt: nowMs
	};
	return {
		ok: true,
		value: { schema: POS_CATALOG_SCHEMA_VERSION, updatedAt: nowMs, items: [...doc.items, product] }
	};
}

/** Update mutable fields (name/truth-pair/kind/fiat-flag/presets). Id is immutable. */
export function updateProduct(
	doc: PosCatalogDoc,
	id: string,
	patch: Partial<Pick<PosProduct, 'name' | 'currency' | 'amount' | 'kind' | 'fiatPriced' | 'presets'>>,
	nowMs: number = Date.now()
): CatalogResult<PosCatalogDoc> {
	const idx = doc.items.findIndex((p) => p.id === id);
	if (idx === -1) return fail('NOT_FOUND', `product not found: ${id}`);
	if (patch.name !== undefined && !cleanStr(patch.name))
		return fail('EMPTY_NAME', 'product name is empty');
	// Truth-pair patches merge with the stored pair: patching one side
	// keeps the other (e.g. { amount: 200 } on (THB,100) → (THB,200)).
	// A half-clear (e.g. { currency: null }) is rejected — v3 truth is
	// REQUIRED, a product never holds half a price.
	const touchesPair = patch.currency !== undefined || patch.amount !== undefined;
	let nextCurrency: PosCurrency = doc.items[idx].currency;
	let nextAmount: number = doc.items[idx].amount;
	if (touchesPair) {
		const cur = doc.items[idx];
		nextCurrency = (patch.currency !== undefined ? patch.currency : cur.currency) as PosCurrency;
		nextAmount = patch.amount !== undefined ? (patch.amount as number) : cur.amount;
		if (!isPosCurrency(nextCurrency))
			return fail('BAD_CURRENCY', 'currency must be SAT or a known fiat code');
		if (!isValidTruthAmount(nextCurrency, nextAmount))
			return fail(
				'BAD_AMOUNT',
				'amount must be a positive integer (SAT) or fit the currency decimals (fiat)'
			);
	}
	const items = doc.items.slice();
	const cur = items[idx];
	items[idx] = {
		...cur,
		name: patch.name !== undefined ? cleanStr(patch.name) : cur.name,
		currency: nextCurrency,
		amount: nextAmount,
		kind: patch.kind !== undefined ? cleanStr(patch.kind) : cur.kind,
		fiatPriced: patch.fiatPriced !== undefined ? patch.fiatPriced === true : cur.fiatPriced,
		presets: patch.presets !== undefined ? cleanPresets(patch.presets) : cur.presets,
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
 * Truth-pair validator for seller input WITHOUT a rate (v3 entry needs no
 * conversion): SAT → integer check; fiat → decimals check via the fiat
 * stack. Returns the canonical pair or null. Rate-dependent resolution
 * happens ONLY in cart.buildBill (live) — never here.
 */
export function resolveTruthPair(
	currency: unknown,
	amount: unknown
): { ok: true; currency: PosCurrency; amount: number } | { ok: false; code: string; message: string } {
	if (!isPosCurrency(currency)) {
		return { ok: false, code: 'BAD_CURRENCY', message: 'currency must be SAT or a known fiat code' };
	}
	if (!isValidTruthAmount(currency, amount)) {
		return {
			ok: false,
			code: 'BAD_AMOUNT',
			message: 'amount must be a positive integer (SAT) or fit the currency decimals (fiat)'
		};
	}
	return { ok: true, currency, amount: amount as number };
}
