import "server-only";

import { cached } from "@/lib/cache";
import { REFRESH } from "@/config/thresholds";
import type { Block, Sectors } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockSectors } from "./providers/mock";
import { liveSectors } from "./providers/live";

export async function getSectorRotation(): Promise<Block<Sectors>> {
  return cached({
    key: "sectors",
    ttlMs: REFRESH.sectors,
    source: "Yahoo",
    fetcher: () => resolveProvider(liveSectors, mockSectors, "Yahoo"),
  });
}
