/**
 * TASK-5001 — scoped vitest for src/lib/fiat/rates.ts (copy in lnw-cash for TASK-5002 — source of truth: ARX src/lib/fiat/rates.ts)
 * Run scoped ONLY: npx vitest run src/lib/fiat/rates.test.ts (L-P033)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getBtcRates,
  getBtcRate,
  clearRatesCache,
  FRESH_TTL_MS,
  STALE_MAX_AGE_MS,
  SUPPORTED_CURRENCIES,
  type FiatCurrency,
} from "./rates";

function geckoBody(thb = 1_700_000, usd = 50_000) {
  return {
    bitcoin: {
      thb,
      usd,
      eur: 46_000,
      jpy: 7_500_000,
      gbp: 39_500,
      cny: 362_000,
      krw: 69_000_000,
      sgd: 67_500,
      aud: 76_000,
      myr: 235_000,
    },
  };
}

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function geckoFetch(body: unknown = geckoBody()) {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes("coingecko")) return okJson(body);
    throw new Error(`unexpected url ${u}`);
  });
}

function binanceFetch(thbPrice = "1701234.56") {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes("coingecko")) throw new Error("gecko down");
    if (u.includes("binance")) return okJson({ symbol: "BTCTHB", price: thbPrice });
    throw new Error(`unexpected url ${u}`);
  });
}

describe("rates", () => {
  beforeEach(() => {
    clearRatesCache();
  });

  it("fresh: CoinGecko primary returns all 10 currencies, stale=false", async () => {
    const fetchFn = geckoFetch() as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn, now: () => 1_000_000 });
    expect(snap.source).toBe("coingecko");
    expect(snap.stale).toBe(false);
    expect(snap.partial).toBe(false);
    expect(snap.rateLimited).toBe(false);
    for (const cur of SUPPORTED_CURRENCIES) {
      const e = snap.rates[cur as FiatCurrency];
      expect(typeof e.price).toBe("number");
      expect(e.price).toBeGreaterThan(0);
      expect(e.asOf).toBe(1_000_000); // timestamp attached
      expect(e.stale).toBe(false);
    }
    expect(snap.rates.THB.price).toBe(1_700_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("cached: second call inside 60s does not fetch again", async () => {
    const fetchFn = geckoFetch() as unknown as typeof fetch;
    let now = 2_000_000;
    await getBtcRates({ fetchFn, now: () => now });
    now += FRESH_TTL_MS - 1_000; // still fresh
    const snap = await getBtcRates({ fetchFn, now: () => now });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(snap.source).toBe("cache");
    expect(snap.stale).toBe(false);
    expect(snap.rates.THB.price).toBe(1_700_000);
  });

  it("fallback: Gecko down → Binance BTCTHB refreshes THB, rest go stale with timestamps", async () => {
    const gecko = geckoFetch() as unknown as typeof fetch;
    let now = 3_000_000;
    await getBtcRates({ fetchFn: gecko, now: () => now }); // warm cache
    now += FRESH_TTL_MS + 5_000; // past fresh window
    const fetchFn = binanceFetch("1701234.56") as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn, now: () => now });
    expect(snap.source).toBe("binance");
    // THB refreshed from Binance — real number, fresh timestamp
    expect(snap.rates.THB.price).toBe(1701234.56);
    expect(snap.rates.THB.asOf).toBe(now);
    expect(snap.rates.THB.stale).toBe(false);
    // Others: last-known stale WITH original timestamp (no invented cross-rates)
    expect(snap.rates.USD.price).toBe(50_000);
    expect(snap.rates.USD.asOf).toBe(3_000_000);
    expect(snap.rates.USD.stale).toBe(true);
    expect(snap.stale).toBe(true);
  });

  it("all-fail with warm cache: stale-with-timestamp, no fake numbers", async () => {
    const gecko = geckoFetch() as unknown as typeof fetch;
    let now = 4_000_000;
    await getBtcRates({ fetchFn: gecko, now: () => now });
    now += FRESH_TTL_MS + 1_000;
    const dead = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn: dead, now: () => now });
    expect(snap.source).toBe("cache");
    expect(snap.stale).toBe(true);
    expect(snap.rates.THB.price).toBe(1_700_000); // last known
    expect(snap.rates.THB.asOf).toBe(4_000_000); // original time label
    expect(snap.rates.THB.expired).toBe(false); // within 300s
  });

  it("all-fail beyond 300s: expired=true but last-known still served with timestamp", async () => {
    const gecko = geckoFetch() as unknown as typeof fetch;
    let now = 5_000_000;
    await getBtcRates({ fetchFn: gecko, now: () => now });
    now += STALE_MAX_AGE_MS + 60_000;
    const dead = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn: dead, now: () => now });
    expect(snap.stale).toBe(true);
    expect(snap.rates.THB.price).toBe(1_700_000);
    expect(snap.rates.THB.asOf).toBe(5_000_000);
    expect(snap.rates.THB.expired).toBe(true);
  });

  it("all-fail with cold cache: UNAVAILABLE (price null — never fabricated)", async () => {
    const dead = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn: dead, now: () => 6_000_000 });
    expect(snap.partial).toBe(true);
    expect(snap.asOf).toBeNull();
    for (const cur of SUPPORTED_CURRENCIES) {
      expect(snap.rates[cur as FiatCurrency].price).toBeNull();
    }
    const single = await getBtcRate("THB", {
      fetchFn: dead,
      now: () => 6_000_000,
    });
    expect(single.price).toBeNull();
  });

  it("429: Gecko 429 → rateLimited flag + Binance fallback for THB", async () => {
    const fetchFn = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("coingecko"))
        return new Response("rate limited", { status: 429 });
      if (u.includes("binance"))
        return okJson({ symbol: "BTCTHB", price: "1699999.00" });
      throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn, now: () => 7_000_000 });
    expect(snap.rateLimited).toBe(true);
    expect(snap.source).toBe("binance");
    expect(snap.rates.THB.price).toBe(1699999.0);
    expect(snap.rates.THB.asOf).toBe(7_000_000);
  });

  it("429 with everything failing: rateLimited flag survives on stale snapshot", async () => {
    const gecko = geckoFetch() as unknown as typeof fetch;
    let now = 8_000_000;
    await getBtcRates({ fetchFn: gecko, now: () => now });
    now += FRESH_TTL_MS + 1_000;
    const fetchFn = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("coingecko"))
        return new Response("rate limited", { status: 429 });
      throw new Error("binance down");
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn, now: () => now });
    expect(snap.rateLimited).toBe(true);
    expect(snap.stale).toBe(true);
    expect(snap.rates.THB.price).toBe(1_700_000);
    expect(snap.rates.THB.asOf).toBe(8_000_000);
  });

  it("supports the R2 mockup 10-currency setting list, THB default first", () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual([
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
    ]);
  });
});
