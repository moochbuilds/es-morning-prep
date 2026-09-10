import "server-only";

import {
  scoreBreadth,
  scoreConfirmation,
  scoreEventRisk,
  scoreRotation,
  scoreStress,
  type ReadInputs,
} from "@/lib/scoring";
import type { DashboardData, Interpretation } from "@/lib/types";

import { dataMode } from "./mode";
import { getIndexFutures } from "./futures";
import { getBreadth } from "./breadth";
import { getSectorRotation } from "./sectors";
import { getRates } from "./rates";
import { getVolatility } from "./volatility";
import { getCreditConditions } from "./credit";
import { getEconomicCalendar } from "./calendar";
import { getEarningsCalendar } from "./earnings";
import { aiEnabled, attachEarningsTakeaways, generateTodayRead } from "@/lib/ai";

type ScoredBlocks = Pick<
  DashboardData,
  "futures" | "breadth" | "sectors" | "rates" | "volatility" | "credit" | "calendar"
>;

/**
 * Scores are pure functions of the blocks, so they can be re-derived whenever a
 * block is replaced (e.g. a failed provider carried forward from the last
 * published snapshot).
 */
export function deriveScores(
  blocks: ScoredBlocks,
  now: number,
): DashboardData["derived"] {
  return {
    stress: scoreStress(blocks.rates.data, blocks.volatility.data, blocks.credit.data),
    breadth: scoreBreadth(blocks.breadth.data),
    rotation: scoreRotation(blocks.sectors.data),
    confirmation: scoreConfirmation(blocks.futures.data),
    eventRisk: scoreEventRisk(blocks.calendar.data, now),
  };
}

/**
 * Fetches every block in parallel and derives the scores.
 *
 * Blocks fail independently — `cached()` never throws, so one dead provider
 * degrades a single card rather than the page. Deliberately does NOT call the
 * AI layer: structured numbers are produced first, interpretation follows.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [futures, breadth, sectors, rates, volatility, credit, calendar, earnings] =
    await Promise.all([
      getIndexFutures(),
      getBreadth(),
      getSectorRotation(),
      getRates(),
      getVolatility(),
      getCreditConditions(),
      getEconomicCalendar(),
      getEarningsCalendar(),
    ]);

  const now = Date.now();
  const blocks = { futures, breadth, sectors, rates, volatility, credit, calendar };

  return {
    generatedAt: new Date(now).toISOString(),
    mode: dataMode(),
    ...blocks,
    earnings,
    derived: deriveScores(blocks, now),
  };
}

/** Reassembles the AI-layer inputs from an already-fetched payload. */
export function readInputsFrom(data: DashboardData): ReadInputs {
  return {
    breadth: data.derived.breadth,
    rotation: data.derived.rotation,
    stress: data.derived.stress,
    confirmation: data.derived.confirmation,
    eventRisk: data.derived.eventRisk,
    futures: data.futures.data,
    rates: data.rates.data,
    volatility: data.volatility.data,
  };
}

/** Everything that needs the model, computed after the numbers. */
export async function getInterpretation(
  data: DashboardData,
): Promise<Interpretation> {
  const [read, reported] = await Promise.all([
    generateTodayRead(readInputsFrom(data)),
    attachEarningsTakeaways(data.earnings.data?.reported ?? []),
  ]);

  const takeaways: Record<string, string> = {};
  for (const r of reported) {
    if (r.takeaway) takeaways[r.ticker] = r.takeaway;
  }

  return { read, takeaways, aiConfigured: aiEnabled() };
}
