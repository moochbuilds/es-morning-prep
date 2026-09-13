/**
 * Cross-asset logic: agreement vs divergence.
 *
 * Nothing here averages. Each market's classification is compared with the
 * others; disagreements are detected explicitly and surfaced, and the headline
 * backdrop leads with the equity tape (what is actually being traded) and then
 * qualifies it by whether rates, credit and volatility confirm it.
 */

import { CROSS } from "@/config/thresholds";
import { bp, bpLevel, dateKeyLabel, pct, pts } from "@/lib/format";
import type {
  Alignment,
  BackdropKind,
  CreditAnalysis,
  Divergence,
  EquityAnalysis,
  IndexFutures,
  Lean,
  RatesAnalysis,
  Signal,
  Synthesis,
  Tone,
  VitalSign,
  VolatilityAnalysis,
  WhatChanged,
} from "@/lib/types";

import { isWidening } from "./credit";
import { capitalize, leanForSignal, listJoin, sentenceCase } from "./labels";

export interface SynthesisInput {
  rates: RatesAnalysis | null;
  credit: CreditAnalysis | null;
  volatility: VolatilityAnalysis | null;
  equities: EquityAnalysis;
  futures: IndexFutures | null;
}

type Market = "rates" | "credit" | "volatility" | "equities";
const MARKET_NAME: Record<Market, string> = {
  rates: "rates",
  credit: "credit",
  volatility: "volatility",
  equities: "equities",
};

// ---------------------------------------------------------------------------
// Backdrop vocabulary
// ---------------------------------------------------------------------------

const BACKDROP: Record<BackdropKind, { label: string; tone: Tone; esContext: string }> = {
  CONFIRMED_RISK_ON: {
    label: "BROADLY CONFIRMED RISK-ON",
    tone: "constructive",
    esContext:
      "Macro conditions currently provide stronger confirmation to bullish ES structure than bearish structure.",
  },
  CONSTRUCTIVE: {
    label: "CONSTRUCTIVE",
    tone: "constructive",
    esContext:
      "Macro conditions lean supportive, giving bullish ES structure more confirmation than bearish structure — though not strongly.",
  },
  RISK_ON_UNEVEN: {
    label: "RISK-ON — UNEVEN PARTICIPATION",
    tone: "caution",
    esContext:
      "Macro conditions remain generally supportive, but participation is not strong enough to treat the move as uniformly broad.",
  },
  RISK_ON_CREDIT: {
    label: "RISK-ON — CREDIT NOT CONFIRMING",
    tone: "caution",
    esContext:
      "Equity strength lacks credit confirmation, so bullish ES structure has less cross-market support than the tape alone suggests.",
  },
  RISK_ON_VOLATILITY: {
    label: "RISK-ON — VOLATILITY NOT CONFIRMING",
    tone: "caution",
    esContext:
      "Protection demand is rising into strength, so bullish ES structure has less cross-market support than the tape alone suggests.",
  },
  RISK_ON_RATES: {
    label: "RISK-ON — RATES HEADWIND",
    tone: "caution",
    esContext:
      "Macro conditions lean supportive of bullish ES structure, with the rates market the main swing factor.",
  },
  CONFIRMED_STRESS: {
    label: "BROADLY CONFIRMED RISK-OFF / STRESS",
    tone: "stressed",
    esContext:
      "Cross-market deterioration increases the significance of bearish price evidence at major ES resistance.",
  },
  CONFIRMED_RISK_OFF: {
    label: "BROADLY CONFIRMED RISK-OFF",
    tone: "stressed",
    esContext:
      "Cross-market weakness gives bearish ES structure stronger confirmation than bullish structure.",
  },
  RISK_OFF_UNCONFIRMED: {
    label: "RISK-OFF — NOT BROADLY CONFIRMED",
    tone: "caution",
    esContext:
      "The decline is not being confirmed by credit or volatility, so bearish ES structure has less cross-market support than the move alone suggests.",
  },
  DEFENSIVE: {
    label: "DEFENSIVE — PARTIAL CONFIRMATION",
    tone: "caution",
    esContext:
      "Conditions lean defensive; bearish price evidence at resistance carries more weight than usual, but confirmation is incomplete.",
  },
  MIXED: {
    label: "MIXED / DIVERGENT",
    tone: "caution",
    esContext:
      "Markets disagree, so neither bullish nor bearish ES structure has strong cross-market confirmation. Price action at key levels should carry more weight than the macro read.",
  },
  NEUTRAL: {
    label: "NEUTRAL — NO DOMINANT DRIVER",
    tone: "neutral",
    esContext:
      "No market is sending a strong signal; the macro backdrop provides little confirmation either way.",
  },
  INSUFFICIENT: {
    label: "INSUFFICIENT DATA",
    tone: "neutral",
    esContext: "Too few markets have data for a cross-market read. Check the provider status on each card.",
  },
};

// ---------------------------------------------------------------------------
// Divergences
// ---------------------------------------------------------------------------

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function detectDivergences(i: SynthesisInput): Divergence[] {
  const out: Divergence[] = [];
  const f = i.futures;
  const es = f?.es.changePct ?? null;
  const es5 = f?.es.change5dPct ?? null;
  const esUp = es !== null && es >= CROSS.esUpPct;
  const esUpTrend = esUp || (es5 !== null && es5 >= CROSS.es5dUpPct);
  const esDown = es !== null && es <= -CROSS.esDownPct;

  const c = i.credit;
  const v = i.volatility;
  const rot = i.equities.rotation;
  const part = i.equities.participation;

  const igWidening = !!c?.ig && isWidening(c.ig.direction);
  const widening = !!c && (isWidening(c.hy.direction) || (igWidening && c.hy.direction !== "TIGHTENING"));
  const creditCalm = !!c && !widening && c.vital.signal === "confirming";
  const creditSevere = !!c && (c.hy.direction === "RAPIDLY WIDENING" || c.quality?.key === "broadening");
  const volCalm =
    !!v &&
    (v.regime === "VERY CALM" || v.regime === "NORMAL") &&
    (v.momentum === "STABLE" || v.momentum === "FALLING") &&
    v.term?.state !== "BACKWARDATION";
  const volJump = !!v && (v.momentum === "SPIKING" || v.momentum === "RISING");

  const wideningText = c
    ? `HY spreads are ${bp(c.hy.d5.value)} over 5 days${igWidening && c.ig ? ` (IG ${bp(c.ig.d5.value)})` : ""}`
    : "";

  if (widening && esUpTrend) {
    out.push({
      id: "equity-credit",
      title: "EQUITY / CREDIT DIVERGENCE",
      headline: "Credit is not confirming equity strength",
      detail: `ES is rising (${esUp ? `${pct(es as number)} today` : `${pct(es5 as number)} over 5 days`}) while ${wideningText}. Equity strength is not being confirmed by credit.`,
      severity: creditSevere ? "high" : "medium",
    });
  }

  if (widening && volCalm && v) {
    out.push({
      id: "volatility-credit",
      title: "VOLATILITY / CREDIT DIVERGENCE",
      headline: "Credit widening beneath calm volatility",
      detail: `VIX is calm at ${v.vix.level.toFixed(1)} while ${wideningText}. Credit deterioration beneath a calm volatility surface — stress is developing beneath a still-calm options market.`,
      severity: "high",
    });
  }

  if (volJump && creditCalm && v) {
    const growthScare =
      i.rates !== null &&
      (i.rates.session.move === "BULL STEEPENING" || i.rates.trend.move === "BULL STEEPENING");
    out.push({
      id: "volatility-only",
      title: "VOLATILITY-ONLY FEAR",
      headline: "Volatility fear not confirmed by credit",
      detail: `VIX is ${pct(v.vix.d1Pct.value, 1)} on the day (${pct(v.vix.d5Pct.value, 1)} over 5 days) while credit spreads are stable${
        growthScare ? "" : " and the curve shows no growth-scare response"
      }. Protection demand has increased, but broader financial stress is not confirming — the volatility shock is not yet broadly confirmed.`,
      severity: v.momentum === "SPIKING" ? "medium" : "low",
    });
  }

  const riskOnRotation =
    rot?.state === "STRONG RISK-ON ROTATION" || rot?.state === "MILD RISK-ON ROTATION";
  if (riskOnRotation && widening && rot) {
    out.push({
      id: "rotation-credit",
      title: "ROTATION / CREDIT DIVERGENCE",
      headline: "Cyclical rotation without credit confirmation",
      detail: `Cyclicals are outperforming defensives by ${pts(rot.spread).replace("+", "")} while ${wideningText}. Equity rotation is risk-on, but credit conviction is deteriorating.`,
      severity: "medium",
    });
  }

  const narrow = part?.state === "POSITIVE — LARGE-CAP LED" || part?.state === "POSITIVE BUT NARROW";
  const defensiveLead = rot?.state === "DEFENSIVE ROTATION";
  if (esUp && part && f && (narrow || defensiveLead)) {
    const lags: string[] = [];
    if (part.rtyLagging) lags.push(`RTY trails ES by ${pts(-part.rtyGap).replace("+", "")}`);
    if (part.rspLagging && part.rspVsSpy !== null) lags.push(`RSP trails SPY by ${pts(-part.rspVsSpy).replace("+", "")}`);
    if (i.equities.breadth?.state === "NARROW") lags.push("breadth is narrow");
    const headline =
      part.rtyLagging && part.rspLagging
        ? "Small caps and equal-weight equities are lagging"
        : part.rtyLagging
          ? "Small caps are lagging"
          : part.rspLagging
            ? "Equal-weight equities are lagging"
            : defensiveLead
              ? "Defensives lead a rising index"
              : "Participation is narrow";
    const clauses = [
      lags.length ? `while ${listJoin(lags)}` : "",
      defensiveLead ? `${lags.length ? "and " : "while "}defensives outperform cyclicals` : "",
    ].filter(Boolean);
    out.push({
      id: "index-participation",
      title: "INDEX PARTICIPATION DIVERGENCE",
      headline,
      detail: `ES ${pct(f.es.changePct)} and NQ ${pct(f.nq.changePct)} ${clauses.join(" ")}. Headline indices are strong, but participation is narrow${
        defensiveLead ? " and the strength may be fragile" : ""
      }.`,
      severity: defensiveLead && lags.length > 0 ? "high" : "medium",
    });
  }

  if (esDown && creditCalm && v && !volJump && rot && rot.spread > 0) {
    out.push({
      id: "unconfirmed-selloff",
      title: "UNCONFIRMED SELLOFF",
      headline: "Selloff lacks broad risk-off confirmation",
      detail: `ES is ${pct(es as number)} while credit is stable, VIX is ${
        v.momentum === "FALLING" ? "declining" : "not rising"
      } and cyclicals are outperforming defensives (${pts(rot.spread)}). The selloff may lack broad risk-off confirmation.`,
      severity: "medium",
    });
  }

  if (esUp && volJump && v && !out.some((d) => d.id === "volatility-only")) {
    out.push({
      id: "equity-volatility",
      title: "EQUITY / VOLATILITY DIVERGENCE",
      headline: "Protection demand rising into strength",
      detail: `ES is ${pct(es as number)} while VIX is ${pct(v.vix.d1Pct.value, 1)}. Options traders are paying more for protection into the advance.`,
      severity: "low",
    });
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

function marketSignals(i: SynthesisInput): Record<Market, Signal | null> {
  const hasEquities = i.equities.posture !== null || i.equities.participation !== null;
  return {
    rates: i.rates?.vital.signal ?? null,
    credit: i.credit?.vital.signal ?? null,
    volatility: i.volatility?.vital.signal ?? null,
    equities: hasEquities ? i.equities.signal : null,
  };
}

function computeAlignment(
  i: SynthesisInput,
  leans: Record<Market, Lean | null>,
  divergences: Divergence[],
): Synthesis["alignment"] {
  const signals = marketSignals(i);
  const markets = (Object.keys(leans) as Market[]).filter((m) => leans[m] !== null);
  const on = markets.filter((m) => leans[m] === "risk-on");
  const off = markets.filter((m) => leans[m] === "risk-off");
  const neutral = markets.filter((m) => leans[m] === "neutral");
  const notable = divergences.filter((d) => d.severity !== "low");
  const high = divergences.some((d) => d.severity === "high");

  const evidence = {
    title: "Why this alignment?",
    lines: markets.map((m) => `${capitalize(MARKET_NAME[m])}: ${leans[m]}${signals[m] ? ` (${signals[m]})` : ""}`),
    note: "Disagreement is reported as information — it is never averaged into a score.",
  };
  if (notable.length) evidence.lines.push(`Divergences flagged: ${notable.map((d) => sentenceCase(d.title)).join("; ")}`);

  const names = (ms: Market[]) => listJoin(ms.map((m) => MARKET_NAME[m]));
  // "rates" and "equities" read as plurals; "credit" and "volatility" do not.
  const plural = (ms: Market[]) => ms.length > 1 || ms[0] === "rates" || ms[0] === "equities";
  const verb = (ms: Market[], one: string, many: string) => (plural(ms) ? many : one);

  if (on.length + off.length < 2) {
    return { state: "NO CLEAR SIGNAL", text: "Too few markets are sending a directional signal.", evidence };
  }
  if (on.length === off.length) {
    return {
      state: "MIXED",
      text: capitalize(`${names(on)} ${verb(on, "leans", "lean")} risk-on; ${names(off)} ${verb(off, "leans", "lean")} risk-off.`),
      evidence,
    };
  }

  const majority = on.length > off.length ? on : off;
  const minority = on.length > off.length ? off : on;
  const direction = on.length > off.length ? "risk-on" : "risk-off";

  let state: Alignment;
  if (minority.length === 0 && majority.length >= 3 && notable.length === 0) state = "STRONG";
  else if (minority.length === 0 && majority.length >= 2 && !high) state = "MODERATE";
  else if (
    minority.length === 1 &&
    majority.length >= 3 &&
    signals[minority[0]] !== "stress" &&
    notable.length === 0
  ) {
    state = "MODERATE";
  } else state = "MIXED";

  let text = capitalize(
    `${names(majority)} ${majority.length > 1 ? "agree" : verb(majority, "leans", "lean")} ${direction}`,
  );
  text += minority.length
    ? `; ${names(minority)} ${verb(minority, "disagrees", "disagree")}.`
    : neutral.length
      ? `; ${names(neutral)} ${verb(neutral, "is", "are")} neutral.`
      : ".";
  if (notable.length) text += ` ${notable.length} cross-market divergence${notable.length > 1 ? "s" : ""} flagged.`;

  return { state, text, evidence };
}

function computeVitalAlignment(i: SynthesisInput): Synthesis["vitalAlignment"] {
  const vitals = [i.rates?.vital, i.credit?.vital, i.volatility?.vital].filter(
    (v): v is VitalSign => Boolean(v),
  );
  if (vitals.length === 0) return { state: "QUIET", text: "No vital-sign data available." };

  const by = (s: Signal) => vitals.filter((v) => v.signal === s).map((v) => v.label.toLowerCase());
  const calm = by("confirming");
  const warn = by("warning");
  const stress = by("stress");
  const neutral = by("neutral");

  const clause = (items: string[], what: string) =>
    items.length ? `${listJoin(items)} ${items.length > 1 ? "are" : "is"} ${what}` : null;
  const text = capitalize(
    [clause(calm, "calm"), clause(stress, "stressed"), clause(warn, "flashing caution"), clause(neutral, "neutral")]
      .filter(Boolean)
      .join("; ") + ".",
  );

  if (calm.length === 0 && (stress.length >= 2 || (stress.length >= 1 && warn.length >= 1))) {
    return { state: "STRESSED", text };
  }
  if (stress.length + warn.length === 0) {
    return { state: calm.length ? "CONSTRUCTIVE" : "QUIET", text };
  }
  return { state: "MIXED", text };
}

// ---------------------------------------------------------------------------
// Backdrop, tailwind, headwind
// ---------------------------------------------------------------------------

const isOff = (v?: VitalSign | null) => !!v && (v.signal === "warning" || v.signal === "stress");
const isOn = (v?: VitalSign | null) => !!v && v.signal === "confirming";
const isStress = (v?: VitalSign | null) => v?.signal === "stress";

function computeBackdrop(i: SynthesisInput, divergences: Divergence[]): BackdropKind {
  const macro = [i.rates?.vital, i.credit?.vital, i.volatility?.vital].filter(Boolean) as VitalSign[];
  const hasEquities = i.equities.posture !== null || i.equities.participation !== null;
  if (macro.length + (hasEquities ? 1 : 0) < 2) return "INSUFFICIENT";

  const macroOn = macro.filter(isOn).length;
  const macroOff = macro.filter(isOff).length;
  const credit = i.credit?.vital;
  const vol = i.volatility?.vital;
  const rates = i.rates?.vital;
  const eq = hasEquities ? i.equities.lean : "neutral";
  const p = i.equities.participation;

  if (eq === "risk-on") {
    const uneven =
      divergences.some((d) => d.id === "index-participation") ||
      p?.state === "POSITIVE — LARGE-CAP LED" ||
      p?.state === "POSITIVE BUT NARROW" ||
      i.equities.breadth?.state === "NARROW";
    // Macro dissent outranks an equity-internal caveat, except that a merely
    // warning-level rates headwind ranks below narrow participation.
    if (isOff(credit)) return "RISK_ON_CREDIT";
    if (isOff(vol)) return "RISK_ON_VOLATILITY";
    if (isStress(rates)) return "RISK_ON_RATES";
    if (uneven) return "RISK_ON_UNEVEN";
    if (isOff(rates)) return "RISK_ON_RATES";
    return macroOn >= 2 ? "CONFIRMED_RISK_ON" : "CONSTRUCTIVE";
  }

  if (eq === "risk-off") {
    if (isStress(credit) && isStress(vol) && (isStress(rates) || i.equities.signal === "stress")) {
      return "CONFIRMED_STRESS";
    }
    if (macroOff >= 2) return "CONFIRMED_RISK_OFF";
    if (!isOff(credit) && !isOff(vol)) return "RISK_OFF_UNCONFIRMED";
    return "DEFENSIVE";
  }

  if (macroOff >= 2 && macroOn === 0) return "DEFENSIVE";
  if (macroOff >= 1) return "MIXED";
  if (macroOn >= 2) return "CONSTRUCTIVE";
  return "NEUTRAL";
}

function tailwindOf(i: SynthesisInput): string | null {
  const c = i.credit;
  const v = i.volatility;
  const creditOk = isOn(c?.vital);
  const volOk = isOn(v?.vital);
  const creditPhrase = c?.state === "IMPROVING" ? "credit spreads are tightening" : "credit remains healthy";
  const volPhrase = v?.momentum === "FALLING" ? "volatility is declining" : "volatility is calm";

  if (creditOk && volOk) return capitalize(`${creditPhrase} and ${volPhrase}`);
  if (creditOk) return capitalize(creditPhrase);
  if (volOk) return capitalize(`${volPhrase} — no acute protection demand`);
  if (isOn(i.rates?.vital)) {
    return i.rates?.trend.move === "BULL STEEPENING"
      ? "Front-end yields falling on easier policy expectations"
      : "Treasury yields easing with credit calm";
  }
  if (i.equities.signal === "confirming") {
    return i.equities.posture === "AGGRESSIVE RISK-ON"
      ? "Aggressive cyclical leadership with broad participation"
      : "Risk-sensitive sector leadership";
  }
  return null;
}

function headwindOf(i: SynthesisInput): string | null {
  const weight = (s: Signal) => (s === "stress" ? 20 : s === "warning" ? 10 : 0);
  const candidates: Array<{ priority: number; text: string }> = [];

  const c = i.credit;
  if (c && weight(c.vital.signal)) {
    const text =
      c.state === "DETERIORATING RAPIDLY"
        ? `HY spreads widening rapidly (${bp(c.hy.d5.value)} in 5 days)`
        : c.state === "STRESSED"
          ? `HY spreads at stressed levels (${bpLevel(c.hy.level)})`
          : c.state === "DETERIORATING"
            ? `Credit spreads are widening (${bp(c.hy.d5.value)} in 5 days)`
            : c.state === "IG WIDENING"
              ? "Investment-grade spreads are widening"
              : "Credit spreads sit in the warning zone";
    candidates.push({ priority: weight(c.vital.signal) + 4, text });
  }

  const v = i.volatility;
  if (v && weight(v.vital.signal)) {
    const text =
      v.state === "ACUTE STRESS"
        ? "Volatility term structure is in backwardation"
        : v.state === "SPIKING"
          ? `VIX is spiking (${pct(v.vix.d1Pct.value, 0)} on the day)`
          : v.state === "HIGH FEAR" || v.state === "EXTREME"
            ? "VIX is in high-fear territory"
            : v.state === "HIGH BUT EASING"
              ? "VIX remains high"
              : "Volatility is rising";
    candidates.push({ priority: weight(v.vital.signal) + 3, text });
  }

  const r = i.rates;
  if (r && weight(r.vital.signal)) {
    const driver = r.driver?.driver;
    const text =
      r.trend.move === "BEAR STEEPENING"
        ? driver === "REAL YIELDS"
          ? "Long-term rates are rising, led by real yields"
          : driver === "INFLATION EXPECTATIONS"
            ? "Long-term rates are rising on inflation expectations"
            : "Long-term rates are rising"
        : r.trend.move === "BEAR FLATTENING"
          ? "Front-end yields rising on tighter policy expectations"
          : r.trend.move === "PARALLEL SHIFT HIGHER"
            ? "Yields are rising across the curve"
            : r.trend.move === "BULL STEEPENING"
              ? "Front-end rally consistent with a growth scare"
              : r.trend.move === "BULL FLATTENING"
                ? "Long-end rally consistent with growth concern"
                : r.trend.move === "PARALLEL SHIFT LOWER"
                  ? "Flight-to-quality bid in Treasuries"
                  : "Rates are a headwind";
    candidates.push({ priority: weight(r.vital.signal) + 2, text });
  }

  const e = i.equities;
  if (e.signal === "warning" || e.signal === "stress") {
    const text =
      e.posture === "RISK-OFF"
        ? "Defensive leadership with weak participation"
        : e.posture === "DEFENSIVE ROTATION"
          ? "Defensive sectors are leading"
          : e.participation?.state === "BROAD WEAKNESS"
            ? "Broad selling across the index"
            : "Equities are declining";
    candidates.push({ priority: weight(e.signal) + 1, text });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0]?.text ?? null;
}

// ---------------------------------------------------------------------------
// What changed since the prior session
// ---------------------------------------------------------------------------

const MARKET_ORDER: WhatChanged["market"][] = ["Rates", "Credit", "Volatility", "Equities"];

function whatChanged(i: SynthesisInput): WhatChanged[] {
  const out: WhatChanged[] = [];

  const r = i.rates;
  if (r) {
    const s = r.session;
    const size = Math.max(r.y2.d1.rank ?? 50, r.y10.d1.rank ?? 50);
    out.push({
      market: "Rates",
      fact: `2Y ${bp(s.d2)} vs 10Y ${bp(s.d10)}`,
      implication: s.move === "STABLE" ? "no meaningful curve change" : s.move.toLowerCase(),
      tone: s.sharp ? "caution" : "neutral",
      significance: s.move === "STABLE" ? Math.min(size, 40) : size,
    });
  }

  const c = i.credit;
  if (c) {
    const use5 = (c.hy.d5.rank ?? 0) >= (c.hy.d1.rank ?? 0);
    const move = use5 ? c.hy.d5 : c.hy.d1;
    const implication: Record<typeof c.hy.direction, string> = {
      "RAPIDLY WIDENING": "rapid deterioration",
      WIDENING: c.hy.band === "TIGHT" ? "mild deterioration from tight levels" : "deterioration",
      TIGHTENING: "improving",
      STABLE: "little change",
    };
    const tone: Record<typeof c.hy.direction, Tone> = {
      "RAPIDLY WIDENING": "stressed",
      WIDENING: "caution",
      TIGHTENING: "constructive",
      STABLE: "neutral",
    };
    out.push({
      market: "Credit",
      fact: `HY OAS ${bp(move.value)} ${use5 ? "over 5 days" : "on the day"} (as of ${dateKeyLabel(c.hy.asOf)})`,
      implication: implication[c.hy.direction],
      tone: tone[c.hy.direction],
      significance: move.rank ?? 50,
    });
  }

  const v = i.volatility;
  if (v) {
    const backw = v.term?.state === "BACKWARDATION";
    const termPhrase = v.term
      ? backw
        ? "term structure in backwardation"
        : v.term.state === "FLAT"
          ? "term structure flat"
          : "term structure remains normal"
      : null;
    const up = v.momentum === "SPIKING" || v.momentum === "RISING";
    out.push({
      market: "Volatility",
      fact: `VIX ${pct(v.vix.d1Pct.value, 0)}${termPhrase ? `, ${termPhrase}` : ""}`,
      implication: backw
        ? "acute stress"
        : up
          ? "fear higher, but not acute"
          : v.momentum === "FALLING"
            ? "fear receding"
            : "little change",
      tone: backw ? "stressed" : up ? (v.vix.level >= 20 ? "stressed" : "caution") : v.momentum === "FALLING" ? "constructive" : "neutral",
      significance: Math.max(v.vix.d1Pct.rank ?? 50, backw ? 99 : 0),
    });
  }

  const e = i.equities;
  if ((e.rotation || e.participation) && e.posture) {
    const bits: string[] = [];
    const p = e.participation;
    if (p) {
      bits.push(`ES ${pct(p.legs[0].changePct)}`);
      if (p.rtyLagging || Math.abs(p.rtyGap) >= 0.3) bits.push(`RTY ${pct(p.legs[2].changePct)}`);
    }
    if (e.rotation) bits.push(`cyclicals ${pts(e.rotation.spread)} vs defensives`);
    out.push({
      market: "Equities",
      fact: bits.join(" · "),
      implication: e.rotation?.transitioning
        ? "rotation reversing its 5-day trend"
        : `${e.posture.toLowerCase()} posture`,
      tone: e.tone,
      significance: e.rotation?.spreadRank ?? 50,
    });
  }

  return out
    .sort((a, b) => b.significance - a.significance)
    .slice(0, 3)
    .sort((a, b) => MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market));
}

// ---------------------------------------------------------------------------

export function synthesize(i: SynthesisInput): Synthesis {
  const divergences = detectDivergences(i);
  const hasEquities = i.equities.posture !== null || i.equities.participation !== null;
  const leans: Record<Market, Lean | null> = {
    rates: i.rates ? leanForSignal(i.rates.vital.signal) : null,
    credit: i.credit ? leanForSignal(i.credit.vital.signal) : null,
    volatility: i.volatility ? leanForSignal(i.volatility.vital.signal) : null,
    equities: hasEquities ? i.equities.lean : null,
  };
  const kind = computeBackdrop(i, divergences);

  return {
    backdrop: { kind, label: BACKDROP[kind].label, tone: BACKDROP[kind].tone },
    alignment: computeAlignment(i, leans, divergences),
    vitalAlignment: computeVitalAlignment(i),
    leans,
    tailwind: tailwindOf(i),
    headwind: headwindOf(i),
    divergence: divergences[0]?.headline ?? null,
    divergences,
    whatChanged: whatChanged(i),
    esContext: BACKDROP[kind].esContext,
  };
}
