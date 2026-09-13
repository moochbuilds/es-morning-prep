/**
 * Every number that turns raw market data into a classification lives here.
 *
 * There are no composite scores and no weights. Each market is classified on
 * three questions — where is it, which way is it moving, and how unusual is
 * that move against its own history — and the cross-asset layer then compares
 * the classifications instead of averaging them.
 *
 * "rank" thresholds are percentiles: a move "at rank 75" is larger than 75% of
 * the same-length moves in that series' own recent history. Fixed "floor"
 * values stop a very quiet regime from promoting tiny moves, and "fallback"
 * values apply only when too little history is available to rank against.
 *
 * These are decision-support heuristics, not calibrated models. Edit freely —
 * lib/engine reads this file and contains no magic numbers of its own.
 */

import type { SectorKey } from "@/lib/types";

// ---------------------------------------------------------------------------
// RATES / YIELD CURVE
// ---------------------------------------------------------------------------

export const RATES = {
  /** 2s10s within ±this many bp is FLAT; below −this is INVERTED. */
  flatBandBp: 20,

  /**
   * A curve move counts only when the 2s10s change clears the floor AND is
   * larger than `rank`% of historical moves over the same window. Anything
   * smaller is labelled STABLE rather than forced into a category.
   */
  spread: {
    rank: 60,
    floorBp: { "1D": 3, "5D": 5 },
    fallbackBp: { "1D": 4, "5D": 8 },
  },

  /** A parallel shift: both legs move the same way while the slope holds. */
  level: {
    rank: 60,
    floorBp: { "1D": 5, "5D": 10 },
    fallbackBp: { "1D": 7, "5D": 14 },
  },

  /** A leading-leg move this unusual is a shock, not just a move. */
  sharp: {
    rank: 95,
    floorBp: { "1D": 10, "5D": 20 },
    fallbackBp: { "1D": 15, "5D": 30 },
  },

  /**
   * 10Y driver: share of the nominal 10Y move explained by the real yield.
   * The remainder is breakeven inflation (nominal = real + breakeven).
   */
  driver: {
    realShareHigh: 0.65,
    realShareLow: 0.35,
  },

  minHistory: 60,
};

// ---------------------------------------------------------------------------
// CREDIT
// ---------------------------------------------------------------------------

export const CREDIT = {
  /** HY OAS bands in bp — rough historical context, not trading rules. */
  hyBands: [
    { max: 300, label: "TIGHT" as const },
    { max: 500, label: "NORMAL" as const },
    { max: 700, label: "WARNING" as const },
    { max: 1000, label: "SIGNIFICANT STRESS" as const },
    { max: Infinity, label: "CRISIS" as const },
  ],

  /**
   * Direction and speed come from the 5-day change ranked against that
   * series' own 5-day changes. HY and IG each use their own history, so a
   * 3bp IG move can matter as much as a 15bp HY move.
   */
  direction: {
    widenRank: 75,
    rapidRank: 95,
    tightenRank: 75,
    floorBp: { hy: 5, ig: 2 },
    rapidFloorBp: { hy: 15, ig: 5 },
    /** A single-day move this unusual is RAPID on its own. */
    rapid1dRank: 99,
    fallbackBp: {
      hy: { widen: 10, rapid: 30 },
      ig: { widen: 3, rapid: 8 },
    },
  },

  /** Observations in the HY trend sparkline (~3 months). */
  sparkDays: 65,

  /** HYG/LQD proxy: 5-day relative move ranked against the last ~3 months. */
  proxy: {
    rank: 60,
    floorPct: 0.15,
    fallbackPct: 0.3,
    sparkDays: 40,
  },

  minHistory: 60,
};

// ---------------------------------------------------------------------------
// VOLATILITY
// ---------------------------------------------------------------------------

export const VOL = {
  /** Descriptive VIX bands — level alone is never read as bullish. */
  regimes: [
    { max: 15, label: "VERY CALM" as const },
    { max: 20, label: "NORMAL" as const },
    { max: 30, label: "ELEVATED" as const },
    { max: 50, label: "HIGH FEAR" as const },
    { max: Infinity, label: "EXTREME" as const },
  ],

  /** Rate of change, in % moves of the VIX, ranked against the last year. */
  momentum: {
    spikeRank: 95,
    riseRank: 70,
    fallRank: 70,
    spikeFloorPct: { "1D": 15, "5D": 25 },
    riseFloorPct: { "1D": 5, "5D": 8 },
    fallback: {
      spikePct: { "1D": 20, "5D": 30 },
      risePct: { "1D": 8, "5D": 12 },
    },
    /** A slow 5-day drift up this large gets called out even when "stable". */
    driftPct: 5,
  },

  /**
   * Term structure slope = longer / shorter − 1. Within ±flatPct is FLAT.
   * Futures (M2 vs M1) sit closer together than VIX3M vs spot, so the proxy
   * gets a wider flat band.
   */
  term: {
    futuresFlatPct: 2,
    proxyFlatPct: 5,
  },

  /** Very low VIX gets a complacency note: calm now says nothing about later. */
  complacency: { level: 13, levelPct1y: 10 },

  minHistory: 60,
};

// ---------------------------------------------------------------------------
// EQUITY CONFIRMATION
// ---------------------------------------------------------------------------

export const EQUITY = {
  /** |ES change| below this is treated as no directional signal. */
  flatPct: 0.2,

  participation: {
    /** RTY lags when it trails ES by max(minPct, fraction × |ES|). */
    rtyLagMinPct: 0.3,
    rtyLagFraction: 0.4,
    /** RSP trailing SPY by this much is a material equal-weight lag. */
    rspLagPct: 0.25,
    /** NQ moving against ES by at least this much makes the tape MIXED. */
    nqOppositePct: 0.2,
  },

  /**
   * Breadth checks, stated for an up-move; they mirror for a down-move.
   * Each indicator either confirms, contradicts, or says nothing.
   */
  breadth: {
    ad: { confirm: 1.5, contradict: 1.0 },
    vwap: { confirm: 55, contradict: 50 },
    /** RSP minus SPY: equal weight must actually keep up to count as confirming. */
    rsp: { confirm: 0.05, contradict: -0.25 },
  },

  rotation: {
    /**
     * The GICS business-model split. Three sectors are shown but kept out of
     * the spread: semis (a subset of XLK — counting both double-counts tech),
     * energy (it often rallies as a hedge in inflation and geopolitical
     * shocks) and real estate (hybrid, and driven mostly by rates).
     */
    cyclical: ["tech", "communication", "discretionary", "financials", "industrials", "materials"] as SectorKey[],
    defensive: ["utilities", "staples", "healthcare"] as SectorKey[],
    /**
     * STRONG rotation must be broad: at least this share of cyclical sectors
     * beating SPY. A spread carried by one or two sectors is capped at MILD.
     */
    broadShare: 0.6,
    /** Today's cyclical-minus-defensive spread, ranked against recent days. */
    strongRank: 85,
    mildRank: 50,
    strongFloorPct: 0.5,
    mildFloorPct: 0.15,
    fallbackPct: { strong: 1.0, mild: 0.3 },
    shown: 3,
    minHistory: 30,
  },
};

// ---------------------------------------------------------------------------
// CROSS-ASSET DIVERGENCE
// ---------------------------------------------------------------------------

export const CROSS = {
  /** ES session move that counts as "rising" / "falling" for divergences. */
  esUpPct: 0.3,
  esDownPct: 0.4,
  /** Or a 5-day advance this large, since credit is read on a 5-day window. */
  es5dUpPct: 0.75,
  maxDivergencesShown: 3,
};

// ---------------------------------------------------------------------------
// EVENT RISK — describes catalyst risk, never current market stress
// ---------------------------------------------------------------------------

export const EVENT_RISK = {
  points: { HIGH: 3, MED: 1.5, LOW: 0.5 },
  /** Extra points when 2+ HIGH events land on the same session. */
  multipleHighBonus: 1.5,
  /** High-impact events landing inside this window compound each other. */
  clusterWindowMinutes: 120,
  clusterBonus: 1.0,
  thresholds: { high: 6, medium: 3 },
  /** Low-impact events are hidden; keeps the card scannable. */
  hideLowImpact: true,
  /** How far ahead to look for the next major catalyst. */
  lookaheadDays: 14,
  /** High-impact releases after the session shown under "Later". */
  laterShown: 4,
};

// ---------------------------------------------------------------------------
// EARNINGS — only reports large enough to move the index
// ---------------------------------------------------------------------------

export const EARNINGS_CFG = {
  /** Reporters below this market cap are not index-moving and are not shown. */
  marketMovingCapUsd: 200e9,
  maxShown: 4,
  maxReportedShown: 3,
};

// ---------------------------------------------------------------------------
// MARKET SESSION (NYSE cash hours; ES trades Globex around them)
// ---------------------------------------------------------------------------

export const SESSION = {
  rthOpenMinutes: 9 * 60 + 30,
  rthCloseMinutes: 16 * 60,
  earlyCloseMinutes: 13 * 60,
  /** Globex daily halt 17:00-18:00 ET. */
  globexHaltMinutes: 17 * 60,
  globexOpenMinutes: 18 * 60,
  /** Unscheduled NYSE closures (e.g. national days of mourning), YYYY-MM-DD. */
  extraClosures: [] as string[],
};

// ---------------------------------------------------------------------------
// REFRESH INTERVALS (ms) — also used as server-side cache TTLs
// ---------------------------------------------------------------------------

export const REFRESH = {
  futures: 30_000,
  volatility: 60_000,
  vixFutures: 120_000,
  breadth: 120_000,
  sectors: 300_000,
  rates: 300_000,
  credit: 900_000,
  creditProxy: 120_000,
  calendar: 300_000,
  earnings: 600_000,
  /** How often the page checks for a newer published snapshot. */
  dashboard: 60_000,
  /**
   * An AI-written Today's Read is reused while every classification it was
   * written from is unchanged, up to this age.
   */
  aiRead: 60 * 60_000,
};

/**
 * Pipeline age (ms) past which a block is downgraded LIVE -> DELAYED -> STALE.
 * Calibrated for the ~5 minute published-snapshot cadence. This is about the
 * refresh pipeline, not market hours — a daily series is labelled with its
 * own observation date separately.
 */
export const FRESHNESS = {
  delayedAfterMs: 15 * 60_000,
  staleAfterMs: 45 * 60_000,
};
