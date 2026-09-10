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
    currency?: string;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${encodeURIComponent(symbol)}?${query}`, {
      headers: HEADERS,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.meta) {
      throw new Error(
        `Yahoo ${symbol}: ${json?.chart?.error?.description ?? "empty response"}`,
      );
    }
    return result as ChartResult;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Session change from the daily series.
 *
 * `meta.chartPreviousClose` is range-dependent and wrong for futures, so we
 * derive the reference close from the daily bars instead: if the final bar is
 * the session currently quoted, the previous close is the bar before it.
 */
export async function getQuote(symbol: string): Promise<Quote> {
  const r = await chart(symbol, "range=5d&interval=1d");
  const closes = (r.indicators?.quote?.[0]?.close ?? []).filter(
    (c): c is number => typeof c === "number",
  );
  const price = r.meta.regularMarketPrice ?? closes[closes.length - 1];
  if (typeof price !== "number" || closes.length < 2) {
    throw new Error(`Yahoo ${symbol}: insufficient price history`);
  }

  const last = closes[closes.length - 1];
  const isCurrentSession = Math.abs(last - price) < Math.abs(price) * 1e-6;
  const previousClose = isCurrentSession
    ? closes[closes.length - 2]
    : closes[closes.length - 1];

  return {
    symbol,
    price,
    previousClose,
    changeAbs: price - previousClose,
    changePct: ((price - previousClose) / previousClose) * 100,
    time: (r.meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
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

/** Fetches many symbols, tolerating individual failures. */
export async function getQuotes(
  symbols: string[],
): Promise<Map<string, Quote>> {
  const settled = await mapPool(symbols, 8, getQuote);
  const map = new Map<string, Quote>();
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") map.set(symbols[i], s.value);
    else console.warn(`[yahoo] ${symbols[i]} failed:`, s.reason?.message ?? s.reason);
  });
  return map;
}

/** Oldest vendor timestamp in a set — what the freshness badge should reflect. */
export function oldestTime(quotes: Iterable<Quote>): string {
  let oldest = Infinity;
  for (const q of quotes) oldest = Math.min(oldest, q.time);
  return new Date(Number.isFinite(oldest) ? oldest : Date.now()).toISOString();
}
