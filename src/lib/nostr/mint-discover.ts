/**
 * TASK-3800 R6 — NIP-87 cashu mint discovery client (REVIEW-FIRST pipeline).
 *
 * R6 rework over R5 (same file, same scope — discover-only, no new TASK):
 *   1. REVIEW-FIRST: seed mint URLs from kind:38000 (#k=38172) reviews FIRST,
 *      then match kind:38172 announcements for metadata (name/nuts/n),
 *      then fill display metadata from the server-side CORS-SEED (probe-matrix
 *      31 online, NO live /v1/info fetch in the list path — browser CORS dies
 *      on half the mints). Union of review-URLs + 38172-URLs is served — a
 *      38172 with zero reviews is still shown (R3 no-filter rule kept: NO
 *      `n`-tag filtering, rev12 intact).
 *   2. RELAY SET 5: the 5 commander-locked originals — wss://relay.damus.io
 *      (ghost relay, serves ~0 exclusive mints, live union +0) and
 *      wss://relay.8333.space (dead: 0+0, connection 503) are CUT.
 *      Configurable via MintDiscoveryConfig.relays — defaults below are only
 *      the default, never hardcoded-dead. Every per-relay query is wrapped
 *      silent (sync-throw + reject → []), so one dead relay never fails or
 *      delays the whole call.
 *   3. CORS-SEED + NORMALIZE: list path performs ZERO live /v1/info fetches
 *      (CORS in browser). Names come from 38172 content first, then SEED_
 *      MINT_INFO (TASK-3804 probe-matrix, 31 online, server-side probed).
 *      Live /v1/info happens ONLY on user tap — the manual validate flow
 *      (validateMintUrl, single URL at a time). infoProbeUrl() strips ANY
 *      trailing path to the origin before appending /v1/info (minibits.cash/
 *      Bitcoin + every pathed mint — never concat the raw path).
 *   4. SORT count-then-rating: primary reviewCount desc, secondary rating
 *      avg [X/5] desc (unique-pubkey based), then legacy score, then URL.
 *      Top-7 + more UI, manual tap-to-validate, NEVER auto-add — all kept.
 *   5. STREAMING progress + /v1/info cache: onProgress callback after every
 *      phase; probeMintInfos + MintInfoCache TTL cache stay exported for the
 *      SINGLE-tap path only (one URL per user tap — never the list).
 *   6. R6 LOGO = icon_url ONLY (Commander verbatim: operator-profile logo
 *      field removed entirely, no fallback). No operator-profile fetch, no
 *      38172 logo-content parsing, no per-letter fallback in this client —
 *      logo comes ONLY from NUT-06 /v1/info `icon_url` captured server-side
 *      in the probe-matrix bodies (TASK-3804, 31 online: 20 present verbatim,
 *      11 absent → empty string). SEED_MINT_INFO carries icon_url; the list
 *      path passes it through verbatim (applySeedInfo); absent stays "" —
 *      never invented, never fetched live in the browser (no CORS).
 *
 * Pipeline inspiration: jooray/mint-discovery (MIT — same approach cashu.me
 * uses: NIP-87 38000 reviews → 38172 match → mint info probe). All code below
 * is written fresh for this repo; no code copied.
 *
 * Spec: NIP-87 "Cashu and Fedimint Discoverability" (draft, optional).
 * Legacy score kept for compat/thorne re-verification (score-formula.md):
 *   score = 10*U + 2*H + 2*R  (display tiebreak only in R5/R6).
 */
import { SimplePool } from 'nostr-tools/pool';
import type { Filter } from 'nostr-tools/filter';

/** NIP-87 event kinds. */
export const MINT_INFO_KIND = 38172;
export const MINT_RECOMMEND_KIND = 38000;

/** Legacy network constant (R3/R4: no filtering — kept only for compat, NOT used as a gate). */
export const MAINNET = 'mainnet';

/**
 * Default relays (5, commander-locked originals — R5: damus.io + 8333.space
 * CUT: damus serves ~0 exclusive mints / live union +0; 8333 is dead 0+0).
 * NOT hardcoded-dead: callers may pass any list via
 * MintDiscoveryConfig.relays — this is only the default.
 */
export const DEFAULT_MINT_RELAYS: readonly string[] = [
	'wss://relay.cashumints.space',
	'wss://nos.lol',
	'wss://relay.azzamo.net',
	'wss://relay.snort.social',
	'wss://relay.primal.net'
];

/** Default visible slice (commander: "5-10 อันดับแรกมาก่อน + more"). */
export const DEFAULT_TOP_N = 7;

/** /v1/info cache TTL (10 min). */
export const INFO_CACHE_TTL_MS = 10 * 60 * 1000;

export interface DiscoveryProgress {
	phase: 'reviews' | 'mints' | 'info' | 'done';
	completed: number;
	total: number;
	detail?: string;
}

export interface MintDiscoveryConfig {
	/** Relay list override. Defaults to DEFAULT_MINT_RELAYS (5). */
	relays?: string[];
	/** Per-relay query timeout in ms. Default 8000. */
	timeoutMs?: number;
	/** Streaming progress callback (called after each phase). */
	onProgress?: (p: DiscoveryProgress) => void;
	/**
	 * Legacy flag, kept for compat. R5/R6: the list path NEVER live-fetches
	 * /v1/info (CORS-seed instead), so this flag is a no-op for
	 * discoverMints()/discoverMintsStreaming() — live probing happens only
	 * on user tap via probeMintInfos() / the manual validate flow.
	 */
	skipInfoProbe?: boolean;
	/** /v1/info fetch timeout in ms (single-tap path only). Default 6000. */
	infoTimeoutMs?: number;
}

export interface DiscoveredMint {
	/** Canonical mint URL (38172 `u` tag, or review `u` when no 38172 exists). */
	url: string;
	/** Display name (38172 content.name → CORS-seed name → null). */
	name: string | null;
	/**
	 * R6 logo — NUT-06 /v1/info `icon_url` passed through verbatim from the
	 * server-side CORS-SEED. Empty string = mint publishes no logo (UI shows
	 * no logo — this client provides no per-letter fallback). Never a
	 * relay-sourced value, never invented, never live-fetched in the list.
	 */
	icon_url: string;
	/** Supported nut numbers as strings, e.g. ["4","5"]. */
	nuts: string[];
	/** Raw `n` tag network value, lowercased+trimmed (R4: shown as-is, never filtered). */
	network: string;
	/** Total kind:38000 events recommending this mint (spam-able count, display only). */
	reviewCount: number;
	/** Unique reviewer pubkeys (primary sort input alongside reviewCount). */
	uniqueReviewers: number;
	/** Average rating [0..5] over unique reviewers that gave one; null = no ratings. */
	rating: number | null;
	/** How many unique reviewers gave a rating. */
	ratingCount: number;
	/** Seed/live probe outcome (true when CORS-seed matched or tap-probe ok — mint still shown either way). */
	infoOk: boolean;
	/** Which of our relays served this mint's 38172 (empty when review-only). */
	relaysSeen: string[];
	/** Legacy ranking score (R4: tiebreak only) — see score-formula.md. */
	score: number;
}

/** Minimal structural shape of a nostr event — enough for NIP-87 parsing. */
export interface RawNostrEvent {
	kind: number;
	pubkey: string;
	tags: string[][];
	content: string;
}

/** Per-relay query function. Injected in tests; SimplePool-backed in prod. */
export type RelayQuery = (relay: string, filter: Filter) => Promise<RawNostrEvent[]>;

/** /v1/info fetch function. Injected in tests; global-fetch-backed in prod. */
export type InfoFetch = (mintUrl: string) => Promise<unknown>;

/** Result of one /v1/info probe. */
export interface MintInfoResult {
	ok: boolean;
	name: string | null;
	/** NUT-06 logo URL from the live /v1/info body (tap path only); null when absent. */
	icon_url: string | null;
	version: string | null;
	raw: unknown;
	error?: string;
}

interface CacheEntry {
	at: number;
	value: MintInfoResult;
}

/** In-memory TTL cache for /v1/info (stops duplicate hits). */
export class MintInfoCache {
	private map = new Map<string, CacheEntry>();
	constructor(private ttlMs: number = INFO_CACHE_TTL_MS) {}
	get(url: string): MintInfoResult | null {
		const e = this.map.get(url);
		if (!e) return null;
		if (Date.now() - e.at > this.ttlMs) {
			this.map.delete(url);
			return null;
		}
		return e.value;
	}
	set(url: string, value: MintInfoResult): void {
		this.map.set(url, { at: Date.now(), value });
	}
	clear(): void {
		this.map.clear();
	}
	get size(): number {
		return this.map.size;
	}
}

/** Shared default cache (module-level; callers may pass their own via deps). */
export const defaultInfoCache = new MintInfoCache();

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested, no network)
// ---------------------------------------------------------------------------

/** All values of tags named `name`. */
export function tagValues(ev: Pick<RawNostrEvent, 'tags'>, name: string): string[] {
	const out: string[] = [];
	for (const t of ev.tags) {
		if (Array.isArray(t) && t[0] === name && typeof t[1] === 'string') out.push(t[1]);
	}
	return out;
}

/** First value of tags named `name`, or null. */
export function tagValue(ev: Pick<RawNostrEvent, 'tags'>, name: string): string | null {
	return tagValues(ev, name)[0] ?? null;
}

/**
 * Canonical mint-URL form for cross-event matching (38000 `u` ↔ 38172 `u`).
 * Lowercases scheme+host, drops trailing slashes. Returns null when unparsable.
 */
export function normalizeMintUrl(raw: string): string | null {
	const s = raw.trim();
	if (!s) return null;
	try {
		const u = new URL(s);
		const scheme = u.protocol.toLowerCase();
		if (scheme !== 'https:' && scheme !== 'http:') return null;
		const host = u.hostname.toLowerCase() + (u.port ? `:${u.port}` : '');
		const path = u.pathname.replace(/\/+$/, '');
		return `${scheme}//${host}${path}`;
	} catch {
		return null;
	}
}

/**
 * R5 — origin-only base for /v1/info probing.
 * Strips ANY trailing path to scheme+host[:port] (lowercased) — e.g.
 *   https://mint.minibits.cash/Bitcoin → https://mint.minibits.cash
 *   https://satscribe.me/cashu/         → https://satscribe.me
 * Never concat the raw path before /v1/info (that 404s / CORS-dies on
 * pathed mints). Returns null when unparsable / non-http(s).
 */
export function normalizeInfoBaseUrl(raw: string): string | null {
	const s = raw.trim();
	if (!s) return null;
	try {
		const u = new URL(s);
		const scheme = u.protocol.toLowerCase();
		if (scheme !== 'https:' && scheme !== 'http:') return null;
		const host = u.hostname.toLowerCase() + (u.port ? `:${u.port}` : '');
		return `${scheme}//${host}`;
	} catch {
		return null;
	}
}

/**
 * R5 — full /v1/info probe URL for a SINGLE mint (tap path only).
 * Origin-normalized, never raw-path-concat. Null when the mint URL is bad.
 */
export function infoProbeUrl(rawMintUrl: string): string | null {
	const base = normalizeInfoBaseUrl(rawMintUrl);
	return base ? `${base}/v1/info` : null;
}

/** Server-side seed metadata for one mint (TASK-3804 probe-matrix row). */
export interface SeedMintMeta {
	name: string;
	/**
	 * R6 — NUT-06 /v1/info `icon_url` copied VERBATIM from the server-side
	 * probe-matrix info/ bodies. Empty string = that mint publishes no logo
	 * (11 of 31). Never invented, never relay-sourced.
	 */
	icon_url: string;
	version: string;
	nuts: string[];
}

/**
 * R6 CORS-SEED — server-side /v1/info metadata for the 31 online mints
 * (TASK-3804 probe-matrix.json, probed 2026-10-24 — browser NEVER fetches
 * these in the list path, so CORS can't kill the list). Keyed by
 * normalizeMintUrl() form. R6 ADDS icon_url (20 present verbatim from the
 * info/ bodies, 11 absent → ""). No relay-sourced logo anywhere.
 */
export const SEED_MINT_INFO: Readonly<Record<string, SeedMintMeta>> = {
	'https://21mint.me': { name: '21Mint', icon_url: 'https://cdn.nostrcheck.me/8c382ee1f0df71548ca203063c0def8da4a84c6add3b43caa8469d1e3732cce7/f7168979ea9ba910daff503bdc3e7302d27a3fdbb8c90ee4a8d1abcd80ee255b.webp', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://antifiat.cash': { name: 'antifiat mint', icon_url: 'https://image.nostr.build/29d1e6b5a5fd205fa16ec0470d335984b25ea4be9a7ce5481e60aebde3f27beb.png', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://btc.aleafnd.org/cashu': { name: 'aleafnd.org', icon_url: 'https://aleafnd.org/learn/icons/bitcoin-512.png', version: 'Nutshell/0.20.3', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://cashu.boats': { name: 'Kinda Reckless Mint', icon_url: '', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://cashu.centurymetadata.org': { name: 'Century Metadata Test Mint', icon_url: '', version: 'cdk-mintd/0.15.1', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '4', '5', '7', '8', '9'] },
	'https://cashu.cz': { name: 'cashu.cz', icon_url: 'https://cashu.cz/icon.webp', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://forge.flashapp.me': { name: 'Flash Forge', icon_url: '', version: 'Nutshell/0.20.3.1', nuts: ['10', '11', '12', '14', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://kashu.me': { name: 'Kashu.me', icon_url: 'https://image.nostr.build/ca72a338d053ffa0f283a1399ebc772bef43814e4998c1fff8aa143b1ea6f29e.jpg', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.21linz.at': { name: '21linz Cashu Mint', icon_url: '', version: 'cdk-mintd/0.18.2', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.28waves.com': { name: '28MINT', icon_url: 'https://res.cloudinary.com/dymfagnlu/image/upload/v1758210455/28_g3bhgv.png', version: 'Nutshell/0.19.2', nuts: ['10', '11', '12', '14', '17', '20', '4', '5', '7', '8', '9'] },
	'https://mint.cashu.chat': { name: 'cashu.chat', icon_url: '', version: 'Nutshell/0.20.2', nuts: ['10', '11', '12', '14', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.coinos.io': { name: 'Coinos', icon_url: 'https://coinos.io/images/icon.png', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.cubabitcoin.org': { name: 'Mint Cuba Bitcoin', icon_url: 'https://image.nostr.build/851be21e07223c5cb91dd32cc1bc0b01321ad0d5fb2e428273c1ee85781b5e87.jpg', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.fredix.xyz': { name: 'Mint fredix', icon_url: 'https://www.fredix.xyz/images/nosfet_aero.png', version: 'cdk-mintd/0.18.2', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.gitvid.net': { name: 'Cashu mint', icon_url: '', version: 'Nutshell/0.20.1', nuts: ['10', '11', '12', '14', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.kashir.xyz': { name: 'Kashir Mint', icon_url: '', version: 'cdk-mintd/0.18.2', nuts: ['10', '11', '12', '14', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.lnvoltz.com': { name: 'Voltz Mint', icon_url: 'https://pbs.twimg.com/profile_images/1868639113806479362/KA6p4Jll_400x400.jpg', version: 'Nutshell/0.20.3', nuts: ['10', '11', '12', '14', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.lnw.cash': { name: '"LNWCASH MINT"', icon_url: '', version: 'Nutshell/0.20.1', nuts: ['10', '11', '12', '14', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.macadamia.cash': { name: 'macadamia Mint', icon_url: 'https://cypherbase.cc/images/logo_w256.png', version: 'cdk-mintd/0.18.1', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.mikelcalvo.net': { name: 'MK Mint', icon_url: 'https://mikelcalvo.net/images/artifact.gif', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.minibits.cash/Bitcoin': { name: 'Minibits mint', icon_url: 'https://minibits.cash/icon-192.png', version: 'cdk-mintd/0.17.7', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.mountainlake.io': { name: 'Mountainlake M5', icon_url: 'https://www.mountainlake.io/wp-content/uploads/2025/03/cropped-MountainlakeIcon256.jpg', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.nostrzap.me': { name: 'mint.nostrzap.me', icon_url: 'https://nostr.download/6d263e90edda811b39180342c75fe0cce399f2ccd6827b109019f5c50761e020.jpg', version: 'cdk-mintd/0.18.2', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.routstr.com': { name: 'RoutstrMint', icon_url: '', version: 'Nutshell/0.20.0', nuts: ['10', '11', '12', '14', '17', '20', '4', '5', '7', '8', '9'] },
	'https://mint.satscribe.me': { name: 'SatScribe Mint', icon_url: 'https://mint.satscribe.me/icon.png', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.sharegap.net': { name: 'Nostrodomo Mint', icon_url: '', version: 'Nutshell/0.20.3', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.sortug.com': { name: 'Sortug造逼厂', icon_url: 'https://s3.sortug.com/img/sortug-logo.png', version: 'cdk-mintd/0.17.1', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.sovran.money': { name: 'Sovran Mint', icon_url: '', version: 'cdk-mintd/0.18.0-rc.1', nuts: ['10', '11', '12', '14', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.unclerics.cash': { name: "Uncle Ric's 2.0", icon_url: 'https://i.imgur.com/69eobdp.jpeg', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '15', '17', '20', '29', '4', '5', '7', '8', '9'] },
	'https://mint.westernbtc.com': { name: 'WesternBTC Cashu mint', icon_url: 'https://westernbtc.com/icons/icon-512x512.png', version: 'cdk-mintd/0.17.6', nuts: ['10', '11', '12', '14', '15', '17', '19', '20', '29', '4', '5', '7', '8', '9'] },
	'https://satscribe.me/cashu': { name: 'SatScribe Mint', icon_url: 'https://mint.satscribe.me/icon.png', version: 'Nutshell/0.21.0', nuts: ['10', '11', '12', '14', '17', '20', '29', '4', '5', '7', '8', '9'] }
};

/**
 * R6 — fill display metadata from the CORS-SEED (pure, zero network).
 * Name gap ← seed name; empty nuts ← seed nuts; icon_url ← seed icon_url
 * VERBATIM (present URL or "" — never invented); infoOk=true when seeded
 * (server-side online). Unknown URLs pass through untouched EXCEPT icon_url
 * stays "" (still listed, tap-to-validate stays available). Seed never
 * overrides a 38172 name. Logo has NO other source in this client.
 */
export function applySeedInfo(
	mints: DiscoveredMint[],
	seed: Readonly<Record<string, SeedMintMeta>> = SEED_MINT_INFO
): DiscoveredMint[] {
	return mints.map((m) => {
		const key = normalizeMintUrl(m.url) ?? m.url.trim();
		const hit = seed[key];
		if (!hit) return m;
		return {
			...m,
			name: m.name ?? hit.name,
			icon_url: hit.icon_url,
			nuts: m.nuts.length > 0 ? m.nuts : [...hit.nuts],
			infoOk: true
		};
	});
}

/** Safely parse NIP-01 metadata-style JSON content; null on any failure. */
export function parseMetadataContent(content: string): Record<string, unknown> | null {
	if (!content || !content.trim()) return null;
	try {
		const v: unknown = JSON.parse(content);
		if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
		return null;
	} catch {
		return null;
	}
}

function asNonEmptyString(v: unknown): string | null {
	return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Parse a 0..5 rating out of a kind:38000 review's free-text content.
 * Accepted forms (first hit wins):
 *   - "4/5", "[4/5]", "4.5 / 5"
 *   - "rating: 4", "rating=3.5" (case-insensitive)
 *   - "★★★★☆" / "⭐⭐⭐⭐" (count ★/⭐, cap 5; ☆/✩ ignored)
 * Returns null when the review carries no rating signal.
 */
export function parseRating(content: string): number | null {
	if (!content) return null;
	const slash = content.match(/([0-5](?:\.\d)?)\s*\/\s*5/);
	if (slash) return clampRating(parseFloat(slash[1]));
	const labeled = content.match(/rating\s*[:=]\s*([0-5](?:\.\d)?)/i);
	if (labeled) return clampRating(parseFloat(labeled[1]));
	if (/[★⭐]/.test(content)) {
		const stars = (content.match(/[★⭐]/g) ?? []).length;
		if (stars > 0) return clampRating(stars);
	}
	return null;
}

function clampRating(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.min(5, Math.max(0, n));
}

export interface ParsedMintInfo {
	url: string;
	normalizedUrl: string;
	network: string;
	nuts: string[];
	/** R6: display name ONLY. No logo field — relay content is never a logo source. */
	name: string | null;
	author: string;
}

/**
 * Parse a kind:38172 mint announcement. Returns null when it carries no
 * usable mint URL. R4: NO network filtering anywhere — every parsed mint
 * (any/missing/garbage `n` tag) flows through to the ranked list.
 * R6: content contributes the display NAME only — any other content key is
 * ignored (logo comes solely from the CORS-SEED icon_url passthrough).
 */
export function parseMintInfo(ev: RawNostrEvent): ParsedMintInfo | null {
	if (ev.kind !== MINT_INFO_KIND) return null;
	const rawUrl = tagValue(ev, 'u');
	if (!rawUrl) return null;
	const normalizedUrl = normalizeMintUrl(rawUrl);
	if (!normalizedUrl) return null;
	const network = (tagValue(ev, 'n') ?? '').trim().toLowerCase();
	const nutsRaw = tagValue(ev, 'nuts') ?? '';
	const nuts = nutsRaw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const meta = parseMetadataContent(ev.content);
	return {
		url: rawUrl.trim(),
		normalizedUrl,
		network,
		nuts,
		name: meta ? asNonEmptyString(meta['name']) : null,
		author: ev.pubkey
	};
}

export interface ParsedRecommendation {
	reviewer: string;
	/** Normalized mint URLs from `u` tags (cashu http(s) ones). */
	urls: string[];
	/** Relay hints from `a` tags pointing at 38172 events. */
	relayHints: string[];
	hasReviewText: boolean;
	/** Rating parsed from free-text content (null = no rating signal). */
	rating: number | null;
}

/** Parse a kind:38000 recommendation. `u` tags that are not mint URLs are ignored. */
export function parseRecommendation(ev: RawNostrEvent): ParsedRecommendation {
	const urls: string[] = [];
	if (ev.kind === MINT_RECOMMEND_KIND) {
		for (const u of tagValues(ev, 'u')) {
			const n = normalizeMintUrl(u);
			if (n) urls.push(n);
		}
	}
	const relayHints: string[] = [];
	for (const t of ev.tags) {
		// ["a", "38172:<pubkey>:<d>", "<relay-hint>", ...]
		if (Array.isArray(t) && t[0] === 'a' && typeof t[1] === 'string' && t[1].startsWith('38172:')) {
			if (typeof t[2] === 'string' && t[2].trim()) relayHints.push(t[2].trim());
		}
	}
	return {
		reviewer: ev.pubkey,
		urls: [...new Set(urls)],
		relayHints: [...new Set(relayHints)],
		hasReviewText: ev.content.trim().length > 0,
		rating: ev.kind === MINT_RECOMMEND_KIND ? parseRating(ev.content) : null
	};
}

export interface ScoreInput {
	/** Unique reviewer pubkeys recommending this mint. */
	reviewers: string[];
	/** Distinct relay hints cited by those reviews. */
	relayHints: string[];
	/** How many of our relays served this mint's 38172. */
	relaysSeenCount: number;
}

/**
 * Legacy ranking score. Documented in score-formula.md for thorne re-verification.
 *   score = 10 * U + 2 * H + 2 * R
 * R4: kept as a tiebreak only — primary sort is count-then-rating.
 * reviewCount is deliberately NOT in the score (one author spamming N reviews
 * must not outrank N independent reviewers) — it is display-only.
 */
export function scoreMint(input: ScoreInput): number {
	const u = new Set(input.reviewers).size;
	const h = new Set(input.relayHints).size;
	const r = Math.max(0, input.relaysSeenCount);
	return 10 * u + 2 * h + 2 * r;
}

/**
 * REVIEW-FIRST merge pipeline (R6):
 *   seed buckets from 38000 review URLs → match 38172 metadata onto them →
 *   union with 38172-only mints (zero reviews, still shown — no n filter) →
 *   count-then-rating sort. Logo is NOT resolved here: icon_url starts as ""
 *   and is filled ONLY by applySeedInfo() (verbatim CORS-SEED passthrough).
 * Returns the FULL ranked list; callers slice with topMints() for the N+more UI.
 *
 * Sort: reviewCount desc → rating avg [X/5] desc (null last) →
 *   legacy score desc → url asc.
 * Rating avg is over UNIQUE reviewers (last rating per pubkey wins).
 */
export function mergeAndRank(
	mintHits: Array<{ relay: string; event: RawNostrEvent }>,
	recommendations: RawNostrEvent[]
): DiscoveredMint[] {
	type Bucket = {
		info: ParsedMintInfo | null;
		seedUrl: string; // normalized URL from reviews (or 38172 when review-less)
		displayUrl: string; // raw URL form for display
		relays: Set<string>;
		reviewers: Set<string>;
		ratingByReviewer: Map<string, number>;
		relayHints: Set<string>;
		reviewCount: number;
	};
	const buckets = new Map<string, Bucket>();
	const ensure = (normalized: string, display: string): Bucket => {
		let b = buckets.get(normalized);
		if (!b) {
			b = {
				info: null,
				seedUrl: normalized,
				displayUrl: display,
				relays: new Set(),
				reviewers: new Set(),
				ratingByReviewer: new Map(),
				relayHints: new Set(),
				reviewCount: 0
			};
			buckets.set(normalized, b);
		}
		return b;
	};

	// STEP 1 (review-first): seed every bucket from 38000 review URLs.
	for (const rec of recommendations) {
		if (rec.kind !== MINT_RECOMMEND_KIND) continue;
		const parsed = parseRecommendation(rec);
		for (const url of parsed.urls) {
			const b = ensure(url, reviewDisplayUrl(rec, url));
			b.reviewCount += 1;
			b.reviewers.add(parsed.reviewer);
			if (parsed.rating !== null) b.ratingByReviewer.set(parsed.reviewer, parsed.rating);
			else if (!b.ratingByReviewer.has(parsed.reviewer)) {
				// reviewer without rating: tracked via reviewers set only
			}
			for (const h of parsed.relayHints) b.relayHints.add(h);
		}
	}

	// STEP 2: match 38172 announcements onto review-seeded buckets (or create).
	for (const { relay, event } of mintHits) {
		const info = parseMintInfo(event);
		if (!info) continue;
		const b = ensure(info.normalizedUrl, info.url);
		b.relays.add(relay);
		if (!b.info) {
			b.info = info;
			b.displayUrl = info.url;
		} else {
			// Prefer the copy that actually carries metadata (name).
			if (!b.info.name && info.name) b.info.name = info.name;
			if (b.info.nuts.length === 0 && info.nuts.length > 0) b.info.nuts = info.nuts;
			if (!b.info.network && info.network) b.info.network = info.network;
		}
	}

	const out: DiscoveredMint[] = [];
	for (const b of buckets.values()) {
		const reviewers = [...b.reviewers];
		const relayHints = [...b.relayHints];
		const relaysSeen = [...b.relays].sort();
		const ratings = [...b.ratingByReviewer.values()];
		const rating = ratings.length > 0 ? ratings.reduce((a, c) => a + c, 0) / ratings.length : null;
		out.push({
			url: b.info?.url ?? b.displayUrl,
			name: b.info?.name ?? null,
			icon_url: '', // filled ONLY by applySeedInfo (list) / applyInfoResults (tap)
			nuts: b.info?.nuts ?? [],
			network: b.info?.network ?? '',
			reviewCount: b.reviewCount,
			uniqueReviewers: reviewers.length,
			rating,
			ratingCount: ratings.length,
			infoOk: false, // filled by applySeedInfo (list) / applyInfoResults (tap)
			relaysSeen,
			score: scoreMint({ reviewers, relayHints, relaysSeenCount: relaysSeen.length })
		});
	}

	out.sort(
		(a, b) =>
			b.reviewCount - a.reviewCount ||
			(b.rating ?? -1) - (a.rating ?? -1) ||
			b.score - a.score ||
			a.url.localeCompare(b.url)
	);
	return out;
}

/** Display URL for a review-seeded bucket: first raw `u` tag mapping to it. */
function reviewDisplayUrl(rec: RawNostrEvent, normalized: string): string {
	for (const u of tagValues(rec, 'u')) {
		if (normalizeMintUrl(u) === normalized) return u.trim();
	}
	return normalized;
}

/** Visible slice for the "top N + more" UI. Returns { top, rest }. */
export function topMints(all: DiscoveredMint[], n: number = DEFAULT_TOP_N): { top: DiscoveredMint[]; rest: DiscoveredMint[] } {
	const k = Math.max(0, Math.floor(n));
	return { top: all.slice(0, k), rest: all.slice(k) };
}

// ---------------------------------------------------------------------------
// /v1/info single-tap probe layer (TAP PATH ONLY — never the list path).
// The list (discoverMints/discoverMintsStreaming) uses applySeedInfo() above:
// zero live fetches, zero CORS. This layer exists so a USER TAP on one mint
// can still validate it live (one URL at a time, via probeMintInfos or the
// manual validate flow). Cached, never fails discovery.
// ---------------------------------------------------------------------------

function defaultInfoFetch(timeoutMs: number): InfoFetch {
	return async (mintUrl: string) => {
		const probe = infoProbeUrl(mintUrl);
		if (!probe) throw new Error('bad-mint-url');
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetch(probe, { signal: ctrl.signal });
			if (!res.ok) throw new Error(`http-${res.status}`);
			return (await res.json()) as unknown;
		} finally {
			clearTimeout(t);
		}
	};
}

function toInfoResult(raw: unknown): MintInfoResult {
	if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
		const r = raw as Record<string, unknown>;
		return {
			ok: true,
			name: asNonEmptyString(r['name']),
			icon_url: asNonEmptyString(r['icon_url']),
			version: asNonEmptyString(r['version']),
			raw
		};
	}
	return { ok: false, name: null, icon_url: null, version: null, raw, error: 'bad-shape' };
}

/**
 * Probe /v1/info for the given mint URLs (cached, allSettled — a dead mint
 * never fails discovery). SINGLE-TAP path only: call with ONE url after a
 * user tap — NEVER with the whole list (list path uses applySeedInfo, which
 * performs zero fetches). Reports per-URL progress via onProbe when provided.
 * Fetch target is origin-normalized (infoProbeUrl) — raw paths are never
 * concatenated.
 */
export async function probeMintInfos(
	urls: string[],
	opts: {
		fetchFn?: InfoFetch;
		cache?: MintInfoCache;
		timeoutMs?: number;
		onProbe?: (completed: number, total: number, url: string) => void;
	} = {}
): Promise<Map<string, MintInfoResult>> {
	const cache = opts.cache ?? defaultInfoCache;
	const fetchFn = opts.fetchFn ?? defaultInfoFetch(opts.timeoutMs ?? 6000);
	const out = new Map<string, MintInfoResult>();
	const pending: Array<{ url: string; norm: string }> = [];
	for (const url of urls) {
		const norm = normalizeMintUrl(url) ?? url.trim();
		const hit = cache.get(norm);
		if (hit) {
			out.set(url, hit);
			opts.onProbe?.(out.size, urls.length, url);
		} else {
			pending.push({ url, norm });
		}
	}
	await Promise.allSettled(
		pending.map(async ({ url, norm }) => {
			try {
				const raw = await fetchFn(norm);
				const r = toInfoResult(raw);
				cache.set(norm, r);
				out.set(url, r);
			} catch (e) {
				const r: MintInfoResult = {
					ok: false,
					name: null,
					icon_url: null,
					version: null,
					raw: null,
					error: e instanceof Error ? e.message : 'fetch-failed'
				};
				cache.set(norm, r);
				out.set(url, r);
			} finally {
				opts.onProbe?.(out.size, urls.length, url);
			}
		})
	);
	// Ensure every URL has an entry even if something above threw synchronously.
	for (const url of urls) {
		if (!out.has(url)) out.set(url, { ok: false, name: null, icon_url: null, version: null, raw: null, error: 'unknown' });
	}
	return out;
}

/**
 * Fill name/icon gaps from /v1/info + mark infoOk (pure, unit-tested).
 * R6: icon_url fills ONLY when the mint has none ("" — seed said absent) and
 * the live NUT-06 body carries one. A seed-present icon_url always wins.
 */
export function applyInfoResults(mints: DiscoveredMint[], infos: Map<string, MintInfoResult>): DiscoveredMint[] {
	return mints.map((m) => {
		const hit = infos.get(m.url) ?? infos.get(normalizeMintUrl(m.url) ?? m.url);
		if (!hit) return m;
		return {
			...m,
			name: m.name ?? hit.name,
			icon_url: m.icon_url || hit.icon_url || '',
			infoOk: hit.ok
		};
	});
}

// ---------------------------------------------------------------------------
// Network layer (thin wrapper over nostr-tools SimplePool)
// ---------------------------------------------------------------------------

function defaultQuery(pool: SimplePool, timeoutMs: number): RelayQuery {
	return (relay: string, filter: Filter) => pool.querySync([relay], filter, { maxWait: timeoutMs });
}

export interface DiscoverDeps {
	query?: RelayQuery;
	closePool?: () => void | Promise<void>;
	/** Single-tap live probe only (probeMintInfos direct calls) — the list path never uses it. */
	infoFetch?: InfoFetch;
	/** Cache for single-tap live probes. */
	infoCache?: MintInfoCache;
}

/**
 * R5 — one relay, always silent: sync-throw + async-reject + wrong-shape
 * all collapse to []. A dead relay never fails (or stalls) discovery.
 */
function silentRelayQuery(
	query: RelayQuery,
	relay: string,
	filter: Filter
): Promise<RawNostrEvent[]> {
	try {
		return Promise.resolve(query(relay, filter)).then(
			(v) => (Array.isArray(v) ? (v as RawNostrEvent[]) : []),
			() => []
		);
	} catch {
		return Promise.resolve([]);
	}
}

/**
 * REVIEW-FIRST discovery (R6) across the configured relays.
 *
 * Steps: 38000 reviews FIRST (#k=38172, source of mint URLs) → 38172 match
 * (name/nuts/n metadata) → mergeAndRank (count-then-rating) → applySeedInfo
 * (CORS-seed metadata incl. icon_url passthrough, ZERO live fetches).
 * A dead relay never fails the whole call (every per-relay query is
 * silentRelayQuery-wrapped, rejections → []).
 * Progress is streamed via config.onProgress (partial results possible).
 * Pure discovery: no validation, no storage, no auto-add — ever.
 * Live /v1/info happens ONLY on user tap (probeMintInfos single-URL, or the
 * manual validate flow) — never in this list path.
 * R6: NO operator-profile relay query anywhere in this path (logo pipeline
 * is CORS-seed icon_url only).
 */
export async function discoverMints(
	config: MintDiscoveryConfig = {},
	deps: DiscoverDeps = {}
): Promise<DiscoveredMint[]> {
	const relays = config.relays && config.relays.length > 0 ? [...new Set(config.relays)] : [...DEFAULT_MINT_RELAYS];
	const timeoutMs = config.timeoutMs ?? 8000;
	const emit = config.onProgress;

	let query = deps.query;
	let pool: SimplePool | null = null;
	if (!query) {
		pool = new SimplePool();
		query = defaultQuery(pool, timeoutMs);
	}
	try {
		// STEP 1 (review-first): kind:38000 — the URL source.
		const recFilter = { kinds: [MINT_RECOMMEND_KIND], '#k': ['38172'] };
		const recResults = await Promise.allSettled(relays.map((relay) => silentRelayQuery(query!, relay, recFilter)));
		const seenRec = new Set<string>();
		const recommendations: RawNostrEvent[] = [];
		for (const r of recResults) {
			if (r.status !== 'fulfilled') continue;
			for (const ev of r.value ?? []) {
				// De-dupe identical (pubkey, content, tags) copies served by N relays.
				const key = `${ev.pubkey}|${ev.content}|${JSON.stringify(ev.tags)}`;
				if (seenRec.has(key)) continue;
				seenRec.add(key);
				recommendations.push(ev);
			}
		}
		emit?.({ phase: 'reviews', completed: recommendations.length, total: recommendations.length, detail: `${relays.length}-relays` });

		// STEP 2: kind:38172 match (name/nuts/n for review-seeded URLs + review-less mints).
		const mintFilter = { kinds: [MINT_INFO_KIND] };
		const perRelay = await Promise.allSettled(
			relays.map(async (relay) => ({
				relay,
				events: await silentRelayQuery(query!, relay, mintFilter)
			}))
		);
		const mintHits: Array<{ relay: string; event: RawNostrEvent }> = [];
		for (const r of perRelay) {
			if (r.status !== 'fulfilled') continue;
			for (const event of r.value.events ?? []) mintHits.push({ relay: r.value.relay, event });
		}
		emit?.({ phase: 'mints', completed: mintHits.length, total: mintHits.length, detail: `${relays.length}-relays` });

		// STEP 3: merge (count-then-rating) — partial ranked list exists here.
		// R6: no operator-profile lookup (icon_url resolves via CORS-SEED only).
		let ranked = mergeAndRank(mintHits, recommendations);

		// STEP 4 (R5/R6): CORS-SEED metadata fill — ZERO live /v1/info fetches in
		// the list path (browser CORS would kill half the list). Live probing
		// happens only on user tap (probeMintInfos single-URL / manual
		// validate flow) — never here.
		if (ranked.length > 0) ranked = applySeedInfo(ranked);
		emit?.({ phase: 'done', completed: ranked.length, total: ranked.length });
		return ranked;
	} finally {
		if (deps.closePool) await deps.closePool();
		else if (pool) pool.close(relays);
	}
}

export interface StreamYield {
	progress: DiscoveryProgress;
	/** Ranked partial (without infoOk filled until the final yield). */
	partial: DiscoveredMint[];
}

/**
 * Streaming variant: yields a partial ranked list after each phase so the UI
 * can render progress (reviews → mints → done). Same data path as
 * discoverMints() — review-first, count-then-rating, CORS-seed metadata
 * (icon_url passthrough). ZERO live /v1/info fetches in the list path
 * (tap path only). R6: no operator-profile query in any phase.
 */
export async function* discoverMintsStreaming(
	config: MintDiscoveryConfig = {},
	deps: DiscoverDeps = {}
): AsyncGenerator<StreamYield, DiscoveredMint[], void> {
	const relays = config.relays && config.relays.length > 0 ? [...new Set(config.relays)] : [...DEFAULT_MINT_RELAYS];
	const timeoutMs = config.timeoutMs ?? 8000;

	let query = deps.query;
	let pool: SimplePool | null = null;
	if (!query) {
		pool = new SimplePool();
		query = defaultQuery(pool, timeoutMs);
	}
	try {
		const recFilter = { kinds: [MINT_RECOMMEND_KIND], '#k': ['38172'] };
		const recResults = await Promise.allSettled(relays.map((relay) => silentRelayQuery(query!, relay, recFilter)));
		const seenRec = new Set<string>();
		const recommendations: RawNostrEvent[] = [];
		for (const r of recResults) {
			if (r.status !== 'fulfilled') continue;
			for (const ev of r.value ?? []) {
				const key = `${ev.pubkey}|${ev.content}|${JSON.stringify(ev.tags)}`;
				if (seenRec.has(key)) continue;
				seenRec.add(key);
				recommendations.push(ev);
			}
		}
		// Partial 1: review-seeded ranking (no 38172 metadata yet).
		let partial = mergeAndRank([], recommendations);
		const p1: DiscoveryProgress = { phase: 'reviews', completed: recommendations.length, total: recommendations.length };
		config.onProgress?.(p1);
		yield { progress: p1, partial };

		const mintFilter = { kinds: [MINT_INFO_KIND] };
		const perRelay = await Promise.allSettled(
			relays.map(async (relay) => ({
				relay,
				events: await silentRelayQuery(query!, relay, mintFilter)
			}))
		);
		const mintHits: Array<{ relay: string; event: RawNostrEvent }> = [];
		for (const r of perRelay) {
			if (r.status !== 'fulfilled') continue;
			for (const event of r.value.events ?? []) mintHits.push({ relay: r.value.relay, event });
		}
		partial = mergeAndRank(mintHits, recommendations);
		const p2: DiscoveryProgress = { phase: 'mints', completed: partial.length, total: partial.length };
		config.onProgress?.(p2);
		yield { progress: p2, partial };

		if (partial.length > 0) partial = applySeedInfo(partial);
		const pd: DiscoveryProgress = { phase: 'done', completed: partial.length, total: partial.length };
		config.onProgress?.(pd);
		yield { progress: pd, partial };
		return partial;
	} finally {
		if (deps.closePool) await deps.closePool();
		else if (pool) pool.close(relays);
	}
}
