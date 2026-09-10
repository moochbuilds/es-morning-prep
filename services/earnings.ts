import "server-only";

import { cached } from "@/lib/cache";
import { EARNINGS_CFG, REFRESH } from "@/config/thresholds";
import { earningsRank } from "@/lib/scoring";
import type { Block, Earnings, EarningsEvent } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockEarnings } from "./providers/mock";
import { liveEarnings } from "./providers/live";

/**
 * Backstop filter. The live provider already restricts to S&P 500 members above
 * a size floor; this keeps the mock path and any future vendor honest too.
 */
function isIndexRelevant(e: EarningsEvent): boolean {
  return e.importance === "HIGH" || (e.marketCapUsd ?? 0) >= EARNINGS_CFG.minMarketCapUsd;
}

export async function getEarningsCalendar(): Promise<Block<Earnings>> {
  return cached({
    key: "earnings",
    ttlMs: REFRESH.earnings,
    source: "Nasdaq",
    fetcher: async () => {
      const { value: raw, source } = await resolveProvider(
        liveEarnings,
        mockEarnings,
        "Nasdaq",
      );

      const relevant = raw.today
        .filter(isIndexRelevant)
        .sort((a, b) => earningsRank(b) - earningsRank(a));

      const today = (["PRE-MARKET", "AFTER CLOSE"] as const).flatMap((slot) =>
        relevant.filter((e) => e.slot === slot).slice(0, EARNINGS_CFG.maxShownPerSlot),
      );

      const reported = [...raw.reported]
        .sort(
          (a, b) =>
            new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
        )
        .slice(0, EARNINGS_CFG.maxReportedShown);

      return { value: { today, reported }, source };
    },
  });
}
