import "server-only";

/**
 * Live provider implementations. Each returns the normalized type from
 * lib/types.ts; swapping in a paid vendor means replacing one function body.
 *
 *   Futures, VIX family, sectors, HYG/LQD, breadth   Yahoo (unofficial, delayed)
 *   Treasury curve (nominal + real)                  home.treasury.gov
 *   Credit spreads (HY + IG OAS)                     FRED
 *   VX futures                                       Cboe
 *   Economic calendar                                TradingEconomics
 *   Earnings                                         Nasdaq
 */

import { EARNINGS_CFG } from "@/config/thresholds";
import {
  BREADTH_CONCURRENCY,
  BREADTH_MIN_COVERAGE,
  EARNINGS_RELEVANCE,
} from "@/config/universe";
import { SECTOR_PROXIES } from "@/config/universe";
import { etParts, prevTradingDay, sessionInfo } from "@/lib/engine/session";
import type {
  Breadth,
  CalendarEvent,
  CreditData,
  CreditProxy,
  Earnings,
  EarningsEvent,
  EarningsResult,
  IndexFutures,
  MarketSeries,
  RatesData,
  Sectors,
  VixFutures,
  VolatilityData,
} from "@/lib/types";

import { getVixFutures } from "./cboe";
import { getConstituents, normalizeTicker } from "./constituents";
import { getCreditSpreads } from "./fred";
import { getEarningsCalendarFor, getLatestEpsSurprise } from "./nasdaq";
import { getUsCalendar } from "./tradingeconomics";
import { getCurveHistory } from "./treasury";
import { getIntradayQuote, getQuote, getSeries, getSeriesMany, mapPool } from "./yahoo";

export class NotConfiguredError extends Error {
  constructor(what: string, envVar: string) {
    super(`${what} provider not configured (set ${envVar} and implement the adapter).`);
    this.name = "NotConfiguredError";
  }
}

const round = (v: number, dp: number): number => Math.round(v * 10 ** dp) / 10 ** dp;

/** Change vs the reference close `lag` sessions back, in percent. */
function changeOver(s: MarketSeries, lag: number): number | null {
  const base = s.closes[s.closes.length - lag];
  return base ? round((s.price / base - 1) * 100, 2) : null;
}

const toMarketSeries = ({ price, time, dates, closes }: MarketSeries): MarketSeries => ({
  price,
  time,
  dates,
  closes,
});

// ---------------------------------------------------------------------------
// Index futures — CME front-month continuous via Yahoo
// ---------------------------------------------------------------------------

const FUTURES = [
  { key: "ES", symbol: "ES=F", name: "E-mini S&P 500" },
  { key: "NQ", symbol: "NQ=F", name: "E-mini Nasdaq 100" },
  { key: "RTY", symbol: "RTY=F", name: "E-mini Russell 2000" },
] as const;

export async function liveFutures(): Promise<IndexFutures> {
  const series = await Promise.all(FUTURES.map((f) => getSeries(f.symbol, "1mo")));
  const [es, nq, rty] = series.map((s, i) => ({
    symbol: FUTURES[i].key,
    name: FUTURES[i].name,
    last: round(s.price, 2),
    changePct: round((s.price / s.previousClose - 1) * 100, 2),
    changeAbs: round(s.price - s.previousClose, 2),
    change5dPct: changeOver(s, 5),
  }));
  const quoteTime = series.map((s) => s.time).sort()[series.length - 1];
  return { es, nq, rty, quoteTime };
}

// ---------------------------------------------------------------------------
// Breadth — computed over every S&P 500 constituent
// ---------------------------------------------------------------------------

export async function liveBreadth(): Promise<Breadth> {
  const universe = [...(await getConstituents()).keys()];

  const settled = await mapPool(universe, BREADTH_CONCURRENCY, getIntradayQuote);
  const quotes = settled
    .filter((s) => s.status === "fulfilled")
    .map((s) => (s as PromiseFulfilledResult<Awaited<ReturnType<typeof getIntradayQuote>>>).value);

  const coverage = quotes.length / universe.length;
  if (coverage < BREADTH_MIN_COVERAGE) {
    throw new Error(`Breadth coverage too low: ${quotes.length}/${universe.length} constituents returned.`);
  }

  const withVwap = quotes.filter((q) => q.vwap !== null);
  const aboveVwap = withVwap.filter((q) => q.price > (q.vwap as number)).length;
  const advancers = quotes.filter((q) => q.changePct > 0).length;
  const decliners = quotes.filter((q) => q.changePct < 0).length;

  const [spy, rsp] = await Promise.all([getQuote("SPY"), getQuote("RSP")]);

  return {
    pctAboveVwap: withVwap.length ? Math.round((aboveVwap / withVwap.length) * 100) : 50,
    // Guard the unchanged-tape case so the ratio never divides by zero.
    advanceDeclineRatio: round(advancers / Math.max(1, decliners), 2),
    advancers,
    decliners,
    spyChangePct: round(spy.changePct, 2),
    rspChangePct: round(rsp.changePct, 2),
    rspVsSpyPct: round(rsp.changePct - spy.changePct, 2),
    quoteTime: new Date(spy.time).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Sectors — ETF proxies, measured against SPY
// ---------------------------------------------------------------------------

export async function liveSectors(): Promise<Sectors> {
  const symbols = [...SECTOR_PROXIES.map((s) => s.proxy), "SPY"];
  const series = await getSeriesMany(symbols, "3mo");

  const spy = series.get("SPY");
  if (!spy) throw new Error("Sector data: SPY unavailable");

  const sectors = SECTOR_PROXIES.flatMap((s) => {
    const q = series.get(s.proxy);
    return q
      ? [{ ...s, changePct: round((q.price / q.previousClose - 1) * 100, 2), change5dPct: changeOver(q, 5) }]
      : [];
  });
  if (sectors.length < SECTOR_PROXIES.length - 2) throw new Error("Sector data incomplete");

  // Align completed closes on dates every symbol shares.
  const present = symbols.filter((s) => series.has(s));
  const shared = spy.dates.filter((d) => present.every((s) => series.get(s)!.dates.includes(d)));
  const closes: Record<string, number[]> = {};
  for (const s of present) {
    const ser = series.get(s)!;
    const byDate = new Map(ser.dates.map((d, i) => [d, ser.closes[i]]));
    closes[s] = shared.map((d) => byDate.get(d) as number);
  }

  return {
    sectors,
    spy: { changePct: round((spy.price / spy.previousClose - 1) * 100, 2), change5dPct: changeOver(spy, 5) },
    history: { dates: shared, closes },
    quoteTime: [...series.values()].map((s) => s.time).sort()[0],
  };
}

// ---------------------------------------------------------------------------
// Rates — official Treasury curve; Cboe ^TNX only as a live 10Y context line
// ---------------------------------------------------------------------------

export async function liveRates(): Promise<RatesData> {
  const [history, tnx] = await Promise.all([
    getCurveHistory(),
    getQuote("^TNX").catch(() => null),
  ]);

  // Only show the live 10Y when it carries information the official curve
  // doesn't yet have (a session after the curve's last date).
  const lastCurveDate = history[history.length - 1].date;
  const live10y =
    tnx && etParts(tnx.time).key > lastCurveDate
      ? {
          yield: round(tnx.price, 3),
          changeBp: Math.round((tnx.price - tnx.previousClose) * 100),
          time: new Date(tnx.time).toISOString(),
        }
      : null;

  return { history, live10y };
}

// ---------------------------------------------------------------------------
// Credit
// ---------------------------------------------------------------------------

export async function liveCredit(): Promise<CreditData> {
  return getCreditSpreads();
}

export async function liveCreditProxy(): Promise<CreditProxy> {
  const [hyg, lqd] = await Promise.all([getSeries("HYG", "3mo"), getSeries("LQD", "3mo")]);
  return { hyg: toMarketSeries(hyg), lqd: toMarketSeries(lqd) };
}

// ---------------------------------------------------------------------------
// Volatility — VIX with a year of history, plus the 9-day and 3-month indices
// ---------------------------------------------------------------------------

export async function liveVolatility(): Promise<VolatilityData> {
  const [vix, vix9d, vix3m] = await Promise.all([
    getSeries("^VIX", "1y"),
    getSeries("^VIX9D", "1y").catch(() => null),
    getSeries("^VIX3M", "1y").catch(() => null),
  ]);
  return {
    vix: toMarketSeries(vix),
    vix9d: vix9d && toMarketSeries(vix9d),
    vix3m: vix3m && toMarketSeries(vix3m),
  };
}

export async function liveVixFutures(): Promise<VixFutures> {
  return getVixFutures();
}

// ---------------------------------------------------------------------------
// Economic calendar
// ---------------------------------------------------------------------------

export async function liveCalendar(): Promise<CalendarEvent[]> {
  return getUsCalendar();
}

// ---------------------------------------------------------------------------
// Earnings — only S&P 500 members large enough to move the index
// ---------------------------------------------------------------------------

export async function liveEarnings(): Promise<Earnings> {
  const members = await getConstituents();
  const session = sessionInfo(Date.now());
  const forDate = session.nextSession;

  const rows = await getEarningsCalendarFor(forDate).catch(() => []);
  const upcoming: EarningsEvent[] = rows
    .flatMap((r) => {
      const member = members.get(normalizeTicker(r.symbol));
      if (!member || !r.slot) return [];
      if ((r.marketCapUsd ?? 0) < EARNINGS_CFG.marketMovingCapUsd) return [];
      return [{
        ticker: r.symbol,
        company: member.name || r.name,
        slot: r.slot,
        sector: member.sector,
        marketCapUsd: r.marketCapUsd,
      }];
    })
    .sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0))
    .slice(0, EARNINGS_CFG.maxShown);

  return { forDate, upcoming, reported: await recentlyReported(members, forDate) };
}

/**
 * Index-moving names that reported since the prior session's close. The EPS
 * surprise feed is the proof a report happened: a name on the calendar that
 * hasn't printed yet has no fresh row there, so it is filtered out by date.
 */
async function recentlyReported(
  members: Awaited<ReturnType<typeof getConstituents>>,
  forDate: string,
): Promise<EarningsResult[]> {
  const dates = [prevTradingDay(forDate), forDate];
  const candidates = (await Promise.all(dates.map((d) => getEarningsCalendarFor(d).catch(() => []))))
    .flat()
    .filter((r) => members.has(normalizeTicker(r.symbol)))
    .filter((r) => (r.marketCapUsd ?? 0) >= EARNINGS_CFG.marketMovingCapUsd)
    .sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0))
    .slice(0, EARNINGS_CFG.maxReportedShown * 2);

  const settled = await Promise.all(
    candidates.map(async (r): Promise<EarningsResult | null> => {
      const [surprise, quote] = await Promise.all([
        getLatestEpsSurprise(r.symbol),
        getQuote(r.symbol).catch(() => null),
      ]);
      if (!surprise || !isRecent(surprise.dateReported)) return null;
      const member = members.get(normalizeTicker(r.symbol));
      return {
        ticker: r.symbol,
        company: member?.name || r.name,
        reportedAt: surprise.dateReported,
        epsSurprisePct: surprise.surprisePct,
        stockReactionPct: quote ? round(quote.changePct, 2) : null,
      };
    }),
  );

  return settled
    .filter((r): r is EarningsResult => r !== null)
    .slice(0, EARNINGS_CFG.maxReportedShown);
}

/** Nasdaq reports dates as M/D/YYYY. Accept only the last few days. */
function isRecent(dateReported: string): boolean {
  const m = dateReported.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const when = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  const ageDays = (Date.now() - when) / 86_400_000;
  return ageDays >= -1 && ageDays <= EARNINGS_RELEVANCE.reportedLookbackDays + 3;
}
