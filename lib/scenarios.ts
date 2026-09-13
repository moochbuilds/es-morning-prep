/**
 * Named market scenarios for DATA_MODE=mock (select with MOCK_SCENARIO) and
 * the test suite. "reference" reproduces the worked example the dashboard was
 * specified against: risk-on with uneven participation, a real-yield-driven
 * bear steepening, healthy credit and declining volatility.
 */

import { etInstant, nextTradingDay, sessionInfo } from "@/lib/engine/session";
import type { CalendarEvent, Earnings, SectorKey } from "@/lib/types";

import type { ScenarioSpec } from "./synthetic";

const at = (key: string, minutes: number) => new Date(etInstant(key, minutes)).toISOString();

/**
 * A realistic three-session calendar shaped like TradingEconomics rows. Rows
 * whose time has passed carry an actual, so both the pending and released
 * layouts are exercised.
 */
export function defaultCalendar(now: number): CalendarEvent[] {
  const s1 = sessionInfo(now).nextSession;
  const s2 = nextTradingDay(s1);
  const s3 = nextTradingDay(s2);
  const title = (slug: string) =>
    slug
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\bMom\b/, "MoM")
      .replace(/\bYoy\b/, "YoY")
      .replace(/\bNahb\b/, "NAHB");
  const ev = (
    day: string,
    minutes: number,
    slug: string,
    figures: { actual?: string; consensus?: string; previous?: string; period?: string } = {},
  ): CalendarEvent => {
    const time = at(day, minutes);
    return {
      id: `${day}-${slug}`.replace(/\s+/g, "-"),
      time,
      title: title(slug),
      importance: "MED",
      category: /fed/.test(slug) ? "fed" : /auction/.test(slug) ? "auction" : "data",
      key: slug,
      period: figures.period ?? null,
      actual: Date.parse(time) <= now ? figures.actual ?? null : null,
      consensus: figures.consensus ?? null,
      modelForecast: null,
      previous: figures.previous ?? null,
    };
  };
  return [
    ev(s1, 8 * 60 + 30, "initial jobless claims", { actual: "231K", consensus: "225K", previous: "219K", period: "SEP/12" }),
    ev(s1, 8 * 60 + 30, "continuing jobless claims", { actual: "1.95M", consensus: "1.94M", previous: "1.94M" }),
    ev(s1, 10 * 60, "michigan consumer sentiment final", { actual: "67.8", consensus: "69.5", previous: "68.9", period: "SEP" }),
    ev(s1, 10 * 60, "michigan inflation expectations final", { actual: "3.3%", consensus: "3.1%", previous: "3.2%", period: "SEP" }),
    ev(s1, 14 * 60, "fed williams speech"),
    ev(s2, 8 * 60 + 30, "core inflation rate mom", { consensus: "0.3%", previous: "0.3%", period: "AUG" }),
    ev(s2, 8 * 60 + 30, "inflation rate yoy", { consensus: "2.9%", previous: "2.9%", period: "AUG" }),
    ev(s2, 8 * 60 + 30, "inflation rate mom", { consensus: "0.3%", previous: "0.2%", period: "AUG" }),
    ev(s2, 10 * 60, "nahb housing market index", { consensus: "40", previous: "39", period: "SEP" }),
    ev(s2, 13 * 60, "10-year note auction", { previous: "4.25%" }),
    ev(s3, 8 * 60 + 30, "retail sales mom", { consensus: "0.4%", previous: "0.6%", period: "AUG" }),
    ev(s3, 8 * 60 + 30, "retail sales control group mom", { consensus: "0.3%", previous: "0.5%", period: "AUG" }),
    ev(s3, 14 * 60, "fed interest rate decision", { consensus: "4.25%", previous: "4.50%" }),
    ev(s3, 14 * 60 + 30, "fed press conference"),
  ];
}

function defaultEarnings(now: number): Earnings {
  return {
    forDate: sessionInfo(now).nextSession,
    upcoming: [
      { ticker: "NVDA", company: "NVIDIA", slot: "AFTER CLOSE", sector: "Information Technology", marketCapUsd: 4.3e12 },
    ],
    reported: [],
  };
}

const sectors = (spy: number, m: Partial<Record<SectorKey, number>>) => ({ spy, moves: m });

/** Calm, directionless tape: the baseline every test scenario starts from. */
export function baseline(now: number): ScenarioSpec {
  return {
    now,
    futures: { es: 0.1, nq: 0.12, rty: 0.05 },
    breadth: { vwap: 52, ad: 1.1, rspVsSpy: 0 },
    sectors: sectors(0.1, {
      semis: 0.15, tech: 0.12, financials: 0.1, industrials: 0.1, discretionary: 0.1,
      energy: 0.1, materials: 0.1, healthcare: 0.08, staples: 0.1, utilities: 0.1,
    }),
    rates: {
      y3m: { level: 4.07, d1: 0, d5: 0 },
      y2: { level: 4.63, d1: 0, d5: 1 },
      y5: { level: 4.78, d1: 0, d5: 1 },
      y10: { level: 4.96, d1: 0, d5: 1 },
      y30: { level: 5.35, d1: 0, d5: 1 },
      real10: { level: 2.6, d1: 0, d5: 1 },
    },
    credit: { hy: { level: 300, d1: 0, d5: 0 }, ig: { level: 85, d1: 0, d5: 0 } },
    proxy: { hyg: { d1: 0, d5: 0 }, lqd: { d1: 0, d5: 0 } },
    vol: { vix: { level: 16, d1: 0, d5: 0 } },
    calendar: [],
  };
}

export const MOCK_SCENARIOS = {
  reference: (now: number): ScenarioSpec => ({
    ...baseline(now),
    futures: { es: 0.8, nq: 0.86, rty: 0.38, es5d: 1.6 },
    breadth: { vwap: 47, ad: 2.1, rspVsSpy: -0.05 },
    sectors: sectors(0.8, {
      semis: 1.9, tech: 1.3, communication: 1.05, discretionary: 1.0, financials: 0.9, industrials: 0.85,
      energy: 0.3, materials: 0.55, healthcare: 0.2, staples: -0.1, utilities: -0.35, realestate: -0.2,
    }),
    rates: {
      y3m: { level: 4.07, d1: 0, d5: -1 },
      y2: { level: 4.63, d1: 1, d5: 3 },
      y5: { level: 4.78, d1: 3, d5: 9 },
      y10: { level: 4.96, d1: 4, d5: 14 },
      y30: { level: 5.35, d1: 4, d5: 15 },
      real10: { level: 2.6, d1: 3, d5: 11 },
      live10y: { yield: 4.98, changeBp: 2 },
    },
    credit: { hy: { level: 270, d1: 1, d5: -2 }, ig: { level: 80, d1: 0, d5: 0 } },
    proxy: { hyg: { d1: 0.1, d5: 0.2 }, lqd: { d1: -0.05, d5: -0.3 } },
    vol: { vix: { level: 15.84, d1: -6, d5: -12 }, vix9d: 14.47, vix3m: 18.6, futures: [16.75, 18.45] },
    calendar: defaultCalendar(now),
    earnings: defaultEarnings(now),
  }),

  stress: (now: number): ScenarioSpec => ({
    ...baseline(now),
    futures: { es: -1.9, nq: -2.4, rty: -2.8, es5d: -4.1 },
    breadth: { vwap: 18, ad: 0.2, rspVsSpy: -0.5 },
    sectors: sectors(-1.8, {
      semis: -3.5, tech: -2.6, discretionary: -2.8, financials: -2.9, industrials: -2.4,
      energy: -2.0, materials: -2.2, healthcare: -0.3, staples: 0.2, utilities: 0.4,
    }),
    rates: {
      y3m: { level: 3.95, d1: -6, d5: -12 },
      y2: { level: 4.28, d1: -12, d5: -35 },
      y5: { level: 4.45, d1: -9, d5: -25 },
      y10: { level: 4.81, d1: -5, d5: -15 },
      y30: { level: 5.22, d1: -3, d5: -9 },
      real10: { level: 2.41, d1: -6, d5: -17 },
    },
    credit: { hy: { level: 420, d1: 18, d5: 60 }, ig: { level: 120, d1: 5, d5: 15 } },
    proxy: { hyg: { d1: -0.9, d5: -2.1 }, lqd: { d1: 0.1, d5: 0.3 } },
    vol: { vix: { level: 34, d1: 25, d5: 60 }, vix9d: 39, vix3m: 30, futures: [31, 29] },
    calendar: defaultCalendar(now),
  }),

  "credit-divergence": (now: number): ScenarioSpec => ({
    ...baseline(now),
    futures: { es: 0.6, nq: 0.7, rty: 0.55, es5d: 1.4 },
    breadth: { vwap: 62, ad: 1.8, rspVsSpy: 0.08 },
    sectors: sectors(0.6, {
      semis: 1.4, tech: 0.9, discretionary: 0.9, financials: 0.8, industrials: 0.8,
      energy: 0.2, materials: 0.5, healthcare: 0.1, staples: 0.0, utilities: -0.1,
    }),
    credit: { hy: { level: 305, d1: 6, d5: 28 }, ig: { level: 88, d1: 1, d5: 5 } },
    vol: { vix: { level: 13.6, d1: -1, d5: -2 } },
    calendar: defaultCalendar(now),
  }),

  "vol-shock": (now: number): ScenarioSpec => ({
    ...baseline(now),
    futures: { es: -1.3, nq: -1.6, rty: -1.1 },
    breadth: { vwap: 30, ad: 0.45, rspVsSpy: 0.05 },
    vol: { vix: { level: 21, d1: 40, d5: 45 }, vix9d: 22.5, vix3m: 22.4, futures: [21.5, 22.3] },
    calendar: defaultCalendar(now),
  }),
} satisfies Record<string, (now: number) => ScenarioSpec>;

export type ScenarioName = keyof typeof MOCK_SCENARIOS;
