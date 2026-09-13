import "server-only";

/**
 * Yahoo Finance chart endpoint client.
 *
 * UNOFFICIAL AND UNLICENSED. Undocumented, rate-limited at Yahoo's discretion,
 * no SLA, and not licensed for commercial use or redistribution. Quotes are
 * delayed (typically 10-30 minutes for CME futures). Good enough for a personal
 * morning scan; not something to trade size against. Everything it returns is
 * surfaced with its own timestamp so the UI can show how old it really is.
 */

import type { MarketSeries } from "@/lib/types";
import { etParts } from "@/lib/engine/session";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
  Accept: "application/json",
};

const TIMEOUT_MS = 8_000;

export interface Quote {
  symbol: string;
  price: number;
  previousClose: number;
  changePct: number;
  changeAbs: number;
  /** Vendor's own quote time (epoch ms). */
  time: number;
}

export interface IntradayQuote extends Quote {
  /** Session VWAP from 5-minute bars; null when no volume was reported. */
  vwap: number | null;
}

interface ChartResult {
  meta: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

async function chart(symbol: string, query: string): Promise<ChartResult> {
  const res = await fetch(`${BASE}${encodeURIComponent(symbol)}?${query}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result?.meta) {
    throw new Error(`Yahoo ${symbol}: ${json?.chart?.error?.description ?? "empty response"}`);
  }
  return result as ChartResult;
}

/**
 * Daily history plus the latest quote, normalised to the MarketSeries
 * contract: `closes` holds completed sessions only and ends with the close the
 * latest price is measured against.
 *
 * `meta.chartPreviousClose` is range-dependent and wrong for futures, so the
 * reference close comes from the bars themselves. The last bar is the session
 * currently quoted when its ET date matches the quote's, or its close matches
 * the quote exactly.
 */
export async function getSeries(
  symbol: string,
  range = "1y",
): Promise<MarketSeries & { previousClose: number }> {
  const r = await chart(symbol, `range=${range}&interval=1d`);
  const timestamps = r.timestamp ?? [];
  const closes = r.indicators?.quote?.[0]?.close ?? [];

  // One bar per ET date; Yahoo occasionally emits a partial duplicate.
  const byDate = new Map<string, number>();
  timestamps.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === "number") byDate.set(etParts(t * 1000).key, c);
  });
  const bars = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));

  const price = r.meta.regularMarketPrice ?? bars[bars.length - 1]?.[1];
  if (typeof price !== "number" || bars.length < 3) {
    throw new Error(`Yahoo ${symbol}: insufficient price history`);
  }
  const time = (r.meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000;

  const [lastDate, lastClose] = bars[bars.length - 1];
  const isCurrent =
    lastDate === etParts(time).key || Math.abs(lastClose - price) < Math.abs(price) * 1e-6;
  const completed = isCurrent ? bars.slice(0, -1) : bars;

  return {
    price,
    time: new Date(time).toISOString(),
    dates: completed.map(([d]) => d),
    closes: completed.map(([, c]) => c),
    previousClose: completed[completed.length - 1][1],
  };
}

/** Latest quote vs the prior session close. */
export async function getQuote(symbol: string): Promise<Quote> {
  const s = await getSeries(symbol, "5d");
  return {
    symbol,
    price: s.price,
    previousClose: s.previousClose,
    changeAbs: s.price - s.previousClose,
    changePct: ((s.price - s.previousClose) / s.previousClose) * 100,
    time: Date.parse(s.time),
  };
}

/**
 * Intraday quote plus session VWAP, from a single 5-minute-bar request.
 * On this range `chartPreviousClose` is the correct prior session close
 * (verified against the daily series for equities).
 */
export async function getIntradayQuote(symbol: string): Promise<IntradayQuote> {
  const r = await chart(symbol, "range=1d&interval=5m");
  const price = r.meta.regularMarketPrice;
  const previousClose = r.meta.chartPreviousClose;
  if (typeof price !== "number" || typeof previousClose !== "number") {
    throw new Error(`Yahoo ${symbol}: missing intraday price`);
  }

  const bars = r.indicators?.quote?.[0];
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < (r.timestamp?.length ?? 0); i++) {
    const h = bars?.high?.[i];
    const l = bars?.low?.[i];
    const c = bars?.close?.[i];
    const v = bars?.volume?.[i];
    if (h == null || l == null || c == null || !v) continue;
    pv += ((h + l + c) / 3) * v;
    vol += v;
  }

  return {
    symbol,
    price,
    previousClose,
    changeAbs: price - previousClose,
    changePct: ((price - previousClose) / previousClose) * 100,
    time: (r.meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
    vwap: vol > 0 ? pv / vol : null,
  };
}

/** Bounded-concurrency map. Yahoo handled 8 in flight comfortably. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const out: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        try {
          out[i] = { status: "fulfilled", value: await fn(items[i]) };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return out;
}

/** Daily series for many symbols, tolerating individual failures. */
export async function getSeriesMany(
  symbols: string[],
  range: string,
): Promise<Map<string, Awaited<ReturnType<typeof getSeries>>>> {
  const settled = await mapPool(symbols, 8, (s) => getSeries(s, range));
  const map = new Map<string, Awaited<ReturnType<typeof getSeries>>>();
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") map.set(symbols[i], s.value);
    else console.warn(`[yahoo] ${symbols[i]} failed:`, (s.reason as Error)?.message ?? s.reason);
  });
  return map;
}
