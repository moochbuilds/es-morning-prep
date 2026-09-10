import "server-only";

import { cached } from "@/lib/cache";
import { REFRESH } from "@/config/thresholds";
import type { Block, Volatility } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockVolatility } from "./providers/mock";
import { liveVolatility } from "./providers/live";

export async function getVolatility(): Promise<Block<Volatility>> {
  return cached({
    key: "volatility",
    ttlMs: REFRESH.volatility,
    source: "Cboe",
    fetcher: () => resolveProvider(liveVolatility, mockVolatility, "Cboe"),
  });
}
