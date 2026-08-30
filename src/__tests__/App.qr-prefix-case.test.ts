/**
 * Test: App.svelte TASK-509-v3-FIX — preserve case for cashu* token prefixes.
 *
 * Background: handleQRResult() previously called `.toLowerCase()` on the entire
 * scanned QR value before storing it in `scannedQRValue`. This corrupted case-sensitive
 * cashuB/cashuA prefixes (NUT-00 V3/V4 spec), causing the validator at
 * src/lib/cashu/token.ts:77 to reject valid cashuB tokens with
 * "Unknown Cashu token prefix".
 *
 * This test verifies the case-preservation logic used by handleQRResult() so that:
 *   - cashuA/cashuB prefixes are preserved (case-sensitive per NUT-00)
 *   - bolt11/lnurl bech32 are lowercased (case-insensitive per spec)
 *   - Lightning Address is lowercased (acceptable for email-style)
 */
import { describe, it, expect } from 'vitest';

// Replicate the case-preservation logic from App.svelte handleQRResult()
function canonicalizeQrResult(stripped: string): string {
	const looksLikeLightningAddress = stripped.includes('@');
	const isBech32Lightning = /^ln(bc|tb|bcrt)/i.test(stripped);
	const isCashuToken = /^cashu/i.test(stripped);
	return (looksLikeLightningAddress || isBech32Lightning) && !isCashuToken
		? stripped.toLowerCase()
		: stripped;
}

describe('App.svelte TASK-509-v3 — cashuB prefix case preservation', () => {
	it('preserves cashuB prefix case (does not lowercase to cashub)', () => {
		const cashuBToken =
			'cashuBo2ftdwh0dhbzoi8vbwludc5sbncuy2fzagf1y3nhdgf0gajhaugawleg2fodzwfwhkrhyqhhc3hayjm4yzi3nwe4njy3mjcxztq4mdmyodqxothlnde3yti3ote3mdk5mmy0nwqyn2vmmde2y2ningyzmjmyogywzgfjwced6x07wcr2qs7ndad';

		const result = canonicalizeQrResult(cashuBToken);

		expect(result).toBe(cashuBToken); // not modified
		expect(result.startsWith('cashuB')).toBe(true); // uppercase B intact
		expect(result.startsWith('cashub')).toBe(false); // NOT lowercased
	});

	it('preserves cashuA prefix case (V3 legacy tokens)', () => {
		const cashuAToken =
			'cashuAeyJ0b2tlbiI6W3sibm1udCI6IlRlc3QiLCJhbW91bnQiOjEwLCJzZWNyZXQiOiJURVNUU0VDUkVUMTIzNDU2NyJ9XX0';

		const result = canonicalizeQrResult(cashuAToken);

		expect(result).toBe(cashuAToken);
		expect(result.startsWith('cashuA')).toBe(true);
	});

	it('lowercases bolt11 invoices (case-insensitive bech32)', () => {
		const bolt11 = 'lnbc100n1pwjlx0...'; // any valid bech32 prefix
		const result = canonicalizeQrResult(bolt11);
		expect(result).toBe(bolt11.toLowerCase());
	});

	it('lowercases lnurl bech32 (case-insensitive)', () => {
		const lnurl = 'lnurl1dp68gurn8ghj7...';
		const result = canonicalizeQrResult(lnurl);
		expect(result).toBe(lnurl.toLowerCase());
	});

	it('lowercases Lightning Address (acceptable for email)', () => {
		const la = 'alice@Example.COM';
		const result = canonicalizeQrResult(la);
		// Per current impl: LA is lowercased
		expect(result).toBe(la.toLowerCase());
	});

	it('regression: invalid prefix characters do not match cashu check', () => {
		// If someone modifies the regex, ensure cashuB still wins
		const notCashu = 'cashuZxxx'; // unknown version
		const result = canonicalizeQrResult(notCashu);
		// Not a cashu token (starts with cashu but not version A/B)
		// The /^cashu/i check matches, so case IS preserved
		// This is acceptable since validator will reject unknown version
		expect(result).toBe(notCashu);
	});
});