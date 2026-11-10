/**
 * TASK-5201 — scoped vitest for src/lib/fiat/convert.ts (+ rates.ts stale/429)
 * Run scoped ONLY: npx vitest run src/lib/fiat/ (L-P033 — never bare vitest)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fiatToSats,
  parseFiatAmount,
  resolveFiatQuote,
  CURRENCY_META,
  SATS_PER_BTC,
} from "./convert";
import {
  getBtcRates,
  clearRatesCache,
  FRESH_TTL_MS,
} from "./rates";

/** Same test vectors as rates.test.ts geckoBody — TEST INPUTS, not real rates. */
const TEST_RATES = {
  THB: 1_700_000,
  USD: 50_000,
  EUR: 46_000,
  JPY: 7_500_000,
  GBP: 39_500,
  CNY: 362_000,
  KRW: 69_000_000,
  SGD: 67_500,
  AUD: 76_000,
  MYR: 235_000,
} as const;

function geckoBody() {
  return {
    bitcoin: {
      thb: TEST_RATES.THB,
      usd: TEST_RATES.USD,
      eur: TEST_RATES.EUR,
      jpy: TEST_RATES.JPY,
      gbp: TEST_RATES.GBP,
      cny: TEST_RATES.CNY,
      krw: TEST_RATES.KRW,
      sgd: TEST_RATES.SGD,
      aud: TEST_RATES.AUD,
      myr: TEST_RATES.MYR,
    },
  };
}

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CURRENCY_META decimals", () => {
  it("JPY/KRW 0 decimals, all others 2", () => {
    expect(CURRENCY_META.JPY.decimals).toBe(0);
    expect(CURRENCY_META.KRW.decimals).toBe(0);
    for (const cur of ["THB", "USD", "EUR", "GBP", "CNY", "SGD", "AUD", "MYR"] as const) {
      expect(CURRENCY_META[cur].decimals).toBe(2);
    }
  });
});

describe("fiatToSats floor (never round-up)", () => {
  it("floors instead of rounding: 100 THB @1.7M = 5882 (exact 5882.35…)", () => {
    const r = fiatToSats("100", "THB", TEST_RATES.THB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const exact = (100 / TEST_RATES.THB) * SATS_PER_BTC; // 5882.3529…
    expect(exact).toBeGreaterThan(5882);
    expect(exact).toBeLessThan(5883);
    expect(r.sats).toBe(5882);
    expect(r.sats).toBe(Math.floor(exact));
  });

  it("floor edge .9999… never rounds up to the next sat", () => {
    // 0.03 THB @1.7M → exact 1.7647… → 1 sat, never 2
    const r = fiatToSats("0.03", "THB", TEST_RATES.THB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sats).toBe(1);
    // property: quoted sats repriced at the same rate never exceed fiat paid
    expect((r.sats / SATS_PER_BTC) * TEST_RATES.THB).toBeLessThanOrEqual(0.03);
  });

  it("property over many amounts: sats*rate <= fiat*1e8 (no over-quote)", () => {
    const amounts = ["0.02", "0.5", "1", "9.99", "100", "1234.56", "50000"];
    for (const a of amounts) {
      const r = fiatToSats(a, "THB", TEST_RATES.THB);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const exact = (Number(a) / TEST_RATES.THB) * SATS_PER_BTC;
      expect(r.sats).toBe(Math.floor(exact));
      expect(r.sats).toBeLessThanOrEqual(exact);
    }
  });

  it("never invents a rate: null/NaN/0/negative → RATE_UNAVAILABLE", () => {
    for (const bad of [null, NaN, 0, -5, Infinity]) {
      const r = fiatToSats("100", "THB", bad);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.code).toBe("RATE_UNAVAILABLE");
    }
  });
});

describe("0-sat dust blocked (D4)", () => {
  it("0.01 THB @1.7M → exact 0.58 sats → floor 0 → DUST_ZERO_SAT", () => {
    const exact = (0.01 / TEST_RATES.THB) * SATS_PER_BTC;
    expect(exact).toBeLessThan(1);
    const r = fiatToSats("0.01", "THB", TEST_RATES.THB);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("DUST_ZERO_SAT");
  });

  it("dust threshold boundary: 0.02 THB → 1 sat (ok), 0.01 THB → dust", () => {
    const ok = fiatToSats("0.02", "THB", TEST_RATES.THB);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.sats).toBe(1);
    expect(fiatToSats("0.01", "THB", TEST_RATES.THB).ok).toBe(false);
  });

  it("zero / negative amounts never reach mint", () => {
    for (const a of ["0", "0.00", "-5"]) {
      const r = fiatToSats(a, "THB", TEST_RATES.THB);
      expect(r.ok).toBe(false);
    }
  });
});

describe("JPY 0-decimal validation (mockup B unit-tap)", () => {
  it("integer yen ok: 1000 JPY @7.5M → 13333 sats floored", () => {
    const r = fiatToSats("1000", "JPY", TEST_RATES.JPY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sats).toBe(Math.floor((1000 / TEST_RATES.JPY) * SATS_PER_BTC));
    expect(r.sats).toBe(13333);
  });

  it("fractional yen rejected (not dust, not rounded): 1000.5 → TOO_MANY_DECIMALS", () => {
    const r = fiatToSats("1000.5", "JPY", TEST_RATES.JPY);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("TOO_MANY_DECIMALS");
  });

  it("sub-yen rejected even though it would dust: 0.5 JPY → TOO_MANY_DECIMALS", () => {
    const r = parseFiatAmount("0.5", "JPY");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOO_MANY_DECIMALS");
  });

  it("KRW mirrors JPY: 50000 ok, 50000.1 rejected", () => {
    expect(fiatToSats("50000", "KRW", TEST_RATES.KRW).ok).toBe(true);
    const r = fiatToSats("50000.1", "KRW", TEST_RATES.KRW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOO_MANY_DECIMALS");
  });
});

describe("2-decimal validation", () => {
  it("10.56 THB ok, 10.567 THB → TOO_MANY_DECIMALS", () => {
    expect(fiatToSats("10.56", "THB", TEST_RATES.THB).ok).toBe(true);
    const r = fiatToSats("10.567", "THB", TEST_RATES.THB);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("TOO_MANY_DECIMALS");
  });

  it("garbage rejected: empty / abc / 1,000 / signs / double-dot", () => {
    const bad: Array<[string, string]> = [
      ["", "EMPTY"],
      ["   ", "EMPTY"],
      ["abc", "INVALID_FORMAT"],
      ["1,000", "INVALID_FORMAT"],
      ["-5", "INVALID_FORMAT"],
      ["+5", "INVALID_FORMAT"],
      ["12.34.56", "INVALID_FORMAT"],
      ["1e3", "INVALID_FORMAT"],
    ];
    for (const [input, code] of bad) {
      const r = fiatToSats(input, "USD", TEST_RATES.USD);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe(code);
    }
  });
});

describe("stale / UNAVAILABLE policy via resolveFiatQuote (D2)", () => {
  beforeEach(() => {
    clearRatesCache();
  });

  it("stale-use: warm cache + fetch fail → converts with stale flag + original asOf", async () => {
    const gecko = vi.fn(async () => okJson(geckoBody())) as unknown as typeof fetch;
    let now = 10_000_000;
    await getBtcRates({ fetchFn: gecko, now: () => now });
    now += FRESH_TTL_MS + 1_000;
    const dead = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn: dead, now: () => now });
    expect(snap.stale).toBe(true);
    const q = resolveFiatQuote("100", "THB", snap.rates.THB);
    expect(q.ok).toBe(true);
    if (!q.ok || q.ok !== true) return;
    expect(q.sats).toBe(5882);
    expect(q.stale).toBe(true); // UI must badge
    expect(q.asOf).toBe(10_000_000); // original timestamp kept
  });

  it("no-cache-block: cold cache + fetch fail → UNAVAILABLE, fiat mode blocked", async () => {
    const dead = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn: dead, now: () => 11_000_000 });
    expect(snap.rates.THB.price).toBeNull();
    const q = resolveFiatQuote("100", "THB", snap.rates.THB);
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.code).toBe("UNAVAILABLE");
    expect(q.blockFiatMode).toBe(true);
    expect(q.asOf).toBeNull();
  });

  it("429-cache: Gecko 429 + Binance down on warm cache → stale usable, flag survives", async () => {
    const gecko = vi.fn(async () => okJson(geckoBody())) as unknown as typeof fetch;
    let now = 12_000_000;
    await getBtcRates({ fetchFn: gecko, now: () => now });
    now += FRESH_TTL_MS + 1_000;
    const limited = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("coingecko")) return new Response("limited", { status: 429 });
      throw new Error("binance down");
    }) as unknown as typeof fetch;
    const snap = await getBtcRates({ fetchFn: limited, now: () => now });
    expect(snap.rateLimited).toBe(true);
    expect(snap.stale).toBe(true);
    const q = resolveFiatQuote("100", "THB", snap.rates.THB);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.sats).toBe(5882); // last-known rate, floored — not invented
    expect(q.asOf).toBe(12_000_000);
  });
});
