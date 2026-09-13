import "server-only";

/**
 * One adapter per raw block. Each is cached, falls back to labelled mock data
 * only when its live provider is not implemented, and stamps the block with
 * the vendor's own observation time — so a daily series is dated by its
 * observation, not by when we fetched it.
 */

import { REFRESH } from "@/config/thresholds";
import { BREADTH_UNIVERSE_LABEL } from "@/config/universe";
import { cached } from "@/lib/cache";
import { etInstant } from "@/lib/engine/session";
import type {
  Block,
  Breadth,
  CalendarEvent,
  CreditData,
  CreditProxy,
  Earnings,
  IndexFutures,
  RatesData,
  Sectors,
  VixFutures,
  VolatilityData,
} from "@/lib/types";

import { resolveProvider } from "./mode";
import * as live from "./providers/live";
import * as mock from "./providers/mock";

/** A daily observation date, stamped at that session's 4 pm ET close. */
const closeOf = (date: string) => new Date(etInstant(date, 16 * 60)).toISOString();

function block<T>(
  key: string,
  ttlMs: number,
  source: string,
  liveFn: () => Promise<T>,
  mockFn: () => Promise<T>,
  stamp?: (value: T) => string | null,
): () => Promise<Block<T>> {
  return () =>
    cached({
      key,
      ttlMs,
      source,
      fetcher: async () => {
        const { value, source: used } = await resolveProvider(liveFn, mockFn, source);
        return { value, source: used, sourceTimestamp: stamp ? stamp(value) : null };
      },
    });
}

export const getIndexFutures = block<IndexFutures>(
  "futures", REFRESH.futures, "Yahoo", live.liveFutures, mock.mockFutures, (v) => v.quoteTime,
);

export const getBreadth = block<Breadth>(
  "breadth", REFRESH.breadth, `Yahoo · ${BREADTH_UNIVERSE_LABEL}`, live.liveBreadth, mock.mockBreadth, (v) => v.quoteTime,
);

export const getSectors = block<Sectors>(
  "sectors", REFRESH.sectors, "Yahoo", live.liveSectors, mock.mockSectors, (v) => v.quoteTime,
);

export const getRates = block<RatesData>(
  "rates", REFRESH.rates, "Treasury", live.liveRates, mock.mockRates,
  (v) => closeOf(v.history[v.history.length - 1].date),
);

export const getCredit = block<CreditData>(
  "credit", REFRESH.credit, "FRED", live.liveCredit, mock.mockCredit,
  (v) => closeOf(v.hy.dates[v.hy.dates.length - 1]),
);

export const getCreditProxy = block<CreditProxy>(
  "creditProxy", REFRESH.creditProxy, "Yahoo", live.liveCreditProxy, mock.mockCreditProxy, (v) => v.hyg.time,
);

export const getVolatility = block<VolatilityData>(
  "volatility", REFRESH.volatility, "Cboe", live.liveVolatility, mock.mockVolatility, (v) => v.vix.time,
);

export const getVixFutures = block<VixFutures>(
  "vixFutures", REFRESH.vixFutures, "Cboe", live.liveVixFutures, mock.mockVixFutures, (v) => v.asOf,
);

export const getCalendar = block<CalendarEvent[]>(
  "calendar", REFRESH.calendar, "TradingEconomics", live.liveCalendar, mock.mockCalendar,
);

export const getEarnings = block<Earnings>(
  "earnings", REFRESH.earnings, "Nasdaq", live.liveEarnings, mock.mockEarnings,
);
