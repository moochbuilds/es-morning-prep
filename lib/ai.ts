import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { REFRESH } from "@/config/thresholds";
import { ruleBasedRead, synthesize, type ReadInputs } from "./scoring";
import type { EarningsResult, Regime, RiskLevel, TodayRead } from "./types";

/**
 * AI is used for INTERPRETATION ONLY.
 *
 * The model never sees a blank canvas: it receives the already-computed scores
 * and classifications and is asked to phrase them. It cannot introduce a number
 * that the scoring layer did not produce, and every field it returns is either
 * a constrained enum or free text that we length-check.
 *
 * With no ANTHROPIC_API_KEY the deterministic writer in scoring.ts runs instead,
 * so the card is never empty and the app is fully usable offline.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return client;
}

export function aiEnabled(): boolean {
  return getClient() !== null;
}

// ---------------------------------------------------------------------------
// Today's Read
// ---------------------------------------------------------------------------

const READ_SCHEMA = {
  type: "object",
  properties: {
    regime: { type: "string", enum: ["RISK-ON", "NEUTRAL", "RISK-OFF"] },
    confidence: { type: "integer" },
    breadth: { type: "string" },
    rotation: { type: "string" },
    stress: { type: "string" },
    confirmation: { type: "string" },
    summary: {
      type: "string",
      description: "Two to three sentences describing the environment.",
    },
    mainRisk: {
      type: "string",
      description: "One sentence naming the single largest risk to the setup.",
    },
  },
  required: [
    "regime",
    "confidence",
    "breadth",
    "rotation",
    "stress",
    "confirmation",
    "summary",
    "mainRisk",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You write the morning market read for a professional S&P 500 futures trader.

You receive pre-computed scores and classifications. Your job is to phrase them, not to recompute them.

Rules:
- Never invent or estimate a market data point. Use only the numbers provided.
- Never make a trade recommendation. Do not write "buy", "sell", "long", "short", or "fade". Describe the environment instead.
- summary: 2-3 sentences. Name the drivers, then say whether the backdrop is constructive, balanced, or defensive, and flag event risk if it is HIGH.
- mainRisk: exactly one sentence naming the single most likely thing that breaks the current setup.
- Echo the breadth, rotation, stress and confirmation classifications back verbatim as given.
- Set regime and confidence to the supplied values unless the data plainly contradicts them.
- Write plainly. No hedging filler, no bullet points, no headings.`;

/** Compact, model-facing view of the dashboard. Numbers only, no prose. */
function buildReadPayload(inputs: ReadInputs) {
  const { breadth, rotation, stress, confirmation, eventRisk } = inputs;
  const { regime, confidence } = synthesize(inputs);

  return {
    computed: { regime, confidence },
    futures: inputs.futures && {
      esChangePct: inputs.futures.es.changePct,
      nqChangePct: inputs.futures.nq.changePct,
      rtyChangePct: inputs.futures.rty.changePct,
    },
    breadth: breadth && {
      classification: breadth.classification,
      score: breadth.score,
      inputs: breadth.components.map((c) => ({
        label: c.label,
        score: Math.round(c.score),
      })),
    },
    rotation: rotation && {
      classification: rotation.classification,
      score: rotation.score,
      changeVsPriorSession: rotation.change,
      leaders: rotation.leaders.map((s) => `${s.label} ${s.changePct}%`),
      laggards: rotation.laggards.map((s) => `${s.label} ${s.changePct}%`),
    },
    stress: stress && {
      classification: stress.classification,
      score: stress.score,
    },
    rates: inputs.rates && {
      us10y: inputs.rates.us10y,
      us10yChangeBp: inputs.rates.us10yChangeBp,
      curve2s10sBp: inputs.rates.curve2s10sBp,
    },
    volatility: inputs.volatility && {
      vix: inputs.volatility.vix,
      vixChangePct: inputs.volatility.vixChangePct,
    },
    confirmation: confirmation && {
      classification: confirmation.classification,
      note: confirmation.interpretation,
    },
    eventRisk: {
      level: eventRisk.level,
      rationale: eventRisk.rationale,
      nextEvent: eventRisk.nextEvent && {
        title: eventRisk.nextEvent.event.title,
        importance: eventRisk.nextEvent.event.importance,
        minutesAway: eventRisk.nextEvent.minutesAway,
      },
    },
  };
}

interface ReadCacheEntry {
  read: TodayRead;
  at: number;
  signature: string;
}

let readCache: ReadCacheEntry | null = null;

/** Regenerate only when a classification actually moved. */
function readSignature(inputs: ReadInputs): string {
  return [
    inputs.breadth?.classification,
    inputs.rotation?.classification,
    inputs.stress?.classification,
    inputs.confirmation?.classification,
    inputs.eventRisk.level,
    inputs.eventRisk.nextEvent?.event.id,
  ].join("|");
}

export async function generateTodayRead(inputs: ReadInputs): Promise<TodayRead> {
  const fallback = ruleBasedRead(inputs);
  const anthropic = getClient();
  if (!anthropic) return fallback;

  const signature = readSignature(inputs);
  if (
    readCache &&
    readCache.signature === signature &&
    Date.now() - readCache.at < REFRESH.aiRead
  ) {
    return readCache.read;
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: READ_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: JSON.stringify(buildReadPayload(inputs), null, 2),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      console.error("[ai] Today's Read declined by safety classifiers.");
      return fallback;
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return fallback;

    const parsed = JSON.parse(text.text) as {
      regime: Regime;
      confidence: number;
      breadth: string;
      rotation: string;
      stress: string;
      confirmation: string;
      summary: string;
      mainRisk: string;
    };

    const read: TodayRead = {
      regime: parsed.regime,
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
      // Classifications are ours, not the model's — never let phrasing drift.
      breadth: fallback.breadth,
      rotation: fallback.rotation,
      stress: fallback.stress,
      confirmation: fallback.confirmation,
      eventRisk: inputs.eventRisk.level as RiskLevel,
      summary: parsed.summary.trim(),
      mainRisk: parsed.mainRisk.trim(),
      generatedBy: "ai",
      generatedAt: new Date().toISOString(),
    };

    readCache = { read, at: Date.now(), signature };
    return read;
  } catch (error) {
    console.error("[ai] Today's Read generation failed:", error);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Earnings takeaways
// ---------------------------------------------------------------------------

const TAKEAWAY_SCHEMA = {
  type: "object",
  properties: {
    takeaway: {
      type: "string",
      description: "At most two sentences on the read-through for ES.",
    },
  },
  required: ["takeaway"],
  additionalProperties: false,
} as const;

const TAKEAWAY_PROMPT = `Summarize the most important market takeaway from this earnings report for an ES futures trader.

Focus on implications for SPX, NQ, the relevant sector, and risk sentiment. Ignore minor details. Maximum two sentences.

Use only the results provided. Any field marked N/A was not reported — say so plainly rather than guessing, and never state a revenue, EPS, guidance, or margin outcome that is not in the input.`;

const takeawayCache = new Map<string, { text: string; at: number }>();

function takeawayKey(r: EarningsResult): string {
  return [r.ticker, r.revenue, r.eps, r.guidance, r.margins, r.stockReactionPct].join("|");
}

async function generateOne(result: EarningsResult): Promise<string | undefined> {
  const anthropic = getClient();
  if (!anthropic) return undefined;

  const key = takeawayKey(result);
  const hit = takeawayCache.get(key);
  if (hit && Date.now() - hit.at < REFRESH.earnings) return hit.text;

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: TAKEAWAY_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: TAKEAWAY_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            ticker: result.ticker,
            company: result.company,
            sector: result.sector,
            revenue: result.revenue,
            eps: result.eps,
            guidance: result.guidance,
            margins: result.margins,
            stockReactionPct: result.stockReactionPct,
            fieldsNotReported: result.missingFields,
          }),
        },
      ],
    });

    if (response.stop_reason === "refusal") return undefined;

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return undefined;

    const { takeaway } = JSON.parse(text.text) as { takeaway: string };
    takeawayCache.set(key, { text: takeaway.trim(), at: Date.now() });
    return takeaway.trim();
  } catch (error) {
    console.error(`[ai] Takeaway for ${result.ticker} failed:`, error);
    return undefined;
  }
}

/** Attaches takeaways in parallel. A failure leaves that report's takeaway unset. */
export async function attachEarningsTakeaways(
  results: EarningsResult[],
): Promise<EarningsResult[]> {
  if (!aiEnabled()) return results;
  return Promise.all(
    results.map(async (r) => ({ ...r, takeaway: await generateOne(r) })),
  );
}
