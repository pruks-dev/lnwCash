/**
 * TASK-5401 — POS sales-log domain (INTENT-054 BLUEPRINT v3)
 *
 * Pure domain: NO svelte imports, NO localStorage, NO tokenStore/proofsDb.
 * Payment linkage is by REFERENCE ONLY — a quote-or-token id string.
 * Never import wallet/cashu stores here (fork forbidden).
 *
 * Time rule (hard): all day/shift bucketing is DEVICE-LOCAL
 * (getFullYear/getMonth/getDate). Never toISOString/UTC slicing —
 * the merchant's day ends at local midnight, not 17:00 UTC.
 */

import type { FiatCurrency } from '../fiat/rates';
import type { BillLine } from './cart';
import { lineIdFor, normalizeIdentity } from './cart';

export const POS_SALES_SCHEMA_VERSION = 1;

/** Settlement rail — reference id points at the wallet-side object. */
export type PosPayMethod = 'lightning' | 'cashu';

export interface SaleFiatSnapshot {
	currency: FiatCurrency;
	pricePerBtc: number | null;
	amount: number | null;
	text: string;
}

export interface SaleRecord {
	/** Sale id — unique per device. */
	id: string;
	/** Device-local ISO with numeric offset (never UTC "Z"). */
	createdAtIso: string;
	/** Device epoch ms (bucketing source of truth). */
	createdAtMs: number;
	totalSat: number;
	fiat: SaleFiatSnapshot;
	method: PosPayMethod;
	/**
	 * Link-by-id ONLY: lightning quote id or cashu token id.
	 * The wallet store owns the object — this log never duplicates it.
	 */
	refId: string;
	lines: BillLine[];
}

export interface SaleInput {
	totalSat: number;
	fiat: SaleFiatSnapshot;
	method: PosPayMethod;
	refId: string;
	lines: BillLine[];
}

export interface DaySummary {
	/** Device-local day key "YYYY-MM-DD". */
	day: string;
	count: number;
	totalSat: number;
	byMethod: Record<PosPayMethod, { count: number; totalSat: number }>;
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

function pad3(n: number): string {
	if (n < 10) return `00${n}`;
	if (n < 100) return `0${n}`;
	return `${n}`;
}

/**
 * Device-local ISO with numeric offset, e.g. 2026-11-10T14:03:22.118+07:00.
 * Built from local getters — toISOString() (UTC) is forbidden here.
 */
export function toDeviceIso(epochMs: number): string {
	const d = new Date(epochMs);
	const offMin = -d.getTimezoneOffset(); // +420 for UTC+7
	const sign = offMin >= 0 ? '+' : '-';
	const abs = Math.abs(offMin);
	return (
		`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
		`T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}` +
		`${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
	);
}

/** Device-local day key "YYYY-MM-DD" — local midnight boundary, not UTC. */
export function deviceDayKey(epochMs: number): string {
	const d = new Date(epochMs);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isMethod(v: unknown): v is PosPayMethod {
	return v === 'lightning' || v === 'cashu';
}

/**
 * 5603 — normalize one persisted bill line (2-shape reader).
 * Pre-5603 rows carry no modifier/note fields at all → they normalize to
 * '' (empty note) and stay readable; the line still renders and totals
 * still add up. Rows missing the sell-critical fields (product/name/
 * price/qty) are dropped (null) — a sale left with zero valid lines is
 * dropped by normalizeSales below.
 */
export function normalizeSaleLine(raw: unknown): BillLine | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.productId !== 'string' || r.productId.trim() === '') return null;
	if (typeof r.name !== 'string' || r.name.trim() === '') return null;
	if (!Number.isInteger(r.unitPriceSat) || (r.unitPriceSat as number) <= 0) return null;
	if (!Number.isInteger(r.qty) || (r.qty as number) <= 0) return null;
	const productId = r.productId as string;
	const unitPriceSat = r.unitPriceSat as number;
	const qty = r.qty as number;
	const ident = normalizeIdentity({
		modifier: r.modifier,
		modifierLabel: r.modifierLabel,
		note: r.note
	});
	const lineTotalSat =
		Number.isInteger(r.lineTotalSat) && (r.lineTotalSat as number) > 0
			? (r.lineTotalSat as number)
			: unitPriceSat * qty;
	return {
		productId,
		name: r.name as string,
		unitPriceSat,
		qty,
		lineTotalSat,
		lineId:
			typeof r.lineId === 'string' && (r.lineId as string).trim() !== ''
				? (r.lineId as string)
				: lineIdFor(productId, ident),
		modifier: ident.modifier,
		modifierLabel: ident.modifierLabel,
		note: ident.note
	};
}

/**
 * Normalize unknown persisted data into a SaleRecord[].
 * Corrupt rows are dropped, valid rows kept — never throws.
 * Pre-5401 shaped rows (missing schema-era fields) fill safe defaults.
 * 5603: bill lines pass through normalizeSaleLine — pre-5603 lines
 * (productId-only identity, no modifier/note) read as empty-note lines.
 */
export function normalizeSales(raw: unknown): SaleRecord[] {
	if (!Array.isArray(raw)) return [];
	const out: SaleRecord[] = [];
	for (const row of raw) {
		if (typeof row !== 'object' || row === null) continue;
		const r = row as Record<string, unknown>;
		if (typeof r.id !== 'string' || r.id.trim() === '') continue;
		if (!isMethod(r.method)) continue;
		if (!Number.isInteger(r.totalSat) || (r.totalSat as number) <= 0) continue;
		if (!Array.isArray(r.lines) || r.lines.length === 0) continue;
		if (typeof r.refId !== 'string' || (r.refId as string).trim() === '') continue;
		const createdAtMs =
			typeof r.createdAtMs === 'number' && Number.isFinite(r.createdAtMs)
				? (r.createdAtMs as number)
				: Date.now();
		const fiat = (typeof r.fiat === 'object' && r.fiat !== null ? r.fiat : {}) as Record<
			string,
			unknown
		>;
		const lines = Array.isArray(r.lines)
			? (r.lines.map(normalizeSaleLine).filter((l) => l !== null) as BillLine[])
			: [];
		if (lines.length === 0) continue;
		out.push({
			id: r.id as string,
			createdAtIso:
				typeof r.createdAtIso === 'string' && (r.createdAtIso as string).length > 0
					? (r.createdAtIso as string)
					: toDeviceIso(createdAtMs),
			createdAtMs,
			totalSat: r.totalSat as number,
			fiat: {
				currency: typeof fiat.currency === 'string' ? (fiat.currency as FiatCurrency) : 'THB',
				pricePerBtc:
					typeof fiat.pricePerBtc === 'number' && Number.isFinite(fiat.pricePerBtc)
						? (fiat.pricePerBtc as number)
						: null,
				amount:
					typeof fiat.amount === 'number' && Number.isFinite(fiat.amount)
						? (fiat.amount as number)
						: null,
				text: typeof fiat.text === 'string' ? (fiat.text as string) : ''
			},
			method: r.method as PosPayMethod,
			refId: r.refId as string,
			lines
		});
	}
	return out;
}

/** Append one sale — validates totals/lines/method, stamps device time + id. */
export function createSaleRecord(
	input: SaleInput,
	nowMs: number = Date.now(),
	rand: string = Math.random().toString(36).slice(2, 8)
):
	| { ok: true; value: SaleRecord }
	| { ok: false; code: 'BAD_TOTAL' | 'BAD_LINES' | 'BAD_METHOD' | 'BAD_REF'; message: string } {
	if (!Number.isInteger(input.totalSat) || input.totalSat <= 0) {
		return { ok: false, code: 'BAD_TOTAL', message: 'totalSat must be a positive integer' };
	}
	if (!Array.isArray(input.lines) || input.lines.length === 0) {
		return { ok: false, code: 'BAD_LINES', message: 'sale needs at least one bill line' };
	}
	if (!isMethod(input.method)) return { ok: false, code: 'BAD_METHOD', message: 'unknown method' };
	if (typeof input.refId !== 'string' || input.refId.trim() === '') {
		return { ok: false, code: 'BAD_REF', message: 'refId (quote/token id) is required' };
	}
	return {
		ok: true,
		value: {
			id: `sale_${nowMs}_${rand}`,
			createdAtIso: toDeviceIso(nowMs),
			createdAtMs: nowMs,
			totalSat: input.totalSat,
			fiat: input.fiat,
			method: input.method,
			refId: input.refId,
			lines: input.lines
		}
	};
}

function emptyMethodSplit(): Record<PosPayMethod, { count: number; totalSat: number }> {
	return {
		lightning: { count: 0, totalSat: 0 },
		cashu: { count: 0, totalSat: 0 }
	};
}

/** Day summary for one device-local day key — shift/khata closing reads this. */
export function summarizeDay(sales: SaleRecord[], day: string): DaySummary {
	const byMethod = emptyMethodSplit();
	let count = 0;
	let totalSat = 0;
	for (const s of sales) {
		if (deviceDayKey(s.createdAtMs) !== day) continue;
		count += 1;
		totalSat += s.totalSat;
		byMethod[s.method].count += 1;
		byMethod[s.method].totalSat += s.totalSat;
	}
	return { day, count, totalSat, byMethod };
}

/** Arbitrary device-local window [startMs, endMs) — for shift cuts. */
export function summarizeShift(sales: SaleRecord[], startMs: number, endMs: number): DaySummary {
	const byMethod = emptyMethodSplit();
	let count = 0;
	let totalSat = 0;
	for (const s of sales) {
		if (s.createdAtMs < startMs || s.createdAtMs >= endMs) continue;
		count += 1;
		totalSat += s.totalSat;
		byMethod[s.method].count += 1;
		byMethod[s.method].totalSat += s.totalSat;
	}
	return { day: `${toDeviceIso(startMs)}..${toDeviceIso(endMs)}`, count, totalSat, byMethod };
}

/** All device-local days present in the log, ascending. */
export function listSaleDays(sales: SaleRecord[]): string[] {
	const set = new Set<string>();
	for (const s of sales) set.add(deviceDayKey(s.createdAtMs));
	return [...set].sort();
}
