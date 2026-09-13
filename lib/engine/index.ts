/**
 * The deterministic engine:
 *
 *   DATA -> CALCULATIONS -> CLASSIFICATIONS -> CROSS-ASSET LOGIC -> TEXT
 *
 * Pure: the same raw blocks always give the same analysis. The language model
 * (lib/ai.ts) only ever sees this output, never the raw numbers alone.
 */

import type { Analysis, RawBlocks } from "@/lib/types";

import { analyzeCredit, analyzeCreditProxy } from "./credit";
import { analyzeEquities } from "./equities";
import { analysisSignature, ruleNarrative } from "./narrative";
import { analyzeRates } from "./rates";
import { synthesize } from "./synthesis";
import { analyzeVolatility } from "./volatility";

export function analyze(blocks: Pick<
  RawBlocks,
  "futures" | "breadth" | "sectors" | "rates" | "credit" | "creditProxy" | "volatility" | "vixFutures"
>): Analysis {
  const credit = analyzeCredit(blocks.credit.data);
  const creditProxy = analyzeCreditProxy(blocks.creditProxy.data);
  const volatility = analyzeVolatility(blocks.volatility.data, blocks.vixFutures.data);

  // Rates are read in context: a bull steepening is benign easing when credit
  // and volatility are calm, and a growth scare when they are not.
  const rates = analyzeRates(blocks.rates.data, {
    creditStress: credit ? credit.vital.signal === "warning" || credit.vital.signal === "stress" : false,
    volStress: volatility ? volatility.vital.signal === "stress" : false,
  });

  const equities = analyzeEquities(blocks.futures.data, blocks.breadth.data, blocks.sectors.data);
  const synthesis = synthesize({ rates, credit, volatility, equities, futures: blocks.futures.data });

  const partial = { rates, credit, creditProxy, volatility, equities, synthesis };
  return {
    ...partial,
    narrative: ruleNarrative(partial),
    signature: analysisSignature(partial),
  };
}

export { buildCatalystView } from "./catalysts";
export { sessionInfo } from "./session";
