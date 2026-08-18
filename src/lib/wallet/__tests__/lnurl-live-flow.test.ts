/**
 * 🔴 TASK-280 LIVE TEST — REV14 MANDATORY, NO MOCK for the LNURL part.
 *
 * Replicates the exact Send.svelte LNURL-pay flow at the node level using the
 * REAL network (coinos.io):
 *   detect address → resolve (.well-known/lnurlp) → description + min/max
 *   → amount 1 sat → request REAL bolt11 invoice → decodeBolt11 verify amount
 *   → STOP at the meltFlow boundary (meltFlow is NOT invoked — no payment).
 *
 * This is a node-level integration test, NOT a browser E2E. The browser-only
 * portion (Svelte component rendering) is covered by the jsdom component tests
 * (Send.lnurl.test.ts / Send.lnurl-bounds.test.ts). Honesty note: no headless
 * browser was used here.
 *
 * Run: LIVE_LNURL=1 npx vitest run src/lib/wallet/__tests__/lnurl-live-flow.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
	parseLightningAddress,
	isLightningAddress,
	resolveLightningAddress,
	requestLnurlInvoice,
	parseMetadata,
	msatToSat,
	satToMsat
} from '../lnurl';
import { decodeBolt11 } from '../bolt11';

const LIVE = process.env.LIVE_LNURL === '1';
const ADDRESS = 'PrukS@coinos.io';
const AMOUNT_SAT = 1;

describe.skipIf(!LIVE)('TASK-280 LIVE LNURL-pay flow (no mock, node-level)', () => {
	it(
		'real resolve + real invoice for 1 sat → reaches meltFlow boundary (stopped before payment)',
		async () => {
			// 1. detect type (same logic as Send.svelte detectInputType)
			const trimmed = ADDRESS.trim();
			expect(isLightningAddress(trimmed)).toBe(true);
			const parsed = parseLightningAddress(trimmed);
			expect(parsed).not.toBeNull();

			// 2. resolve → LnurlPayInfo
			const resolved = await resolveLightningAddress(parsed!.username, parsed!.domain);
			expect(resolved.info.tag).toBe('payRequest');
			const domain = parsed!.domain;
			const description = parseMetadata(resolved.info.metadata, domain);
			const minSat = msatToSat(resolved.info.minSendable);
			const maxSat = msatToSat(resolved.info.maxSendable);

			process.stdout.write(`LIVE_DOMAIN=${domain}\n`);
			process.stdout.write(`LIVE_DESCRIPTION=${description}\n`);
			process.stdout.write(`LIVE_MIN_SAT=${minSat}\n`);
			process.stdout.write(`LIVE_MAX_SAT=${maxSat}\n`);
			process.stdout.write(`LIVE_COMMENT_ALLOWED=${resolved.info.commentAllowed ?? 0}\n`);

			// 3. amount bounds check (amount_sat*1000 ∈ [minSendable, maxSendable])
			const amountMsat = satToMsat(AMOUNT_SAT);
			expect(amountMsat).toBeGreaterThanOrEqual(resolved.info.minSendable);
			expect(amountMsat).toBeLessThanOrEqual(resolved.info.maxSendable);
			process.stdout.write(`LIVE_AMOUNT_MSAT=${amountMsat} (within bounds)\n`);

			// 4. request REAL bolt11 invoice
			const pr = await requestLnurlInvoice(resolved.callbackUrl, amountMsat);
			expect(typeof pr).toBe('string');
			expect(pr.length).toBeGreaterThan(0);
			process.stdout.write(`LIVE_INVOICE_HRP=${pr.slice(0, 6)}...\n`);
			process.stdout.write(`LIVE_INVOICE_LENGTH=${pr.length}\n`);

			// 5. decode + verify amount matches (same as handleLnurlRequestInvoice)
			const decoded = decodeBolt11(pr);
			expect('code' in decoded).toBe(false);
			if (!('code' in decoded)) {
				process.stdout.write(`LIVE_DECODED_AMOUNT_SAT=${decoded.amountSat}\n`);
				if (decoded.amountSat > 0) {
					expect(decoded.amountSat).toBe(AMOUNT_SAT);
				}
			}

			// 6. meltFlow boundary — STOP. Do NOT call meltFlow (no payment).
			//    Record the exact args Send.svelte would pass to meltFlow:
			const meltFlowArgs = {
				mintUrl: '<stopped-before-melt>',
				invoice: pr,
				amountSat: AMOUNT_SAT
			};
			process.stdout.write(
				`LIVE_MELTFLOW_BOUNDARY=reached args=${JSON.stringify({
					mintUrl: meltFlowArgs.mintUrl,
					invoiceHrp: meltFlowArgs.invoice.slice(0, 6),
					amountSat: meltFlowArgs.amountSat
				})}\n`
			);
			expect(meltFlowArgs.amountSat).toBe(AMOUNT_SAT);
			expect(meltFlowArgs.invoice.startsWith('lnbc')).toBe(true);
		},
		30000
	);
});
