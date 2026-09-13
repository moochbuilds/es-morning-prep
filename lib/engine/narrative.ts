/**
 * Deterministic Today's Read text, plus the language rules every narrative —
 * rule-based or AI — must obey.
 *
 * Four sentences at most, built around: what equities are doing, whether
 * credit and volatility confirm it, what rates are doing and which leg is
 * driving, and what that means together. The language describes relationships
 * ("consistent with", "is not confirming"); it never claims one market causes
 * another, and it never names a trade.
 */

import type { Analysis, SectorKey } from "@/lib/types";

import { capitalize } from "./labels";

export type NarrativeInput = Omit<Analysis, "narrative" | "signature">;

const SECTOR_ADJ: Record<SectorKey, string> = {
  semis: "semiconductor",
  tech: "technology",
  communication: "communication services",
  financials: "financial",
  industrials: "industrial",
  discretionary: "consumer discretionary",
  energy: "energy",
  materials: "materials",
  utilities: "utilities",
  staples: "consumer staples",
  healthcare: "healthcare",
  realestate: "real estate",
};

function equitySentence(a: NarrativeInput): string | null {
  const p = a.equities.participation;
  const rot = a.equities.rotation;
  const top = rot?.leaders[0];
  const lead = top && top.relPct > 0 ? ` with ${SECTOR_ADJ[top.key]} leadership` : "";

  if (!p) {
    return rot ? `Sector rotation reads ${rot.state.toLowerCase()}.` : null;
  }

  switch (p.state) {
    case "BROAD CONFIRMATION":
      return `Equities are advancing${lead}, and participation is broad.`;
    case "POSITIVE — UNEVEN BREADTH":
      return `Equities are advancing${lead}, but breadth beneath the index is mixed.`;
    case "POSITIVE — LARGE-CAP LED":
    case "POSITIVE BUT NARROW": {
      const lag =
        p.rtyLagging && p.rspLagging
          ? "small caps and equal-weight participation are lagging"
          : p.rtyLagging
            ? "small caps are lagging"
            : p.rspLagging
              ? "equal-weight participation is lagging"
              : "breadth is narrow";
      return `Equities are advancing${lead}, but ${lag}.`;
    }
    case "MIXED":
      return "Equity leadership is split, with NQ moving against ES.";
    case "BROAD WEAKNESS":
      return "Equities are declining with broad selling beneath the index.";
    case "NEGATIVE — CONCENTRATED":
      return "Equities are lower, but the selling is concentrated in large caps while small caps or equal-weight hold up.";
    case "NEGATIVE — UNEVEN":
      return "Equities are lower with uneven participation.";
    default:
      return rot && rot.state !== "NEUTRAL"
        ? `Equities are little changed, with rotation reading ${rot.state.toLowerCase()}.`
        : "Equities are little changed.";
  }
}

function macroSentence(a: NarrativeInput): string | null {
  const c = a.credit;
  const v = a.volatility;
  if (!c && !v) return null;

  const cOk = c?.vital.signal === "confirming";
  const cBad = c?.vital.signal === "warning" || c?.vital.signal === "stress";
  const vOk = v?.vital.signal === "confirming";
  const vBad = v?.vital.signal === "warning" || v?.vital.signal === "stress";

  const creditPhrase = c?.state === "IMPROVING" ? "credit spreads are tightening" : "credit remains healthy";
  const volPhrase = v?.momentum === "FALLING" ? "volatility is declining" : "volatility remains subdued";

  if (cOk && vOk) {
    const p = a.equities.participation;
    const weakness =
      p?.state === "POSITIVE — LARGE-CAP LED" || p?.state === "POSITIVE BUT NARROW"
        ? "the participation weakness"
        : p?.direction === "down"
          ? "the equity weakness"
          : null;
    return weakness
      ? `${capitalize(creditPhrase)} and ${volPhrase}, so broader financial stress is not confirming ${weakness}.`
      : `${capitalize(creditPhrase)} and ${volPhrase}, consistent with a stable risk backdrop.`;
  }
  if (cBad && vBad) {
    return `Credit spreads are widening and volatility is ${
      v?.term?.state === "BACKWARDATION" ? "in backwardation" : "rising"
    }, confirming broader financial stress.`;
  }
  if (cBad && v && !vBad) {
    return "Credit spreads are widening while volatility stays subdued — stress is building beneath a calm options market.";
  }
  if (vBad && c && !cBad) {
    return `Volatility has ${v?.momentum === "SPIKING" ? "jumped" : "firmed"}, but credit spreads are stable, so the fear is not yet confirmed by credit.`;
  }
  if (c && v) {
    return `Credit reads ${c.state.toLowerCase()} and volatility reads ${v.state.toLowerCase()}.`;
  }
  return c ? `Credit reads ${c.state.toLowerCase()}.` : `Volatility reads ${v?.state.toLowerCase()}.`;
}

function ratesSentence(a: NarrativeInput): string | null {
  const r = a.rates;
  if (!r) return null;
  const driver = r.driver?.driver;
  const stressed =
    a.credit?.vital.signal === "warning" ||
    a.credit?.vital.signal === "stress" ||
    a.volatility?.vital.signal === "stress";

  switch (r.trend.move) {
    case "BEAR STEEPENING":
      return `Long-end Treasury yields are leading higher${
        driver === "REAL YIELDS"
          ? ", primarily through real yields — a rates headwind for growth assets"
          : driver === "INFLATION EXPECTATIONS"
            ? ", primarily through inflation expectations"
            : ""
      }.`;
    case "BULL STEEPENING":
      return stressed
        ? "Front-end yields are leading lower alongside credit or volatility stress, consistent with a growth scare rather than benign easing."
        : "Front-end yields are leading lower, consistent with easier policy expectations; with credit and volatility calm, that reads as benign.";
    case "BEAR FLATTENING":
      return `Front-end yields are leading higher, consistent with tighter policy expectations${
        driver === "REAL YIELDS" && (r.driver?.nominalBp ?? 0) > 0
          ? ", and the smaller rise in the 10Y is coming through real yields"
          : ""
      }.`;
    case "BULL FLATTENING":
      return "Long-end yields are falling faster than the front end, consistent with softer long-run growth or inflation expectations.";
    case "PARALLEL SHIFT HIGHER":
      return `Treasury yields are rising across the curve${
        driver === "REAL YIELDS" ? ", led by real yields" : ""
      }, consistent with tighter financial conditions.`;
    case "PARALLEL SHIFT LOWER":
      return stressed
        ? "Treasury yields are falling across the curve alongside stress, consistent with a flight to quality."
        : "Treasury yields are easing across the curve.";
    default:
      return "Treasury yields are little changed on the week, so rates are not a driver.";
  }
}

const SYNTHESIS_SENTENCE: Record<NarrativeInput["synthesis"]["backdrop"]["kind"], string> = {
  CONFIRMED_RISK_ON: "Rates, credit, volatility and equities are broadly aligned in a risk-on backdrop.",
  CONSTRUCTIVE: "The backdrop is constructive, though confirmation is not complete.",
  RISK_ON_UNEVEN: "The backdrop remains constructive, but the rally is narrower than the headline indices imply.",
  RISK_ON_CREDIT: "Equity strength is not being confirmed by credit, which has historically tended to lead.",
  RISK_ON_VOLATILITY: "Equities are firm, but rising protection demand shows options traders are less comfortable.",
  RISK_ON_RATES: "The backdrop is supportive, with rising yields the main macro headwind.",
  CONFIRMED_STRESS: "Rates, credit, volatility and equities are deteriorating together — the most trustworthy form of risk-off signal.",
  CONFIRMED_RISK_OFF: "Cross-market signals broadly confirm the risk-off move.",
  RISK_OFF_UNCONFIRMED: "The equity decline lacks confirmation from credit and volatility.",
  DEFENSIVE: "Conditions lean defensive, with only partial cross-market confirmation.",
  MIXED: "Markets disagree, and the disagreement itself is the main signal.",
  NEUTRAL: "No market is sending a strong signal.",
  INSUFFICIENT: "Too little data is available for a cross-market read.",
};

export function ruleNarrative(a: NarrativeInput): string {
  return [equitySentence(a), macroSentence(a), ratesSentence(a), SYNTHESIS_SENTENCE[a.synthesis.backdrop.kind]]
    .filter((s): s is string => Boolean(s))
    .slice(0, 4)
    .join(" ");
}

/** Changes whenever any classification the narrative depends on changes. */
export function analysisSignature(a: NarrativeInput): string {
  return [
    a.synthesis.backdrop.kind,
    a.synthesis.alignment.state,
    a.rates?.vital.state,
    a.rates?.driver?.driver,
    a.credit?.vital.state,
    a.volatility?.vital.state,
    a.volatility?.term?.state,
    a.equities.posture,
    a.equities.participation?.state,
    a.equities.breadth?.state,
    a.equities.rotation?.state,
    a.synthesis.divergences.map((d) => d.id).join(","),
  ].join("|");
}

// ---------------------------------------------------------------------------
// Language rules
// ---------------------------------------------------------------------------

/**
 * Trade-direction language. "Short-term", "short end", "long end" and
 * "long-dated" are legitimate rates vocabulary, so the patterns target trade
 * phrasing specifically.
 */
const FORBIDDEN: RegExp[] = [
  /\bbuy(?:s|ing)?\b/i,
  /\bsell (?:es|nq|the|now|into)\b/i,
  /\bgo(?:ing)? (?:long|short)\b/i,
  /\b(?:longs|shorts)\b/i,
  /\bfad(?:e|es|ing)\b/i,
  /\b(?:long|short) (?:es|nq|rty|spx|the (?:index|market|open))\b/i,
  /\blook(?:ing)? for (?:longs|shorts|entries)\b/i,
  /\bentr(?:y|ies)\b/i,
  /\bstop[- ]loss\b/i,
  /\btake[- ]profit\b/i,
  /\bprice target\b/i,
];

/** Returns the offending phrase, or null when the text is clean. */
export function languageViolation(text: string): string | null {
  for (const pattern of FORBIDDEN) {
    const m = text.match(pattern);
    if (m) return m[0];
  }
  return null;
}

export function sentenceCount(text: string): number {
  return (text.match(/[.!?](?:\s|$)/g) ?? []).length;
}
