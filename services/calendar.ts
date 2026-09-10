import "server-only";

import { cached } from "@/lib/cache";
import { EVENT_RISK, REFRESH } from "@/config/thresholds";
import type { Block, CalendarEvent } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockCalendar } from "./providers/mock";
import { liveCalendar } from "./providers/live";

export async function getEconomicCalendar(): Promise<Block<CalendarEvent[]>> {
  return cached({
    key: "calendar",
    ttlMs: REFRESH.calendar,
    source: "TradingEconomics",
    fetcher: async () => {
      const { value: events, source } = await resolveProvider(
        liveCalendar,
        mockCalendar,
        "TradingEconomics",
      );
      const filtered = EVENT_RISK.hideLowImpact
        ? events.filter((e) => e.importance !== "LOW")
        : events;
      filtered.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
      return { value: filtered, source };
    },
  });
}
