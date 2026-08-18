import { describe, it, expect } from 'vitest';
import { msatToSat, satToMsat } from '../lnurl';

describe('msatToSat / satToMsat', () => {
	it('converts 1000 msat → 1 sat', () => {
		expect(msatToSat(1000)).toBe(1);
	});

	it('converts 1 sat → 1000 msat', () => {
		expect(satToMsat(1)).toBe(1000);
	});

	it('round-trips sat → msat → sat', () => {
		for (const sat of [0, 1, 21, 100, 250000, 100000000]) {
			expect(msatToSat(satToMsat(sat))).toBe(sat);
		}
	});

	it('round-trips msat → sat → msat (exact multiples of 1000)', () => {
		for (const msat of [0, 1000, 21000, 250000000, 100000000000]) {
			expect(satToMsat(msatToSat(msat))).toBe(msat);
		}
	});

	it('rounds fractional msat to nearest sat', () => {
		expect(msatToSat(1500)).toBe(2); // 1.5 sat → 2 (round half up)
		expect(msatToSat(1499)).toBe(1);
	});

	it('handles zero', () => {
		expect(msatToSat(0)).toBe(0);
		expect(satToMsat(0)).toBe(0);
	});

	it('handles large values without overflow', () => {
		expect(satToMsat(100000000)).toBe(100000000000); // 1 BTC in msat
	});
});
