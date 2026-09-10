import "server-only";

import { cached } from "@/lib/cache";
import { REFRESH } from "@/config/thresholds";
import type { Block, Credit } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockCredit } from "./providers/mock";
import { liveCredit } from "./providers/live";

export async function getCreditConditions(): Promise<Block<Credit>> {
  return cached({
    key: "credit",
    ttlMs: REFRESH.credit,
    source: "FRED",
    fetcher: async () => {
      const { value, source } = await resolveProvider(
        liveCredit,
        mockCredit,
        "FRED",
      );
      // Daily series: the source timestamp is the observation date, not now.
      return { value, source, sourceTimestamp: `${value.asOfDate}T16:00:00-05:00` };
    },
  });
}
