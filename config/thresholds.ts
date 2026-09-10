/**
 * Every number that turns raw market data into a score or a label lives here.
 *
 * These are decision-support heuristics, not calibrated models. Edit freely —
 * /lib/scoring.ts reads this file and contains no magic numbers of its own.
 */

import type { SectorKey } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers used by the anchor-point maps below
// ---------------------------------------------------------------------------

/** [input, score] pairs, ascending by input. Interpolated linearly, clamped. */
export type AnchorMap = Array<[number, number]>;

// ---------------------------------------------------------------------------
// MARKET STRESS — 0 = calm/supportive, 100 = severe financial stress
// ---------------------------------------------------------------------------

export const STRESS = {
  /**
   * Composite weights. VIX, 10Y movement and credit dominate; the curve is
   * deliberately minor because 2s10s says little about today's ES tape.
   */
  weights: {
    vix: 0.4,
    rates: 0.3,
    credit: 0.25,
    curve: 0.05,
  },

  vix: {
    /** VIX level -> stress contribution. */
    level: [
      [10, 0],
      [12, 8],
      [15, 22],
      [18, 35],
      [20, 45],
      [25, 60],
      [30, 75],
      [40, 90],
      [55, 100],
    ] as AnchorMap,
    /** Daily % change -> stress; 50 is unchanged. */
    changeCenter: 50,
    changePerPct: 2.0,
    /** Level vs change blend inside the VIX sub-score. */
    levelWeight: 0.75,
  },

  rates: {
    /**
     * The daily bp move matters far more than the absolute level for ES.
     * Rising yields = stress, falling yields = relief.
     */
    changeCenter: 50,
    changePerBp: 4.0,
    /** Absolute 10Y level -> background stress, low weight. */
    level: [
      [2.0, 0],
      [3.0, 15],
      [4.0, 40],
      [4.5, 60],
      [5.0, 80],
      [6.0, 100],
    ] as AnchorMap,
    changeWeight: 0.75,
  },

  credit: {
    /** HY OAS in bp -> stress contribution. */
    level: [
      [250, 10],
      [300, 20],
      [350, 35],
      [400, 50],
      [500, 70],
      [700, 90],
      [1000, 100],
    ] as AnchorMap,
    /** Widening = stress, tightening = relief. */
    changeCenter: 50,
    changePerBp: 3.0,
    levelWeight: 0.7,
  },

  curve: {
    /** 2s10s in bp (10Y minus 2Y) -> stress. Inversion reads as stress. */
    level: [
      [-150, 100],
      [-100, 90],
      [-50, 72],
      [0, 50],
      [50, 34],
      [100, 20],
      [200, 10],
    ] as AnchorMap,
  },

  /** Upper bound of each class, ascending. */
  classes: [
    { max: 32, label: "LOW" as const },
    { max: 50, label: "NORMAL" as const },
    { max: 70, label: "ELEVATED" as const },
    { max: 101, label: "HIGH" as const },
  ],

  conclusions: {
    LOW: "Conditions supportive.",
    NORMAL: "Conditions broadly neutral.",
    ELEVATED: "Financial conditions are tightening against equities.",
    HIGH: "Financial conditions are actively restrictive.",
  },
};

// ---------------------------------------------------------------------------
// BREADTH — 0 = no participation, 100 = universal participation
// ---------------------------------------------------------------------------

export const BREADTH = {
  weights: {
    vwap: 0.4,
    advanceDecline: 0.35,
    equalWeight: 0.25,
  },

  /** % above VWAP maps 1:1 onto the sub-score. */
  vwapPassThrough: true,

  advanceDecline: {
    /** score = center + perLog2 * log2(ratio); 1:1 => 50. */
    center: 50,
    perLog2: 25,
  },

  equalWeight: {
    /** RSP-minus-SPY in percentage points -> sub-score. 0 => 50. */
    center: 50,
    perPct: 80,
    /** |RSP-SPY| above this counts as a genuine broadening/narrowing signal. */
    significantPct: 0.1,
  },

  classes: [
    { max: 20, label: "VERY WEAK" as const },
    { max: 40, label: "WEAK" as const },
    { max: 60, label: "NEUTRAL" as const },
    { max: 80, label: "STRONG" as const },
    { max: 101, label: "VERY STRONG" as const },
  ],

  conclusions: {
    "VERY WEAK": "Participation is very narrow; index moves lack support.",
    WEAK: "Participation is thin relative to the index move.",
    NEUTRAL: "Participation is mixed.",
    STRONG: "Broad participation confirms ES.",
    "VERY STRONG": "Exceptionally broad participation behind ES.",
  },
};

// ---------------------------------------------------------------------------
// SECTOR ROTATION — 0 = fully defensive, 100 = fully risk-on
// ---------------------------------------------------------------------------

export const ROTATION = {
  /**
   * Semis are split out from broad tech on purpose: they are the cleanest
   * single read on NQ and on high-beta risk appetite generally.
   */
  cyclical: {
    semis: 0.28,
    tech: 0.22,
    financials: 0.18,
    industrials: 0.16,
    discretionary: 0.16,
  } as Partial<Record<SectorKey, number>>,

  defensive: {
    utilities: 0.35,
    staples: 0.35,
    healthcare: 0.3,
  } as Partial<Record<SectorKey, number>>,

  /** score = center + perPct * (cyclicalAvg% - defensiveAvg%) */
  center: 50,
  perPct: 19,

  classes: [
    { max: 30, label: "DEFENSIVE" as const },
    { max: 45, label: "SLIGHTLY DEFENSIVE" as const },
    { max: 55, label: "NEUTRAL" as const },
    { max: 70, label: "RISK-ON" as const },
    { max: 101, label: "STRONG RISK-ON" as const },
  ],

  /** How many names to show in each column. */
  leadersShown: 4,
  laggardsShown: 3,

  /** |change| in % that promotes a single arrow to a double arrow. */
  strongMovePct: 1.0,

  conclusions: {
    DEFENSIVE: "Capital is rotating into defensives.",
    "SLIGHTLY DEFENSIVE": "Mild defensive tilt in leadership.",
    NEUTRAL: "No clear rotational bias.",
    "RISK-ON": "Cyclical leadership is intact.",
    "STRONG RISK-ON": "Aggressive rotation into cyclicals and high beta.",
  },
};

// ---------------------------------------------------------------------------
// INDEX CONFIRMATION — how well NQ and RTY corroborate ES
// ---------------------------------------------------------------------------

export const CONFIRMATION = {
  /** |change%| below this is treated as flat/no signal. */
  flatPct: 0.1,
  /** |change%| at or above this earns a double arrow. */
  strongPct: 0.5,

  /** Nominal 0-100 strength used when blending into Today's Read. */
  scoreByClass: {
    STRONG: 85,
    MODERATE: 60,
    WEAK: 35,
    DIVERGENT: 20,
  },
};

// ---------------------------------------------------------------------------
// EVENT RISK — importance weighted, with a concentration bonus
// ---------------------------------------------------------------------------

export const EVENT_RISK = {
  points: { HIGH: 3, MED: 1.5, LOW: 0.5 },
  /** Extra points when 2+ HIGH events land on the same session. */
  multipleHighBonus: 1.5,
  /** Events landing inside this window compound each other. */
  clusterWindowMinutes: 120,
  clusterBonus: 1.0,

  thresholds: { high: 6, medium: 3 },

  /** Low-impact events are hidden unless flagged; keeps the card scannable. */
  hideLowImpact: true,
};

// ---------------------------------------------------------------------------
// TODAY'S READ — regime + confidence synthesis
// ---------------------------------------------------------------------------

export const READ = {
  /** Weights over the four pillar scores (all in risk-on polarity, 0-100). */
  weights: {
    breadth: 0.3,
    rotation: 0.3,
    stress: 0.25,
    confirmation: 0.15,
  },

  regime: [
    { max: 42, label: "RISK-OFF" as const },
    { max: 58, label: "NEUTRAL" as const },
    { max: 101, label: "RISK-ON" as const },
  ],

  confidence: {
    /** confidence = base + |composite-50| * conviction - stdev * dispersion */
    base: 50,
    convictionMultiplier: 1.4,
    dispersionPenalty: 0.8,
    min: 25,
    max: 95,
  },
};

// ---------------------------------------------------------------------------
// EARNINGS — what counts as index-relevant
// ---------------------------------------------------------------------------

export const EARNINGS_CFG = {
  /** Reporters smaller than this are dropped unless importance is HIGH. */
  minMarketCapUsd: 50e9,
  maxShownPerSlot: 4,
  maxReportedShown: 3,
};

// ---------------------------------------------------------------------------
// REFRESH INTERVALS (ms) — also used as server-side cache TTLs
// ---------------------------------------------------------------------------

export const REFRESH = {
  futures: 30_000,
  volatility: 60_000,
  breadth: 120_000,
  sectors: 300_000,
  rates: 120_000,
  credit: 900_000,
  calendar: 300_000,
  earnings: 600_000,
  /**
   * How often the page checks for a newer published snapshot. Snapshots
   * publish every ~5 minutes and static files cost nothing to poll.
   */
  dashboard: 60_000,
  /** Today's Read is regenerated no more often than this. */
  aiRead: 300_000,
};

/**
 * Age (ms) past which a block is downgraded LIVE -> DELAYED -> STALE.
 *
 * Calibrated for the published-snapshot model: the refresh runs every 5
 * minutes on weekdays and GitHub's scheduler can start it several minutes
 * late, so anything under 15 minutes old is on schedule.
 */
export const FRESHNESS = {
  delayedAfterMs: 15 * 60_000,
  staleAfterMs: 45 * 60_000,
};
