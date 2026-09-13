/**
 * Volatility — level, rate of change and term structure, never level alone.
 *
 * Low VIX means calm NOW; it is never read as bullish. The term structure is
 * the acute-stress detector: backwardation (near-term vol priced above longer
 * vol) outranks everything else. Actual VX futures are preferred; the
 * VIX9D/VIX/VIX3M indices are a clearly labelled proxy when futures are missing.
 */

import { VOL } from "@/config/thresholds";
import { pct } from "@/lib/format";
import type {
  MoveStat,
  Signal,
  Tone,
  VixFutures,
  VixMomentum,
  VixRegime,
  VolatilityAnalysis,
  VolatilityData,
} from "@/lib/types";

import { sentenceCase, toneForSignal } from "./labels";
import { clears, moveStat, pctChanges, percentileOf, rankPhrase, round, spanOf } from "./stats";

const MONTHS: Record<string, string> = {
  F: "Jan", G: "Feb", H: "Mar", J: "Apr", K: "May", M: "Jun",
  N: "Jul", Q: "Aug", U: "Sep", V: "Oct", X: "Nov", Z: "Dec",
};

export function vixRegime(level: number): VixRegime {
  for (const r of VOL.regimes) if (level < r.max) return r.label;
  return "EXTREME";
}

export function classifyMomentum(d1: MoveStat, d5: MoveStat): VixMomentum {
  const m = VOL.momentum;
  const up = (s: MoveStat, rank: number, floor: number, fallback: number) =>
    s.value > 0 && clears(s, rank, floor, fallback);
  const down = (s: MoveStat, rank: number, floor: number, fallback: number) =>
    s.value < 0 && clears(s, rank, floor, fallback);

  if (
    up(d1, m.spikeRank, m.spikeFloorPct["1D"], m.fallback.spikePct["1D"]) ||
    up(d5, m.spikeRank, m.spikeFloorPct["5D"], m.fallback.spikePct["5D"])
  ) {
    return "SPIKING";
  }
  if (
    up(d1, m.riseRank, m.riseFloorPct["1D"], m.fallback.risePct["1D"]) ||
    up(d5, m.riseRank, m.riseFloorPct["5D"], m.fallback.risePct["5D"])
  ) {
    return "RISING";
  }
  if (
    down(d5, m.fallRank, m.riseFloorPct["5D"], m.fallback.risePct["5D"]) ||
    down(d1, m.fallRank, m.riseFloorPct["1D"], m.fallback.risePct["1D"])
  ) {
    return "FALLING";
  }
  return "STABLE";
}

function termStructure(
  spot: number,
  data: VolatilityData,
  futures: VixFutures | null,
): VolatilityAnalysis["term"] {
  if (futures && futures.contracts.length >= 2) {
    const [m1, m2] = futures.contracts;
    const month = (sym: string) => MONTHS[sym.match(/\/([A-Z])\d$/)?.[1] ?? ""] ?? sym;
    const slopePct = round((m2.price / m1.price - 1) * 100, 1);
    const flat = VOL.term.futuresFlatPct;
    const state = slopePct > flat ? "CONTANGO" : slopePct < -flat ? "BACKWARDATION" : "FLAT";
    const spotAbove = spot > m1.price * (1 + flat / 100);
    const note = spotAbove
      ? "Spot VIX is above the front-month future — immediate stress is priced above next month."
      : null;
    return {
      state,
      source: "futures",
      points: [
        { label: "Spot", value: spot },
        { label: `M1 ${month(m1.symbol)}`, value: m1.price },
        { label: `M2 ${month(m2.symbol)}`, value: m2.price },
      ],
      slopePct,
      note,
      evidence: {
        title: `Why ${sentenceCase(state)}?`,
        lines: [
          `VX M1 (${m1.symbol}, exp ${m1.expiration}): ${m1.price.toFixed(2)}`,
          `VX M2 (${m2.symbol}, exp ${m2.expiration}): ${m2.price.toFixed(2)}`,
          `M2 vs M1: ${pct(slopePct, 1)} (flat within ±${flat}%)`,
          state === "BACKWARDATION"
            ? "Near-term volatility is priced above longer-dated volatility."
            : state === "CONTANGO"
              ? "Longer-dated volatility is priced above near-term volatility — the normal state."
              : "Little difference between near and longer-dated volatility.",
        ],
        note: "Cboe VX futures, monthly contracts.",
      },
    };
  }

  const v9 = data.vix9d?.price ?? null;
  const v3m = data.vix3m?.price ?? null;
  if (v3m === null) return null;

  const slopePct = round((v3m / spot - 1) * 100, 1);
  const flat = VOL.term.proxyFlatPct;
  const state = slopePct > flat ? "CONTANGO" : slopePct < 0 ? "BACKWARDATION" : "FLAT";
  const points = [
    ...(v9 !== null ? [{ label: "9D", value: v9 }] : []),
    { label: "30D", value: spot },
    { label: "3M", value: v3m },
  ];
  const frontKink = v9 !== null && v9 > spot;
  return {
    state,
    source: "proxy",
    points,
    slopePct,
    note: frontKink
      ? "9-day volatility is above 30-day — a near-term event premium in the front end."
      : null,
    evidence: {
      title: `Why ${sentenceCase(state)}?`,
      lines: [
        ...(v9 !== null ? [`VIX9D: ${v9.toFixed(2)}`] : []),
        `VIX (30D): ${spot.toFixed(2)}`,
        `VIX3M: ${v3m.toFixed(2)}`,
        `3M vs 30D: ${pct(slopePct, 1)} (flat within 0–${flat}%)`,
      ],
      note: "Term-structure PROXY from Cboe volatility indices — not VIX futures contango.",
    },
  };
}

export function analyzeVolatility(
  data: VolatilityData | null,
  futures: VixFutures | null,
): VolatilityAnalysis | null {
  if (!data || data.vix.closes.length < 5) return null;

  const closes = data.vix.closes;
  const level = data.vix.price;
  const d1 = round((level / closes[closes.length - 1] - 1) * 100, 1);
  const d5 = round((level / closes[closes.length - 5] - 1) * 100, 1);
  const d1Pct = moveStat(d1, pctChanges(closes, 1), VOL.minHistory);
  const d5Pct = moveStat(d5, pctChanges(closes, 5), VOL.minHistory);
  const levelPct1y = percentileOf(level, closes.slice(-252), VOL.minHistory);
  const span = spanOf(closes.length);

  const regime = vixRegime(level);
  const momentum = classifyMomentum(d1Pct, d5Pct);
  const term = termStructure(level, data, futures);
  const complacency =
    level < VOL.complacency.level ||
    (levelPct1y !== null && levelPct1y <= VOL.complacency.levelPct1y);

  let state: string;
  let signal: Signal;
  let tone: Tone | null = null;
  let interpretation: string;

  if (term?.state === "BACKWARDATION") {
    state = "ACUTE STRESS";
    signal = "stress";
    interpretation = "Near-term volatility is priced above longer-dated volatility — acute, immediate protection demand.";
  } else if (regime === "HIGH FEAR" || regime === "EXTREME") {
    if (momentum === "FALLING") {
      state = "HIGH BUT EASING";
      signal = "warning";
      interpretation = "Fear is high but receding; extremes have tended to mean-revert, though that is not a timing signal.";
    } else {
      state = regime;
      signal = "stress";
      interpretation = "Options are pricing large near-term moves.";
    }
  } else if (momentum === "SPIKING") {
    state = "SPIKING";
    signal = level >= 20 ? "stress" : "warning";
    interpretation =
      level >= 20
        ? "Significant repricing of near-term protection."
        : "A sharp repricing of protection from a calm base.";
  } else if (regime === "ELEVATED") {
    if (momentum === "RISING") {
      state = "ELEVATED — RISING";
      signal = "warning";
      interpretation = "Elevated and still climbing — protection demand is building.";
    } else if (momentum === "FALLING") {
      state = "ELEVATED — EASING";
      signal = "neutral";
      tone = "caution";
      interpretation = "Mean-reverting lower from elevated levels; fear is receding.";
    } else {
      state = "ELEVATED";
      signal = "warning";
      interpretation = "Elevated concern; choppy conditions are more likely.";
    }
  } else if (momentum === "RISING") {
    state = "CALM — FIRMING";
    signal = "warning";
    interpretation = "Levels are calm, but protection demand is rising.";
  } else if (momentum === "FALLING") {
    state = "CALM";
    signal = "confirming";
    interpretation = "Volatility is declining — no acute protection demand.";
  } else if (d5 >= VOL.momentum.driftPct) {
    state = "CALM";
    signal = "neutral";
    interpretation = "Calm environment with modestly increasing uncertainty.";
  } else {
    state = "CALM";
    signal = "confirming";
    interpretation = "No acute protection demand.";
  }

  if (term?.state === "FLAT" && signal === "confirming") {
    signal = "neutral";
    interpretation += " The term structure is flat, so the cushion is thin.";
  }
  if (complacency && state === "CALM") {
    interpretation += " Hedging is cheap; calm now says nothing about calm later.";
  }

  const lines = [
    `VIX: ${level.toFixed(2)} (${sentenceCase(regime)})`,
    `Change: ${pct(d1, 1)} 1D · ${pct(d5, 1)} 5D — ${sentenceCase(momentum)}`,
  ];
  const ranked = rankPhrase(Math.abs(d1Pct.rank ?? 0) >= Math.abs(d5Pct.rank ?? 0) ? d1Pct : d5Pct, "VIX", span);
  if (ranked) lines.push(ranked);
  if (term) lines.push(`Term structure: ${sentenceCase(term.state)} (${term.source === "futures" ? "VX futures" : "index proxy"})`);
  if (term?.note) lines.push(term.note);

  return {
    vix: { level, d1Pct, d5Pct, levelPct1y },
    regime,
    momentum,
    term,
    state,
    complacency,
    vital: {
      key: "volatility",
      label: "Volatility",
      state,
      arrow: momentum === "RISING" || momentum === "SPIKING" ? "up" : momentum === "FALLING" ? "down" : "flat",
      tone: tone ?? toneForSignal(signal),
      signal,
      interpretation,
      evidence: {
        title: `Why ${sentenceCase(state)}?`,
        lines,
        note: "VIX measures the size of expected moves, not their direction. Low VIX means calm now — not that stocks will rise.",
      },
      asOf: null,
    },
  };
}
