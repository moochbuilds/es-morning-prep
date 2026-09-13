/**
 * Credit — one of the primary warning systems.
 *
 * Level bands give context, but direction and speed carry the signal: a move
 * from 240 to 290 bp matters more than a spread sitting calmly at 330. Speed
 * is judged by ranking the 5-day change against the series' own history, and
 * HY and IG are read separately so the page can say whether stress is
 * confined to junk or spreading into quality borrowers.
 */

import { CREDIT } from "@/config/thresholds";
import { bp, bpLevel, pts } from "@/lib/format";
import type {
  CreditAnalysis,
  CreditData,
  CreditDirection,
  CreditProxy,
  CreditProxyAnalysis,
  HyBand,
  MoveStat,
  Signal,
  SpreadLeg,
  SpreadSeries,
  Tone,
} from "@/lib/types";

import { arrow, sentenceCase, toneForSignal } from "./labels";
import {
  clears,
  lagChanges,
  moveStat,
  pctChanges,
  percentileOf,
  rankOfAbs,
  rankPhrase,
  round,
  spanOf,
} from "./stats";

type Tier = "hy" | "ig";

export const isWidening = (d: CreditDirection) => d === "WIDENING" || d === "RAPIDLY WIDENING";

export function classifySpreadDirection(d1: MoveStat, d5: MoveStat, tier: Tier): CreditDirection {
  const cfg = CREDIT.direction;
  const rapid5 =
    d5.value > 0 && clears(d5, cfg.rapidRank, cfg.rapidFloorBp[tier], cfg.fallbackBp[tier].rapid);
  const rapid1 =
    d1.value > 0 && clears(d1, cfg.rapid1dRank, cfg.rapidFloorBp[tier], cfg.fallbackBp[tier].rapid);
  if (rapid5 || rapid1) return "RAPIDLY WIDENING";
  if (d5.value > 0 && clears(d5, cfg.widenRank, cfg.floorBp[tier], cfg.fallbackBp[tier].widen)) {
    return "WIDENING";
  }
  if (d5.value < 0 && clears(d5, cfg.tightenRank, cfg.floorBp[tier], cfg.fallbackBp[tier].widen)) {
    return "TIGHTENING";
  }
  return "STABLE";
}

export function hyBand(levelBp: number): HyBand {
  for (const b of CREDIT.hyBands) if (levelBp < b.max) return b.label;
  return "CRISIS";
}

function spreadLeg(series: SpreadSeries, tier: Tier): SpreadLeg {
  const v = series.values;
  const c1 = lagChanges(v, 1).map((x) => Math.round(x));
  const c5 = lagChanges(v, 5).map((x) => Math.round(x));
  const d1 = moveStat(c1[c1.length - 1], c1.slice(0, -1), CREDIT.minHistory);
  const d5 = moveStat(c5[c5.length - 1], c5.slice(0, -1), CREDIT.minHistory);
  const level = v[v.length - 1];
  const year = v.slice(-253, -1);
  return {
    level,
    d1,
    d5,
    direction: classifySpreadDirection(d1, d5, tier),
    levelPct1y: percentileOf(level, year, CREDIT.minHistory),
    asOf: series.dates[series.dates.length - 1],
  };
}

export function analyzeCredit(data: CreditData | null): CreditAnalysis | null {
  if (!data || data.hy.values.length < 6) return null;

  const hyLeg = spreadLeg(data.hy, "hy");
  const band = hyBand(hyLeg.level);
  const hy = { ...hyLeg, band };
  const ig = data.ig && data.ig.values.length >= 6 ? spreadLeg(data.ig, "ig") : null;
  const span = spanOf(data.hy.values.length);

  const quality = qualityRead(hy.direction, ig?.direction ?? null);
  const broadening = quality?.key === "broadening";

  let state: string;
  let signal: Signal;
  let tone: Tone | null = null;
  let interpretation: string;

  if (hy.direction === "RAPIDLY WIDENING") {
    state = "DETERIORATING RAPIDLY";
    signal = "stress";
    interpretation = `HY spreads ${bp(hy.d5.value)} in 5 days — a fast repricing of default and liquidity risk${
      broadening ? ", now spreading into investment grade" : ""
    }.`;
  } else if (band === "SIGNIFICANT STRESS" || band === "CRISIS") {
    state = "STRESSED";
    signal = "stress";
    interpretation = `HY spreads at ${bpLevel(hy.level)} price meaningful default risk.`;
  } else if (hy.direction === "WIDENING") {
    state = "DETERIORATING";
    signal = broadening ? "stress" : "warning";
    interpretation =
      band === "TIGHT"
        ? "Deteriorating from a very healthy level."
        : band === "WARNING"
          ? "Widening inside the 500–700 bp warning zone."
          : "Spreads are widening from normal levels.";
    if (broadening) interpretation += " IG is widening too.";
  } else if (ig && isWidening(ig.direction)) {
    state = "IG WIDENING";
    signal = "warning";
    interpretation = "Investment-grade spreads are widening while HY holds — watch for stress spreading.";
  } else if (band === "WARNING") {
    state = "ELEVATED";
    signal = "warning";
    interpretation = "Spreads sit in the 500–700 bp warning zone, though they are not widening.";
  } else if (hy.direction === "TIGHTENING") {
    state = "IMPROVING";
    signal = "confirming";
    interpretation = "Spreads are tightening — credit is confirming risk appetite.";
  } else {
    state = "HEALTHY";
    signal = "confirming";
    interpretation =
      band === "TIGHT"
        ? "Spreads are tight and stable — credit is comfortable, and pricing little default risk."
        : "Spreads remain contained.";
  }

  if (signal === "warning" && broadening) tone = "stressed";

  const lines = [
    `HY OAS: ${bpLevel(hy.level)} (${sentenceCase(band)})`,
    `HY change: ${bp(hy.d1.value)} 1D · ${bp(hy.d5.value)} 5D — ${sentenceCase(hy.direction)}`,
  ];
  const ranked = rankPhrase(hy.d5, "5-day HY", span);
  if (ranked) lines.push(ranked);
  if (ig) lines.push(`IG OAS: ${bpLevel(ig.level)} · ${bp(ig.d5.value)} 5D — ${sentenceCase(ig.direction)}`);
  if (quality) lines.push(quality.text);

  const spark = Math.min(CREDIT.sparkDays, data.hy.values.length);

  return {
    hy,
    ig,
    quality,
    state,
    trend: { dates: data.hy.dates.slice(-spark), values: data.hy.values.slice(-spark) },
    vital: {
      key: "credit",
      label: "Credit",
      state,
      arrow: arrow(hy.d5.value, hy.direction !== "STABLE"),
      tone: tone ?? toneForSignal(signal),
      signal,
      interpretation,
      evidence: {
        title: `Why ${sentenceCase(state)}?`,
        lines,
        note: `Daily ICE BofA OAS series, as of ${hy.asOf}. Bands are context; direction and speed carry the signal.`,
      },
      asOf: hy.asOf,
    },
  };
}

function qualityRead(
  hy: CreditDirection,
  ig: CreditDirection | null,
): CreditAnalysis["quality"] {
  if (ig === null) return null;
  const hyW = isWidening(hy);
  const igW = isWidening(ig);
  if (hyW && igW) {
    return { key: "broadening", text: "HY and IG are both widening — deterioration is broadening into higher-quality borrowers." };
  }
  if (hyW) {
    return { key: "hy-only", text: "HY is widening while IG holds — stress remains concentrated in lower-quality credit." };
  }
  if (igW) {
    return { key: "ig-only", text: "IG is widening while HY holds — unusual, and often rate- or supply-driven." };
  }
  return { key: "contained", text: "Neither HY nor IG is widening meaningfully." };
}

// ---------------------------------------------------------------------------
// HYG / LQD — a faster, price-based proxy. Never ranked above actual spreads.
// ---------------------------------------------------------------------------

export function analyzeCreditProxy(data: CreditProxy | null): CreditProxyAnalysis | null {
  if (!data) return null;
  const { hyg, lqd } = data;

  // Align completed closes on shared dates.
  const lqdByDate = new Map(lqd.dates.map((d, i) => [d, lqd.closes[i]]));
  const dates: string[] = [];
  const h: number[] = [];
  const l: number[] = [];
  hyg.dates.forEach((d, i) => {
    const lv = lqdByDate.get(d);
    if (lv !== undefined) {
      dates.push(d);
      h.push(hyg.closes[i]);
      l.push(lv);
    }
  });
  if (h.length < 6) return null;

  const rel = (lag: number) =>
    ((hyg.price / h[h.length - lag]) - 1) * 100 - ((lqd.price / l[l.length - lag]) - 1) * 100;
  const d1 = round(rel(1), 2);
  const d5 = round(rel(5), 2);

  const lqd5 = pctChanges(l, 5);
  const hist5 = pctChanges(h, 5).map((x, i) => x - lqd5[i]);
  const stat: MoveStat = { value: d5, rank: rankOfAbs(d5, hist5, 30) };
  const moved = clears(stat, CREDIT.proxy.rank, CREDIT.proxy.floorPct, CREDIT.proxy.fallbackPct);
  const state: CreditProxyAnalysis["state"] = !moved ? "STABLE" : d5 > 0 ? "IMPROVING" : "DETERIORATING";

  const ratios = h.map((v, i) => v / l[i]);
  ratios.push(hyg.price / lqd.price);
  const lines = [
    `HYG vs LQD: ${pts(d1)} 1D · ${pts(d5)} 5D`,
    state === "IMPROVING"
      ? "Lower-quality bonds are outperforming higher-quality bonds."
      : state === "DETERIORATING"
        ? "Lower-quality bonds are underperforming higher-quality bonds."
        : "No meaningful quality rotation in bond ETFs.",
  ];
  const ranked = rankPhrase(stat, "5-day", spanOf(h.length));
  if (ranked) lines.push(ranked);

  return {
    state,
    d1,
    d5,
    tone: state === "IMPROVING" ? "constructive" : state === "DETERIORATING" ? "caution" : "neutral",
    spark: ratios.slice(-CREDIT.proxy.sparkDays),
    time: hyg.time,
    evidence: {
      title: `Why ${sentenceCase(state)}?`,
      lines,
      note: "Price-based proxy including distribution drag — secondary to actual OAS.",
    },
  };
}
