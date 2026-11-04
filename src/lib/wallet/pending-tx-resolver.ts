/**
 * Pending Transaction Auto-Resolver
 *
 * Scans pending transactions on app startup and attempts to auto-resolve
 * by checking quote status with the mint.
 *
 * Call once on Home/History mount via `resolvePendingTransactions()`.
 *
 * TASK-4911 (INTENT-049, failed-policy ใหม่ตามกฎบอส): เลิกดู invoice expiry
 * โดยสิ้นเชิง — failed ได้ทางเดียวคือพิสูจน์แล้วว่าไม่จ่าย:
 *   melt → mint-FAILED / mint-EXPIRED (mint ประกาศผ่าน quote state) /
 *           quote UNPAID หรือ PENDING + checkState ยืนยัน inputs ทั้งหมด
 *           UNSPENT (TASK-4913: PENDING+UNSPENT ทั้งหมด = POST ไม่เคยมีผล =
 *           proven non-payment เช่นเดียวกับ UNPAID — failed + ปล่อยเหรียญ
 *           ทันที, รอบใหม่ขอ quote ใหม่ ไม่ reuse quote เดิม) /
 *           proven non-submit (melt-req-*: phase-1 ไม่เคยได้ quote)
 *   mint → mint-EXPIRED (mint ประกาศ — quote นี้จ่ายไม่ได้อีกแล้ว)
 * PAID / ISSUED / PENDING-ที่พิสูจน์ไม่ได้ (proofIds ไม่มี / proof หาย /
 * check ล้มเหลว / input ไม่ใช่ UNSPENT ทั้งหมด) / UNKNOWN → pending ต่อ
 * เสมอ (stuck-Pending ที่พิสูจน์ไม่ได้คง pending — ไม่มีเส้นตายเวลาใน fail
 * path ใด ๆ ทั้งสิ้น, แม้ invoice หมดอายุแต่ quote ยัง PENDING ก็ตาม).
 */
import { getTransactions, updateTransaction, compareAndSetTransactionStatus } from '../storage/db';
import { checkMintQuote, checkMeltQuote, checkState } from '../cashu/client';
import { MELT_INVOICE_GRACE_MS } from './melt';
import { markSpent, clearReserved, getAllProofs } from './proofsDb';
import { decodeBolt11 } from './bolt11';
import type { Transaction } from '../types';

/**
 * TASK-4406 (INTENT-044) helper, RETAINED for compatibility (callers: the
 * TASK-4909 central-fix test imports isMeltInvoiceDead; bolt11-tags-4910
 * documents the same (timestamp + expiry) * 1000 math).
 *
 * TASK-4911: these pure decode helpers are NOT consulted by ANY fail path
 * anymore — failed ⟺ proven non-payment via mint quote state + checkState.
 * Kept exported so existing importers keep compiling; the resolver and the
 * central poll below never call them for verdicts.
 */
export function getLnbcExpiryMs(tx: Transaction): number | null {
	const invoice = tx.invoice;
	if (!invoice) return null;
	const decoded = decodeBolt11(invoice);
	if ('code' in decoded) return null;
	return (decoded.timestamp + decoded.expiry) * 1000;
}

/**
 * TASK-4902 (M2) helper, RETAINED for compatibility (see module note:
 * TASK-4911 removed every fail-path use — no verdict below reads it).
 * A melt invoice is "dead" only past expiry + MELT_INVOICE_GRACE_MS; until
 * then the tx must stay alive for reconcile (never failed on a guess).
 * Undecodable/missing invoice → null (caller applies legacy handling).
 */
export function isMeltInvoiceDead(tx: Transaction, nowMs: number = Date.now()): boolean | null {
	const expiryMs = getLnbcExpiryMs(tx);
	if (expiryMs === null) return null;
	return nowMs > expiryMs + MELT_INVOICE_GRACE_MS;
}

/**
 * Scan pending transactions and auto-resolve on app startup.
 *
 * Resolution logic — TASK-4911 (INTENT-049, failed-policy ใหม่ตามกฎบอส):
 * invoice expiry / wall-clock timeouts play NO role in any branch. The
 * tx.invoice field is never decoded here; failed ⟺ proven non-payment:
 *  - Mint type → checkMintQuote:
 *      PAID / ISSUED → leave pending for the central mint collector
 *        (never confirm here — TASK-4301).
 *      EXPIRED / FAILED-ish (mint-declared, NOT invoice-decoded) → failed.
 *        The mint guarantees this quote can never be paid → proven unpaid.
 *      UNPAID / PENDING / unknown → stay pending (may still be paid).
 *  - Melt type → checkMeltQuote:
 *      PAID → confirmed + reservation consumed (TASK-4906).
 *      FAILED-ish / EXPIRED (mint-declared) → failed + released NOW.
 *      UNPAID / PENDING → checkState over the bound inputs (proofIds trail):
 *        all UNSPENT ⟺ our POST never took effect ⟺ proven non-payment →
 *        failed + released NOW (TASK-4913: PENDING+UNSPENT ทั้งหมด = POST
 *        ไม่เคยมีผล = proven non-payment เช่นเดียวกับ UNPAID; history
 *        reflects truth immediately; รอบใหม่ขอ quote ใหม่ ไม่ reuse quote
 *        เดิม). Anything less than proof (SPENT/PENDING input, missing
 *        proofs, DB/check failure) → stay pending.
 *      UNKNOWN / anything else → stays pending (no deadline — even with an
 *        expired invoice).
 *  - Melt local-only ids: melt-req-* (phase-1 never produced a quote →
 *    proven non-submit) → failed; legacy orphans melt-{ts}-{rand} →
 *    orphan-skip for manual restore (unprovable either way, unchanged).
 *  - No extractable quote id (other types) → skip (never kill on
 *    uncertainty). Other types (transfer, cashu_send, cashu_receive) → skip.
 *  - Network error / mint unreachable → leave as pending (never kill on
 *    uncertainty).
 *
 * @returns Number of transactions resolved (confirmed or failed)
 */
export async function resolvePendingTransactions(): Promise<number> {
	// TASK-4916 (INTENT-049) boot reclaim: a crash/restart between claim and
	// release can leave a tx stuck in the transient claim state ('checking',
	// or legacy 'minting' rows written before the 4916 rename). Such rows are
	// invisible to every pending filter (central poll, resolver loop below),
	// so without this they would sit unclaimable forever. Reclaim them to
	// pending FIRST — the verdict paths below / the central 5s poll then own
	// them again (a reclaimed PAID mint quote still gets minted for real).
	// Migration accepts BOTH names so pre-rename rows recover too.
	try {
		const all = await getTransactions();
		for (const tx of all) {
			const st = tx.status as string;
			if (st === 'checking' || st === 'minting') {
				await updateTransaction(tx.id, { status: 'pending' }).catch(() => {});
			}
		}
	} catch {
		// Boot must never break on a reclaim-scan failure.
	}
	const txs = await getTransactions({ type: undefined, status: 'pending' });
	let resolved = 0;

	for (const tx of txs) {
		// TASK-4911: NO invoice read, NO wall-clock timeout anywhere in this
		// loop — tx.invoice / tx.timestamp never enter a verdict.
		// TASK-4902: melt txs use extractMeltQuoteId — local-only ids
		// (legacy orphans, phase-1 req ids) carry no quote, so there is
		// nothing to check against: never hammer the mint with junk.
		if (tx.type === 'melt' && extractMeltQuoteId(tx.id) === null && tx.id.startsWith('melt-')) {
			if (tx.id.startsWith('melt-req-')) {
				// Proven non-submit: phase-1 (requestMelt) never produced a
				// quote, so no POST could have left this wallet — failing is
				// truthful, not a guess.
				console.warn(
					`[pending-tx-resolver] non-submit: melt tx ${tx.id} never reached a quote — failing (nothing was submitted)`
				);
				await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
				// Req txs bind no proofs, but settle anyway (trail-safe).
				await settleReservation(tx, false);
				resolved++;
				continue;
			}
			console.warn(
				`[pending-tx-resolver] orphan-skip: melt tx ${tx.id} carries no quote id — leaving for manual restore (no mint call)`
			);
			continue;
		}
		const quoteId = tx.type === 'melt' ? extractMeltQuoteId(tx.id) : extractQuoteId(tx);
		if (!quoteId) {
			// Nothing to verify against — never kill on uncertainty.
			continue;
		}

		try {
			if (tx.type === 'mint') {
				const quote = await checkMintQuote(tx.mint_url, quoteId);
				const state = quote.state ?? (quote.paid ? 'PAID' : 'UNPAID');
				if (state === 'PAID' || state === 'ISSUED') {
					// TASK-4301 (INTENT-043): do NOT confirm here — the central 5s
					// poll in App.svelte owns PAID mint quotes and mints them for
					// real via completeMint (proofs+balance, not a label).
					// Leave pending so the collector claims it (เก็บตกต้องได้เงินจริง).
					continue;
				}
				if (state === 'EXPIRED' || /failed/i.test(state)) {
					// Mint-declared dead quote — this quote can never be paid
					// → proven non-payment (no invoice decode involved).
					await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
					resolved++;
				}
				// UNPAID / PENDING / unknown → stay pending (may still be paid).
			} else if (tx.type === 'melt') {
				const quote = await checkMeltQuote(tx.mint_url, quoteId);
				const state = quote.state ?? (quote.paid ? 'PAID' : 'UNPAID');
				if (state === 'PAID') {
					await updateTransaction(tx.id, { status: 'confirmed' });
					// TASK-4906: PAID = the mint took the inputs — consume
					// the reservation (no stuck lock on the confirm path).
					await settleReservation(tx, true);
					resolved++;
				} else if (/failed/i.test(state) || state === 'EXPIRED') {
					// Mint-declared terminal non-payment → proven unpaid →
					// failed NOW + coins released to the pool.
					await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
					// TASK-4906: proven unpaid — coins return to the pool.
					await settleReservation(tx, false);
					resolved++;
				} else if (state === 'UNPAID' || state === 'PENDING') {
					// Quote sits at UNPAID or PENDING: fail ONLY on checkState
					// proof — all bound inputs still UNSPENT ⟺ our POST never
					// took effect ⟺ proven non-payment → failed NOW + released
					// (TASK-4913: PENDING + all UNSPENT counts exactly like
					// UNPAID — released+unspent = ไม่จ่าย = failed ไม่ใช่
					// confirmed; history reflects truth immediately, and the
					// next attempt requests a FRESH quote — never reuse this
					// quote id). Anything less than proof → stay pending.
					if (await proveMeltUnpaid(tx)) {
						await updateTransaction(tx.id, { status: 'failed' }).catch(() => {});
						await settleReservation(tx, false);
						resolved++;
					}
				}
				// UNKNOWN / anything else (or UNPAID/PENDING-but-unproven) →
				// stays pending (no deadline — even with an expired invoice).
			}
			// Other types (transfer, cashu_send, cashu_receive) → skip
		} catch {
			// Network/mint unreachable → leave as pending (never kill on
			// uncertainty)
		}
	}

	// TASK-4902 (M2 startup-reconcile, amended by TASK-4911): revisit
	// recently-failed melt txs. A tx failed while its mint quote was still
	// PENDING must get one more check at boot: PAID → confirmed (CAS
	// failed→confirmed so the central poll can never double-process it),
	// anything else → stays failed (already terminal; never hammer — one
	// check per boot). Bounds: plausible quote id only (orphans skipped).
	// TASK-4911: NO invoice-dead bound — a failed tx whose quote is actually
	// PAID must still be claimed (money truth beats history; expiry never
	// blocks a verdict in either direction).
	try {
		const failedMelts = await getTransactions({ type: 'melt', status: 'failed' });
		for (const tx of failedMelts) {
			const quoteId = extractMeltQuoteId(tx.id);
			if (quoteId === null) continue;
			try {
				const quote = await checkMeltQuote(tx.mint_url, quoteId);
				const state = quote.state ?? (quote.paid ? 'PAID' : 'UNPAID');
				if (state === 'PAID') {
					const claimed = await compareAndSetTransactionStatus(tx.id, 'failed', 'confirmed');
					// TASK-4906: the late-PAID verdict consumes the inputs —
					// settle the reservation on the claim win (no stuck lock).
					if (claimed) {
						await settleReservation(tx, true);
						resolved++;
					}
				}
			} catch {
				// Network/mint unreachable → stays failed (never kill, never loop)
			}
		}
	} catch {
		// Resolver scan itself failed → ignore (boot must never break)
	}

	return resolved;
}

/**
 * TASK-4911: prove a melt tx UNPAID via NUT-07 checkState over its bound
 * inputs (the tx proofIds trail).
 *
 * Returns true ONLY when every bound input is accounted for in the local
 * DB AND the mint reports every one UNSPENT — i.e. our POST never took
 * effect AND the quote sits at UNPAID ⟺ proven non-payment. The caller
 * then fails the tx + releases the reservation NOW (history = truth).
 *
 * Returns false (stay pending — never kill on uncertainty) when:
 *  - the tx binds no proofIds (legacy — nothing to verify),
 *  - any bound proof is missing locally (can't account all inputs),
 *  - the proofs-DB read fails,
 *  - any input is SPENT/PENDING (mint may hold them), or
 *  - the checkState call itself fails (mint unreachable).
 *
 * Write-free: verdict only — the caller owns updateTransaction + settle.
 */
async function proveMeltUnpaid(tx: Transaction): Promise<boolean> {
	const ids = tx.proofIds;
	if (!ids || ids.length === 0) return false;
	let ours: Array<{ secret: string; C: string }>;
	try {
		const all = await getAllProofs();
		ours = all.filter((p) => ids.includes(p.local_id));
	} catch {
		return false;
	}
	if (ours.length !== ids.length) return false;
	try {
		const result = await checkState(
			tx.mint_url,
			ours.map((p) => ({ secret: p.secret, C: p.C }))
		);
		const states = result.states.map((s) => s.state);
		return states.length > 0 && states.every((s) => s === 'UNSPENT');
	} catch {
		return false;
	}
}

/**
 * TASK-4906: settle the in-flight reservation bound to a melt tx via its
 * proofIds trail (meltFlow binds them at pending-tx creation). PAID settles
 * consume the coins (markSpent — clears the flag); proven-unpaid settles
 * release them back to the spendable pool (clearReserved). Legacy txs carry
 * no proofIds → no-op. Best-effort ALWAYS — boot must never break on a
 * reservation write, and the DB filters (not this call) are the spend gate.
 * Mint-agnostic: driven only by the quote-state verdict the caller proved.
 */
async function settleReservation(tx: Transaction, consumed: boolean): Promise<void> {
	const ids = tx.proofIds;
	if (!ids || ids.length === 0) return;
	try {
		if (consumed) await markSpent(ids);
		else await clearReserved(ids);
	} catch {
		// best-effort — the spendable-pool filters stay correct regardless
	}
}
/**
 * Extract the quote ID from a transaction ID.
 *
 * Convention: tx.id format is "{type}-{quoteId}"
 * e.g. "mint-abc123xyz" → "abc123xyz"
 *      "melt-def456ghi" → "def456ghi"
 */
function extractQuoteId(tx: Transaction): string | null {
	const parts = tx.id.split('-');
	return parts.length >= 2 ? parts.slice(1).join('-') : null;
}

/**
 * TASK-4902 pillar 4: melt quote-ID extraction that recognises local-only
 * ids (no quote to check against):
 *   - legacy orphans `melt-{timestamp}-{rand}` (pre-4902: extractQuoteId
 *     returned "{timestamp}-{rand}" junk → checkMeltQuote(junk) could never
 *     resolve → melt txs nobody followed up);
 *   - phase-1 failures `melt-req-{timestamp}-{rand}` (nothing was submitted).
 *
 * Returns null for both (nothing reconcilable) so callers skip the mint
 * call instead of hammering it with junk. Real quote IDs (UUID-style from
 * requestMeltQuote) never match the local patterns below.
 */
const MELT_LOCAL_TX_RE = /^(req-)?\d+-[a-z0-9]+$/;

export function extractMeltQuoteId(txId: string): string | null {
	if (!txId.startsWith('melt-')) return null;
	const rest = txId.slice(5);
	if (!rest || MELT_LOCAL_TX_RE.test(rest)) return null;
	return rest;
}
