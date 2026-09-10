import "server-only";

/**
 * Live provider implementations.
 *
 * Implemented keyless (Yahoo Finance + US Treasury): futures, breadth, sectors,
 * rates, volatility.
 *
 * Still unimplemented — no credible keyless source exists: credit spreads (needs
 * a free FRED key), the economic calendar, and earnings. Those throw
 * NotConfiguredError, which the service layer turns into a labelled mock so the
 * rest of the dashboard keeps working.
 */

import {
  BREADTH_CONCURRENCY,
  BREADTH_MIN_COVERAGE,
  EARNINGS_RELEVANCE,
} from "@/config/universe";
import type {
  Breadth,
  Credit,
  Earnings,
  EarningsEvent,
  EarningsResult,
  IndexFutures,
  Rates,
  ResultGrade,
  SectorQuote,
  Sectors,
  Volatility,
} from "@/lib/types";

import { getIntradayQuote, getQuote, getQuotes, mapPool } from "./yahoo";
import { getParYields } from "./treasury";
import { getConstituents, normalizeTicker } from "./constituents";
import { getHighYieldSpread } from "./fred";
import { getEarningsCalendarFor, getLatestEpsSurprise } from "./nasdaq";
import { getUsCalendar } from "./tradingeconomics";

export class NotConfiguredError extends Error {
  constructor(what: string, envVar: string) {
    super(`${what} provider not configured (set ${envVar} and implement the adapter).`);
    this.name = "NotConfiguredError";
  }
}

/** YYYY-MM-DD in Eastern Time. */
function etDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Index futures — CME front-month continuous via Yahoo
// ---------------------------------------------------------------------------

const FUTURES_SYMBOLS = {
  ES: { symbol: "ES=F", name: "E-mini S&P 500" },
  NQ: { symbol: "NQ=F", name: "E-mini Nasdaq 100" },
  RTY: { symbol: "RTY=F", name: "E-mini Russell 2000" },
} as const;

export async function liveFutures(): Promise<IndexFutures> {
  const [es, nq, rty] = await Promise.all(
    (["ES", "NQ", "RTY"] as const).map((k) => getQuote(FUTURES_SYMBOLS[k].symbol)),
  );

  const leg = (key: "ES" | "NQ" | "RTY", q: Awaited<ReturnType<typeof getQuote>>) => ({
    symbol: key,
    name: FUTURES_SYMBOLS[key].name,
    last: round(q.price, 2),
    changePct: round(q.changePct, 2),
    changeAbs: round(q.changeAbs, 2),
  });

  return { es: leg("ES", es), nq: leg("NQ", nq), rty: leg("RTY", rty) };
}

// ---------------------------------------------------------------------------
// Breadth — computed over the S&P 100 (see config/universe.ts for the caveat)
// ---------------------------------------------------------------------------

export async function liveBreadth(): Promise<Breadth> {
  const universe = [...(await getConstituents()).keys()];

  const settled = await mapPool(universe, BREADTH_CONCURRENCY, getIntradayQuote);
  const quotes = settled
    .filter((s) => s.status === "fulfilled")
    .map((s) => (s as PromiseFulfilledResult<Awaited<ReturnType<typeof getIntradayQuote>>>).value);

  const coverage = quotes.length / universe.length;
  if (coverage < BREADTH_MIN_COVERAGE) {
    throw new Error(
      `Breadth coverage too low: ${quotes.length}/${universe.length} constituents returned.`,
    );
  }

  const withVwap = quotes.filter((q) => q.vwap !== null);
  const aboveVwap = withVwap.filter((q) => q.price > (q.vwap as number)).length;

  const advancers = quotes.filter((q) => q.changePct > 0).length;
  const decliners = quotes.filter((q) => q.changePct < 0).length;

  const [spy, rsp] = await Promise.all([getQuote("SPY"), getQuote("RSP")]);

  return {
    pctAboveVwap: withVwap.length
      ? Math.round((aboveVwap / withVwap.length) * 100)
      : 50,
    // Guard the unchanged-tape case so the ratio never divides by zero.
    advanceDeclineRatio: round(advancers / Math.max(1, decliners), 2),
    advancers,
    decliners,
    rspVsSpyPct: round(rsp.changePct - spy.changePct, 2),
  };
}

// ---------------------------------------------------------------------------
// Sectors — ETF proxies
// ---------------------------------------------------------------------------

const SECTOR_PROXIES: Array<Pick<SectorQuote, "key" | "label" | "proxy">> = [
  { key: "semis", label: "Semiconductors", proxy: "SOXX" },
  { key: "tech", label: "Technology", proxy: "XLK" },
  { key: "financials", label: "Financials", proxy: "XLF" },
  { key: "industrials", label: "Industrials", proxy: "XLI" },
  { key: "discretionary", label: "Discretionary", proxy: "XLY" },
  { key: "energy", label: "Energy", proxy: "XLE" },
  { key: "materials", label: "Materials", proxy: "XLB" },
  { key: "healthcare", label: "Healthcare", proxy: "XLV" },
  { key: "staples", label: "Staples", proxy: "XLP" },
  { key: "utilities", label: "Utilities", proxy: "XLU" },
];

export async function liveSectors(): Promise<Sectors> {
  const quotes = await getQuotes(SECTOR_PROXIES.map((s) => s.proxy));

  const sectors: SectorQuote[] = SECTOR_PROXIES.flatMap((s) => {
    const q = quotes.get(s.proxy);
    return q ? [{ ...s, changePct: round(q.changePct, 2) }] : [];
  });

  if (sectors.length < SECTOR_PROXIES.length - 2) {
    throw new Error("Sector data incomplete");
  }

  // The prior session's rotation score would need yesterday's sector closes
  // stored; without a datastore there is nothing honest to compare against.
  return { sectors, previousScore: null };
}

// ---------------------------------------------------------------------------
// Rates — 10Y intraday from Cboe ^TNX, 2Y from Treasury par yields
// ---------------------------------------------------------------------------

export async function liveRates(): Promise<Rates> {
  const [tnx, par] = await Promise.all([getQuote("^TNX"), getParYields()]);

  const us10y = round(tnx.price, 2);
  const us10yChangeBp = Math.round((tnx.price - tnx.previousClose) * 100);
  const us2y = round(par.us2y, 2);

  return {
    us10y,
    us10yChangeBp,
    us2y,
    us2yChangeBp: par.us2yChangeBp,
    // Small cross-source basis (Cboe index vs par yield); 2s10s carries only
    // 5% of the stress score and is read as level + direction, not precision.
    curve2s10sBp: Math.round((us10y - us2y) * 100),
    curve2s10sChangeBp: us10yChangeBp - par.us2yChangeBp,
  };
}

// ---------------------------------------------------------------------------
// Volatility — spot VIX
// ---------------------------------------------------------------------------

export async function liveVolatility(): Promise<Volatility> {
  const q = await getQuote("^VIX");
  return {
    vix: round(q.price, 2),
    vixChangePct: round(q.changePct, 2),
    vixChangeAbs: round(q.changeAbs, 2),
  };
}

// ---------------------------------------------------------------------------
// Credit — ICE BofA US High Yield OAS via FRED's keyless CSV export
// ---------------------------------------------------------------------------

export async function liveCredit(): Promise<Credit> {
  return getHighYieldSpread();
}

// ---------------------------------------------------------------------------
// Economic calendar — TradingEconomics, US only, 2-star and above
// ---------------------------------------------------------------------------

export { getUsCalendar as liveCalendarResult };

export async function liveCalendar() {
  return (await getUsCalendar()).events;
}

// ---------------------------------------------------------------------------
// Earnings — Nasdaq calendar, restricted to S&P 500 members and ranked by size
// ---------------------------------------------------------------------------

function importanceForCap(cap: number | null) {
  return (cap ?? 0) >= EARNINGS_RELEVANCE.highImpactMarketCap
    ? ("HIGH" as const)
    : ("MED" as const);
}

export async function liveEarnings(): Promise<Earnings> {
  const members = await getConstituents();
  const today = etDateKey();

  // "Big impact on the S&P" = actually in the index, and big enough to matter.
  const relevantOn = async (date: string) => {
    const rows = await getEarningsCalendarFor(date).catch(() => []);
    return rows
      .flatMap((r) => {
        const member = members.get(normalizeTicker(r.symbol));
        if (!member || !r.slot) return [];
        if ((r.marketCapUsd ?? 0) < EARNINGS_RELEVANCE.minMarketCap) return [];
        return [{ row: r, member }];
      })
      .sort((a, b) => (b.row.marketCapUsd ?? 0) - (a.row.marketCapUsd ?? 0));
  };

  // Weekends and holidays have nothing scheduled; fall forward to the next
  // session so the card is useful on a Sunday-evening prep, same as catalysts.
  let relevant = await relevantOn(today);
  for (let ahead = 1; relevant.length === 0 && ahead <= 4; ahead++) {
    relevant = await relevantOn(etDateKey(new Date(Date.now() + ahead * 86_400_000)));
  }

  const todayEvents: EarningsEvent[] = relevant.map(({ row, member }) => ({
    ticker: row.symbol,
    company: member.name || row.name,
    slot: row.slot as EarningsEvent["slot"],
    importance: importanceForCap(row.marketCapUsd),
    sector: member.sector,
    marketCapUsd: row.marketCapUsd,
    epsForecast: row.epsForecast,
  }));

  return { today: todayEvents, reported: await recentlyReported(members, today) };
}

/**
 * Names that reported since the prior close. EPS beat/miss is real (actual vs
 * consensus); revenue, guidance and margins are not published by any keyless
 * source, so they stay N/A and the UI omits those rows entirely.
 */
async function recentlyReported(
  members: Awaited<ReturnType<typeof getConstituents>>,
  today: string,
): Promise<EarningsResult[]> {
  const prior = new Date(Date.now() - EARNINGS_RELEVANCE.reportedLookbackDays * 86_400_000);
  const priorKey = etDateKey(prior);

  const candidates = (
    await Promise.all(
      [priorKey, today].map((d) => getEarningsCalendarFor(d).catch(() => [])),
    )
  )
    .flat()
    .flatMap((r) => {
      const member = members.get(normalizeTicker(r.symbol));
      if (!member) return [];
      if ((r.marketCapUsd ?? 0) < EARNINGS_RELEVANCE.highImpactMarketCap) return [];
      return [{ r, member }];
    })
    .sort((a, b) => (b.r.marketCapUsd ?? 0) - (a.r.marketCapUsd ?? 0))
    .slice(0, EARNINGS_RELEVANCE.maxReportedShown * 3);

  const settled = await Promise.all(
    candidates.map(async ({ r, member }): Promise<EarningsResult | null> => {
      const [surprise, quote] = await Promise.all([
        getLatestEpsSurprise(r.symbol),
        getQuote(r.symbol).catch(() => null),
      ]);
      // The surprise feed is the proof the report actually happened. A name on
      // today's calendar that hasn't printed yet has no fresh row here, so
      // stale quarters are filtered out by date rather than guessed at.
      if (!surprise || !isRecent(surprise.dateReported)) return null;

      const grade: ResultGrade =
        surprise.surprisePct > 1 ? "BEAT" : surprise.surprisePct < -1 ? "MISS" : "IN LINE";

      return {
        ticker: r.symbol,
        company: member.name || r.name,
        sector: member.sector,
        reportedAt: surprise.dateReported,
        revenue: "N/A",
        eps: grade,
        guidance: "N/A",
        margins: "N/A",
        epsDetail: {
          actual: surprise.eps,
          consensus: surprise.consensus,
          surprisePct: surprise.surprisePct,
        },
        stockReactionPct: quote ? round(quote.changePct, 2) : null,
        missingFields: ["revenue", "guidance", "margins"],
      };
    }),
  );

  return settled
    .filter((r): r is EarningsResult => r !== null)
    .slice(0, EARNINGS_RELEVANCE.maxReportedShown);
}

/** Nasdaq reports dates as M/D/YYYY. Accept only the last few days. */
function isRecent(dateReported: string): boolean {
  const m = dateReported.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  const when = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  const ageDays = (Date.now() - when) / 86_400_000;
  return ageDays >= -1 && ageDays <= EARNINGS_RELEVANCE.reportedLookbackDays + 1.5;
}

// ---------------------------------------------------------------------------

const round = (v: number, dp: number): number =>
  Math.round(v * 10 ** dp) / 10 ** dp;
