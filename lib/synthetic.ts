/**
 * Synthetic market data, shared by the test suite and DATA_MODE=mock.
 *
 * Builds complete raw blocks from a compact scenario. Each series is a seeded
 * random walk — realistic day-to-day noise, so the engine's history-ranked
 * thresholds behave the way they do on real data — followed by a quiet,
 * deterministic final five sessions that land exactly on the requested
 * one-day and five-day moves. The same scenario always produces the same data.
 */

import { SECTOR_PROXIES } from "@/config/universe";
import { etInstant, etParts, prevTradingDay, sessionInfo } from "@/lib/engine/session";
import type {
  Block,
  CalendarEvent,
  CurveRow,
  Earnings,
  MarketSeries,
  RawBlocks,
  SectorKey,
} from "@/lib/types";

/** A target for one series. Changes are bp for yields/spreads, % for prices. */
export interface Move {
  level: number;
  d1?: number;
  /** Defaults to d1: the four sessions before the last one are quiet. */
  d5?: number;
}

export interface ScenarioSpec {
  now: number;
  seed?: number;
  futures?: { es: number; nq: number; rty: number; es5d?: number } | null;
  breadth?: { vwap: number; ad: number; rspVsSpy: number } | null;
  sectors?: {
    spy: number;
    /** Sectors left out move in line with SPY. */
    moves: Partial<Record<SectorKey, number>>;
    /** Optional 5-day moves; default to the 1-day move. */
    fiveDay?: Partial<Record<SectorKey | "spy", number>>;
  } | null;
  rates?: {
    y3m: Move;
    y2: Move;
    y5: Move;
    y10: Move;
    y30: Move;
    real10: Move | null;
    live10y?: { yield: number; changeBp: number } | null;
  } | null;
  credit?: { hy: Move; ig: Move | null } | null;
  proxy?: { hyg: { d1: number; d5?: number }; lqd: { d1: number; d5?: number } } | null;
  vol?: {
    vix: Move;
    vix9d?: number | null;
    vix3m?: number | null;
    /** [M1, M2]; null forces the index proxy. */
    futures?: [number, number] | null;
  } | null;
  calendar?: CalendarEvent[] | null;
  earnings?: Earnings | null;
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function shocks(rand: () => number, n: number, sigma: number): number[] {
  return Array.from({ length: n }, () => gaussian(rand) * sigma);
}

const addShocks = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);

/**
 * n values ending at target.level; the last move is d1 and the move over the
 * final five sessions is d5. Earlier values walk backwards through `noise`.
 */
function path(
  n: number,
  target: Move,
  noise: number[],
  mode: "add" | "mul",
  unit = 1,
  floor?: number,
): number[] {
  const d1 = (target.d1 ?? 0) * unit;
  const d5 = (target.d5 ?? target.d1 ?? 0) * unit;
  const back = (x: number, d: number) => (mode === "add" ? x - d : x / (1 + d / 100));
  const v = new Array<number>(n);
  v[n - 1] = target.level;
  v[n - 2] = back(target.level, d1);
  v[n - 6] = back(target.level, d5);
  for (let k = 1; k <= 3; k++) v[n - 6 + k] = v[n - 6] + ((v[n - 2] - v[n - 6]) * k) / 4;
  for (let i = n - 7; i >= 0; i--) {
    const s = noise[i] * unit;
    v[i] = mode === "add" ? v[i + 1] - s : v[i + 1] / (1 + s / 100);
    if (floor !== undefined) v[i] = Math.max(floor, v[i]);
  }
  return v;
}

function tradingDates(end: string, n: number): string[] {
  const out = [end];
  let k = end;
  while (out.length < n) {
    k = prevTradingDay(k);
    out.unshift(k);
  }
  return out;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------

function block<T>(data: T | null | undefined, now: number, sourceTimestamp?: string): Block<T> {
  const iso = new Date(now).toISOString();
  if (data === null || data === undefined) {
    return {
      data: null,
      freshness: {
        status: "UNAVAILABLE",
        sourceTimestamp: null,
        lastSuccessfulUpdate: null,
        source: "MOCK",
        note: "Not included in this scenario.",
      },
    };
  }
  return {
    data,
    freshness: {
      status: "LIVE",
      sourceTimestamp: sourceTimestamp ?? iso,
      lastSuccessfulUpdate: iso,
      source: "MOCK",
    },
  };
}

export function buildScenario(spec: ScenarioSpec): RawBlocks {
  const rand = mulberry32(spec.seed ?? 7);
  const now = spec.now;
  const session = sessionInfo(now);

  // Cash-market quotes: the price belongs to the last session (live if the
  // market is open) and the completed closes end one session earlier.
  const priceSession = session.lastSession;
  const closesEnd = prevTradingDay(priceSession);
  const cashTime = session.cashOpen
    ? new Date(now).toISOString()
    : new Date(etInstant(priceSession, 16 * 60)).toISOString();
  const futuresTime = session.futuresOpen
    ? new Date(now).toISOString()
    : new Date(etInstant(priceSession, 17 * 60)).toISOString();
  // Official daily series: the last completed session (Treasury), one more for FRED.
  const lastCompleted = session.cashOpen ? prevTradingDay(session.today) : session.lastSession;

  const series = (n: number, target: Move, sigma: number, floor?: number, common?: number[]): MarketSeries => {
    const noise = common ? addShocks(common.slice(0, n), shocks(rand, n, sigma)) : shocks(rand, n, sigma);
    const v = path(n, target, noise, "mul", 1, floor);
    return {
      price: r2(v[n - 1]),
      time: cashTime,
      dates: tradingDates(closesEnd, n - 1),
      closes: v.slice(0, -1).map(r2),
    };
  };

  // --- futures -------------------------------------------------------------
  const f = spec.futures;
  const futures = f
    ? (() => {
        const leg = (symbol: "ES" | "NQ" | "RTY", name: string, last: number, chg: number, chg5: number | null) => ({
          symbol,
          name,
          last,
          changePct: chg,
          changeAbs: r2(last - last / (1 + chg / 100)),
          change5dPct: chg5,
        });
        return {
          es: leg("ES", "E-mini S&P 500", 7659.5, f.es, f.es5d ?? f.es),
          nq: leg("NQ", "E-mini Nasdaq 100", 26910.25, f.nq, f.nq),
          rty: leg("RTY", "E-mini Russell 2000", 2598.4, f.rty, f.rty),
          quoteTime: futuresTime,
        };
      })()
    : null;

  // --- breadth ---------------------------------------------------------------
  const b = spec.breadth;
  const spyMove = spec.sectors?.spy ?? f?.es ?? 0;
  const breadth = b
    ? (() => {
        const advancers = Math.round((503 * b.ad) / (1 + b.ad));
        const decliners = 503 - advancers;
        return {
          pctAboveVwap: b.vwap,
          advanceDeclineRatio: r2(advancers / Math.max(1, decliners)),
          advancers,
          decliners,
          spyChangePct: spyMove,
          rspChangePct: r2(spyMove + b.rspVsSpy),
          rspVsSpyPct: b.rspVsSpy,
          quoteTime: cashTime,
        };
      })()
    : null;

  // --- sectors ---------------------------------------------------------------
  const s = spec.sectors;
  const sectors = s
    ? (() => {
        const n = 64;
        const market = shocks(rand, n, 0.8);
        const closes: Record<string, number[]> = {};
        const build = (move: number, five: number | undefined) =>
          series(n, { level: 100, d1: move, d5: five ?? move }, 0.6, undefined, market);
        const spy = build(s.spy, s.fiveDay?.spy);
        closes.SPY = spy.closes;
        const quotes = SECTOR_PROXIES.map((p) => {
          const move = s.moves[p.key] ?? s.spy;
          const ser = build(move, s.fiveDay?.[p.key]);
          closes[p.proxy] = ser.closes;
          return {
            ...p,
            changePct: move,
            change5dPct: r2((ser.price / ser.closes[ser.closes.length - 5] - 1) * 100),
          };
        });
        return {
          sectors: quotes,
          spy: { changePct: s.spy, change5dPct: r2((spy.price / spy.closes[spy.closes.length - 5] - 1) * 100) },
          history: { dates: spy.dates, closes },
          quoteTime: cashTime,
        };
      })()
    : null;

  // --- rates -----------------------------------------------------------------
  const rt = spec.rates;
  const rates = rt
    ? (() => {
        const n = 260;
        const common = shocks(rand, n, 4);
        const tenor = (m: Move, idio: number) =>
          path(n, m, addShocks(common, shocks(rand, n, idio)), "add", 0.01).map(r2);
        const y3m = tenor(rt.y3m, 1.5);
        const y2 = tenor(rt.y2, 2);
        const y5 = tenor(rt.y5, 2);
        const y10 = tenor(rt.y10, 2.5);
        const y30 = tenor(rt.y30, 2.5);
        const real = rt.real10 ? tenor(rt.real10, 2) : null;
        const dates = tradingDates(lastCompleted, n);
        const history: CurveRow[] = dates.map((date, i) => ({
          date,
          y3m: y3m[i],
          y2: y2[i],
          y5: y5[i],
          y10: y10[i],
          y30: y30[i],
          real10: real ? real[i] : null,
        }));
        return {
          history,
          live10y: rt.live10y ? { ...rt.live10y, time: cashTime } : null,
        };
      })()
    : null;

  // --- credit ----------------------------------------------------------------
  const cr = spec.credit;
  const fredEnd = prevTradingDay(lastCompleted);
  const credit = cr
    ? (() => {
        const n = 760;
        const dates = tradingDates(fredEnd, n);
        const hy = path(n, cr.hy, shocks(rand, n, 3), "add", 1, 150).map(Math.round);
        const ig = cr.ig ? path(n, cr.ig, shocks(rand, n, 1), "add", 1, 40).map(Math.round) : null;
        return {
          hy: { dates, values: hy },
          ig: ig ? { dates, values: ig } : null,
        };
      })()
    : null;

  const px = spec.proxy;
  const creditProxy = px
    ? (() => {
        const n = 64;
        const common = shocks(rand, n, 0.25);
        return {
          hyg: series(n, { level: 78.6, d1: px.hyg.d1, d5: px.hyg.d5 }, 0.15, undefined, common),
          lqd: series(n, { level: 104.3, d1: px.lqd.d1, d5: px.lqd.d5 }, 0.2, undefined, common),
        };
      })()
    : null;

  // --- volatility ------------------------------------------------------------
  const vs = spec.vol;
  const volatility = vs
    ? (() => {
        const n = 253;
        const vix = series(n, vs.vix, 5, 9);
        const aux = (level: number | null | undefined) =>
          level === null ? null : series(n, { level: level ?? vs.vix.level, d1: vs.vix.d1, d5: vs.vix.d5 }, 4, 8);
        return {
          vix,
          vix9d: aux(vs.vix9d === undefined ? r2(vs.vix.level * 0.93) : vs.vix9d),
          vix3m: aux(vs.vix3m === undefined ? r2(vs.vix.level * 1.14) : vs.vix3m),
        };
      })()
    : null;

  const vixFutures =
    vs && vs.futures !== null
      ? (() => {
          const [m1, m2] = vs.futures ?? [r2(vs.vix.level * 1.06), r2(vs.vix.level * 1.12)];
          const p = etParts(now);
          const codes = "FGHJKMNQUVXZ";
          const idx = (p.month - 1 + (p.day > 16 ? 1 : 0)) % 12;
          const contract = (offset: number, price: number) => {
            const i = (idx + offset) % 12;
            const year = p.year + Math.floor((p.month - 1 + (p.day > 16 ? 1 : 0) + offset) / 12);
            return {
              symbol: `VX/${codes[i]}${year % 10}`,
              expiration: `${String(i + 1).padStart(2, "0")}/16/${year}`,
              price,
              prevSettlement: price,
            };
          };
          return { contracts: [contract(0, m1), contract(1, m2)], asOf: new Date(now).toISOString() };
        })()
      : null;

  return {
    futures: block(futures, now, futuresTime),
    breadth: block(breadth, now, cashTime),
    sectors: block(sectors, now, cashTime),
    rates: block(rates, now, rates ? `${lastCompleted}T20:00:00Z` : undefined),
    credit: block(credit, now, credit ? `${fredEnd}T21:00:00Z` : undefined),
    creditProxy: block(creditProxy, now, cashTime),
    volatility: block(volatility, now, cashTime),
    vixFutures: block(vixFutures, now),
    calendar: block(spec.calendar === undefined ? [] : spec.calendar, now),
    earnings: block(
      spec.earnings === undefined ? { forDate: session.nextSession, upcoming: [], reported: [] } : spec.earnings,
      now,
    ),
  };
}
