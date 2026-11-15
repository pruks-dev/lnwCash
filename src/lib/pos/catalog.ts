/**
 * TASK-5401 — POS catalog domain (INTENT-054 BLUEPRINT v3)
 *
 * Pure domain: NO svelte imports, NO localStorage, NO fetch.
 * Persistence lives in src/lib/storage/local.ts (pos:catalog key);
 * this file only owns the in-memory document shape + validation.
 *
 * Schema versioning: every persisted doc carries `schema`.
 * Readers MUST go through normalizeCatalogDoc() so installs that
 * stored older docs (no schema / missing fields) still load.
 */

export const POS_CATALOG_SCHEMA_VERSION = 1;

/** Product category — free-form label, never affects pricing. */
export type PosProductKind = string;

export interface PosProduct {
	/** Stable id (uuid-ish, unique within catalog). */
	id: string;
	/** Display name. */
	name: string;
	/** Unit price in sats (integer > 0). Single source of truth for math. */
	priceSat: number;
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
	kind?: PosProductKind;
	fiatPriced?: boolean;
	active?: boolean;
}

export type CatalogErrorCode =
	| 'EMPTY_ID'
	| 'EMPTY_NAME'
	| 'BAD_PRICE'
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

/** Blank catalog (schema-stamped). */
export function emptyCatalog(nowMs: number = Date.now()): PosCatalogDoc {
	return { schema: POS_CATALOG_SCHEMA_VERSION, updatedAt: nowMs, items: [] };
}

/**
 * Normalize unknown persisted data into a valid doc.
 * - null / garbage / wrong shape → empty catalog (never throws)
 * - missing schema (pre-5401 installs) → stamped v1, items kept when valid
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
		if (!isValidPrice(r.priceSat)) continue;
		seen.add(id);
		items.push({
			id,
			name,
			priceSat: r.priceSat as number,
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

/** Create — id must be unique, name non-empty, priceSat positive integer. */
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
	const product: PosProduct = {
		id,
		name,
		priceSat: input.priceSat,
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

/** Update mutable fields (name/price/kind/fiat-flag). Id is immutable. */
export function updateProduct(
	doc: PosCatalogDoc,
	id: string,
	patch: Partial<Pick<PosProduct, 'name' | 'priceSat' | 'kind' | 'fiatPriced'>>,
	nowMs: number = Date.now()
): CatalogResult<PosCatalogDoc> {
	const idx = doc.items.findIndex((p) => p.id === id);
	if (idx === -1) return fail('NOT_FOUND', `product not found: ${id}`);
	if (patch.name !== undefined && !cleanStr(patch.name))
		return fail('EMPTY_NAME', 'product name is empty');
	if (patch.priceSat !== undefined && !isValidPrice(patch.priceSat))
		return fail('BAD_PRICE', 'priceSat must be a positive integer');
	const items = doc.items.slice();
	const cur = items[idx];
	items[idx] = {
		...cur,
		name: patch.name !== undefined ? cleanStr(patch.name) : cur.name,
		priceSat: patch.priceSat !== undefined ? (patch.priceSat as number) : cur.priceSat,
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
