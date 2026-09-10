import "server-only";

import { cached } from "@/lib/cache";
import { REFRESH } from "@/config/thresholds";
import type { Block, IndexFutures } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockFutures } from "./providers/mock";
import { liveFutures } from "./providers/live";

export async function getIndexFutures(): Promise<Block<IndexFutures>> {
  return cached({
    key: "futures",
    ttlMs: REFRESH.futures,
    source: "Yahoo",
    fetcher: () => resolveProvider(liveFutures, mockFutures, "Yahoo"),
  });
}
