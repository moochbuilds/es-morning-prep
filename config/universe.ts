/**
 * Instrument universe: breadth, sector proxies and earnings relevance.
 *
 * The S&P 500 constituent list itself is fetched live
 * (services/providers/constituents.ts) rather than hardcoded, so breadth is
 * computed over the actual index and earnings relevance is judged against
 * real membership.
 */

import type { SectorKey } from "@/lib/types";

export const BREADTH_UNIVERSE_LABEL = "S&P 500";

/** Below this share of constituents returning data, breadth is not reported. */
export const BREADTH_MIN_COVERAGE = 0.9;

/** Parallel requests when sweeping constituents. */
export const BREADTH_CONCURRENCY = 16;

/**
 * All eleven GICS Select Sector SPDRs, plus semis (SOXX) as the cleanest single
 * read on high-beta risk appetite. Which of these count toward the
 * cyclical-vs-defensive spread is decided in config/thresholds.ts.
 */
export const SECTOR_PROXIES: Array<{ key: SectorKey; label: string; proxy: string }> = [
  { key: "semis", label: "Semiconductors", proxy: "SOXX" },
  { key: "tech", label: "Technology", proxy: "XLK" },
  { key: "communication", label: "Comm. Services", proxy: "XLC" },
  { key: "financials", label: "Financials", proxy: "XLF" },
  { key: "industrials", label: "Industrials", proxy: "XLI" },
  { key: "discretionary", label: "Discretionary", proxy: "XLY" },
  { key: "energy", label: "Energy", proxy: "XLE" },
  { key: "materials", label: "Materials", proxy: "XLB" },
  { key: "healthcare", label: "Healthcare", proxy: "XLV" },
  { key: "staples", label: "Staples", proxy: "XLP" },
  { key: "utilities", label: "Utilities", proxy: "XLU" },
  { key: "realestate", label: "Real Estate", proxy: "XLRE" },
];

export const EARNINGS_RELEVANCE = {
  /** How far back to look for "already reported" names. */
  reportedLookbackDays: 1,
};
