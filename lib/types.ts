/**
 * Normalized internal data contracts.
 *
 * Two layers live here:
 *   1. Raw market data (Block<T> payloads). Vendor responses are translated into
 *      these inside services/providers and never leak past that boundary.
 *   2. The engine's output (Analysis). Computed deterministically in lib/engine
 *      from the raw layer; the UI and the language model only ever read it.
 *
 * Pipeline: DATA -> CALCULATIONS -> CLASSIFICATIONS -> CROSS-ASSET LOGIC -> TEXT.
 */

/** Bumped whenever a raw block changes shape, so old snapshots are never mixed in. */
export const SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------
// Freshness envelope — every raw block carries one
// ---------------------------------------------------------------------------

export type DataStatus = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";

export interface Freshness {
  status: DataStatus;
  /** Vendor's own timestamp for the observation (ISO 8601). */
  sourceTimestamp: string | null;
  /** When we last successfully pulled this block (ISO 8601). */
  lastSuccessfulUpdate: string | null;
  /** Human label for the provider, e.g. "MOCK", "Treasury", "FRED". */
  source: string;
  /** Populated when status is STALE/UNAVAILABLE so cards can explain themselves. */
  note?: string;
}

/**
 * A block of data that may have failed independently of the rest of the page.
 * `data` is null only when the provider failed AND no cached value exists.
 */
export interface Block<T> {
  data: T | null;
  freshness: Freshness;
}

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

export type Importance = "HIGH" | "MED" | "LOW";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type Trend = "up" | "down" | "flat";

/**
 * Colour language. Colour follows the interpretation, never the raw sign:
 *   constructive  green  improving / confirming
 *   caution       amber  mixed / background risk
 *   stressed      red    deteriorating / stressed
 *   neutral       gray   stable / no information
 */
export type Tone = "constructive" | "caution" | "stressed" | "neutral";

/** What one market is saying about risk appetite. */
export type Signal = "confirming" | "neutral" | "warning" | "stress";
export type Lean = "risk-on" | "neutral" | "risk-off";

/**
 * A daily-sampled market series plus its latest quote.
 *
 * `closes` holds COMPLETED sessions only, oldest first, and ends with the
 * reference close that `price` is measured against. So the latest session's
 * change is price vs closes.at(-1), and the 5-session change is price vs
 * closes.at(-5).
 */
export interface MarketSeries {
  price: number;
  /** Vendor quote time for `price` (ISO 8601). */
  time: string;
  dates: string[];
  closes: number[];
}

// ---------------------------------------------------------------------------
// Raw: index futures
// ---------------------------------------------------------------------------

export interface FuturesQuote {
  symbol: "ES" | "NQ" | "RTY";
  name: string;
  last: number;
  changePct: number;
  changeAbs: number;
  /** Change over the last five sessions, in percent. */
  change5dPct: number | null;
}

export interface IndexFutures {
  es: FuturesQuote;
  nq: FuturesQuote;
  rty: FuturesQuote;
  /** Vendor quote time (ISO 8601) — used to label "live" vs "Friday close". */
  quoteTime: string;
}

// ---------------------------------------------------------------------------
// Raw: breadth
// ---------------------------------------------------------------------------

export interface Breadth {
  /** % of S&P 500 constituents trading above their session VWAP. */
  pctAboveVwap: number;
  /** Advancers / decliners, expressed as the ratio itself (1.8 => 1.8:1). */
  advanceDeclineRatio: number;
  advancers: number;
  decliners: number;
  spyChangePct: number;
  rspChangePct: number;
  /** RSP % change minus SPY % change, in percentage points. */
  rspVsSpyPct: number;
  /** Vendor quote time of the sweep (ISO 8601). */
  quoteTime: string;
}

// ---------------------------------------------------------------------------
// Raw: sectors
// ---------------------------------------------------------------------------

export type SectorKey =
  | "semis"
  | "tech"
  | "communication"
  | "financials"
  | "industrials"
  | "discretionary"
  | "energy"
  | "materials"
  | "utilities"
  | "staples"
  | "healthcare"
  | "realestate";

export interface SectorQuote {
  key: SectorKey;
  label: string;
  proxy: string;
  changePct: number;
  change5dPct: number | null;
}

export interface Sectors {
  sectors: SectorQuote[];
  spy: { changePct: number; change5dPct: number | null };
  /**
   * Completed-session closes for every proxy and SPY, aligned on `dates`.
   * Used only to learn how large a "normal" day's rotation is.
   */
  history: { dates: string[]; closes: Record<string, number[]> };
  quoteTime: string;
}

// ---------------------------------------------------------------------------
// Raw: rates
// ---------------------------------------------------------------------------

/** One Treasury business day. Yields in percent. */
export interface CurveRow {
  date: string;
  y3m: number;
  y2: number;
  y5: number;
  y10: number;
  y30: number;
  /** 10Y TIPS par real yield; null when Treasury did not publish it. */
  real10: number | null;
}

export interface RatesData {
  /** Official Treasury par curve, oldest first, roughly a year deep. */
  history: CurveRow[];
  /**
   * Cboe ^TNX intraday 10Y. There is no reliable keyless live 2Y, so the live
   * leg is shown for context only and never used to classify the curve.
   */
  live10y: { yield: number; changeBp: number; time: string } | null;
}

// ---------------------------------------------------------------------------
// Raw: credit
// ---------------------------------------------------------------------------

export interface SpreadSeries {
  /** Observation dates, oldest first. */
  dates: string[];
  /** Option-adjusted spread in basis points. */
  values: number[];
}

export interface CreditData {
  /** ICE BofA US High Yield OAS (FRED BAMLH0A0HYM2). Daily, T-1. */
  hy: SpreadSeries;
  /** ICE BofA US Corporate (investment grade) OAS (FRED BAMLC0A0CM). */
  ig: SpreadSeries | null;
}

/** HYG vs LQD: a faster, price-based read on lower- vs higher-quality credit. */
export interface CreditProxy {
  hyg: MarketSeries;
  lqd: MarketSeries;
}

// ---------------------------------------------------------------------------
// Raw: volatility
// ---------------------------------------------------------------------------

export interface VolatilityData {
  vix: MarketSeries;
  vix9d: MarketSeries | null;
  vix3m: MarketSeries | null;
}

export interface VixFuturesContract {
  symbol: string;
  expiration: string;
  price: number;
  prevSettlement: number;
}

/** Monthly VX futures, nearest expiry first. */
export interface VixFutures {
  contracts: VixFuturesContract[];
  asOf: string;
}

// ---------------------------------------------------------------------------
// Raw: catalysts
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  /** ISO 8601 instant; rendered in ET. */
  time: string;
  title: string;
  importance: Importance;
  category: "data" | "fed" | "auction" | "government" | "earnings";
  /** Provider's own event key (TradingEconomics slug) — matched against the release library. */
  key?: string;
  /** Period the release covers, e.g. "AUG". */
  period?: string | null;
  actual?: string | null;
  /** Market consensus — what the market expects. */
  consensus?: string | null;
  /** The provider's own model estimate, used only when there is no consensus. */
  modelForecast?: string | null;
  previous?: string | null;
}

// ---------------------------------------------------------------------------
// Economic releases (the calendar, interpreted through config/releases.ts)
// ---------------------------------------------------------------------------

/** The five primary categories. Interest rates are the transmission, never a category. */
export type ReleaseCategory = "INFLATION" | "LABOR" | "GROWTH" | "FED" | "SENTIMENT";

export interface ReleaseFigure {
  label: string | null;
  actual: string | null;
  forecast: string | null;
  /** "consensus" = the market's expectation; "model" = the provider's own estimate. */
  forecastSource: "consensus" | "model" | null;
  previous: string | null;
}

/** A computed comparison of two readings, stated in economic terms. */
export interface ReleaseReading {
  direction: "above" | "below" | "inline";
  meaning: string | null;
  /** The forecast side is the provider's estimate, not market consensus. */
  vsModel: boolean;
}

export interface Release {
  id: string;
  time: string;
  name: string;
  period: string | null;
  importance: Importance;
  /** Null for scheduled events that are not economic data (Treasury auctions). */
  category: ReleaseCategory | null;
  secondary: string | null;
  /** Headline figure first; at most two. */
  figures: ReleaseFigure[];
  released: boolean;
  /** After the print: actual vs forecast on the headline figure. */
  surprise: ReleaseReading | null;
  /** Before the print: forecast vs previous — what the market expects to change. */
  expectation: ReleaseReading | null;
  /** Its category is one the market currently appears most sensitive to. */
  inFocus: boolean;
}

/** What the market currently appears most sensitive to, and why. */
export interface MacroFocus {
  label: string;
  detail: string;
  categories: ReleaseCategory[];
  evidence: Evidence;
}

export type EarningsSlot = "PRE-MARKET" | "AFTER CLOSE";

export interface EarningsEvent {
  ticker: string;
  company: string;
  slot: EarningsSlot;
  sector: string;
  /** Market cap in USD — the proxy for index weight (no keyless source has weights). */
  marketCapUsd: number | null;
}

export interface EarningsResult {
  ticker: string;
  company: string;
  reportedAt: string;
  /** Actual vs consensus EPS, in percent. */
  epsSurprisePct: number | null;
  /** Latest move in the stock since the report, in percent. */
  stockReactionPct: number | null;
}

export interface Earnings {
  /** ET date the upcoming reports belong to (the next session). */
  forDate: string;
  upcoming: EarningsEvent[];
  /** Index-moving names that reported since the prior session's close. */
  reported: EarningsResult[];
}

// ---------------------------------------------------------------------------
// Top-level snapshot
// ---------------------------------------------------------------------------

export interface DashboardData {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  mode: "mock" | "live";
  futures: Block<IndexFutures>;
  breadth: Block<Breadth>;
  sectors: Block<Sectors>;
  rates: Block<RatesData>;
  credit: Block<CreditData>;
  creditProxy: Block<CreditProxy>;
  volatility: Block<VolatilityData>;
  vixFutures: Block<VixFutures>;
  calendar: Block<CalendarEvent[]>;
  earnings: Block<Earnings>;
  /** Deterministic engine output. Time-independent; see lib/engine. */
  analysis: Analysis;
}

export type RawBlocks = Omit<DashboardData, "schemaVersion" | "generatedAt" | "mode" | "analysis">;

// ===========================================================================
// ENGINE OUTPUT
// ===========================================================================

/** The "why" behind a classification, shown on hover so the page teaches. */
export interface Evidence {
  title: string;
  lines: string[];
  note?: string;
}

/** How a single move compares with its own history. */
export interface MoveStat {
  value: number;
  /** % of historical moves over the same window that were smaller in size. */
  rank: number | null;
}

/** One row of the Vital Signs summary. */
export interface VitalSign {
  key: "rates" | "credit" | "volatility";
  label: string;
  state: string;
  arrow: Trend;
  tone: Tone;
  signal: Signal;
  interpretation: string;
  evidence: Evidence;
  /** Observation date for daily series, so stale-by-design data is labelled. */
  asOf: string | null;
}

// ---- rates ----------------------------------------------------------------

export type CurveShape = "UPWARD-SLOPING" | "FLAT" | "INVERTED";

export type CurveMove =
  | "BULL STEEPENING"
  | "BEAR STEEPENING"
  | "BULL FLATTENING"
  | "BEAR FLATTENING"
  | "PARALLEL SHIFT HIGHER"
  | "PARALLEL SHIFT LOWER"
  | "STABLE";

export interface CurveMoveAnalysis {
  window: "1D" | "5D";
  move: CurveMove;
  /** bp changes. */
  d2: number;
  d10: number;
  dSpread: number;
  /** Which end of the curve drove the move. */
  leader: "front" | "long" | null;
  /** True when the leading leg's move is unusually large for its history. */
  sharp: boolean;
  /** One line: "Long-end yields are leading higher." */
  description: string;
  evidence: Evidence;
}

export type TenYearDriver = "REAL YIELDS" | "INFLATION EXPECTATIONS" | "MIXED" | "NONE";

export interface YieldLeg {
  level: number;
  d1: MoveStat;
  d5: MoveStat;
}

export interface RatesAnalysis {
  asOf: string;
  weekAgoDate: string;
  y2: YieldLeg;
  y10: YieldLeg;
  s2s10: { level: number; d1: number; d5: number };
  s3m10: { level: number; d5: number };
  shape: CurveShape;
  session: CurveMoveAnalysis;
  trend: CurveMoveAnalysis;
  driver: {
    driver: TenYearDriver;
    nominalBp: number;
    realBp: number;
    breakevenBp: number;
    evidence: Evidence;
  } | null;
  cycle: { inverted: boolean; text: string };
  curve: { tenors: string[]; today: number[]; weekAgo: number[] };
  live10y: RatesData["live10y"];
  vital: VitalSign;
}

// ---- credit ---------------------------------------------------------------

export type CreditDirection = "TIGHTENING" | "STABLE" | "WIDENING" | "RAPIDLY WIDENING";
export type HyBand = "TIGHT" | "NORMAL" | "WARNING" | "SIGNIFICANT STRESS" | "CRISIS";

export interface SpreadLeg {
  level: number;
  d1: MoveStat;
  d5: MoveStat;
  direction: CreditDirection;
  /** Percentile of today's level within the past year. */
  levelPct1y: number | null;
  asOf: string;
}

export interface CreditAnalysis {
  hy: SpreadLeg & { band: HyBand };
  ig: SpreadLeg | null;
  /** Whether stress is confined to junk or spreading to quality borrowers. */
  quality: { key: "contained" | "hy-only" | "broadening" | "ig-only"; text: string } | null;
  state: string;
  trend: { dates: string[]; values: number[] };
  vital: VitalSign;
}

export interface CreditProxyAnalysis {
  state: "IMPROVING" | "STABLE" | "DETERIORATING";
  /** HYG-minus-LQD performance, percentage points. */
  d1: number;
  d5: number;
  tone: Tone;
  spark: number[];
  time: string;
  evidence: Evidence;
}

// ---- volatility -----------------------------------------------------------

export type VixRegime = "VERY CALM" | "NORMAL" | "ELEVATED" | "HIGH FEAR" | "EXTREME";
export type VixMomentum = "FALLING" | "STABLE" | "RISING" | "SPIKING";
export type TermStructureState = "CONTANGO" | "FLAT" | "BACKWARDATION";

export interface VolatilityAnalysis {
  vix: { level: number; d1Pct: MoveStat; d5Pct: MoveStat; levelPct1y: number | null };
  regime: VixRegime;
  momentum: VixMomentum;
  term: {
    state: TermStructureState;
    source: "futures" | "proxy";
    /** Plotted left to right: shortest horizon first. */
    points: Array<{ label: string; value: number }>;
    /** Longer-dated over shorter-dated, minus one (percent). Positive = contango. */
    slopePct: number;
    note: string | null;
    evidence: Evidence;
  } | null;
  state: string;
  complacency: boolean;
  vital: VitalSign;
}

// ---- equities -------------------------------------------------------------

export type Verdict = "confirms" | "neutral" | "contradicts";

export type BreadthState = "BROAD" | "MIXED" | "NARROW" | "BROAD SELLING";

export interface BreadthAnalysis {
  state: BreadthState;
  tone: Tone;
  checks: Array<{ label: string; value: string; verdict: Verdict }>;
  explanation: string;
}

export type RotationState =
  | "STRONG RISK-ON ROTATION"
  | "MILD RISK-ON ROTATION"
  | "NEUTRAL"
  | "DEFENSIVE ROTATION";

export interface RelativeSector {
  key: SectorKey;
  label: string;
  proxy: string;
  changePct: number;
  /** changePct minus SPY, percentage points. */
  relPct: number;
  group: "cyclical" | "defensive" | "other";
}

export interface RotationAnalysis {
  state: RotationState;
  tone: Tone;
  /** Cyclical/high-beta average minus defensive average, both vs SPY. */
  spread: number;
  spreadRank: number | null;
  cyclicalRel: number;
  defensiveRel: number;
  leaders: RelativeSector[];
  laggards: RelativeSector[];
  trend5d: { state: RotationState; spread: number } | null;
  transitioning: boolean;
  explanation: string;
  evidence: Evidence;
}

export type ConfirmationState =
  | "BROAD CONFIRMATION"
  | "POSITIVE — UNEVEN BREADTH"
  | "POSITIVE — LARGE-CAP LED"
  | "POSITIVE BUT NARROW"
  | "MIXED"
  | "FLAT"
  | "NEGATIVE — CONCENTRATED"
  | "NEGATIVE — UNEVEN"
  | "BROAD WEAKNESS";

export interface ParticipationAnalysis {
  state: ConfirmationState;
  tone: Tone;
  direction: Trend;
  legs: Array<{ symbol: string; changePct: number }>;
  /** RTY minus ES, percentage points. */
  rtyGap: number;
  rspVsSpy: number | null;
  rtyLagging: boolean;
  rspLagging: boolean;
  explanation: string;
  evidence: Evidence;
}

export type EquityPosture =
  | "AGGRESSIVE RISK-ON"
  | "CONSTRUCTIVE"
  | "MIXED / TRANSITIONING"
  | "DEFENSIVE ROTATION"
  | "RISK-OFF";

export interface EquityAnalysis {
  posture: EquityPosture | null;
  tone: Tone;
  signal: Signal;
  lean: Lean;
  explanation: string;
  evidence: Evidence;
  breadth: BreadthAnalysis | null;
  rotation: RotationAnalysis | null;
  participation: ParticipationAnalysis | null;
}

// ---- cross-asset ----------------------------------------------------------

export type DivergenceSeverity = "high" | "medium" | "low";

export interface Divergence {
  id:
    | "equity-credit"
    | "volatility-credit"
    | "volatility-only"
    | "rotation-credit"
    | "index-participation"
    | "unconfirmed-selloff"
    | "equity-volatility";
  title: string;
  /** Short phrase for the "Main Divergence" line. */
  headline: string;
  detail: string;
  severity: DivergenceSeverity;
}

export type Alignment = "STRONG" | "MODERATE" | "MIXED" | "NO CLEAR SIGNAL";
export type VitalAlignment = "CONSTRUCTIVE" | "MIXED" | "STRESSED" | "QUIET";

export type BackdropKind =
  | "CONFIRMED_RISK_ON"
  | "CONSTRUCTIVE"
  | "RISK_ON_UNEVEN"
  | "RISK_ON_CREDIT"
  | "RISK_ON_VOLATILITY"
  | "RISK_ON_RATES"
  | "CONFIRMED_STRESS"
  | "CONFIRMED_RISK_OFF"
  | "RISK_OFF_UNCONFIRMED"
  | "DEFENSIVE"
  | "MIXED"
  | "NEUTRAL"
  | "INSUFFICIENT";

export interface WhatChanged {
  market: "Rates" | "Credit" | "Volatility" | "Equities";
  fact: string;
  implication: string;
  tone: Tone;
  /** How unusual the change is (0-100); used only to pick the top three. */
  significance: number;
}

export interface Synthesis {
  backdrop: { kind: BackdropKind; label: string; tone: Tone };
  alignment: { state: Alignment; text: string; evidence: Evidence };
  vitalAlignment: { state: VitalAlignment; text: string };
  leans: Record<"rates" | "credit" | "volatility" | "equities", Lean | null>;
  tailwind: string | null;
  headwind: string | null;
  divergence: string | null;
  divergences: Divergence[];
  whatChanged: WhatChanged[];
  esContext: string;
}

export interface Analysis {
  rates: RatesAnalysis | null;
  credit: CreditAnalysis | null;
  creditProxy: CreditProxyAnalysis | null;
  volatility: VolatilityAnalysis | null;
  equities: EquityAnalysis;
  synthesis: Synthesis;
  /** Deterministic Today's Read text; the AI version replaces it when available. */
  narrative: string;
  /** Changes whenever a classification the narrative depends on changes. */
  signature: string;
}

// ---------------------------------------------------------------------------
// Session + catalysts (time-dependent: recomputed against the viewer's clock)
// ---------------------------------------------------------------------------

export type SessionPhase =
  | "RTH"
  | "PRE-MARKET"
  | "POST-CLOSE"
  | "DAILY HALT"
  | "WEEKEND"
  | "HOLIDAY";

export interface SessionInfo {
  phase: SessionPhase;
  /** "Market open", "Closed — weekend", … */
  label: string;
  /** Whether the cash equity market is trading right now. */
  cashOpen: boolean;
  /** Whether ES (Globex) is trading right now. */
  futuresOpen: boolean;
  today: string;
  /** Session that the prep is for: today before the close, otherwise the next one. */
  nextSession: string;
  /** Most recent completed or in-progress session. */
  lastSession: string;
  holidayName: string | null;
}

export interface CatalystView {
  session: SessionInfo;
  sessionDate: string;
  sessionIsToday: boolean;
  /** Economic releases for the session being prepared for. */
  releases: Release[];
  /** Scheduled events that are not economic data (Treasury auctions). */
  other: Release[];
  /** High-impact releases after that session, within the lookahead. */
  later: Release[];
  nextEvent: { release: Release; minutesAway: number } | null;
  /** Next HIGH-importance event after now, on any day. */
  nextMajor: { release: Release; minutesAway: number } | null;
  /** Scheduled catalyst risk only — never a measure of market stress. */
  eventRisk: { level: RiskLevel; rationale: string };
  focus: MacroFocus;
  /** The single most important catalyst takeaway, computed from the releases. */
  headline: { text: string; detail: string | null };
  earnings: {
    upcoming: EarningsEvent[];
    reported: EarningsResult[];
    forDate: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Precomputed narrative (published alongside the snapshot)
// ---------------------------------------------------------------------------

export interface Interpretation {
  /** Matches Analysis.signature of the snapshot it was written for. */
  signature: string;
  text: string;
  generatedBy: "ai" | "rule";
  generatedAt: string;
  aiConfigured: boolean;
}
