import "server-only";

import { generateNarrative } from "@/lib/ai";
import { analyze } from "@/lib/engine";
import { SCHEMA_VERSION, type DashboardData, type Interpretation, type RawBlocks } from "@/lib/types";

import {
  getBreadth,
  getCalendar,
  getCredit,
  getCreditProxy,
  getEarnings,
  getIndexFutures,
  getRates,
  getSectors,
  getVixFutures,
  getVolatility,
} from "./blocks";
import { dataMode } from "./mode";

/**
 * Fetches every block in parallel. Blocks fail independently — `cached()`
 * never throws — so one dead provider degrades one section, not the page.
 */
export async function fetchBlocks(): Promise<RawBlocks> {
  const [futures, breadth, sectors, rates, credit, creditProxy, volatility, vixFutures, calendar, earnings] =
    await Promise.all([
      getIndexFutures(),
      getBreadth(),
      getSectors(),
      getRates(),
      getCredit(),
      getCreditProxy(),
      getVolatility(),
      getVixFutures(),
      getCalendar(),
      getEarnings(),
    ]);
  return { futures, breadth, sectors, rates, credit, creditProxy, volatility, vixFutures, calendar, earnings };
}

/** Numbers first, then the deterministic engine. No model call happens here. */
export async function getDashboardData(): Promise<DashboardData> {
  const blocks = await fetchBlocks();
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    mode: dataMode(),
    ...blocks,
    analysis: analyze(blocks),
  };
}

/** The explanation layer, computed after the numbers and classifications. */
export function getInterpretation(
  data: DashboardData,
  previous: Interpretation | null,
): Promise<Interpretation> {
  return generateNarrative(data.analysis, previous);
}
