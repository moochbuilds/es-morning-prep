/**
 * Rates & yield curve.
 *
 * The central rule: steepening or flattening says nothing on its own — what
 * matters is WHICH end of the curve moved. So every move is classified by the
 * slope change (steepening / flattening / stable, noise-gated against the
 * curve's own history) and by the leading leg (front end vs long end), which
 * together give bull/bear steepening/flattening.
 *
 * Inversion is kept strictly as background cycle context. It never feeds the
 * day's signal.
 */

import { RATES } from "@/config/thresholds";
import { bp } from "@/lib/format";
import type {
  CurveMove,
  CurveMoveAnalysis,
  CurveRow,
  CurveShape,
  MoveStat,
  RatesAnalysis,
  RatesData,
  Signal,
  Tone,
  VitalSign,
  YieldLeg,
} from "@/lib/types";

import { arrow, sentenceCase, toneForSignal } from "./labels";
import { clears, lagChanges, moveStat, rankPhrase, spanOf } from "./stats";

type Window = "1D" | "5D";

const MOVE_TEXT: Record<CurveMove, { description: string; reason: string }> = {
  "BULL STEEPENING": {
    description: "Front-end yields are leading lower.",
    reason: "Short-end yields fell faster than long-end yields.",
  },
  "BEAR STEEPENING": {
    description: "Long-end yields are leading higher.",
    reason: "Long-end yields rose faster than short-end yields.",
  },
  "BULL FLATTENING": {
    description: "Long-end yields are falling faster than the front end.",
    reason: "Long-end yields fell faster than short-end yields.",
  },
  "BEAR FLATTENING": {
    description: "Front-end yields are leading higher.",
    reason: "Short-end yields rose faster than long-end yields.",
  },
  "PARALLEL SHIFT HIGHER": {
    description: "Yields are rising across the curve with little change in slope.",
    reason: "Both legs rose by a similar amount, so the slope held.",
  },
  "PARALLEL SHIFT LOWER": {
    description: "Yields are falling across the curve with little change in slope.",
    reason: "Both legs fell by a similar amount, so the slope held.",
  },
  STABLE: {
    description: "Curve changes are within normal noise.",
    reason:
      "The 2s10s change is inside this window's normal range, so no slope classification is forced.",
  },
};

/**
 * Classifies one window's curve move from the 2Y and 10Y changes (bp).
 * `dSpread.value` must equal d10 - d2; its rank is against 2s10s history.
 */
export function classifyCurveMove(
  window: Window,
  d2: MoveStat,
  d10: MoveStat,
  dSpread: MoveStat,
  span = "year",
): CurveMoveAnalysis {
  const slopeMoved = clears(
    dSpread,
    RATES.spread.rank,
    RATES.spread.floorBp[window],
    RATES.spread.fallbackBp[window],
  );
  // Ties go to the long end: a symmetric twist is led by neither, and the
  // long end is where the bear/bull read is usually made.
  const frontLeads = Math.abs(d2.value) > Math.abs(d10.value);
  const leaderStat = frontLeads ? d2 : d10;
  const sharp = clears(
    leaderStat,
    RATES.sharp.rank,
    RATES.sharp.floorBp[window],
    RATES.sharp.fallbackBp[window],
  );

  let move: CurveMove;
  let leader: CurveMoveAnalysis["leader"] = null;

  if (slopeMoved) {
    leader = frontLeads ? "front" : "long";
    // With the leader defined as the larger absolute move, a steepening led
    // by the front end is necessarily a falling front end, and so on — the
    // four quadrants fall out without further sign checks.
    if (dSpread.value > 0) move = frontLeads ? "BULL STEEPENING" : "BEAR STEEPENING";
    else move = frontLeads ? "BEAR FLATTENING" : "BULL FLATTENING";
  } else {
    const sameWay = d2.value !== 0 && Math.sign(d2.value) === Math.sign(d10.value);
    const levelMoved =
      sameWay &&
      clears(d2, RATES.level.rank, RATES.level.floorBp[window], RATES.level.fallbackBp[window]) &&
      clears(d10, RATES.level.rank, RATES.level.floorBp[window], RATES.level.fallbackBp[window]);
    move = levelMoved
      ? d10.value > 0
        ? "PARALLEL SHIFT HIGHER"
        : "PARALLEL SHIFT LOWER"
      : "STABLE";
  }

  const windowLabel = window === "1D" ? "last session" : "5 days";
  const lines = [
    `2Y: ${bp(d2.value)}`,
    `10Y: ${bp(d10.value)}`,
    `2s10s: ${bp(dSpread.value)}`,
    MOVE_TEXT[move].reason,
  ];
  const ranked = rankPhrase(dSpread, window === "1D" ? "daily 2s10s" : "5-day 2s10s", span);
  if (ranked) lines.push(ranked);
  if (sharp && move !== "STABLE") lines.push("The leading leg's move is unusually large for its history.");

  return {
    window,
    move,
    d2: d2.value,
    d10: d10.value,
    dSpread: dSpread.value,
    leader,
    sharp: sharp && move !== "STABLE",
    description: MOVE_TEXT[move].description,
    evidence: { title: `Why ${sentenceCase(move)}? (${windowLabel})`, lines },
  };
}

export interface RatesContext {
  /** Credit is widening or already stressed. */
  creditStress: boolean;
  /** Volatility is in a stress state. */
  volStress: boolean;
}

export function analyzeRates(
  data: RatesData | null,
  ctx: RatesContext = { creditStress: false, volStress: false },
): RatesAnalysis | null {
  if (!data || data.history.length < 6) return null;

  const h = data.history;
  const n = h.length;
  const last = h[n - 1];
  const weekAgo = h[n - 6];
  const span = spanOf(n);

  const toBp = (v: number) => Math.round(v * 100);
  const changes = (vals: number[], lag: number) => lagChanges(vals, lag).map(toBp);

  const leg = (vals: number[]): YieldLeg => {
    const c1 = changes(vals, 1);
    const c5 = changes(vals, 5);
    return {
      level: vals[vals.length - 1],
      d1: moveStat(c1[c1.length - 1], c1.slice(0, -1), RATES.minHistory),
      d5: moveStat(c5[c5.length - 1], c5.slice(0, -1), RATES.minHistory),
    };
  };

  const y2 = leg(h.map((r) => r.y2));
  const y10 = leg(h.map((r) => r.y10));

  const spreads = h.map((r) => r.y10 - r.y2);
  const sp1 = changes(spreads, 1);
  const sp5 = changes(spreads, 5);
  const dSpread1 = moveStat(y10.d1.value - y2.d1.value, sp1.slice(0, -1), RATES.minHistory);
  const dSpread5 = moveStat(y10.d5.value - y2.d5.value, sp5.slice(0, -1), RATES.minHistory);

  const session = classifyCurveMove("1D", y2.d1, y10.d1, dSpread1, span);
  const trend = classifyCurveMove("5D", y2.d5, y10.d5, dSpread5, span);

  const s2s10 = toBp(last.y10 - last.y2);
  const s3m10 = toBp(last.y10 - last.y3m);
  const shape: CurveShape =
    s2s10 > RATES.flatBandBp ? "UPWARD-SLOPING" : s2s10 < -RATES.flatBandBp ? "INVERTED" : "FLAT";

  const driver = tenYearDriver(h, y10);

  return {
    asOf: last.date,
    weekAgoDate: weekAgo.date,
    y2,
    y10,
    s2s10: { level: s2s10, d1: dSpread1.value, d5: dSpread5.value },
    s3m10: { level: s3m10, d5: s3m10 - toBp(weekAgo.y10 - weekAgo.y3m) },
    shape,
    session,
    trend,
    driver,
    cycle: cycleBackdrop(s2s10, s3m10, shape),
    curve: {
      tenors: ["3M", "2Y", "5Y", "10Y", "30Y"],
      today: [last.y3m, last.y2, last.y5, last.y10, last.y30],
      weekAgo: [weekAgo.y3m, weekAgo.y2, weekAgo.y5, weekAgo.y10, weekAgo.y30],
    },
    live10y: data.live10y,
    vital: ratesVital(trend, driver, ctx, last.date),
  };
}

// ---------------------------------------------------------------------------

function tenYearDriver(h: CurveRow[], y10: YieldLeg): RatesAnalysis["driver"] {
  const now = h[h.length - 1];
  const then = h[h.length - 6];
  if (now.real10 === null || then.real10 === null) return null;

  const nominalBp = y10.d5.value;
  const realBp = Math.round((now.real10 - then.real10) * 100);
  const breakevenBp = nominalBp - realBp;

  const moved = clears(
    y10.d5,
    RATES.level.rank,
    RATES.level.floorBp["5D"],
    RATES.level.fallbackBp["5D"],
  );

  const lines = [
    `10Y nominal: ${bp(nominalBp)} over 5 days`,
    `10Y real (TIPS): ${bp(realBp)}`,
    `Breakeven inflation: ${bp(breakevenBp)}`,
  ];

  if (!moved || nominalBp === 0) {
    lines.push("The 10Y is little changed, so no driver is assigned.");
    return { driver: "NONE", nominalBp, realBp, breakevenBp, evidence: { title: "Why no 10Y driver?", lines } };
  }

  const share = realBp / nominalBp;
  const driver =
    share >= RATES.driver.realShareHigh
      ? "REAL YIELDS"
      : share <= RATES.driver.realShareLow
        ? "INFLATION EXPECTATIONS"
        : "MIXED";

  if (share > 1) lines.push("Real yields more than explain the move; breakevens moved the other way.");
  else if (share < 0) lines.push("Breakevens more than explain the move; real yields moved the other way.");
  else if (driver === "REAL YIELDS") lines.push(`Real yields account for ${Math.round(share * 100)}% of the move.`);
  else if (driver === "INFLATION EXPECTATIONS")
    lines.push(`Breakeven inflation accounts for ${Math.round((1 - share) * 100)}% of the move.`);
  else lines.push("Real yields and inflation expectations contributed similarly.");

  return {
    driver,
    nominalBp,
    realBp,
    breakevenBp,
    evidence: { title: `Why ${sentenceCase(driver)}?`, lines },
  };
}

function cycleBackdrop(s2s10: number, s3m10: number, shape: CurveShape): RatesAnalysis["cycle"] {
  const inv2 = s2s10 < 0;
  const inv3 = s3m10 < 0;
  const caveat = "A longer-term macro warning remains present, but inversion alone is not an intraday timing signal.";
  if (inv2 && inv3) return { inverted: true, text: `2s10s and 3m10y are inverted. ${caveat}` };
  if (inv3) return { inverted: true, text: `3m10y is inverted while 2s10s is positive. ${caveat}` };
  if (inv2) return { inverted: true, text: `2s10s is inverted while 3m10y is positive. ${caveat}` };
  if (shape === "FLAT")
    return { inverted: false, text: "The curve is flat — late-cycle, transitional territory. Background context only." };
  return { inverted: false, text: "The curve is upward-sloping on 2s10s and 3m10y — no inversion warning in the background." };
}

/**
 * The rates reading for the Vital Signs row. Deliberately context-dependent:
 * a bull steepening is benign easing when credit and volatility are calm, and
 * a growth scare when they are not.
 */
function ratesVital(
  trend: CurveMoveAnalysis,
  driver: RatesAnalysis["driver"],
  ctx: RatesContext,
  asOf: string,
): VitalSign {
  const stressed = ctx.creditStress || ctx.volStress;
  // Only name a driver when the 10Y actually rose; a falling 10Y is a
  // different story and is described by the move itself.
  const tenYear =
    driver && driver.driver !== "NONE" && driver.nominalBp > 0
      ? driver.driver === "REAL YIELDS"
        ? "real yields"
        : driver.driver === "INFLATION EXPECTATIONS"
          ? "inflation expectations"
          : "both real yields and inflation expectations"
      : null;
  const driverClause = tenYear
    ? `, driven by ${tenYear}${driver?.driver === "REAL YIELDS" ? " — a tighter-conditions headwind for growth assets" : ""}`
    : "";

  let signal: Signal;
  let tone: Tone | null = null;
  let interpretation: string;

  switch (trend.move) {
    case "BULL STEEPENING":
      if (stressed) {
        signal = trend.sharp ? "stress" : "warning";
        interpretation = "Front-end yields are falling alongside credit or volatility stress — consistent with a growth scare.";
      } else if (trend.sharp) {
        signal = "neutral";
        tone = "caution";
        interpretation = "A large repricing toward easier policy; credit and volatility are not signalling a growth scare yet.";
      } else {
        signal = "confirming";
        interpretation = "Easier policy expectations; credit and volatility are calm, consistent with benign easing rather than a growth scare.";
      }
      break;
    case "BEAR STEEPENING":
      signal = trend.sharp ? "stress" : "warning";
      interpretation = `Long end leading rates higher${driverClause}.`;
      break;
    case "BEAR FLATTENING":
      signal = trend.sharp ? "stress" : "warning";
      interpretation = `Front end leading higher — consistent with tighter policy expectations${
        tenYear ? `; the 10Y's rise is driven by ${tenYear}` : ""
      }.`;
      break;
    case "BULL FLATTENING":
      signal = stressed ? "warning" : "neutral";
      interpretation = stressed
        ? "Long-end yields falling faster than the front end alongside stress — leaning toward growth concern."
        : "Long-term growth or inflation expectations are softening faster than policy expectations.";
      break;
    case "PARALLEL SHIFT HIGHER":
      signal = trend.sharp ? "stress" : "warning";
      interpretation = `Yields rising across the curve${driverClause}.`;
      break;
    case "PARALLEL SHIFT LOWER":
      signal = stressed ? "warning" : "confirming";
      interpretation = stressed
        ? "Yields falling across the curve alongside stress — consistent with a flight to quality."
        : "Yields easing across the curve with credit and volatility calm.";
      break;
    default:
      signal = "neutral";
      interpretation = "Curve little changed on the week; rates are not a driver.";
  }

  const lines = [...trend.evidence.lines];
  if (driver && driver.driver !== "NONE") lines.push(`10Y driver: ${sentenceCase(driver.driver)}.`);

  const slopeMoved = trend.move !== "STABLE" && !trend.move.startsWith("PARALLEL");
  return {
    key: "rates",
    label: "Yield Curve",
    state: trend.move,
    arrow: arrow(trend.dSpread, slopeMoved),
    tone: tone ?? toneForSignal(signal),
    signal,
    interpretation,
    evidence: { title: trend.evidence.title, lines, note: `Treasury par curve, as of ${asOf}.` },
    asOf,
  };
}
