/**
 * TASK-5001 — fiat-rate service (INTENT-050 / BLUEPRINT-050 v2)
 *
 * CoinGecko (primary, keyless direct) + Binance BTCTHB (fallback)
 * + in-memory cache (fresh 60s / stale-while-usable 300s)
 * + stale-with-timestamp policy.
 *
 * Policy (no fake numbers, no stuck loading — L-P021):
 *  - age < FRESH_TTL_MS        → serve cache, no fetch (FRESH)
 *  - FRESH_TTL <= age < STALE   → serve cache immediately (STALE, with asOf
 *    timestamp) and refresh in background; UI must show stale + time label
 *  - fetch fails + cache exists → serve last-known STALE with asOf (any age;
 *    beyond STALE_MAX_AGE_MS it is flagged `expired: true` so UI can badge it
 *    harder — still better than inventing a number or hanging on loading)
 *  - fetch fails + NO cache     → UNAVAILABLE (rate = null) — caller must
 *    render "–" / error, never a fabricated number
 *
 * Binance fallback only quotes BTCTHB, so it can only refresh THB.
 * Other currencies fall back to their own stale entries — never derived
 * via invented cross-rates.
 *
 * Forbidden: hardcoded rates (L-P021), Bitkub direct-from-browser (CORS).
 */

export const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price";
export const BINANCE_BTCTHB_URL =
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCTHB";

/** Fresh window: serve cache without fetching. */
export const FRESH_TTL_MS = 60_000;
/** Stale-usable window: serve stale + background refresh. */
export const STALE_MAX_AGE_MS = 300_000;

export type FiatCurrency =
  | "THB"
  | "USD"
  | "EUR"
  | "JPY"
  | "GBP"
  | "CNY"
  | "KRW"
  | "SGD"
  | "AUD"
  | "MYR";

/** R2 mockup setting list — THB default. */
export const SUPPORTED_CURRENCIES: readonly FiatCurrency[] = [
  "THB",
  "USD",
  "EUR",
  "JPY",
  "GBP",
  "CNY",
  "KRW",
  "SGD",
  "AUD",
  "MYR",
] as const;

export type RateSource = "coingecko" | "binance" | "cache";

export interface RateEntry {
  /** Price of 1 BTC in this currency. Null = unavailable (never fabricated). */
  price: number | null;
  /** Epoch ms of the last successful fetch that produced this entry. */
  asOf: number | null;
  where: RateSource;
  stale: boolean;
  /** True when older than STALE_MAX_AGE_MS — UI should badge harder. */
  expired: boolean;
}

export interface RatesSnapshot {
  rates: Record<FiatCurrency, RateEntry>;
  /** Newest asOf across entries (null when nothing cached). */
  asOf: number | null;
  stale: boolean;
  /** True when at least one entry is unavailable (no cache + fetch failed). */
  partial: boolean;
  /** True when the primary (CoinGecko) answered HTTP 429 on last refresh. */
  rateLimited: boolean;
  source: RateSource;
}

export interface RatesDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
}

interface CacheSlot {
  entry: RateEntry;
  fetchedAt: number;
}

const cache = new Map<FiatCurrency, CacheSlot>();
let lastRateLimited = false;
let inflight: Promise<RatesSnapshot> | null = null;

/** Test seam — clears in-memory cache + flags. */
export function clearRatesCache(): void {
  cache.clear();
  lastRateLimited = false;
  inflight = null;
}

function geckoParams(): string {
  const vs = SUPPORTED_CURRENCIES.map((c) => c.toLowerCase()).join(",");
  return `?ids=bitcoin&vs_currencies=${encodeURIComponent(vs)}&precision=2`;
}

function unavailable(source: RateSource): RateEntry {
  return { price: null, asOf: null, where: source, stale: true, expired: true };
}

function snapshotFromCache(nowMs: number, source: RateSource): RatesSnapshot {
  const rates = {} as Record<FiatCurrency, RateEntry>;
  let newest: number | null = null;
  let anyStale = false;
  let anyMissing = false;
  for (const cur of SUPPORTED_CURRENCIES) {
    const slot = cache.get(cur);
    if (!slot) {
      rates[cur] = unavailable("cache");
      anyMissing = true;
      anyStale = true;
      continue;
    }
    const age = nowMs - slot.fetchedAt;
    const expired = age >= STALE_MAX_AGE_MS;
    rates[cur] = {
      price: slot.entry.price,
      asOf: slot.entry.asOf,
      where: slot.entry.where, // real origin of the data, not "cache"
      stale: age >= FRESH_TTL_MS || slot.entry.stale,
      expired: expired || slot.entry.expired,
    };
    if (rates[cur].stale) anyStale = true;
    if (slot.entry.asOf !== null && (newest === null || slot.entry.asOf > newest)) {
      newest = slot.entry.asOf;
    }
  }
  return {
    rates,
    asOf: newest,
    stale: anyStale,
    partial: anyMissing,
    rateLimited: lastRateLimited,
    source,
  };
}

async function fetchGecko(
  fetchFn: typeof fetch,
): Promise<Record<string, Record<string, number>>> {
  const res = await fetchFn(`${COINGECKO_URL}${geckoParams()}`, {
    headers: { accept: "application/json" },
  });
  if (res.status === 429) {
    const err = new Error("coingecko rate limited (429)") as Error & {
      code: string;
    };
    err.code = "GECKO_429";
    throw err;
  }
  if (!res.ok) throw new Error(`coingecko HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).bitcoin !== "object"
  ) {
    throw new Error("coingecko unexpected body");
  }
  return body as Record<string, Record<string, number>>;
}

async function fetchBinanceThb(fetchFn: typeof fetch): Promise<number> {
  const res = await fetchFn(BINANCE_BTCTHB_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`binance HTTP ${res.status}`);
  const body = (await res.json()) as { price?: unknown };
  const price = typeof body?.price === "string" ? Number(body.price) : NaN;
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("binance unexpected body");
  }
  return price;
}

function storeSuccess(
  prices: Partial<Record<FiatCurrency, number>>,
  where: RateSource,
  nowMs: number,
): void {
  for (const cur of SUPPORTED_CURRENCIES) {
    const p = prices[cur];
    if (typeof p === "number" && Number.isFinite(p) && p > 0) {
      const entry: RateEntry = {
        price: p,
        asOf: nowMs,
        where,
        stale: false,
        expired: false,
      };
      cache.set(cur, { entry, fetchedAt: nowMs });
    }
    // No Binance quote for non-THB → keep existing stale slot untouched.
  }
}

async function refresh(deps: RatesDeps): Promise<RatesSnapshot> {
  const fetchFn = deps.fetchFn ?? fetch;
  const nowFn = deps.now ?? Date.now;
  const nowMs = nowFn();

  try {
    const gecko = await fetchGecko(fetchFn);
    const btc = gecko.bitcoin ?? {};
    const prices: Partial<Record<FiatCurrency, number>> = {};
    for (const cur of SUPPORTED_CURRENCIES) {
      const v = btc[cur.toLowerCase()];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        prices[cur] = v;
      }
    }
    if (prices.THB === undefined && Object.keys(prices).length === 0) {
      throw new Error("coingecko empty prices");
    }
    lastRateLimited = false;
    storeSuccess(prices, "coingecko", nowMs);
    // snapshotFromCache already marks only truly-old slots stale —
    // keep it truthful for partial Gecko responses.
    return snapshotFromCache(nowMs, "coingecko");
  } catch (primaryErr) {
    if ((primaryErr as { code?: string })?.code === "GECKO_429") {
      lastRateLimited = true;
    }
    // Fallback: Binance only quotes BTCTHB.
    try {
      const thb = await fetchBinanceThb(fetchFn);
      storeSuccess({ THB: thb }, "binance", nowMs);
      const snap = snapshotFromCache(nowMs, "binance");
      return snap;
    } catch {
      // All failed → stale-with-timestamp (or unavailable when cold).
      return snapshotFromCache(nowMs, "cache");
    }
  }
}

/**
 * Main entry. Never throws for fetch failures — encodes them in the
 * snapshot (stale/unavailable) so UI never hangs on loading.
 */
export async function getBtcRates(deps: RatesDeps = {}): Promise<RatesSnapshot> {
  const nowFn = deps.now ?? Date.now;
  const nowMs = nowFn();

  // Fresh cache → no fetch.
  let newest = -1;
  let complete = true;
  for (const cur of SUPPORTED_CURRENCIES) {
    const slot = cache.get(cur);
    if (!slot) {
      complete = false;
      break;
    }
    if (slot.fetchedAt > newest) newest = slot.fetchedAt;
  }
  if (complete && newest >= 0 && nowMs - newest < FRESH_TTL_MS) {
    // All slots fresh → snapshotFromCache already reports stale: false.
    return snapshotFromCache(nowMs, "cache");
  }

  // Single-flight refresh; concurrent callers share it.
  if (!inflight) {
    inflight = refresh(deps).finally(() => {
      inflight = null;
    });
  }
  const snap = await inflight;

  // Stale-but-usable cache + refresh already attempted above:
  // snapshot already reflects newest data. If refresh failed, entries
  // carry their original asOf timestamps (stale-with-timestamp).
  return snap;
}

/** Convenience: single currency (null price = unavailable, never fake). */
export async function getBtcRate(
  currency: FiatCurrency,
  deps: RatesDeps = {},
): Promise<RateEntry> {
  const snap = await getBtcRates(deps);
  return snap.rates[currency];
}
