/**
 * TASK-4910 (INTENT-049, BLUEPRINT-049 v4 + COMMANDER_ORDER 4908 round-2
 * rev52+rev53): parseTagsFrom5Bit rewritten per BOLT #11.
 *
 * Spec rules under test:
 *   - data_length = TWO 5-bit groups (10-bit big-endian group count).
 *     No single-group length, no `31` escape — the spec has neither.
 *   - NO zero-break on type 0 — the spec defines no terminator; tagged
 *     fields run to the signature boundary (data end minus 104 groups).
 *   - `x` (6, expiry) data is a big-endian integer OVER THE 5-BIT GROUPS
 *     (base-32 fold, like the timestamp): groups [1,28] = 60s — NOT a
 *     byte-fold (which would wrongly give 15).
 *   - default 3600 applies ONLY when tag x is absent.
 *
 * Craft is spec-native (two-group lengths throughout) and INDEPENDENT of
 * the old wrong-model craft (single-group length + escape-31 + tag-0
 * terminator) — the old file is deleted, nothing is reused. Real BOLT #11
 * spec vectors (V1/V2 strings) anchor every claim; an independent python
 * reference decode (evidence) confirms V1 has NO x tag (→3600 correct)
 * and V2 carries x=[1,28] (→60).
 */
import { describe, it, expect } from 'vitest';
import { decodeBolt11 } from '../bolt11';
import { polymod, hrpExpand, convertBits } from '../bech32';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

// BOLT #11 spec vectors (real strings, verbatim from the spec).
const V1 =
	'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2pkx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcsyz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erqz25le42c4u4ecky03ylcqca784w';
const V2 =
	'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';

/** Minimal base-32 (5-bit group) big-endian encoding of an integer. */
function toGroupsBe(v: number): number[] {
	if (v === 0) return [0];
	const out: number[] = [];
	let n = v;
	while (n > 0) {
		out.unshift(n % 32);
		n = Math.floor(n / 32);
	}
	return out;
}

/** 35-bit timestamp as 7 x 5-bit groups, big-endian. */
function timestampGroups(ts: number): number[] {
	const out: number[] = [];
	for (let i = 6; i >= 0; i--) out.push(Math.floor(ts / 32 ** i) % 32);
	return out;
}

interface CraftTag {
	type: number;
	/** raw 5-bit data groups (already in wire form) */
	groups: number[];
}

function bytesToGroups(bytes: number[]): number[] {
	return convertBits(bytes, 8, 5, true)!;
}

/**
 * Craft a checksum-valid bolt11 invoice per the SPEC wire format:
 * timestamp + tagged fields (type + TWO-GROUP length + data) + 104
 * zero groups as the signature placeholder. No zero-terminator, no
 * escape rule — lengths are always two groups.
 */
function craftInvoice(timestamp: number, tags: CraftTag[], hrp = 'lnbc'): string {
	const data5: number[] = [...timestampGroups(timestamp)];
	for (const t of tags) {
		data5.push(t.type);
		data5.push(Math.floor(t.groups.length / 32), t.groups.length % 32);
		data5.push(...t.groups);
	}
	for (let i = 0; i < 104; i++) data5.push(0);
	const mod = polymod([...hrpExpand(hrp), ...data5, 0, 0, 0, 0, 0, 0]) ^ 1;
	const chk: number[] = [];
	for (let p = 0; p < 6; p++) chk.push((mod >> (5 * (5 - p))) & 31);
	return `${hrp}1${[...data5, ...chk].map((v) => CHARSET[v]).join('')}`;
}

/** Expiry tag in wire form: integer → minimal base-32 groups. */
function xTag(seconds: number): CraftTag {
	return { type: 6, groups: toGroupsBe(seconds) };
}

/** Payment-hash tag: 32 bytes → 52 wire groups (as real invoices carry). */
function pTag(fill = 0xab): CraftTag {
	return { type: 1, groups: bytesToGroups(new Array(32).fill(fill)) };
}

/** Description tag from ASCII. */
function dTag(text: string): CraftTag {
	return { type: 13, groups: bytesToGroups([...text].map((c) => c.charCodeAt(0))) };
}

const TS = 1_700_000_000;

describe('TASK-4910 spec vectors — real BOLT #11 strings', () => {
	it('V2 coffee vector (x=[1,28] → 60s): expiry 60 + hash + description', () => {
		const d = decodeBolt11(V2);
		expect(d).not.toHaveProperty('code');
		const v = d as { expiry: number; timestamp: number; paymentHash: string; description: string };
		expect(v.timestamp).toBe(1496314658);
		expect(v.expiry).toBe(60);
		expect(v.paymentHash).toBe(
			'0001020304050607080900010203040506070809000102030405060708090102'
		);
		expect(v.description).toBe('1 cup coffee');
	});

	it('V1 donation vector (NO x tag): expiry defaults 3600, hash+desc intact', () => {
		const d = decodeBolt11(V1);
		expect(d).not.toHaveProperty('code');
		const v = d as { expiry: number; timestamp: number; paymentHash: string; description: string };
		expect(v.timestamp).toBe(1496314658);
		expect(v.expiry).toBe(3600);
		expect(v.paymentHash).toHaveLength(64);
		expect(v.paymentHash).toBe(
			'0001020304050607080900010203040506070809000102030405060708090102'
		);
		expect(v.description).toBe('Please consider supporting this project');
	});
});

describe('TASK-4910 spec craft — two-group lengths, no zero-break', () => {
	it('60s expiry (x 2 groups) reads 60 — group-fold, not byte-fold (15)', () => {
		const inv = craftInvoice(TS, [xTag(60)]);
		expect(toGroupsBe(60)).toEqual([1, 28]);
		const d = decodeBolt11(inv);
		expect(d).not.toHaveProperty('code');
		expect((d as { expiry: number }).expiry).toBe(60);
		expect((d as { timestamp: number }).timestamp).toBe(TS);
	});

	it('1-week expiry 604800 (x 4 groups) reads 604800', () => {
		const inv = craftInvoice(TS, [xTag(604_800)]);
		expect(toGroupsBe(604_800)).toEqual([18, 14, 20, 0]);
		const d = decodeBolt11(inv);
		expect(d).not.toHaveProperty('code');
		expect((d as { expiry: number }).expiry).toBe(604_800);
	});

	it('30-day expiry 2592000, boss-case shape (x 5 groups / 25 bits) after p+d — no desync', () => {
		// Mirrors a real invoice: 52-group payment hash FIRST (length field
		// (1,20)=52 — the exact spot the old single-group reader desynced),
		// then description, then the 25-bit expiry. Type-0-valued groups
		// inside the hash must not truncate anything.
		const inv = craftInvoice(TS, [pTag(), dTag('task-4910 boss shape'), xTag(2_592_000)]);
		expect(toGroupsBe(2_592_000)).toEqual([2, 15, 3, 8, 0]);
		const d = decodeBolt11(inv);
		expect(d).not.toHaveProperty('code');
		const v = d as { expiry: number; paymentHash: string; description: string };
		expect(v.expiry).toBe(2_592_000);
		expect(v.paymentHash).toBe('ab'.repeat(32));
		expect(v.description).toBe('task-4910 boss shape');
	});

	it('no x tag → default 3600', () => {
		const d = decodeBolt11(craftInvoice(TS, [pTag(), dTag('no expiry here')]));
		expect(d).not.toHaveProperty('code');
		expect((d as { expiry: number }).expiry).toBe(3600);
	});

	it('type-0 tag is data, not a terminator — tags after it still parse', () => {
		const inv = craftInvoice(TS, [xTag(60), { type: 0, groups: [7] }, dTag('after-zero')]);
		const d = decodeBolt11(inv);
		expect(d).not.toHaveProperty('code');
		const v = d as { expiry: number; description: string };
		expect(v.expiry).toBe(60);
		expect(v.description).toBe('after-zero');
	});

	it('long length fields (>= 32 groups) use the plain 10-bit form — 52-group hash intact', () => {
		// p data is 52 groups → length field (1,20). Old escape-31 rule
		// could never even express this; the parse must be exact.
		const inv = craftInvoice(TS, [pTag(0x00), xTag(300)]);
		const d = decodeBolt11(inv);
		expect(d).not.toHaveProperty('code');
		const v = d as { expiry: number; paymentHash: string };
		expect(v.expiry).toBe(300);
		expect(v.paymentHash).toBe('00'.repeat(32));
	});

	it('regression sweep: short x values never fall to default; tag-less still 3600', () => {
		for (const secs of [1, 15, 60, 300, 3600, 86_400, 604_800, 2_592_000]) {
			const d = decodeBolt11(craftInvoice(TS, [xTag(secs)]));
			expect(d).not.toHaveProperty('code');
			expect((d as { expiry: number }).expiry).toBe(secs);
		}
		expect((decodeBolt11(craftInvoice(TS, [])) as { expiry: number }).expiry).toBe(3600);
	});

	it('getLnbcExpiryMs-equivalent math: (timestamp + expiry) * 1000', () => {
		const d = decodeBolt11(craftInvoice(TS, [xTag(2_592_000)]));
		expect(d).not.toHaveProperty('code');
		const { timestamp, expiry } = d as { timestamp: number; expiry: number };
		expect((timestamp + expiry) * 1000).toBe((TS + 2_592_000) * 1000);
	});
});
