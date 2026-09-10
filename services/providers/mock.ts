/**
 * Deterministic mock providers.
 *
 * Values are anchored to the reference scenario in the build spec and drift
 * slowly (seeded off the current minute) so the dashboard looks alive without
 * becoming non-reproducible. Nothing here touches the network.
 */

import type {
  Breadth,
  CalendarEvent,
  Credit,
  Earnings,
  IndexFutures,
  Rates,
  Sectors,
  Volatility,
} from "@/lib/types";

// --- deterministic drift -----------------------------------------------------

/** Mulberry32 — stable per-minute jitter so repeated renders agree. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drifter(): (amplitude: number) => number {
  const minute = Math.floor(Date.now() / 60_000);
  const rand = seeded(minute);
  return (amplitude: number) => (rand() - 0.5) * 2 * amplitude;
}

const round = (v: number, dp: number): number =>
  Math.round(v * 10 ** dp) / 10 ** dp;

// --- ET wall-clock helpers ---------------------------------------------------

const etParts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") };
};

/** Instant for a given Eastern-Time wall clock on today's ET date. */
function etToday(hour: number, minute: number): string {
  const { year, month, day } = etParts(new Date());
  for (const offset of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offset, minute));
    const p = etParts(candidate);
    if (p.hour === hour && p.day === day) return candidate.toISOString();
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute)).toISOString();
}

// --- providers ---------------------------------------------------------------

export async function mockFutures(): Promise<IndexFutures> {
  const d = drifter();
  const es = round(0.42 + d(0.08), 2);
  const nq = round(0.71 + d(0.1), 2);
  const rty = round(0.08 + d(0.06), 2);

  return {
    es: {
      symbol: "ES",
      name: "E-mini S&P 500",
      last: round(5642.25 + es * 12, 2),
      changePct: es,
      changeAbs: round(es * 56, 2),
    },
    nq: {
      symbol: "NQ",
      name: "E-mini Nasdaq 100",
      last: round(19842.5 + nq * 40, 2),
      changePct: nq,
      changeAbs: round(nq * 198, 2),
    },
    rty: {
      symbol: "RTY",
      name: "E-mini Russell 2000",
      last: round(2214.8 + rty * 8, 2),
      changePct: rty,
      changeAbs: round(rty * 22, 2),
    },
  };
}

export async function mockBreadth(): Promise<Breadth> {
  const d = drifter();
  const advancers = Math.round(321 + d(9));
  const decliners = 503 - advancers;
  return {
    pctAboveVwap: Math.round(68 + d(2.5)),
    advanceDeclineRatio: round(advancers / decliners, 2),
    advancers,
    decliners,
    rspVsSpyPct: round(0.24 + d(0.05), 2),
  };
}

export async function mockSectors(): Promise<Sectors> {
  const d = drifter();
  return {
    sectors: [
      { key: "semis", label: "Semiconductors", proxy: "SOXX", changePct: round(1.8 + d(0.15), 2) },
      { key: "tech", label: "Technology", proxy: "XLK", changePct: round(0.9 + d(0.1), 2) },
      { key: "financials", label: "Financials", proxy: "XLF", changePct: round(0.7 + d(0.1), 2) },
      { key: "industrials", label: "Industrials", proxy: "XLI", changePct: round(0.55 + d(0.08), 2) },
      { key: "discretionary", label: "Discretionary", proxy: "XLY", changePct: round(0.5 + d(0.08), 2) },
      { key: "energy", label: "Energy", proxy: "XLE", changePct: round(0.31 + d(0.12), 2) },
      { key: "materials", label: "Materials", proxy: "XLB", changePct: round(0.18 + d(0.08), 2) },
      { key: "healthcare", label: "Healthcare", proxy: "XLV", changePct: round(0.05 + d(0.07), 2) },
      { key: "staples", label: "Staples", proxy: "XLP", changePct: round(-0.2 + d(0.07), 2) },
      { key: "utilities", label: "Utilities", proxy: "XLU", changePct: round(-0.35 + d(0.09), 2) },
    ],
    previousScore: 63,
  };
}

export async function mockRates(): Promise<Rates> {
  const d = drifter();
  const chg10 = Math.round(-6 + d(1.5));
  const chg2 = Math.round(-2 + d(1.5));
  const us10y = round(4.18 + d(0.01), 2);
  const us2y = round(3.86 + d(0.01), 2);
  return {
    us10y,
    us10yChangeBp: chg10,
    us2y,
    us2yChangeBp: chg2,
    curve2s10sBp: Math.round((us10y - us2y) * 100),
    curve2s10sChangeBp: chg10 - chg2,
  };
}

export async function mockVolatility(): Promise<Volatility> {
  const d = drifter();
  const vix = round(16.4 + d(0.35), 2);
  const changePct = round(-5.2 + d(0.9), 2);
  return {
    vix,
    vixChangePct: changePct,
    vixChangeAbs: round((vix * changePct) / 100, 2),
  };
}

export async function mockCredit(): Promise<Credit> {
  // Daily series — no intraday drift, and flagged as such.
  const asOf = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  return {
    hySpreadBp: 298,
    hySpreadChangeBp: -3,
    asOfDate: asOf,
    dailyOnly: true,
  };
}

export async function mockCalendar(): Promise<CalendarEvent[]> {
  return [
    {
      id: "cpi",
      time: etToday(8, 30),
      title: "CPI",
      importance: "HIGH",
      category: "data",
    },
    {
      id: "sentiment",
      time: etToday(10, 0),
      title: "Consumer Sentiment",
      importance: "MED",
      category: "data",
    },
    {
      id: "auction-30y",
      time: etToday(13, 0),
      title: "30Y Treasury Auction",
      importance: "MED",
      category: "auction",
    },
    {
      id: "powell",
      time: etToday(14, 0),
      title: "Powell Speech",
      importance: "HIGH",
      category: "fed",
    },
    {
      id: "claims-revision",
      time: etToday(8, 30),
      title: "Jobless Claims Revisions",
      importance: "LOW",
      category: "data",
    },
  ];
}

export async function mockEarnings(): Promise<Earnings> {
  return {
    today: [
      {
        ticker: "WMT",
        company: "Walmart",
        slot: "PRE-MARKET",
        importance: "MED",
        sector: "Consumer Staples",
        marketCapUsd: 780e9,
        epsForecast: 0.74,
      },
      {
        ticker: "HD",
        company: "Home Depot",
        slot: "PRE-MARKET",
        importance: "MED",
        sector: "Consumer Discretionary",
        marketCapUsd: 390e9,
        epsForecast: 4.52,
      },
      {
        ticker: "NVDA",
        company: "NVIDIA",
        slot: "AFTER CLOSE",
        importance: "HIGH",
        sector: "Information Technology",
        marketCapUsd: 3200e9,
        epsForecast: 1.12,
      },
      {
        ticker: "PANW",
        company: "Palo Alto Networks",
        slot: "AFTER CLOSE",
        importance: "MED",
        sector: "Information Technology",
        marketCapUsd: 130e9,
        epsForecast: 0.89,
      },
    ],
    reported: [
      {
        ticker: "NVDA",
        company: "NVIDIA",
        sector: "Information Technology",
        reportedAt: etToday(16, 20),
        revenue: "BEAT",
        eps: "BEAT",
        guidance: "RAISED",
        margins: "BETTER",
        epsDetail: { actual: 1.24, consensus: 1.12, surprisePct: 10.7 },
        stockReactionPct: 6.8,
        missingFields: [],
      },
      {
        ticker: "CSCO",
        company: "Cisco",
        sector: "Information Technology",
        reportedAt: etToday(16, 5),
        revenue: "IN LINE",
        eps: "BEAT",
        guidance: "MAINTAINED",
        margins: "IN LINE",
        epsDetail: { actual: 0.98, consensus: 0.95, surprisePct: 3.2 },
        stockReactionPct: 1.2,
        missingFields: [],
      },
      {
        ticker: "AMAT",
        company: "Applied Materials",
        sector: "Information Technology",
        reportedAt: etToday(16, 10),
        revenue: "BEAT",
        eps: "BEAT",
        guidance: "N/A",
        margins: "N/A",
        epsDetail: { actual: 2.31, consensus: 2.19, surprisePct: 5.5 },
        stockReactionPct: -2.1,
        missingFields: ["guidance", "margins"],
      },
    ],
  };
}
