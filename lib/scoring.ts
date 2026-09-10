/**
 * Transparent, auditable scoring. No magic numbers — every constant comes from
 * /config/thresholds.ts so the model can be tuned without touching this file.
 *
 * Convention: sub-scores are always expressed in their parent's polarity.
 *   - Stress components: higher = more stress.
 *   - Breadth / rotation components: higher = more risk-on.
 */

import {
  BREADTH,
  CONFIRMATION,
  EVENT_RISK,
  READ,
  ROTATION,
  STRESS,
  type AnchorMap,
} from "@/config/thresholds";
import type {
  Breadth,
  BreadthScore,
  CalendarEvent,
  ConfirmationClass,
  ConfirmationScore,
  Credit,
  Direction,
  EarningsEvent,
  EventRisk,
  IndexFutures,
  Rates,
  Regime,
  RotationScore,
  SectorQuote,
  Sectors,
  StressScore,
  TodayRead,
  Tone,
  Volatility,
} from "./types";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const clamp = (v: number, lo = 0, hi = 100): number =>
  Math.min(hi, Math.max(lo, v));

/** Piecewise-linear interpolation across ascending [input, score] anchors. */
export function interpolate(map: AnchorMap, x: number): number {
  const first = map[0];
  const last = map[map.length - 1];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < map.length - 1; i++) {
    const [x0, y0] = map[i];
    const [x1, y1] = map[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

function classify<T extends string>(
  score: number,
  classes: Array<{ max: number; label: T }>,
): T {
  for (const c of classes) if (score < c.max) return c.label;
  return classes[classes.length - 1].label;
}

function weightedMean(parts: Array<{ score: number; weight: number }>): number {
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return 50;
  return parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight;
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// MARKET STRESS
// ---------------------------------------------------------------------------

export function scoreStress(
  rates: Rates | null,
  vol: Volatility | null,
  credit: Credit | null,
): StressScore | null {
  if (!rates && !vol && !credit) return null;

  const components: StressScore["components"] = [];

  if (vol) {
    const levelScore = interpolate(STRESS.vix.level, vol.vix);
    const changeScore = clamp(
      STRESS.vix.changeCenter + vol.vixChangePct * STRESS.vix.changePerPct,
    );
    components.push({
      label: "VIX",
      score:
        STRESS.vix.levelWeight * levelScore +
        (1 - STRESS.vix.levelWeight) * changeScore,
      weight: STRESS.weights.vix,
    });
  }

  if (rates) {
    // Rising yields tighten conditions; falling yields relieve them.
    const changeScore = clamp(
      STRESS.rates.changeCenter + rates.us10yChangeBp * STRESS.rates.changePerBp,
    );
    const levelScore = interpolate(STRESS.rates.level, rates.us10y);
    components.push({
      label: "10Y",
      score:
        STRESS.rates.changeWeight * changeScore +
        (1 - STRESS.rates.changeWeight) * levelScore,
      weight: STRESS.weights.rates,
    });

    components.push({
      label: "2s10s",
      score: interpolate(STRESS.curve.level, rates.curve2s10sBp),
      weight: STRESS.weights.curve,
    });
  }

  if (credit) {
    const levelScore = interpolate(STRESS.credit.level, credit.hySpreadBp);
    const changeScore = clamp(
      STRESS.credit.changeCenter +
        credit.hySpreadChangeBp * STRESS.credit.changePerBp,
    );
    components.push({
      label: "HY",
      score:
        STRESS.credit.levelWeight * levelScore +
        (1 - STRESS.credit.levelWeight) * changeScore,
      weight: STRESS.weights.credit,
    });
  }

  const score = Math.round(clamp(weightedMean(components)));
  const classification = classify(score, STRESS.classes);

  return {
    score,
    classification,
    // Heaviest input first, so the breakdown reads in order of influence.
    components: [...components].sort((a, b) => b.weight - a.weight),
    conclusion: STRESS.conclusions[classification],
    tone:
      classification === "LOW"
        ? "supportive"
        : classification === "NORMAL"
          ? "neutral"
          : "restrictive",
  };
}

/**
 * Tone for an individual stress metric — interpretation, not sign.
 * A falling 10Y is a negative number but supportive for equities.
 */
export function rateTone(changeBp: number): "supportive" | "neutral" | "restrictive" {
  if (changeBp <= -3) return "supportive";
  if (changeBp >= 3) return "restrictive";
  return "neutral";
}

export function vixTone(changePct: number): "supportive" | "neutral" | "restrictive" {
  if (changePct <= -2) return "supportive";
  if (changePct >= 2) return "restrictive";
  return "neutral";
}

export function creditTone(changeBp: number): "supportive" | "neutral" | "restrictive" {
  if (changeBp <= -5) return "supportive";
  if (changeBp >= 5) return "restrictive";
  return "neutral";
}

export function creditDirectionLabel(changeBp: number): string {
  if (changeBp <= -5) return "Tightening";
  if (changeBp >= 5) return "Widening";
  return "Stable";
}

export function curveDirectionLabel(changeBp: number): string {
  if (changeBp >= 2) return "Steepening";
  if (changeBp <= -2) return "Flattening";
  return "Unchanged";
}

// ---------------------------------------------------------------------------
// BREADTH
// ---------------------------------------------------------------------------

export function scoreBreadth(breadth: Breadth | null): BreadthScore | null {
  if (!breadth) return null;

  const vwapScore = clamp(breadth.pctAboveVwap);

  const adScore = clamp(
    BREADTH.advanceDecline.center +
      BREADTH.advanceDecline.perLog2 *
        Math.log2(Math.max(0.05, breadth.advanceDeclineRatio)),
  );

  const ewScore = clamp(
    BREADTH.equalWeight.center + breadth.rspVsSpyPct * BREADTH.equalWeight.perPct,
  );

  const components = [
    { label: "Above VWAP", score: vwapScore, weight: BREADTH.weights.vwap },
    { label: "A/D", score: adScore, weight: BREADTH.weights.advanceDecline },
    { label: "RSP vs SPY", score: ewScore, weight: BREADTH.weights.equalWeight },
  ];

  const score = Math.round(clamp(weightedMean(components)));
  const classification = classify(score, BREADTH.classes);

  return {
    score,
    classification,
    components,
    conclusion: BREADTH.conclusions[classification],
    broadening: breadth.rspVsSpyPct >= BREADTH.equalWeight.significantPct,
  };
}

export function equalWeightLabel(rspVsSpyPct: number): string {
  if (rspVsSpyPct >= BREADTH.equalWeight.significantPct) return "BROADENING";
  if (rspVsSpyPct <= -BREADTH.equalWeight.significantPct) return "NARROWING";
  return "IN LINE";
}

// ---------------------------------------------------------------------------
// SECTOR ROTATION
// ---------------------------------------------------------------------------

export function scoreRotation(sectors: Sectors | null): RotationScore | null {
  if (!sectors || sectors.sectors.length === 0) return null;

  const bySector = new Map(sectors.sectors.map((s) => [s.key, s]));

  const groupAvg = (weights: Partial<Record<string, number>>): number => {
    const parts: Array<{ score: number; weight: number }> = [];
    for (const [key, weight] of Object.entries(weights)) {
      const quote = bySector.get(key as SectorQuote["key"]);
      if (quote && weight) parts.push({ score: quote.changePct, weight });
    }
    if (parts.length === 0) return 0;
    const total = parts.reduce((s, p) => s + p.weight, 0);
    return parts.reduce((s, p) => s + p.score * p.weight, 0) / total;
  };

  const cyclical = groupAvg(ROTATION.cyclical);
  const defensive = groupAvg(ROTATION.defensive);
  const spread = cyclical - defensive;

  const score = Math.round(clamp(ROTATION.center + spread * ROTATION.perPct));
  const classification = classify(score, ROTATION.classes);

  const ranked = [...sectors.sectors].sort((a, b) => b.changePct - a.changePct);

  return {
    score,
    classification,
    change:
      sectors.previousScore === null ? null : score - sectors.previousScore,
    leaders: ranked.slice(0, ROTATION.leadersShown),
    laggards: ranked.slice(-ROTATION.laggardsShown).reverse(),
    conclusion: ROTATION.conclusions[classification],
  };
}

/** Arrow glyph for a sector move. */
export function sectorArrow(changePct: number): string {
  if (changePct >= ROTATION.strongMovePct) return "↑↑";
  if (changePct >= 0.1) return "↑";
  if (changePct <= -ROTATION.strongMovePct) return "↓↓";
  if (changePct <= -0.1) return "↓";
  return "→";
}

// ---------------------------------------------------------------------------
// INDEX CONFIRMATION
// ---------------------------------------------------------------------------

export function directionOf(changePct: number): Direction {
  if (changePct >= CONFIRMATION.strongPct) return "up-strong";
  if (changePct > CONFIRMATION.flatPct) return "up";
  if (changePct <= -CONFIRMATION.strongPct) return "down-strong";
  if (changePct < -CONFIRMATION.flatPct) return "down";
  return "flat";
}

export function arrowFor(direction: Direction): string {
  switch (direction) {
    case "up-strong":
      return "↑↑";
    case "up":
      return "↑";
    case "down-strong":
      return "↓↓";
    case "down":
      return "↓";
    default:
      return "→";
  }
}

export function scoreConfirmation(
  futures: IndexFutures | null,
): ConfirmationScore | null {
  if (!futures) return null;

  const legs = [futures.es, futures.nq, futures.rty].map((q) => ({
    symbol: q.symbol,
    changePct: q.changePct,
    direction: directionOf(q.changePct),
  }));

  const sign = (v: number): -1 | 0 | 1 =>
    v > CONFIRMATION.flatPct ? 1 : v < -CONFIRMATION.flatPct ? -1 : 0;

  const [es, nq, rty] = legs;
  const esSign = sign(es.changePct);
  const nqSign = sign(nq.changePct);
  const rtySign = sign(rty.changePct);

  let classification: ConfirmationClass;

  if (esSign === 0) {
    // ES itself has no directional signal; confirmation is moot.
    classification = nqSign !== 0 && nqSign === rtySign ? "MODERATE" : "WEAK";
  } else if (nqSign === esSign && rtySign === esSign) {
    classification = "STRONG";
  } else if (nqSign === -esSign && rtySign === -esSign) {
    classification = "DIVERGENT";
  } else if (nqSign === -esSign || rtySign === -esSign) {
    // One leg is actively fighting ES.
    classification = nqSign === esSign || rtySign === esSign ? "WEAK" : "DIVERGENT";
  } else {
    // One leg confirms, the other is flat.
    classification = "MODERATE";
  }

  return {
    classification,
    bias: esSign > 0 ? "up" : esSign < 0 ? "down" : "flat",
    score: CONFIRMATION.scoreByClass[classification],
    interpretation: confirmationSentence(esSign, nqSign, rtySign, legs),
    legs,
  };
}

/**
 * Confirmation in risk-on polarity. A strongly confirmed selloff is as risk-off
 * as a strongly confirmed rally is risk-on, so the class score is mirrored when
 * ES is falling. Snapshots written before `bias` existed read as neutral.
 */
export function confirmationPolarity(c: ConfirmationScore): number {
  if (c.bias === "up") return c.score;
  if (c.bias === "down") return 100 - c.score;
  return 50;
}

/** Colour for a confirmation reading: what it means for equities, not its label. */
export function confirmationTone(c: ConfirmationScore): Tone {
  const polarity = confirmationPolarity(c);
  if (polarity >= 70) return "supportive";
  if (polarity <= 30) return "restrictive";
  return "neutral";
}

function confirmationSentence(
  esSign: -1 | 0 | 1,
  nqSign: -1 | 0 | 1,
  rtySign: -1 | 0 | 1,
  legs: ConfirmationScore["legs"],
): string {
  const dir = esSign > 0 ? "strength" : esSign < 0 ? "weakness" : "chop";
  const nqStrong = Math.abs(legs[1].changePct) >= CONFIRMATION.strongPct;

  if (esSign === 0) {
    return "ES is directionless; NQ and RTY are not providing a usable lead.";
  }
  if (nqSign === esSign && rtySign === esSign) {
    return `All three equity futures are participating, supporting broad ${
      esSign > 0 ? "risk-on" : "risk-off"
    } conditions.`;
  }
  if (nqSign === esSign && rtySign === 0) {
    return `ES ${dir} is being led by NQ, while RTY participation remains flat.`;
  }
  if (nqSign === esSign && rtySign === -esSign) {
    return `Leadership is ${
      nqStrong ? "narrow and growth-heavy" : "concentrated in NQ"
    }, with RTY moving the other way.`;
  }
  if (rtySign === esSign && nqSign === 0) {
    return `ES ${dir} is being carried by cyclicals via RTY, with NQ offering no lead.`;
  }
  if (rtySign === esSign && nqSign === -esSign) {
    return `Small caps are driving ES while NQ diverges — leadership has rotated away from growth.`;
  }
  return `Neither NQ nor RTY is confirming ES ${dir}; the move lacks corroboration.`;
}

// ---------------------------------------------------------------------------
// EVENT RISK
// ---------------------------------------------------------------------------

export function scoreEventRisk(
  events: CalendarEvent[] | null,
  now: number,
): EventRisk {
  if (!events || events.length === 0) {
    return {
      level: "LOW",
      score: 0,
      nextEvent: null,
      rationale: "No index-relevant catalysts scheduled.",
    };
  }

  let score = events.reduce((s, e) => s + EVENT_RISK.points[e.importance], 0);

  const highs = events.filter((e) => e.importance === "HIGH");
  if (highs.length >= 2) score += EVENT_RISK.multipleHighBonus;

  // Concentration: high-impact events landing close together compound.
  const window = EVENT_RISK.clusterWindowMinutes * 60_000;
  for (let i = 0; i < highs.length - 1; i++) {
    const gap = Math.abs(
      new Date(highs[i + 1].time).getTime() - new Date(highs[i].time).getTime(),
    );
    if (gap <= window) score += EVENT_RISK.clusterBonus;
  }

  const level =
    score >= EVENT_RISK.thresholds.high
      ? "HIGH"
      : score >= EVENT_RISK.thresholds.medium
        ? "MEDIUM"
        : "LOW";

  const upcoming = events
    .filter((e) => new Date(e.time).getTime() > now)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())[0];

  const nextEvent = upcoming
    ? {
        event: upcoming,
        minutesAway: Math.round(
          (new Date(upcoming.time).getTime() - now) / 60_000,
        ),
      }
    : null;

  const rationale =
    highs.length >= 2
      ? `${highs.length} high-impact events, including ${highs[0].title}.`
      : highs.length === 1
        ? `${highs[0].title} is the dominant catalyst.`
        : "No high-impact releases; second-tier data only.";

  return { level, score: Math.round(score * 10) / 10, nextEvent, rationale };
}

// ---------------------------------------------------------------------------
// EARNINGS RELEVANCE
// ---------------------------------------------------------------------------

/**
 * Ranks a reporter by its ability to move the index. Pure, so both the service
 * filter and the UI's "primary catalyst" pick agree on the ordering.
 */
export function earningsRank(e: EarningsEvent): number {
  const capScore = Math.log10(Math.max(1, e.marketCapUsd ?? 1)); // ~11 for $100B
  return (
    (e.importance === "HIGH" ? 1000 : e.importance === "MED" ? 100 : 0) + capScore
  );
}

/** The single name most likely to drive index-level volatility today. */
export function primaryCatalyst(
  events: EarningsEvent[] | undefined,
): EarningsEvent | null {
  if (!events || events.length === 0) return null;
  return [...events].sort((a, b) => earningsRank(b) - earningsRank(a))[0];
}

// ---------------------------------------------------------------------------
// TODAY'S READ — deterministic synthesis (also the AI fallback writer)
// ---------------------------------------------------------------------------

export interface ReadInputs {
  breadth: BreadthScore | null;
  rotation: RotationScore | null;
  stress: StressScore | null;
  confirmation: ConfirmationScore | null;
  eventRisk: EventRisk;
  futures: IndexFutures | null;
  rates: Rates | null;
  volatility: Volatility | null;
}

/** Composite in risk-on polarity plus the pillar spread, used for confidence. */
export function synthesize(inputs: ReadInputs): {
  composite: number;
  regime: Regime;
  confidence: number;
} {
  const parts: Array<{ score: number; weight: number }> = [];
  const raw: number[] = [];

  if (inputs.breadth) {
    parts.push({ score: inputs.breadth.score, weight: READ.weights.breadth });
    raw.push(inputs.breadth.score);
  }
  if (inputs.rotation) {
    parts.push({ score: inputs.rotation.score, weight: READ.weights.rotation });
    raw.push(inputs.rotation.score);
  }
  if (inputs.stress) {
    // Invert: low stress is a risk-on input.
    const inverted = 100 - inputs.stress.score;
    parts.push({ score: inverted, weight: READ.weights.stress });
    raw.push(inverted);
  }
  if (inputs.confirmation) {
    const polarity = confirmationPolarity(inputs.confirmation);
    parts.push({ score: polarity, weight: READ.weights.confirmation });
    raw.push(polarity);
  }

  const composite = weightedMean(parts);
  const regime = classify(composite, READ.regime);

  const dispersion = stdev(raw);
  const confidence = Math.round(
    clamp(
      READ.confidence.base +
        Math.abs(composite - 50) * READ.confidence.convictionMultiplier -
        dispersion * READ.confidence.dispersionPenalty,
      READ.confidence.min,
      READ.confidence.max,
    ),
  );

  return { composite: Math.round(composite), regime, confidence };
}

/**
 * Rule-based Today's Read. Runs when ANTHROPIC_API_KEY is absent and as the
 * failure path for the AI call, so the card is never empty.
 */
export function ruleBasedRead(inputs: ReadInputs): TodayRead {
  const { regime, confidence } = synthesize(inputs);
  const { breadth, rotation, stress, confirmation, eventRisk } = inputs;

  const base = {
    breadth: breadth?.classification ?? "UNAVAILABLE",
    rotation: rotation?.classification ?? "UNAVAILABLE",
    stress: stress?.classification ?? "UNAVAILABLE",
    confirmation: confirmation?.classification ?? "UNAVAILABLE",
    eventRisk: eventRisk.level,
    generatedBy: "rule" as const,
    generatedAt: new Date().toISOString(),
  };

  // With no pillar data at all, a regime call would be fabricated. Say so.
  if (!breadth && !rotation && !stress && !confirmation) {
    return {
      ...base,
      regime: "NEUTRAL",
      confidence: 0,
      summary:
        "No breadth, rotation, stress or confirmation data is available, so no regime can be assessed. Check the individual cards for provider status.",
      mainRisk: "Trading without a read — the dashboard has no usable inputs.",
    };
  }

  const clauses: string[] = [];

  if (breadth) {
    clauses.push(
      breadth.score >= 60
        ? "Broad participation is supporting the index"
        : breadth.score <= 40
          ? "Participation is narrow beneath the index"
          : "Participation is mixed",
    );
  }
  if (rotation) {
    clauses.push(
      rotation.score >= 55
        ? "with cyclical leadership intact"
        : rotation.score <= 45
          ? "with leadership tilting defensive"
          : "with no clear rotational bias",
    );
  }

  const macro: string[] = [];
  if (inputs.rates) {
    macro.push(
      inputs.rates.us10yChangeBp <= -3
        ? "lower Treasury yields"
        : inputs.rates.us10yChangeBp >= 3
          ? "higher Treasury yields"
          : "steady Treasury yields",
    );
  }
  if (inputs.volatility) {
    macro.push(
      inputs.volatility.vixChangePct <= -2
        ? "easing volatility"
        : inputs.volatility.vixChangePct >= 2
          ? "firming volatility"
          : "contained volatility",
    );
  }

  // Either half can be absent when a provider is down — assemble defensively
  // so a missing block never leaves dangling punctuation.
  const macroClause = macro.length
    ? `${macro.join(" and ")} ${
        stress && stress.score <= 40 ? "reinforce" : "temper"
      } the move`
    : "";

  const sentence1 = clauses.length
    ? `${clauses.join(" ")}${macroClause ? `, while ${macroClause}` : ""}.`
    : macroClause
      ? `${macroClause.charAt(0).toUpperCase()}${macroClause.slice(1)}.`
      : "";

  const sentence2 =
    regime === "RISK-ON"
      ? "The backdrop is constructive."
      : regime === "RISK-OFF"
        ? "Defensive conditions are developing."
        : "The environment is balanced with no dominant driver.";

  const sentence3 =
    eventRisk.level === "HIGH" && eventRisk.nextEvent
      ? ` ${eventRisk.nextEvent.event.title} represents significant event risk.`
      : "";

  return {
    ...base,
    regime,
    confidence,
    summary: [sentence1, `${sentence2}${sentence3}`]
      .filter(Boolean)
      .join(" ")
      .trim(),
    mainRisk: buildMainRisk(inputs, regime),
  };
}

function buildMainRisk(inputs: ReadInputs, regime: Regime): string {
  const next = inputs.eventRisk.nextEvent?.event;

  if (inputs.eventRisk.level === "HIGH" && next) {
    return `${next.title} surprises and forces a repricing in yields.`;
  }
  if (inputs.confirmation?.classification === "DIVERGENT") {
    return "Index leadership stays narrow and the divergence resolves lower.";
  }
  if (inputs.stress && inputs.stress.score >= 50) {
    return "Financial conditions tighten further and pressure equity multiples.";
  }
  if (regime === "RISK-ON" && inputs.breadth && inputs.breadth.score < 50) {
    return "Strength fails to broaden and the rally stalls on thin participation.";
  }
  return "A sharp move in yields or volatility overrides the current tape.";
}
