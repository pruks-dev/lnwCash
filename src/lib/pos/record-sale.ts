/**
 * TASK-5405 — paid-success write-first helper (INTENT-054 BLUEPRINT v3)
 *
 * Pure domain: NO svelte imports, NO localStorage, NO wallet imports
 * (no proofsDb / tokenStore / getTransactions — fork forbidden).
 * Payment linkage is by REFERENCE ONLY — a quote-or-token id string
 * carried on SaleRecord.refId (owned by sales-log.ts of 5401).
 *
 * Write-before-show rule (hard): recordSale() persists the new SaleRecord
 * via the injected save() BEFORE returning ok:true. UI layers MUST render
 * the success screen only from the returned value — never before the
 * write. A PERSIST_FAIL return means "no screen": nothing was stored, so
 * there is nothing to show.
 *
 * Time rule (hard): all formatting/bucketing here is DEVICE-LOCAL
 * (getFullYear/getMonth/getDate/getHours/...). Never toISOString() or
 * UTC slicing — the merchant's day ends at local midnight.
 */

import { createSaleRecord, type SaleInput, type SaleRecord } from './sales-log';

export type RecordSaleErrorCode =
	| 'BAD_TOTAL'
	| 'BAD_LINES'
	| 'BAD_METHOD'
	| 'BAD_REF'
	| 'PERSIST_FAIL';

export interface RecordSaleFailure {
	ok: false;
	code: RecordSaleErrorCode;
	message: string;
}

export interface RecordSaleOk {
	ok: true;
	value: SaleRecord;
}

export type RecordSaleResult = RecordSaleOk | RecordSaleFailure;

export interface RecordSaleDeps {
	/** Current log contents (read via getPosSales by the caller). */
	existing: SaleRecord[];
	/**
	 * Persist the appended log (setPosSales by the caller).
	 * Must return true only when the write actually landed.
	 */
	save: (sales: SaleRecord[]) => boolean;
	nowMs?: number;
	rand?: string;
}

/**
 * Validate + stamp + PERSIST the sale, then hand back the stored record
 * for the success screen. The success UI must only render `value` from
 * an ok:true return — that value is guaranteed already on disk.
 */
export function recordSale(input: SaleInput, deps: RecordSaleDeps): RecordSaleResult {
	const created = createSaleRecord(
		input,
		deps.nowMs ?? Date.now(),
		deps.rand ?? Math.random().toString(36).slice(2, 8)
	);
	if (!created.ok) return created;
	const next = [...deps.existing, created.value];
	let saved = false;
	try {
		saved = deps.save(next);
	} catch {
		saved = false;
	}
	if (!saved) {
		return { ok: false, code: 'PERSIST_FAIL', message: 'could not persist sale' };
	}
	return { ok: true, value: created.value };
}

function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

/** Device-local "HH:MM:SS" — local getters only, never UTC. */
export function formatDeviceTime(epochMs: number): string {
	const d = new Date(epochMs);
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Device-local "YYYY-MM-DD HH:MM" — local getters only, never UTC. */
export function formatDeviceDateTime(epochMs: number): string {
	const d = new Date(epochMs);
	return (
		`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
		`${pad2(d.getHours())}:${pad2(d.getMinutes())}`
	);
}

/** Device-local midnight (start of the local calendar day) in epoch ms. */
export function startOfLocalDay(epochMs: number): number {
	const d = new Date(epochMs);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
