import "server-only";

import { cached } from "@/lib/cache";
import { REFRESH } from "@/config/thresholds";
import type { Block, Rates } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockRates } from "./providers/mock";
import { liveRates } from "./providers/live";

/** 10Y is Cboe's ^TNX (intraday); the 2Y leg is the Treasury par curve (T-1). */
const SOURCE = "Cboe · Treasury";

export async function getRates(): Promise<Block<Rates>> {
  return cached({
    key: "rates",
    ttlMs: REFRESH.rates,
    source: SOURCE,
    fetcher: () => resolveProvider(liveRates, mockRates, SOURCE),
  });
}
