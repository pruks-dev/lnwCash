/**
 * TASK-5201 — fiat→sats convert lib (INTENT-052 / BLUEPRINT v2, D2/D4)
 *
 * Extends: src/lib/fiat/rates.ts (rate source + stale/UNAVAILABLE policy).
 * This file adds ONLY: decimals meta + parse/validate + fiat→sats math.
 *
 * Rules (hard):
 *  - NEVER round-up — Math.floor only. A quote must never promise more
 *    sats than the fiat actually buys (else mint would be asked to
 *    over-deliver / the user underpays).
 *  - NEVER invent a rate — rate comes from the caller (rates.ts snapshot).
 *    Null / non-finite / non-positive rate → RATE_UNAVAILABLE, never a
 *    fabricated number.
 *  - 0-sat dust is INVALID — a floor result of 0 sats is blocked and never
 *    sent to mint as a quote (D4).
 *  - Stale policy (D2) lives in rates.ts; resolveFiatQuote() below only
 *    *propagates* it: stale entry + timestamp → usable with label,
 *    no-cache entry (price null) → UNAVAILABLE (block fiat mode).
 */

import type { FiatCurrency, RateEntry } from "./rates";

/** Minor-unit decimals per currency (mockup B unit-tap: USD 2 / JPY 0). */
export const CURRENCY_META: Record<FiatCurrency, { decimals: number }> = {
  THB: { decimals: 2 },
  USD: { decimals: 2 },
  EUR: { decimals: 2 },
  JPY: { decimals: 0 },
  GBP: { decimals: 2 },
  CNY: { decimals: 2 },
  KRW: { decimals: 0 },
  SGD: { decimals: 2 },
  AUD: { decimals: 2 },
  MYR: { decimals: 2 },
};

/** Sats per 1 BTC — the only scaling constant (protocol, not a rate). */
export const SATS_PER_BTC = 100_000_000;

export type FiatParseErrorCode =
  | "EMPTY"
  | "INVALID_FORMAT"
  | "TOO_MANY_DECIMALS"
  | "NON_POSITIVE";

export type ConvertErrorCode =
  | FiatParseErrorCode
  | "RATE_UNAVAILABLE"
  | "DUST_ZERO_SAT";

export interface FiatParseOk {
  ok: true;
  /** Amount in major units (e.g. baht, yen). */
  major: number;
  currency: FiatCurrency;
  decimals: number;
}

export interface ParseFailure {
  ok: false;
  code: FiatParseErrorCode;
  message: string;
}

export type FiatParseResult = FiatParseOk | ParseFailure;

export interface SatsOk {
  ok: true;
  sats: number;
  /** Echo of the validated major amount (for UI confirmation). */
  major: number;
  currency: FiatCurrency;
}

export interface SatsFailure {
  ok: false;
  code: ConvertErrorCode;
  message: string;
}

export type FiatToSatsResult = SatsOk | SatsFailure;

function fail(code: ConvertErrorCode, message: string): SatsFailure {
  return { ok: false, code, message };
}

/**
 * Parse + validate a raw fiat input string against the currency's decimals.
 * Strict: no thousands separators, no signs, no exponent — keypad-grade input.
 */
export function parseFiatAmount(
  fiatStr: string,
  currency: FiatCurrency,
): FiatParseResult {
  const decimals = CURRENCY_META[currency].decimals;
  const raw = fiatStr.trim();
  if (raw.length === 0) {
    return { ok: false, code: "EMPTY", message: "amount is empty" };
  }
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return {
      ok: false,
      code: "INVALID_FORMAT",
      message: `invalid amount format: ${JSON.stringify(fiatStr)}`,
    };
  }
  const dot = raw.indexOf(".");
  const fracDigits = dot === -1 ? 0 : raw.length - dot - 1;
  if (fracDigits > decimals) {
    return {
      ok: false,
      code: "TOO_MANY_DECIMALS",
      message: `${currency} allows at most ${decimals} decimals`,
    };
  }
  const major = Number(raw);
  if (!Number.isFinite(major) || major <= 0) {
    return { ok: false, code: "NON_POSITIVE", message: "amount must be > 0" };
  }
  return { ok: true, major, currency, decimals };
}

function asFailure(r: FiatParseResult): SatsFailure {
  const f = r as ParseFailure;
  return { ok: false, code: f.code, message: f.message };
}

/**
 * fiatToSats(fiatStr, currency, rate) = floor(fiat / rate_per_btc * 1e8).
 *
 * @param rate price of 1 BTC in `currency` major units, from rates.ts.
 *             null/NaN/<=0 → RATE_UNAVAILABLE (never invent one).
 * @returns sats floored (never rounded up); 0-sat dust → DUST_ZERO_SAT.
 */
export function fiatToSats(
  fiatStr: string,
  currency: FiatCurrency,
  rate: number | null,
): FiatToSatsResult {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return fail("RATE_UNAVAILABLE", "rate unavailable — fiat mode blocked");
  }
  const parsed = parseFiatAmount(fiatStr, currency);
  if (!parsed.ok) return asFailure(parsed);
  // FLOOR ONLY — never round-up, never Math.round/ceil.
  const sats = Math.floor((parsed.major / rate) * SATS_PER_BTC);
  if (!Number.isFinite(sats) || sats <= 0) {
    return fail(
      "DUST_ZERO_SAT",
      "amount too small — converts to 0 sats (dust blocked)",
    );
  }
  return { ok: true, sats, major: parsed.major, currency };
}

export interface FiatQuoteOk extends SatsOk {
  /** Stale-with-timestamp passthrough (D2) — UI must badge + show time. */
  stale: boolean;
  expired: boolean;
  asOf: number | null;
}

export interface FiatQuoteBlocked {
  ok: false;
  code: "UNAVAILABLE" | ConvertErrorCode;
  message: string;
  /** True when fiat mode must be blocked (no usable rate at all). */
  blockFiatMode: boolean;
  stale: boolean;
  expired: boolean;
  asOf: number | null;
}

export type FiatQuoteResult = FiatQuoteOk | FiatQuoteBlocked;

/**
 * Resolve a fiat input against a rates.ts entry (D2 stale/UNAVAILABLE policy):
 *  - entry.price null (cold cache + fetch failed, incl. post-429) → UNAVAILABLE,
 *    block fiat mode — never fabricate.
 *  - stale entry (incl. expired, incl. post-429 cache) → convert normally and
 *    propagate stale/expired/asOf so UI labels the timestamp.
 */
export function resolveFiatQuote(
  fiatStr: string,
  currency: FiatCurrency,
  entry: RateEntry,
): FiatQuoteResult {
  if (entry.price === null) {
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: "rate unavailable — fiat mode blocked",
      blockFiatMode: true,
      stale: true,
      expired: true,
      asOf: null,
    };
  }
  const r = fiatToSats(fiatStr, currency, entry.price);
  if (!r.ok) {
    return {
      ok: false,
      code: r.code,
      message: r.message,
      blockFiatMode: r.code === "RATE_UNAVAILABLE",
      stale: entry.stale,
      expired: entry.expired,
      asOf: entry.asOf,
    };
  }
  return {
    ok: true,
    sats: r.sats,
    major: r.major,
    currency,
    stale: entry.stale,
    expired: entry.expired,
    asOf: entry.asOf,
  };
}
