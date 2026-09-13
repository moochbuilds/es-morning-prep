/**
 * Equity confirmation: breadth, index participation, and sector rotation,
 * combined into a categorical equity posture.
 *
 * Everything here is confirmation, never a signal on its own. Breadth is
 * judged against the index's own direction (a rally with most stocks below
 * VWAP is narrow), sectors are judged relative to SPY (on a strong day every
 * sector is green), and the posture never overrides ES price action: the
 * equity lean handed to the cross-asset layer follows the tape first.
 */

import { EQUITY } from "@/config/thresholds";
import { pct, pts, ratio } from "@/lib/format";
import type {
  Breadth,
  BreadthAnalysis,
  BreadthState,
  ConfirmationState,
  EquityAnalysis,
  EquityPosture,
  IndexFutures,
  Lean,
  ParticipationAnalysis,
  RelativeSector,
  RotationAnalysis,
  RotationState,
  Sectors,
  Signal,
  Tone,
  Verdict,
} from "@/lib/types";

import { capitalize, listJoin, sentenceCase } from "./labels";
import { clears, mean, rankOfAbs, rankPhrase, round, spanOf } from "./stats";

// ---------------------------------------------------------------------------
// Breadth
// ---------------------------------------------------------------------------

export function analyzeBreadth(b: Breadth, esChangePct: number | null): BreadthAnalysis {
  const cfg = EQUITY.breadth;
  // Judge participation in the direction the index is moving; a flat index is
  // judged by breadth's own lean.
  const dir: 1 | -1 =
    esChangePct !== null && Math.abs(esChangePct) >= EQUITY.flatPct
      ? esChangePct > 0 ? 1 : -1
      : b.advanceDeclineRatio >= 1 ? 1 : -1;

  // Express each indicator in "confirms an up-move" terms, then mirror.
  const ad = dir > 0 ? b.advanceDeclineRatio : 1 / Math.max(0.01, b.advanceDeclineRatio);
  const vwap = dir > 0 ? b.pctAboveVwap : 100 - b.pctAboveVwap;
  const rsp = dir * b.rspVsSpyPct;

  const verdict = (v: number, confirm: number, contradict: number): Verdict =>
    v >= confirm ? "confirms" : v <= contradict ? "contradicts" : "neutral";

  // A/D and VWAP contradict strictly below their line (1.0 exactly is a tie).
  const adV = verdict(ad, cfg.ad.confirm, cfg.ad.contradict - 1e-9);
  const vwapV = verdict(vwap, cfg.vwap.confirm, cfg.vwap.contradict - 1e-9);
  const rspV = verdict(rsp, cfg.rsp.confirm, cfg.rsp.contradict);

  const verdicts = [adV, vwapV, rspV];
  const confirms = verdicts.filter((v) => v === "confirms").length;
  const contradicts = verdicts.filter((v) => v === "contradicts").length;

  let state: BreadthState;
  if (confirms === 3 || (confirms === 2 && contradicts === 0)) state = dir > 0 ? "BROAD" : "BROAD SELLING";
  else if (contradicts >= 2 || (contradicts >= 1 && confirms === 0)) state = "NARROW";
  else state = "MIXED";

  const tone: Tone =
    state === "BROAD" ? "constructive"
    : state === "BROAD SELLING" ? "stressed"
    : state === "NARROW" && dir > 0 ? "caution"
    : "neutral";

  const up = dir > 0;
  const clause = {
    ad: {
      confirms: up ? `advance/decline is positive (${ratio(b.advanceDeclineRatio)})` : `decliners dominate (${ratio(b.advanceDeclineRatio)})`,
      neutral: up ? `advance/decline is only modestly positive (${ratio(b.advanceDeclineRatio)})` : `advance/decline is only modestly negative (${ratio(b.advanceDeclineRatio)})`,
      contradicts: up ? `decliners outnumber advancers (${ratio(b.advanceDeclineRatio)})` : `advancers outnumber decliners (${ratio(b.advanceDeclineRatio)})`,
    },
    vwap: {
      confirms: up ? `most constituents are above VWAP (${b.pctAboveVwap}%)` : `most constituents are below VWAP (${b.pctAboveVwap}% above)`,
      neutral: `about half of constituents are above VWAP (${b.pctAboveVwap}%)`,
      contradicts: up ? `less than half of constituents are above VWAP (${b.pctAboveVwap}%)` : `most constituents are holding above VWAP (${b.pctAboveVwap}%)`,
    },
    rsp: {
      confirms: up ? "equal-weight participation is keeping up" : "equal-weight is falling at least as hard",
      neutral: up ? "equal-weight participation is not confirming strongly" : "equal-weight is roughly in line",
      contradicts: up ? `equal-weight is lagging (${pts(b.rspVsSpyPct)})` : `equal-weight is holding up (${pts(b.rspVsSpyPct)})`,
    },
  };
  const parts = [
    { v: adV, text: clause.ad[adV] },
    { v: vwapV, text: clause.vwap[vwapV] },
    { v: rspV, text: clause.rsp[rspV] },
  ];
  const good = parts.filter((p) => p.v === "confirms").map((p) => p.text);
  const bad = parts.filter((p) => p.v !== "confirms").map((p) => p.text);
  const explanation =
    bad.length === 0
      ? `${capitalize(listJoin(good))}.`
      : good.length === 0
        ? `${capitalize(listJoin(bad))}.`
        : `${capitalize(listJoin(good))}, but ${listJoin(bad)}.`;

  return {
    state,
    tone,
    checks: [
      { label: "A/D", value: ratio(b.advanceDeclineRatio), verdict: adV },
      { label: "Above VWAP", value: `${b.pctAboveVwap}%`, verdict: vwapV },
      { label: "RSP vs SPY", value: pts(b.rspVsSpyPct), verdict: rspV },
    ],
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Index participation (ES / NQ / RTY / RSP)
// ---------------------------------------------------------------------------

export function analyzeParticipation(
  f: IndexFutures,
  breadth: BreadthAnalysis | null,
  rspVsSpy: number | null,
): ParticipationAnalysis {
  const cfg = EQUITY.participation;
  const es = f.es.changePct;
  const nq = f.nq.changePct;
  const rty = f.rty.changePct;
  const rtyGap = round(rty - es, 2);
  const lagThreshold = Math.max(cfg.rtyLagMinPct, cfg.rtyLagFraction * Math.abs(es));
  const direction = Math.abs(es) < EQUITY.flatPct ? "flat" : es > 0 ? "up" : "down";

  const legs = [
    { symbol: "ES", changePct: es },
    { symbol: "NQ", changePct: nq },
    { symbol: "RTY", changePct: rty },
  ];

  let state: ConfirmationState;
  let explanation: string;
  let rtyLagging = false;
  let rspLagging = false;

  if (direction === "up") {
    rtyLagging = rtyGap <= -lagThreshold;
    rspLagging = rspVsSpy !== null && rspVsSpy <= -cfg.rspLagPct;
    const breadthNarrow = breadth?.state === "NARROW";
    const lagCount = Number(rtyLagging) + Number(rspLagging) + Number(breadthNarrow);
    const lags = [
      rtyLagging && `RTY trails ES by ${pts(-rtyGap).replace("+", "")}`,
      rspLagging && `RSP trails SPY by ${pts(-(rspVsSpy as number)).replace("+", "")}`,
      breadthNarrow && "breadth is narrow",
    ].filter(Boolean) as string[];

    if (nq <= -cfg.nqOppositePct) {
      state = "MIXED";
      explanation = `NQ is falling (${pct(nq)}) while ES rises — index leadership is split.`;
    } else if (lagCount === 0 && breadth?.state === "MIXED") {
      state = "POSITIVE — UNEVEN BREADTH";
      explanation = "ES, NQ and RTY are aligned higher, but breadth beneath the index is mixed.";
    } else if (lagCount === 0) {
      state = "BROAD CONFIRMATION";
      explanation = "ES, NQ and RTY are all participating, with equal-weight keeping pace.";
    } else if (lagCount >= 2 || (breadthNarrow && !rtyLagging && !rspLagging)) {
      state = "POSITIVE BUT NARROW";
      explanation = `ES ${pct(es)} and NQ ${pct(nq)}, but ${listJoin(lags)} — headline strength is narrow.`;
    } else {
      state = "POSITIVE — LARGE-CAP LED";
      explanation = `ES and NQ are higher, but ${lags[0]} — leadership is concentrated in large caps.`;
    }
  } else if (direction === "down") {
    const rtyHolding = rtyGap >= lagThreshold;
    const rspHolding = rspVsSpy !== null && rspVsSpy >= cfg.rspLagPct;
    const broadSelling = breadth?.state === "BROAD SELLING";

    if (nq >= cfg.nqOppositePct) {
      state = "MIXED";
      explanation = `NQ is rising (${pct(nq)}) while ES falls — index leadership is split.`;
    } else if ((broadSelling || (breadth === null && rty <= es)) && !rtyHolding && !rspHolding) {
      state = "BROAD WEAKNESS";
      explanation = "ES, NQ and RTY are all lower, with broad selling beneath the index.";
    } else if ((rtyHolding || rspHolding) && !broadSelling) {
      state = "NEGATIVE — CONCENTRATED";
      explanation = "ES is lower, but small caps or equal-weight are holding up — the selling is concentrated in large caps.";
    } else {
      state = "NEGATIVE — UNEVEN";
      explanation = "ES is lower with uneven participation beneath the index.";
    }
  } else {
    state = "FLAT";
    explanation = "ES is little changed — there is no directional move to confirm.";
  }

  const tone: Tone =
    state === "BROAD CONFIRMATION" ? "constructive"
    : state === "BROAD WEAKNESS" ? "stressed"
    : state === "POSITIVE — LARGE-CAP LED" || state === "POSITIVE BUT NARROW" || state === "MIXED" || state === "NEGATIVE — UNEVEN" ? "caution"
    : "neutral";

  const lines = [
    `ES ${pct(es)} · NQ ${pct(nq)} · RTY ${pct(rty)}`,
    `RTY vs ES: ${pts(rtyGap)} (lag threshold ${pts(-lagThreshold)})`,
  ];
  if (rspVsSpy !== null) lines.push(`RSP vs SPY: ${pts(rspVsSpy)} (lag threshold ${pts(-cfg.rspLagPct)})`);
  if (breadth) lines.push(`Breadth: ${sentenceCase(breadth.state)}`);

  return {
    state,
    tone,
    direction,
    legs,
    rtyGap,
    rspVsSpy,
    rtyLagging,
    rspLagging,
    explanation,
    evidence: { title: `Why ${sentenceCase(state)}?`, lines },
  };
}

// ---------------------------------------------------------------------------
// Sector rotation — always relative to SPY
// ---------------------------------------------------------------------------

function classifyRotation(spread: number, rank: number | null, scale = 1, broad = true): RotationState {
  const cfg = EQUITY.rotation;
  const stat = { value: spread, rank };
  const strong = clears(stat, cfg.strongRank, cfg.strongFloorPct * scale, cfg.fallbackPct.strong * scale);
  const mild = clears(stat, cfg.mildRank, cfg.mildFloorPct * scale, cfg.fallbackPct.mild * scale);
  // A large spread carried by one or two sectors is not broad risk-on rotation.
  if (spread > 0) return strong && broad ? "STRONG RISK-ON ROTATION" : strong || mild ? "MILD RISK-ON ROTATION" : "NEUTRAL";
  if (spread < 0 && mild) return "DEFENSIVE ROTATION";
  return "NEUTRAL";
}

/** Daily (or n-day) cyclical-minus-defensive spread from the close history. */
function spreadHistory(s: Sectors, lag: number): number[] {
  const cfg = EQUITY.rotation;
  const proxyOf = new Map(s.sectors.map((q) => [q.key, q.proxy]));
  const groupSeries = (keys: string[]) =>
    keys
      .map((k) => s.history.closes[proxyOf.get(k as never) ?? ""])
      .filter((c): c is number[] => Array.isArray(c) && c.length === s.history.dates.length);
  const cyc = groupSeries(cfg.cyclical);
  const def = groupSeries(cfg.defensive);
  if (cyc.length === 0 || def.length === 0) return [];
  const out: number[] = [];
  for (let i = lag; i < s.history.dates.length; i++) {
    const r = (c: number[]) => (c[i] / c[i - lag] - 1) * 100;
    out.push(mean(cyc.map(r)) - mean(def.map(r)));
  }
  return out;
}

export function analyzeRotation(s: Sectors): RotationAnalysis | null {
  const cfg = EQUITY.rotation;
  if (s.sectors.length < 5) return null;

  const spy = s.spy.changePct;
  const groupOf = (k: string): RelativeSector["group"] =>
    cfg.cyclical.includes(k as never) ? "cyclical" : cfg.defensive.includes(k as never) ? "defensive" : "other";
  const rel: RelativeSector[] = s.sectors.map((q) => ({
    key: q.key,
    label: q.label,
    proxy: q.proxy,
    changePct: q.changePct,
    relPct: round(q.changePct - spy, 2),
    group: groupOf(q.key),
  }));

  const avgRel = (g: RelativeSector["group"]) => {
    const xs = rel.filter((r) => r.group === g).map((r) => r.relPct);
    return xs.length ? mean(xs) : null;
  };
  const cyc = avgRel("cyclical");
  const def = avgRel("defensive");
  if (cyc === null || def === null) return null;

  const spread = round(cyc - def, 2);
  const hist1 = spreadHistory(s, 1);
  const spreadRank = rankOfAbs(spread, hist1, cfg.minHistory);
  const cyclicals = rel.filter((r) => r.group === "cyclical");
  const beating = cyclicals.filter((r) => r.relPct > 0);
  const broad = beating.length / cyclicals.length >= cfg.broadShare;
  const state = classifyRotation(spread, spreadRank, 1, broad);

  // 5-day trend, to spot a rotation that is reversing rather than persisting.
  let trend5d: RotationAnalysis["trend5d"] = null;
  const all5 = s.sectors.every((q) => q.change5dPct !== null) && s.spy.change5dPct !== null;
  if (all5) {
    const avg5 = (g: RelativeSector["group"]) =>
      mean(s.sectors.filter((q) => groupOf(q.key) === g).map((q) => q.change5dPct as number));
    const spread5 = round(avg5("cyclical") - avg5("defensive"), 2);
    const rank5 = rankOfAbs(spread5, spreadHistory(s, 5), cfg.minHistory);
    const cyc5 = s.sectors.filter((q) => groupOf(q.key) === "cyclical");
    const broad5 =
      cyc5.filter((q) => (q.change5dPct as number) > (s.spy.change5dPct as number)).length / cyc5.length >=
      cfg.broadShare;
    trend5d = { state: classifyRotation(spread5, rank5, 2, broad5), spread: spread5 };
  }

  const riskOn = (r: RotationState) => r === "STRONG RISK-ON ROTATION" || r === "MILD RISK-ON ROTATION";
  const transitioning =
    trend5d !== null &&
    ((riskOn(state) && trend5d.state === "DEFENSIVE ROTATION") ||
      (state === "DEFENSIVE ROTATION" && riskOn(trend5d.state)));

  const ranked = [...rel].sort((a, b) => b.relPct - a.relPct);
  const leaders = ranked.slice(0, cfg.shown);
  const laggards = ranked.slice(-cfg.shown).reverse();

  const leaderNames = leaders.filter((l) => l.relPct > 0).slice(0, 2).map((l) => l.label);
  let explanation =
    state === "NEUTRAL"
      ? `No clear rotational tilt: cyclicals ${pts(spread)} vs defensives, relative to SPY.`
      : spread > 0
        ? `Cyclical sectors are outperforming defensives by ${pts(spread).replace("+", "")} relative to SPY${
            leaderNames.length ? `, led by ${listJoin(leaderNames)}` : ""
          }.`
        : `Defensives are outperforming cyclical sectors by ${pts(-spread).replace("+", "")} relative to SPY.`;
  if (spread > 0 && state !== "NEUTRAL" && !broad) {
    explanation += ` Leadership is concentrated${
      beating.length ? ` in ${listJoin(beating.map((b) => b.label))}` : ""
    } rather than broad across cyclicals.`;
  }
  if (transitioning && trend5d) {
    explanation += riskOn(state)
      ? " This reverses a defensive 5-day trend."
      : " This reverses a risk-on 5-day trend.";
  }

  const byKey = new Map(rel.map((r) => [r.key, r]));
  const pair = (a: string, b: string, label: string) => {
    const x = byKey.get(a as never);
    const y = byKey.get(b as never);
    return x && y ? `${label}: ${pts(x.changePct - y.changePct)}` : null;
  };
  const pairs = [pair("discretionary", "staples", "XLY vs XLP"), pair("financials", "utilities", "XLF vs XLU")]
    .filter(Boolean)
    .join(" · ");

  const lines = [
    `SPY: ${pct(spy)}`,
    `Cyclical avg vs SPY: ${pts(cyc)}`,
    `Defensive avg vs SPY: ${pts(def)}`,
    `Spread: ${pts(spread)}`,
    `Cyclicals beating SPY: ${beating.length} of ${cyclicals.length}${broad ? " — broad" : " — concentrated"}`,
  ];
  if (pairs) lines.push(`Paired opposites: ${pairs}`);
  const r = rankPhrase({ value: spread, rank: spreadRank }, "daily rotation", spanOf(hist1.length));
  if (r) lines.push(r);
  if (trend5d) lines.push(`5-day spread: ${pts(trend5d.spread)} (${sentenceCase(trend5d.state)})`);

  return {
    state,
    tone: riskOn(state) ? "constructive" : state === "DEFENSIVE ROTATION" ? "caution" : "neutral",
    spread,
    spreadRank,
    cyclicalRel: round(cyc, 2),
    defensiveRel: round(def, 2),
    leaders,
    laggards,
    trend5d,
    transitioning,
    explanation,
    evidence: {
      title: `Why ${sentenceCase(state)}?`,
      lines,
      note: "Semis, energy and real estate are shown but kept out of the spread: semis double-count XLK, energy often acts as an inflation/geopolitical hedge, and real estate is hybrid and rate-driven.",
    },
  };
}

// ---------------------------------------------------------------------------
// Posture
// ---------------------------------------------------------------------------

export function analyzeEquities(
  futures: IndexFutures | null,
  breadth: Breadth | null,
  sectors: Sectors | null,
): EquityAnalysis {
  const breadthA = breadth ? analyzeBreadth(breadth, futures?.es.changePct ?? null) : null;
  const participation = futures
    ? analyzeParticipation(futures, breadthA, breadth?.rspVsSpyPct ?? null)
    : null;
  const rotation = sectors ? analyzeRotation(sectors) : null;

  const empty: EquityAnalysis = {
    posture: null,
    tone: "neutral",
    signal: "neutral",
    lean: "neutral",
    explanation: "Equity data is unavailable.",
    evidence: { title: "Equity posture", lines: ["No equity inputs available."] },
    breadth: breadthA,
    rotation,
    participation,
  };
  if (!rotation && !participation) return empty;

  const conf = participation?.state ?? null;
  const dir = participation?.direction ?? "flat";
  const rot = rotation?.state ?? null;
  const riskOnRot = rot === "STRONG RISK-ON ROTATION" || rot === "MILD RISK-ON ROTATION";
  const defRot = rot === "DEFENSIVE ROTATION";
  const weakTape =
    conf === "BROAD WEAKNESS" || conf === "NEGATIVE — UNEVEN" || conf === "NEGATIVE — CONCENTRATED" ||
    breadthA?.state === "BROAD SELLING";

  let posture: EquityPosture;
  let explanation: string;

  if (rot === "STRONG RISK-ON ROTATION" && conf === "BROAD CONFIRMATION") {
    posture = "AGGRESSIVE RISK-ON";
    explanation = "Cyclicals and high beta are strongly outperforming defensives, with broad index participation.";
  } else if (defRot && weakTape) {
    posture = "RISK-OFF";
    explanation = "Defensives are leading while the index and its participation are weak.";
  } else if (defRot) {
    posture = rotation?.transitioning ? "MIXED / TRANSITIONING" : "DEFENSIVE ROTATION";
    explanation = rotation?.transitioning
      ? "Defensives lead today against a risk-on 5-day trend — leadership is transitioning."
      : `Defensives are meaningfully outperforming cyclicals${
          dir === "up"
            ? " even as the index rises"
            : dir === "flat"
              ? " beneath a flat index — a hidden rotation the headline number doesn't show"
              : ""
        }.`;
  } else if (riskOnRot && dir === "down") {
    posture = "MIXED / TRANSITIONING";
    explanation = "Cyclicals are holding up relative to defensives, but the index is falling — conflicting equity signals.";
  } else if (riskOnRot) {
    posture = rotation?.transitioning ? "MIXED / TRANSITIONING" : "CONSTRUCTIVE";
    explanation = rotation?.transitioning
      ? "Risk-on rotation today against a defensive 5-day trend — leadership is transitioning."
      : "Risk-sensitive leadership is present, but not broad enough for aggressive risk-on.";
  } else if (conf === "BROAD CONFIRMATION") {
    posture = "CONSTRUCTIVE";
    explanation = "Broad index participation, though sector leadership has no clear cyclical tilt.";
  } else if (conf === "BROAD WEAKNESS") {
    posture = "MIXED / TRANSITIONING";
    explanation = "Broad selling without defensive leadership — indiscriminate de-risking rather than a rotation.";
  } else {
    posture = "MIXED / TRANSITIONING";
    explanation = "No coherent sector leadership.";
  }

  // The lean follows the tape first; rotation only decides it on a flat day
  // or neutralises an advance that defensives are leading.
  let lean: Lean;
  if (dir === "up") lean = posture === "DEFENSIVE ROTATION" || posture === "RISK-OFF" ? "neutral" : "risk-on";
  else if (dir === "down") lean = "risk-off";
  else
    lean =
      posture === "AGGRESSIVE RISK-ON" || posture === "CONSTRUCTIVE" ? "risk-on"
      : posture === "RISK-OFF" || posture === "DEFENSIVE ROTATION" ? "risk-off"
      : "neutral";

  const signal: Signal =
    lean === "risk-on" ? "confirming"
    : lean === "risk-off" ? (posture === "RISK-OFF" || conf === "BROAD WEAKNESS" ? "stress" : "warning")
    : "neutral";

  const tone: Tone =
    posture === "AGGRESSIVE RISK-ON" || posture === "CONSTRUCTIVE" ? "constructive"
    : posture === "RISK-OFF" ? "stressed"
    : "caution";

  const lines: string[] = [];
  if (rotation) lines.push(`Rotation: ${sentenceCase(rotation.state)} (${pts(rotation.spread)})`);
  if (participation) lines.push(`Participation: ${sentenceCase(participation.state)}`);
  if (breadthA) lines.push(`Breadth: ${sentenceCase(breadthA.state)}`);
  lines.push(explanation);

  return {
    posture,
    tone,
    signal,
    lean,
    explanation,
    evidence: {
      title: `Why ${sentenceCase(posture)}?`,
      lines,
      note: "Equity posture is confirmation only — it never overrides credit, rates, volatility or ES price action.",
    },
    breadth: breadthA,
    rotation,
    participation,
  };
}
