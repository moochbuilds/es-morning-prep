/**
 * Breadth and earnings-relevance configuration.
 *
 * The constituent list itself is fetched live (services/providers/constituents.ts)
 * rather than hardcoded, so breadth is computed over the actual S&P 500 —
 * all ~503 names — and earnings relevance is judged against real membership.
 */

export const BREADTH_UNIVERSE_LABEL = "S&P 500";

/** Below this share of constituents returning data, breadth is not reported. */
export const BREADTH_MIN_COVERAGE = 0.9;

/** Parallel requests when sweeping constituents. 20 measured ~1.3s for 503. */
export const BREADTH_CONCURRENCY = 16;

export const EARNINGS_RELEVANCE = {
  /**
   * Market cap (USD) at or above which a reporter is a HIGH-impact catalyst.
   * Deliberately NOT "whatever is largest today" — on a quiet week the biggest
   * reporter can be a $70B REIT, and calling that HIGH would be misleading.
   */
  highImpactMarketCap: 300e9,
  /** Below this, the report is not shown at all. */
  minMarketCap: 50e9,
  /** How far back to look for "already reported" names. */
  reportedLookbackDays: 1,
  /** Cap on how many reported names get the full-detail treatment. */
  maxReportedShown: 3,
};
