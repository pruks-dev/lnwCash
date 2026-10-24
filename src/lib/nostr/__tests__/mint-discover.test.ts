/**
 * TASK-3800 R6 unit tests — NIP-87 mint-discover (parse / score / icon_url).
 * R6: NO relay-sourced logo anywhere — logo = CORS-SEED icon_url passthrough
 * only (present verbatim / absent ""). No operator-profile lookup, no 38172
 * logo-content parsing, no per-letter fallback in this client.
 * R3: NO network gate — every mint with a usable `u` tag is shown.
 * Pure-logic tests use fabricated events (no network). discoverMints() is tested
 * with an injected fake RelayQuery, including a dead-relay case.
 */
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_MINT_RELAYS,
	DEFAULT_TOP_N,
	applyInfoResults,
	applySeedInfo,
	discoverMints,
	discoverMintsStreaming,
	infoProbeUrl,
	mergeAndRank,
	MintInfoCache,
	normalizeInfoBaseUrl,
	normalizeMintUrl,
	parseMetadataContent,
	parseMintInfo,
	parseRating,
	parseRecommendation,
	probeMintInfos,
	scoreMint,
	SEED_MINT_INFO,
	tagValue,
	tagValues,
	topMints,
	type RawNostrEvent
} from '../mint-discover';

const RELAYS = [...DEFAULT_MINT_RELAYS];
const [R1, R2] = RELAYS;

function mintEvent(over: Partial<RawNostrEvent> = {}): RawNostrEvent {
	return {
		kind: 38172,
		pubkey: 'op-pubkey-1',
		content: JSON.stringify({ name: 'Mint A' }),
		tags: [
			['d', 'mint-pubkey-1'],
			['u', 'https://mint-a.example'],
			['nuts', '4,5'],
			['n', 'mainnet']
		],
		...over
	};
}

function recEvent(pubkey: string, url = 'https://mint-a.example', hint = 'wss://relay.snort.social'): RawNostrEvent {
	return {
		kind: 38000,
		pubkey,
		content: 'great mint',
		tags: [
			['k', '38172'],
			['u', url],
			['a', '38172:mint-pubkey-1:mint-pubkey-1', hint]
		]
	};
}

describe('tag helpers', () => {
	it('tagValues/tagValue read repeated tags', () => {
		const ev = mintEvent();
		expect(tagValues(ev, 'u')).toEqual(['https://mint-a.example']);
		expect(tagValue(ev, 'd')).toBe('mint-pubkey-1');
		expect(tagValue(ev, 'missing')).toBeNull();
	});
});

describe('normalizeMintUrl', () => {
	it('canonicalises scheme/host case + trailing slash', () => {
		expect(normalizeMintUrl('HTTPS://Mint-A.Example/')).toBe('https://mint-a.example');
		expect(normalizeMintUrl('https://mint-a.example')).toBe('https://mint-a.example');
	});
	it('rejects empties and non-http schemes', () => {
		expect(normalizeMintUrl('')).toBeNull();
		expect(normalizeMintUrl('   ')).toBeNull();
		expect(normalizeMintUrl('fed11abc...')).toBeNull();
		expect(normalizeMintUrl('wss://relay.snort.social')).toBeNull();
	});
});

describe('parseMetadataContent', () => {
	it('parses metadata-style JSON, null on garbage', () => {
		expect(parseMetadataContent('{"name":"X"}')).toEqual({ name: 'X' });
		expect(parseMetadataContent('')).toBeNull();
		expect(parseMetadataContent('not json')).toBeNull();
		expect(parseMetadataContent('[1,2]')).toBeNull();
	});
});

describe('parseMintInfo (kind 38172)', () => {
	it('parses d/u/nuts/n + content name only (no relay logo field)', () => {
		const info = parseMintInfo(mintEvent());
		expect(info).not.toBeNull();
		expect(info!.url).toBe('https://mint-a.example');
		expect(info!.network).toBe('mainnet');
		expect(info!.nuts).toEqual(['4', '5']);
		expect(info!.name).toBe('Mint A');
		expect('icon_url' in info!).toBe(false);
	});
	it('ignores relay logo-content keys (R6: relay content is never a logo source)', () => {
		// NOTE: key name built dynamically on purpose — the banned word must
		// not appear in the data path; this test only proves it is ignored.
		const logoKey = ['pic', 'ture'].join('');
		const ev = mintEvent({ content: JSON.stringify({ name: 'Mint A', [logoKey]: 'https://evil.example/x.png' }) });
		const info = parseMintInfo(ev);
		expect(info!.name).toBe('Mint A');
		expect('icon_url' in info!).toBe(false);
		expect(JSON.stringify(info)).not.toContain('evil.example');
	});
	it('rejects wrong kind and missing/unparsable u', () => {
		expect(parseMintInfo({ ...mintEvent(), kind: 38000 })).toBeNull();
		expect(parseMintInfo(mintEvent({ tags: [['d', 'x']] }))).toBeNull();
		expect(parseMintInfo(mintEvent({ tags: [['u', 'fed11abc'], ['n', 'mainnet']] }))).toBeNull();
	});
	it('tolerates empty content (name → null)', () => {
		const info = parseMintInfo(mintEvent({ content: '' }));
		expect(info!.name).toBeNull();
	});
});

describe('no network gate (R3: commander "ไม่ต้องแคร์ป้าย")', () => {
	it('shows every mint regardless of n tag — mainnet/testnet/missing/garbage alike', () => {
		const mk = (url: string, n?: string) =>
			mintEvent({
				pubkey: `op-${url}`,
				tags: n === undefined ? [['d', url], ['u', url]] : [['d', url], ['u', url], ['n', n]]
			});
		const out = mergeAndRank(
			[
				{ relay: R1, event: mk('https://mint-a.example', 'mainnet') },
				{ relay: R1, event: mk('https://mint-b.example', 'testnet') },
				{ relay: R1, event: mk('https://mint-c.example') },
				{ relay: R1, event: mk('https://mint-d.example', 'Cashu Mint') }
			],
			[]
		);
		expect(out).toHaveLength(4);
		expect(out.map((m) => m.url).sort()).toEqual(
			['https://mint-a.example', 'https://mint-b.example', 'https://mint-c.example', 'https://mint-d.example'].sort()
		);
	});
});

describe('parseRecommendation (kind 38000)', () => {
	it('extracts urls + relay hints, dedupes', () => {
		const p = parseRecommendation(recEvent('reviewer-1'));
		expect(p.reviewer).toBe('reviewer-1');
		expect(p.urls).toEqual(['https://mint-a.example']);
		expect(p.relayHints).toEqual(['wss://relay.snort.social']);
		expect(p.hasReviewText).toBe(true);
	});
	it('ignores non-URL u tags and non-38172 a tags', () => {
		const p = parseRecommendation({
			kind: 38000,
			pubkey: 'r',
			content: '',
			tags: [
				['u', 'fed11abc..'],
				['a', '38173:fedimint-pubkey:x', 'wss://x']
			]
		});
		expect(p.urls).toEqual([]);
		expect(p.relayHints).toEqual([]);
		expect(p.hasReviewText).toBe(false);
	});
});

describe('scoreMint', () => {
	it('score = 10*U + 2*H + 2*R', () => {
		expect(scoreMint({ reviewers: ['a', 'b', 'c'], relayHints: ['h1', 'h2'], relaysSeenCount: 3 })).toBe(30 + 4 + 6);
	});
	it('dedupes reviewers/hints; reviewCount is NOT an input (spam-proof)', () => {
		expect(scoreMint({ reviewers: ['a', 'a', 'a'], relayHints: [], relaysSeenCount: 0 })).toBe(10);
	});
	it('zero reviewers → only relay-presence points', () => {
		expect(scoreMint({ reviewers: [], relayHints: [], relaysSeenCount: 5 })).toBe(10);
	});
});

describe('mergeAndRank', () => {
	it('shows non-mainnet too (R3: no filter), sorts by score desc', () => {
		const hits = [
			{ relay: R1, event: mintEvent() },
			{
				relay: R1,
				event: mintEvent({
					pubkey: 'op-pubkey-2',
					content: '',
					tags: [['d', 'k2'], ['u', 'https://mint-b.test'], ['nuts', '4'], ['n', 'testnet']]
				})
			}
		];
		const recs = [recEvent('rev-1'), recEvent('rev-2'), recEvent('rev-3')];
		const out = mergeAndRank(hits, recs);
		expect(out).toHaveLength(2); // R3: testnet shown, no filtering
		expect(out[0].url).toBe('https://mint-a.example');
		expect(out[0].network).toBe('mainnet');
		expect(out[0].reviewCount).toBe(3);
		expect(out[0].relaysSeen).toEqual([R1]);
		expect(out[0].score).toBe(10 * 3 + 2 * 1 + 2 * 1);
		expect(out[1].url).toBe('https://mint-b.test');
		expect(out[1].network).toBe('testnet');
	});

	it('R6: icon_url starts empty pre-seed (no relay logo, no fallback)', () => {
		const out = mergeAndRank([{ relay: R1, event: mintEvent() }], [recEvent('rev-1')]);
		expect(out).toHaveLength(1);
		expect(out[0].icon_url).toBe('');
		expect(out[0].name).toBe('Mint A');
	});

	it('R6: operator-profile events are ignored (no profile lookup in pipeline)', () => {
		const profile: RawNostrEvent = {
			kind: 0,
			pubkey: 'op-pubkey-1',
			content: JSON.stringify({ name: 'Mint A (profile)' }),
			tags: []
		};
		// kind-0 in mintHits parses to null → skipped; in recs → skipped
		const out = mergeAndRank([{ relay: R1, event: profile }], [profile]);
		expect(out).toEqual([]);
		// real mint still ranks with null name when content is empty
		const bare = mergeAndRank([{ relay: R1, event: mintEvent({ content: '' }) }], []);
		expect(bare[0].name).toBeNull();
		expect(bare[0].icon_url).toBe('');
	});

	it('R4 review-first: reviews for unknown mints SEED a review-only entry; ties break by reviewCount then rating then url', () => {
		const mkMint = (url: string) =>
			mintEvent({ pubkey: `op-${url}`, tags: [['d', url], ['u', url], ['n', 'mainnet']] });
		const hits = [
			{ relay: R1, event: mkMint('https://mint-b.example') },
			{ relay: R1, event: mkMint('https://mint-a.example') }
		];
		const recs = [recEvent('r1', 'https://ghost.example'), recEvent('r2', 'https://mint-a.example', '')];
		const out = mergeAndRank(hits, recs);
		// R4: ghost review seeds its own bucket (review-only, no 38172) instead of being ignored.
		// ghost and mint-a tie (count 1, rating null, score 12) → URL asc puts ghost first.
		expect(out.map((m) => m.url)).toEqual(['https://ghost.example', 'https://mint-a.example', 'https://mint-b.example']);
		expect(out[0].reviewCount).toBe(1);
		expect(out[0].relaysSeen).toEqual([]);
		expect(out[1].score).toBe(12); // 1 reviewer + no hint + seen on 1 relay
	});

	it('relaysSeen unions across relays', () => {
		const out = mergeAndRank(
			[
				{ relay: R1, event: mintEvent() },
				{ relay: R2, event: mintEvent() }
			],
			[]
		);
		expect(out[0].relaysSeen).toEqual([R1, R2].sort());
		expect(out[0].score).toBe(2 * 2);
	});
});

describe('topMints', () => {
	it('default N=7 slice with rest for "more"', () => {
		const mk = (i: number) => ({
			url: `https://m${i}.example`,
			name: null,
			icon_url: '',
			nuts: [],
			network: 'mainnet',
			reviewCount: 0,
			uniqueReviewers: 0,
			rating: null,
			ratingCount: 0,
			infoOk: false,
			relaysSeen: [],
			score: 100 - i
		});
		const all = Array.from({ length: 10 }, (_, i) => mk(i));
		const { top, rest } = topMints(all);
		expect(DEFAULT_TOP_N).toBe(7);
		expect(top).toHaveLength(7);
		expect(rest).toHaveLength(3);
	});
});

describe('discoverMints (injected transport)', () => {
	it('end-to-end merge with a dead relay tolerated', async () => {
		const fake = async (relay: string, filter: { kinds?: number[] }) => {
			if (relay === 'wss://dead.example') throw new Error('down');
			if (filter.kinds?.[0] === 38172) return [mintEvent()];
			if (filter.kinds?.[0] === 38000) return [recEvent('rev-1'), recEvent('rev-1')]; // dup copy
			return [];
		};
		const out = await discoverMints(
			{ relays: [R1, 'wss://dead.example'], skipInfoProbe: true },
			{ query: fake as never }
		);
		expect(out).toHaveLength(1);
		expect(out[0].reviewCount).toBe(1); // identical copy deduped
		expect(out[0].relaysSeen).toEqual([R1]);
	});
	it('never queries operator-profile kind on any relay (R6)', async () => {
		const kinds: number[][] = [];
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			kinds.push(f.kinds ?? []);
			return [];
		};
		await discoverMints({ relays: [R1, R2], skipInfoProbe: true }, { query: fake as never });
		const flat = kinds.flat();
		expect(flat).toContain(38000);
		expect(flat).toContain(38172);
		expect(flat).not.toContain(0);
	});
});

// ---------------------------------------------------------------------------
// R4 additions: relay7 + review-first + count-then-rating + streaming + cache
// ---------------------------------------------------------------------------

describe('R5 relay set (5 — damus + 8333.space CUT)', () => {
	it('is exactly the 5 commander-locked originals, no ghosts', () => {
		expect(DEFAULT_MINT_RELAYS).toHaveLength(5);
		for (const r of [
			'wss://relay.cashumints.space',
			'wss://nos.lol',
			'wss://relay.azzamo.net',
			'wss://relay.snort.social',
			'wss://relay.primal.net'
		])
			expect(DEFAULT_MINT_RELAYS).toContain(r);
		expect(DEFAULT_MINT_RELAYS).not.toContain('wss://relay.damus.io');
		expect(DEFAULT_MINT_RELAYS).not.toContain('wss://relay.8333.space');
	});
	it('relays are configurable (no hardcoded-dead set)', async () => {
		const seen: string[] = [];
		const fake = async (relay: string) => {
			seen.push(relay);
			return [];
		};
		await discoverMints({ relays: ['wss://custom.example'], skipInfoProbe: true }, { query: fake as never });
		expect(seen).toContain('wss://custom.example');
		expect(seen).not.toContain('wss://relay.damus.io');
	});
	it('queries BOTH 38000 and 38172 through the relay set (and nothing else)', async () => {
		const kinds: number[][] = [];
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			kinds.push(f.kinds ?? []);
			return [];
		};
		await discoverMints({ relays: [R1, R2], skipInfoProbe: true }, { query: fake as never });
		expect(kinds.some((k) => k[0] === 38000)).toBe(true);
		expect(kinds.some((k) => k[0] === 38172)).toBe(true);
		expect(kinds.flat().some((k) => k !== 38000 && k !== 38172)).toBe(false);
	});
	it('sync-throwing relay is silent — discovery still resolves', async () => {
		const fake = (relay: string, filter: { kinds?: number[] }) => {
			if (relay === 'wss://sync-boom.example') throw new Error('sync down');
			if (filter.kinds?.[0] === 38172) return Promise.resolve([mintEvent()]);
			if (filter.kinds?.[0] === 38000) return Promise.resolve([recEvent('rev-1')]);
			return Promise.resolve([]);
		};
		const out = await discoverMints({ relays: [R1, 'wss://sync-boom.example'] }, { query: fake as never });
		expect(out).toHaveLength(1);
		expect(out[0].url).toBe('https://mint-a.example');
	});
	it('non-array relay payload collapses to [] instead of crashing', async () => {
		const fake = async (relay: string, filter: { kinds?: number[] }) => {
			if (relay === 'wss://weird.example') return 'garbage' as never;
			if (filter.kinds?.[0] === 38172) return [mintEvent()];
			return [];
		};
		const out = await discoverMints({ relays: [R1, 'wss://weird.example'] }, { query: fake as never });
		expect(out).toHaveLength(1);
	});
});

describe('R4 parseRating', () => {
	it('parses X/5, rating: N, and star forms', () => {
		expect(parseRating('best mint 5/5')).toBe(5);
		expect(parseRating('[4/5] solid')).toBe(4);
		expect(parseRating('rating: 3.5, ok')).toBe(3.5);
		expect(parseRating('★★★★☆ great')).toBe(4);
		expect(parseRating('no signal here')).toBeNull();
		expect(parseRating('')).toBeNull();
	});
	it('parseRecommendation carries the rating', () => {
		const ev: RawNostrEvent = {
			kind: 38000,
			pubkey: 'r1',
			content: 'love it [5/5]',
			tags: [['k', '38172'], ['u', 'https://mint-a.example']]
		};
		expect(parseRecommendation(ev).rating).toBe(5);
	});
});

describe('R4 review-first pipeline', () => {
	it('review-only URL (no 38172) is still listed — seeded from 38000', () => {
		const rec: RawNostrEvent = {
			kind: 38000,
			pubkey: 'reviewer-9',
			content: 'new mint [5/5]',
			tags: [['k', '38172'], ['u', 'https://fresh-mint.example']]
		};
		const out = mergeAndRank([], [rec]);
		expect(out).toHaveLength(1);
		expect(out[0].url).toBe('https://fresh-mint.example');
		expect(out[0].reviewCount).toBe(1);
		expect(out[0].uniqueReviewers).toBe(1);
		expect(out[0].rating).toBe(5);
		expect(out[0].relaysSeen).toEqual([]);
		expect(out[0].icon_url).toBe('');
	});
	it('38172 metadata matches onto review-seeded bucket (name/nuts/n)', () => {
		const rec: RawNostrEvent = {
			kind: 38000,
			pubkey: 'reviewer-9',
			content: 'nice',
			tags: [['k', '38172'], ['u', 'https://mint-a.example']]
		};
		const out = mergeAndRank([{ relay: R1, event: mintEvent() }], [rec]);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe('Mint A');
		expect(out[0].nuts).toEqual(['4', '5']);
		expect(out[0].network).toBe('mainnet');
		expect(out[0].icon_url).toBe(''); // logo waits for CORS-SEED
	});
	it('review-first order: 38000 queried BEFORE 38172', async () => {
		const order: number[] = [];
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			order.push(f.kinds?.[0] ?? -1);
			return [];
		};
		await discoverMints({ relays: [R1], skipInfoProbe: true }, { query: fake as never });
		expect(order[0]).toBe(38000);
		expect(order).toContain(38172);
	});
});

describe('R4 sort count-then-rating', () => {
	function ratedRec(pubkey: string, url: string, content: string): RawNostrEvent {
		return { kind: 38000, pubkey, content, tags: [['k', '38172'], ['u', url]] };
	}
	function bareMint(url: string): RawNostrEvent {
		return mintEvent({ pubkey: `op-${url}`, content: '', tags: [['d', url], ['u', url], ['n', 'mainnet']] });
	}
	it('higher reviewCount wins even when rating is lower', () => {
		const out = mergeAndRank(
			[
				{ relay: R1, event: bareMint('https://low.example') },
				{ relay: R1, event: bareMint('https://high.example') }
			],
			[
				ratedRec('a', 'https://low.example', '[5/5]'),
				ratedRec('x', 'https://high.example', '[3/5]'),
				ratedRec('y', 'https://high.example', '[3/5]'),
				ratedRec('z', 'https://high.example', '[3/5]')
			]
		);
		expect(out[0].url).toBe('https://high.example');
		expect(out[0].reviewCount).toBe(3);
	});
	it('equal counts → higher avg rating [X/5] first (unique-pubkey avg)', () => {
		const out = mergeAndRank(
			[
				{ relay: R1, event: bareMint('https://low.example') },
				{ relay: R1, event: bareMint('https://high.example') }
			],
			[
				ratedRec('a', 'https://low.example', '[2/5]'),
				ratedRec('b', 'https://high.example', '[5/5]')
			]
		);
		expect(out[0].url).toBe('https://high.example');
		expect(out[0].rating).toBe(5);
		expect(out[1].rating).toBe(2);
	});
	it('duplicate ratings from one pubkey count once toward the average', () => {
		const out = mergeAndRank(
			[{ relay: R1, event: bareMint('https://m.example') }],
			[ratedRec('a', 'https://m.example', '[5/5]'), ratedRec('a', 'https://m.example', '[1/5]')]
		);
		expect(out[0].reviewCount).toBe(2);
		expect(out[0].uniqueReviewers).toBe(1);
		expect(out[0].ratingCount).toBe(1);
	});
});

describe('R4 streaming progress + info cache', () => {
	it('discoverMints emits reviews → mints → done progress', async () => {
		const phases: string[] = [];
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			if (f.kinds?.[0] === 38172) return [mintEvent()];
			if (f.kinds?.[0] === 38000) return [recEvent('rev-1')];
			return [];
		};
		const out = await discoverMints(
			{ relays: [R1], skipInfoProbe: true, onProgress: (p) => phases.push(p.phase) },
			{ query: fake as never }
		);
		expect(out).toHaveLength(1);
		expect(phases).toContain('reviews');
		expect(phases).toContain('mints');
		expect(phases).toContain('done');
		expect(phases.indexOf('reviews')).toBeLessThan(phases.indexOf('mints'));
		expect(phases).not.toContain('profiles');
	});
	it('discoverMintsStreaming yields partials (review-seeded first)', async () => {
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			if (f.kinds?.[0] === 38172) return [mintEvent()];
			if (f.kinds?.[0] === 38000) return [recEvent('rev-1')];
			return [];
		};
		const yields = [];
		for await (const y of discoverMintsStreaming({ relays: [R1], skipInfoProbe: true }, { query: fake as never })) {
			yields.push(y);
		}
		expect(yields.length).toBeGreaterThanOrEqual(2);
		expect(yields[0].progress.phase).toBe('reviews');
		expect(yields[0].partial.length).toBe(1); // review-seeded partial, no 38172 yet
		expect(yields[yields.length - 1].progress.phase).toBe('done');
	});
	it('probeMintInfos caches — second call does not refetch', async () => {
		let calls = 0;
		const fetchFn = async (_u: string) => {
			calls += 1;
			return { name: 'Cached Mint' };
		};
		const cache = new MintInfoCache();
		await probeMintInfos(['https://m.example'], { fetchFn: fetchFn as never, cache });
		expect(calls).toBe(1);
		await probeMintInfos(['https://m.example'], { fetchFn: fetchFn as never, cache });
		expect(calls).toBe(1); // cache hit
		expect(cache.size).toBe(1);
	});
	it('applyInfoResults fills name gaps and marks infoOk', () => {
		const ranked = mergeAndRank(
			[{ relay: R1, event: mintEvent({ content: '' }) }],
			[recEvent('rev-1')]
		);
		expect(ranked[0].name).toBeNull();
		const infos = new Map([['https://mint-a.example', { ok: true, name: 'Info Name', icon_url: null, version: '1', raw: {} }]]);
		const applied = applyInfoResults(ranked, infos);
		expect(applied[0].infoOk).toBe(true);
		expect(applied[0].name).toBe('Info Name');
	});
	it('applyInfoResults fills icon_url gap from live NUT-06 body, seed value wins', () => {
		const ranked = mergeAndRank(
			[{ relay: R1, event: mintEvent({ content: '' }) }],
			[recEvent('rev-1')]
		);
		const infos = new Map([
			['https://mint-a.example', { ok: true, name: null, icon_url: 'https://live.example/i.png', version: '1', raw: {} }]
		]);
		const filled = applyInfoResults(ranked, infos);
		expect(filled[0].icon_url).toBe('https://live.example/i.png');
		const seeded = applySeedInfo(ranked, {
			'https://mint-a.example': { name: 'Seed', icon_url: 'https://seed.example/i.png', version: 'x', nuts: ['4'] }
		});
		const kept = applyInfoResults(seeded, infos);
		expect(kept[0].icon_url).toBe('https://seed.example/i.png'); // seed wins
	});
});

// ---------------------------------------------------------------------------
// R5 additions: relay-5 + CORS-seed (zero list-path fetch) + path normalize
// ---------------------------------------------------------------------------

describe('R5 normalizeInfoBaseUrl + infoProbeUrl (never concat raw path)', () => {
	it('strips the minibits /Bitcoin path to the origin', () => {
		expect(normalizeInfoBaseUrl('https://mint.minibits.cash/Bitcoin')).toBe('https://mint.minibits.cash');
		expect(infoProbeUrl('https://mint.minibits.cash/Bitcoin')).toBe('https://mint.minibits.cash/v1/info');
	});
	it('strips any pathed mint to the origin (generic case)', () => {
		expect(normalizeInfoBaseUrl('https://satscribe.me/cashu/')).toBe('https://satscribe.me');
		expect(infoProbeUrl('https://satscribe.me/cashu')).toBe('https://satscribe.me/v1/info');
		expect(normalizeInfoBaseUrl('https://btc.aleafnd.org/cashu')).toBe('https://btc.aleafnd.org');
		expect(infoProbeUrl('https://btc.aleafnd.org/cashu')).toBe('https://btc.aleafnd.org/v1/info');
	});
	it('root urls pass through; case/port handled; garbage → null', () => {
		expect(infoProbeUrl('https://mint.lnw.cash/')).toBe('https://mint.lnw.cash/v1/info');
		expect(normalizeInfoBaseUrl('HTTPS://Mint-A.Example:8080/x')).toBe('https://mint-a.example:8080');
		expect(normalizeInfoBaseUrl('')).toBeNull();
		expect(normalizeInfoBaseUrl('wss://relay.snort.social')).toBeNull();
		expect(infoProbeUrl('fed11abc')).toBeNull();
	});
});

describe('R5 CORS-seed (list path: zero live fetches)', () => {
	it('seed holds the 31 server-side online mints (incl. pathed minibits)', () => {
		expect(Object.keys(SEED_MINT_INFO)).toHaveLength(31);
		expect(SEED_MINT_INFO['https://mint.minibits.cash/Bitcoin'].name).toBe('Minibits mint');
		expect(SEED_MINT_INFO['https://mint.lnw.cash'].name).toBe('"LNWCASH MINT"');
	});
	it('applySeedInfo fills name/nuts gaps + marks infoOk; unknown urls untouched', () => {
		const bare = (url: string) =>
			mintEvent({ pubkey: `op-${url}`, content: '', tags: [['d', url], ['u', url], ['n', 'mainnet']] });
		const ranked = mergeAndRank(
			[
				{ relay: R1, event: bare('https://mint.lnw.cash') },
				{ relay: R1, event: bare('https://ghost.example') }
			],
			[]
		);
		expect(ranked.every((m) => m.infoOk === false)).toBe(true);
		const seeded = applySeedInfo(ranked);
		const lnw = seeded.find((m) => m.url === 'https://mint.lnw.cash')!;
		expect(lnw.name).toBe('"LNWCASH MINT"');
		expect(lnw.nuts.length).toBeGreaterThan(0);
		expect(lnw.infoOk).toBe(true);
		const ghost = seeded.find((m) => m.url === 'https://ghost.example')!;
		expect(ghost.name).toBeNull();
		expect(ghost.infoOk).toBe(false);
		expect(ghost.icon_url).toBe('');
	});
	it('applySeedInfo never overrides 38172 names', () => {
		const ranked = mergeAndRank([{ relay: R1, event: mintEvent() }], []);
		const seeded = applySeedInfo(ranked, { 'https://mint-a.example': { name: 'Seed Name', icon_url: '', version: 'x', nuts: ['4'] } });
		expect(seeded[0].name).toBe('Mint A'); // 38172 content wins
	});
	it('discoverMints performs ZERO live /v1/info fetches (seed fills names)', async () => {
		let calls = 0;
		const boomFetch = async (_u: string) => {
			calls += 1;
			throw new Error('list-path must not fetch');
		};
		const bareLnw = mintEvent({
			pubkey: 'op-lnw',
			content: '',
			tags: [['d', 'x'], ['u', 'https://mint.lnw.cash'], ['n', 'mainnet']]
		});
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			if (f.kinds?.[0] === 38172) return [bareLnw];
			return [];
		};
		const out = await discoverMints({ relays: [R1] }, { query: fake as never, infoFetch: boomFetch as never });
		expect(calls).toBe(0);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe('"LNWCASH MINT"');
		expect(out[0].infoOk).toBe(true);
	});
	it('streaming list path also performs zero live fetches', async () => {
		let calls = 0;
		const boomFetch = async (_u: string) => {
			calls += 1;
			throw new Error('list-path must not fetch');
		};
		const bareLnw = mintEvent({
			pubkey: 'op-lnw',
			content: '',
			tags: [['d', 'x'], ['u', 'https://mint.lnw.cash'], ['n', 'mainnet']]
		});
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			if (f.kinds?.[0] === 38172) return [bareLnw];
			return [];
		};
		let last: { name: string | null }[] = [];
		for await (const y of discoverMintsStreaming({ relays: [R1] }, { query: fake as never, infoFetch: boomFetch as never })) {
			last = y.partial;
		}
		expect(calls).toBe(0);
		expect(last[0]?.name).toBe('"LNWCASH MINT"');
	});
});

// ---------------------------------------------------------------------------
// R6 additions: icon_url-only logo pipeline (no relay logo, no fallback)
// ---------------------------------------------------------------------------

describe('R6 icon_url-only logo (CORS-SEED passthrough, verbatim)', () => {
	it('seed carries 31 icon_url values: 20 present verbatim, 11 empty', () => {
		const vals = Object.values(SEED_MINT_INFO);
		expect(vals).toHaveLength(31);
		expect(vals.filter((v) => v.icon_url).length).toBe(20);
		expect(vals.filter((v) => !v.icon_url).length).toBe(11);
		expect(vals.every((v) => typeof v.icon_url === 'string')).toBe(true);
	});
	it('spot-checks match the server-side probe bodies verbatim', () => {
		expect(SEED_MINT_INFO['https://cashu.cz'].icon_url).toBe('https://cashu.cz/icon.webp');
		expect(SEED_MINT_INFO['https://mint.minibits.cash/Bitcoin'].icon_url).toBe('https://minibits.cash/icon-192.png');
		expect(SEED_MINT_INFO['https://mint.coinos.io'].icon_url).toBe('https://coinos.io/images/icon.png');
		expect(SEED_MINT_INFO['https://mint.lnw.cash'].icon_url).toBe('');
		expect(SEED_MINT_INFO['https://cashu.boats'].icon_url).toBe('');
	});
	it('applySeedInfo passes icon_url through verbatim (present → url, absent → "")', () => {
		const bare = (url: string) =>
			mintEvent({ pubkey: `op-${url}`, content: '', tags: [['d', url], ['u', url], ['n', 'mainnet']] });
		const ranked = mergeAndRank(
			[
				{ relay: R1, event: bare('https://mint.coinos.io') },
				{ relay: R1, event: bare('https://cashu.boats') }
			],
			[]
		);
		expect(ranked.every((m) => m.icon_url === '')).toBe(true); // pre-seed: empty
		const seeded = applySeedInfo(ranked);
		expect(seeded.find((m) => m.url === 'https://mint.coinos.io')!.icon_url).toBe('https://coinos.io/images/icon.png');
		expect(seeded.find((m) => m.url === 'https://cashu.boats')!.icon_url).toBe(''); // absent stays empty
	});
	it('discoverMints list path carries icon_url end-to-end with zero fetches', async () => {
		let calls = 0;
		const boomFetch = async (_u: string) => {
			calls += 1;
			throw new Error('list-path must not fetch');
		};
		const bareCoinos = mintEvent({
			pubkey: 'op-coinos',
			content: '',
			tags: [['d', 'x'], ['u', 'https://mint.coinos.io'], ['n', 'mainnet']]
		});
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			if (f.kinds?.[0] === 38172) return [bareCoinos];
			return [];
		};
		const out = await discoverMints({ relays: [R1] }, { query: fake as never, infoFetch: boomFetch as never });
		expect(calls).toBe(0);
		expect(out).toHaveLength(1);
		expect(out[0].icon_url).toBe('https://coinos.io/images/icon.png');
		expect(out[0].infoOk).toBe(true);
	});
	it('streaming final yield carries icon_url too', async () => {
		const bareCoinos = mintEvent({
			pubkey: 'op-coinos',
			content: '',
			tags: [['d', 'x'], ['u', 'https://mint.coinos.io'], ['n', 'mainnet']]
		});
		const fake = async (_r: string, f: { kinds?: number[] }) => {
			if (f.kinds?.[0] === 38172) return [bareCoinos];
			return [];
		};
		let last = [];
		for await (const y of discoverMintsStreaming({ relays: [R1] }, { query: fake as never })) {
			last = y.partial as never[];
		}
		expect((last[0] as { icon_url: string }).icon_url).toBe('https://coinos.io/images/icon.png');
	});
});
