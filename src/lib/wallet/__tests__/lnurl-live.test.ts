/**
 * 🔴 LIVE TEST — REV14 MANDATORY, NO MOCK.
 *
 * Resolves the real lightning address PrukS@coinos.io and requests a real
 * bolt11 invoice. Requires outbound internet. Gated by LIVE_LNURL=1 so it
 * does not run (or fail) in the default unit-test suite.
 *
 * Run: LIVE_LNURL=1 npx vitest run src/lib/wallet/__tests__/lnurl-live.test.ts
 */
import { describe, it, expect } from 'vitest';
import { resolveLightningAddress, requestLnurlInvoice, parseMetadata } from '../lnurl';

const LIVE = process.env.LIVE_LNURL === '1';

describe.skipIf(!LIVE)('LIVE LNURL-pay @ PrukS@coinos.io (no mock)', () => {
	it(
		'resolves lightning address → HTTP 200 + tag=payRequest + text/plain metadata',
		async () => {
			const result = await resolveLightningAddress('PrukS', 'coinos.io');
			expect(result.info.tag).toBe('payRequest');
			expect(result.callbackUrl).toMatch(/^https?:\/\//);

			const metaText = parseMetadata(result.info.metadata, 'coinos.io');
			expect(metaText).toBe('Paying PrukS@coinos.io');

			// surface the metadata text for evidence logs
			process.stdout.write(`LIVE_METADATA text/plain=${metaText}\n`);
			process.stdout.write(`LIVE_CALLBACK=${result.callbackUrl}\n`);
		},
		30000
	);

	it(
		'requests a real bolt11 invoice (lnbc...) for 1000 msat',
		async () => {
			const resolved = await resolveLightningAddress('PrukS', 'coinos.io');
			const pr = await requestLnurlInvoice(resolved.callbackUrl, 1000);
			expect(typeof pr).toBe('string');
			expect(pr.length).toBeGreaterThan(0);
			expect(pr.startsWith('lnbc')).toBe(true);
			process.stdout.write(`LIVE_INVOICE=${pr}\n`);
		},
		30000
	);
});
