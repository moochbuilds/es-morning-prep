import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { REFRESH } from "@/config/thresholds";
import { languageViolation, sentenceCount } from "./engine/narrative";
import type { Analysis, Interpretation } from "./types";

/**
 * AI is used for EXPLANATION ONLY.
 *
 * The deterministic engine (lib/engine) has already classified every market,
 * detected every divergence and chosen the backdrop. The model receives those
 * computed facts and writes the Today's Read paragraph — it never sees a blank
 * canvas and never decides a classification. Its output is checked against the
 * same language rules as the rule-based writer (no trade direction, at most
 * four sentences); anything that fails falls back to the rule-based text.
 *
 * With no ANTHROPIC_API_KEY the rule-based text is used and no request is made.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const MAX_SENTENCES = 5;
const MAX_CHARS = 1100;

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return client;
}

export function aiEnabled(): boolean {
  return getClient() !== null;
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "At most four sentences of plain prose.",
    },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You write the "Today's Read" paragraph on a market-context dashboard used by an intraday S&P 500 futures (ES) trader.

You receive facts already computed by a deterministic engine: classifications for rates, credit, volatility and equity internals, the cross-asset backdrop, detected divergences, and what changed since the prior session. Explain what those facts mean together. Do not recompute or reclassify anything, and do not introduce a number, market or event that is not in the input.

Organise the paragraph around four questions: what changed, what confirms it, what contradicts it, and what that means for the environment ES is trading in. Write at most four sentences.

Rules:
- Describe relationships, not mechanics: "yields are rising alongside equities", "consistent with", "suggests", "is confirming", "is not confirming". Never claim one market causes or reinforces another.
- When rates matter, say which part of the curve is moving and, if the input names one, whether real yields or inflation expectations are driving the 10Y.
- If markets disagree, name exactly what disagrees. Never smooth a disagreement into an average reading, and never write filler such as "markets are showing mixed signals".
- This is context, not a trade signal. Never recommend a trade or a direction: no buy, sell, long, short, fade, entries, targets or stops.
- Do not mention scheduled events or event risk; they are shown separately.
- No headings, bullet points or hedging filler.`;

/** The engine's facts, compact and model-facing. */
function facts(a: Analysis) {
  const s = a.synthesis;
  const e = a.equities;
  return {
    backdrop: s.backdrop.label,
    signalAlignment: { state: s.alignment.state, explanation: s.alignment.text },
    mainTailwind: s.tailwind,
    mainHeadwind: s.headwind,
    divergences: s.divergences.map((d) => ({ title: d.title, detail: d.detail, severity: d.severity })),
    whatChanged: s.whatChanged.map((w) => `${w.market}: ${w.fact} -> ${w.implication}`),
    rates: a.rates && {
      curveMove5d: a.rates.trend.move,
      curveMoveDescription: a.rates.trend.description,
      lastSessionMove: a.rates.session.move,
      shape: a.rates.shape,
      tenYearDriver: a.rates.driver?.driver ?? "not available",
      interpretation: a.rates.vital.interpretation,
      cycleBackdrop: a.rates.cycle.text,
      asOf: a.rates.asOf,
    },
    credit: a.credit && {
      state: a.credit.state,
      hyOasBp: a.credit.hy.level,
      hyBand: a.credit.hy.band,
      hyDirection: a.credit.hy.direction,
      igDirection: a.credit.ig?.direction ?? null,
      quality: a.credit.quality?.text ?? null,
      interpretation: a.credit.vital.interpretation,
      asOf: a.credit.hy.asOf,
    },
    creditProxy: a.creditProxy && { hygVsLqd: a.creditProxy.state },
    volatility: a.volatility && {
      state: a.volatility.state,
      vix: a.volatility.vix.level,
      regime: a.volatility.regime,
      momentum: a.volatility.momentum,
      termStructure: a.volatility.term?.state ?? null,
      termStructureSource: a.volatility.term?.source ?? null,
      interpretation: a.volatility.vital.interpretation,
    },
    equities: {
      posture: e.posture,
      postureExplanation: e.explanation,
      participation: e.participation && { state: e.participation.state, explanation: e.participation.explanation },
      breadth: e.breadth && { state: e.breadth.state, explanation: e.breadth.explanation },
      rotation: e.rotation && {
        state: e.rotation.state,
        explanation: e.rotation.explanation,
        leadersVsSpy: e.rotation.leaders.map((l) => `${l.label} ${l.relPct}`),
        laggardsVsSpy: e.rotation.laggards.map((l) => `${l.label} ${l.relPct}`),
      },
    },
    esContext: s.esContext,
  };
}

/** Null when the text is usable; otherwise the reason it was rejected. */
function rejection(text: string): string | null {
  if (!text) return "empty";
  if (text.length > MAX_CHARS) return "too long";
  if (sentenceCount(text) > MAX_SENTENCES) return "too many sentences";
  const bad = languageViolation(text);
  return bad ? `trade language ("${bad}")` : null;
}

/**
 * Writes Today's Read. `previous` is the last published narrative: when the
 * engine's classifications are unchanged it is reused, so a snapshot every few
 * minutes doesn't mean a model call every few minutes.
 */
export async function generateNarrative(
  a: Analysis,
  previous: Interpretation | null = null,
): Promise<Interpretation> {
  const rule: Interpretation = {
    signature: a.signature,
    text: a.narrative,
    generatedBy: "rule",
    generatedAt: new Date().toISOString(),
    aiConfigured: aiEnabled(),
  };

  const anthropic = getClient();
  if (!anthropic) return rule;

  if (
    previous?.generatedBy === "ai" &&
    previous.signature === a.signature &&
    Date.now() - Date.parse(previous.generatedAt) < REFRESH.aiRead
  ) {
    return { ...previous, aiConfigured: true };
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [{ role: "user", content: JSON.stringify(facts(a), null, 2) }],
    });

    if (response.stop_reason === "refusal") {
      console.error("[ai] Today's Read declined by safety classifiers.");
      return rule;
    }

    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return rule;

    const text = (JSON.parse(block.text) as { summary: string }).summary.trim();
    const reason = rejection(text);
    if (reason) {
      console.warn(`[ai] Today's Read rejected (${reason}); using rule-based text.`);
      return rule;
    }

    return { ...rule, text, generatedBy: "ai" };
  } catch (error) {
    console.error("[ai] Today's Read generation failed:", error);
    return rule;
  }
}
