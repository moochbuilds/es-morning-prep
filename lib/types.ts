/**
 * Normalized internal data contracts.
 *
 * The UI consumes ONLY these types. Vendor payloads are translated inside
 * /services/<domain>/*.ts adapters and never leak past this boundary.
 */

// ---------------------------------------------------------------------------
// Freshness envelope — every metric group carries one
// ---------------------------------------------------------------------------

export type DataStatus = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE";

export interface Freshness {
  status: DataStatus;
  /** Vendor's own timestamp for the observation (ISO 8601). */
  sourceTimestamp: string | null;
  /** When we last successfully pulled this block (ISO 8601). */
  lastSuccessfulUpdate: string | null;
  /** Human label for the provider, e.g. "MOCK", "Polygon", "FRED". */
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

export type Direction = "up-strong" | "up" | "flat" | "down" | "down-strong";
export type Importance = "HIGH" | "MED" | "LOW";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type Regime = "RISK-ON" | "NEUTRAL" | "RISK-OFF";
export type BreadthClass =
  | "VERY WEAK"
  | "WEAK"
  | "NEUTRAL"
  | "STRONG"
  | "VERY STRONG";
export type RotationClass =
  | "DEFENSIVE"
  | "SLIGHTLY DEFENSIVE"
  | "NEUTRAL"
  | "RISK-ON"
  | "STRONG RISK-ON";
export type StressClass = "LOW" | "NORMAL" | "ELEVATED" | "HIGH";
export type ConfirmationClass = "STRONG" | "MODERATE" | "WEAK" | "DIVERGENT";

/** Whether a reading helps or fights equities — drives color, not the sign. */
export type Tone = "supportive" | "neutral" | "restrictive";

// ---------------------------------------------------------------------------
// 1. Index futures
// ---------------------------------------------------------------------------

export interface FuturesQuote {
  symbol: "ES" | "NQ" | "RTY";
  name: string;
  last: number;
  changePct: number;
  changeAbs: number;
}

export interface IndexFutures {
  es: FuturesQuote;
  nq: FuturesQuote;
  rty: FuturesQuote;
}

// ---------------------------------------------------------------------------
// 2. Breadth
// ---------------------------------------------------------------------------

export interface Breadth {
  /** % of S&P 500 constituents trading above their session VWAP. */
  pctAboveVwap: number;
  /** Advancers / decliners, expressed as the ratio itself (1.8 => 1.8:1). */
  advanceDeclineRatio: number;
  advancers: number;
  decliners: number;
  /** RSP % change minus SPY % change, in percentage points. */
  rspVsSpyPct: number;
}

// ---------------------------------------------------------------------------
// 3. Sectors
// ---------------------------------------------------------------------------

export type SectorKey =
  | "semis"
  | "tech"
  | "financials"
  | "industrials"
  | "discretionary"
  | "energy"
  | "materials"
  | "utilities"
  | "staples"
  | "healthcare";

export interface SectorQuote {
  key: SectorKey;
  label: string;
  proxy: string;
  changePct: number;
}

export interface Sectors {
  sectors: SectorQuote[];
  /** Prior session's rotation score, used for the day-over-day delta. */
  previousScore: number | null;
}

// ---------------------------------------------------------------------------
// 4-6. Rates / volatility / credit
// ---------------------------------------------------------------------------

export interface Rates {
  /** 10Y yield in percent, e.g. 4.18 */
  us10y: number;
  /** Session change in basis points, e.g. -6 */
  us10yChangeBp: number;
  us2y: number;
  us2yChangeBp: number;
  /** 10Y minus 2Y, in basis points. Positive = upward sloping. */
  curve2s10sBp: number;
  curve2s10sChangeBp: number;
}

export interface Volatility {
  vix: number;
  vixChangePct: number;
  vixChangeAbs: number;
}

export interface Credit {
  /** ICE BofA US High Yield option-adjusted spread, in basis points. */
  hySpreadBp: number;
  /** Change vs prior observation, in bp. */
  hySpreadChangeBp: number;
  /** Observation date of the underlying series (often T-1 for daily series). */
  asOfDate: string;
  /** True when the series only updates daily — suppresses intraday framing. */
  dailyOnly: boolean;
}

// ---------------------------------------------------------------------------
// 7. Economic calendar
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  /** ISO 8601 with offset; rendered in ET. */
  time: string;
  title: string;
  importance: Importance;
  category: "data" | "fed" | "auction" | "government" | "earnings";
}

// ---------------------------------------------------------------------------
// 8-9. Earnings
// ---------------------------------------------------------------------------

export type EarningsSlot = "PRE-MARKET" | "AFTER CLOSE";
export type ResultGrade = "BEAT" | "IN LINE" | "MISS" | "N/A";
export type GuidanceGrade = "RAISED" | "MAINTAINED" | "LOWERED" | "N/A";
export type MarginGrade = "BETTER" | "IN LINE" | "WORSE" | "N/A";

export interface EarningsEvent {
  ticker: string;
  company: string;
  slot: EarningsSlot;
  importance: Importance;
  /** GICS sector from the S&P 500 constituent list. */
  sector: string;
  /**
   * Market capitalisation in USD — the ranking key for "most anticipated".
   * True float-adjusted index weight needs the index divisor, which no keyless
   * source publishes, so cap is used instead and displayed as cap.
   */
  marketCapUsd: number | null;
  /** Consensus EPS estimate for the quarter, when the vendor supplies one. */
  epsForecast: number | null;
}

export interface EarningsResult {
  ticker: string;
  company: string;
  sector: string;
  reportedAt: string;
  revenue: ResultGrade;
  eps: ResultGrade;
  guidance: GuidanceGrade;
  margins: MarginGrade;
  /** Actual vs consensus EPS, when the provider reports both. */
  epsDetail?: { actual: number; consensus: number; surprisePct: number };
  /** Post-report stock reaction in percent; null when not yet tradable. */
  stockReactionPct: number | null;
  /** Fields the provider could not supply — surfaced verbatim in the UI. */
  missingFields: string[];
  /** Filled in by the AI layer; never by a data provider. */
  takeaway?: string;
}

export interface Earnings {
  today: EarningsEvent[];
  reported: EarningsResult[];
}

// ---------------------------------------------------------------------------
// Derived scores (computed in /lib/scoring.ts from /config/thresholds.ts)
// ---------------------------------------------------------------------------

export interface ScoreComponent {
  label: string;
  /** 0-100 sub-score in the same polarity as its parent composite. */
  score: number;
  weight: number;
}

export interface StressScore {
  score: number;
  classification: StressClass;
  components: ScoreComponent[];
  conclusion: string;
  tone: Tone;
}

export interface BreadthScore {
  score: number;
  classification: BreadthClass;
  components: ScoreComponent[];
  conclusion: string;
  broadening: boolean;
}

export interface RotationScore {
  score: number;
  classification: RotationClass;
  change: number | null;
  leaders: SectorQuote[];
  laggards: SectorQuote[];
  conclusion: string;
}

export interface ConfirmationScore {
  classification: ConfirmationClass;
  score: number;
  interpretation: string;
  legs: Array<{ symbol: string; changePct: number; direction: Direction }>;
}

export interface EventRisk {
  level: RiskLevel;
  score: number;
  /** Minutes until the next event; null if none remain today. */
  nextEvent: { event: CalendarEvent; minutesAway: number } | null;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Today's Read (AI or deterministic fallback)
// ---------------------------------------------------------------------------

export interface TodayRead {
  regime: Regime;
  confidence: number;
  breadth: string;
  rotation: string;
  stress: string;
  confirmation: string;
  eventRisk: RiskLevel;
  summary: string;
  mainRisk: string;
  /** "ai" when written by the model, "rule" when the deterministic writer ran. */
  generatedBy: "ai" | "rule";
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Top-level payload consumed by the page
// ---------------------------------------------------------------------------

export interface DashboardData {
  generatedAt: string;
  mode: "mock" | "live";
  futures: Block<IndexFutures>;
  breadth: Block<Breadth>;
  sectors: Block<Sectors>;
  rates: Block<Rates>;
  volatility: Block<Volatility>;
  credit: Block<Credit>;
  calendar: Block<CalendarEvent[]>;
  earnings: Block<Earnings>;
  derived: {
    stress: StressScore | null;
    breadth: BreadthScore | null;
    rotation: RotationScore | null;
    confirmation: ConfirmationScore | null;
    eventRisk: EventRisk;
  };
}

// ---------------------------------------------------------------------------
// Precomputed interpretation (published alongside the dashboard snapshot)
// ---------------------------------------------------------------------------

export interface Interpretation {
  read: TodayRead;
  /** AI takeaways keyed by ticker; empty when AI is not configured. */
  takeaways: Record<string, string>;
  /** False when ANTHROPIC_API_KEY is unset. */
  aiConfigured: boolean;
}
