import "server-only";

import type { VixFutures } from "@/lib/types";
import { etParts } from "@/lib/engine/session";

/**
 * Cboe VX futures (keyless, delayed). The preferred source for volatility
 * term structure: actual M1 vs M2 contango/backwardation. When this fails the
 * engine falls back to the VIX9D/VIX/VIX3M index proxy and says so.
 *
 * Monthly contracts are "VX/U6"; weeklies carry a week number ("VX38/U6") and
 * are excluded.
 */

const URL = "https://www.cboe.com/us/futures/api/get_quotes_combined/?symbol=VX&rootsymbol=null";
const MONTHLY = /^VX\/[FGHJKMNQUVXZ]\d$/;

interface Row {
  symbol?: string;
  expiration?: string;
  last_price?: number;
  settlement?: number;
  prev_settlement?: number;
}

/** "09/16/2026" -> "2026-09-16" */
function isoDate(mdy: string): string | null {
  const m = mdy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

export async function getVixFutures(): Promise<VixFutures> {
  const res = await fetch(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Cboe VX futures: HTTP ${res.status}`);

  const json = (await res.json()) as { data?: Row[]; lastUpdate?: string };
  const today = etParts(Date.now()).key;

  const contracts = (json.data ?? [])
    .filter((r) => r.symbol && MONTHLY.test(r.symbol) && r.expiration)
    .map((r) => {
      // A contract with no trade yet today shows last_price 0; fall back to
      // today's settlement, then the prior one.
      const price =
        (r.last_price ?? 0) > 0
          ? (r.last_price as number)
          : (r.settlement ?? 0) > 0
            ? (r.settlement as number)
            : (r.prev_settlement ?? 0);
      return {
        symbol: r.symbol as string,
        expiration: r.expiration as string,
        expiry: isoDate(r.expiration as string),
        price,
        prevSettlement: r.prev_settlement ?? price,
      };
    })
    .filter((c) => c.expiry !== null && c.expiry >= today && c.price > 0)
    .sort((a, b) => ((a.expiry as string) < (b.expiry as string) ? -1 : 1))
    .map(({ expiry: _expiry, ...c }) => c);

  if (contracts.length < 2) throw new Error("Cboe VX futures: fewer than two monthly contracts");

  // Cboe reports microseconds, which not every parser accepts.
  const stamp = json.lastUpdate?.replace(/(\.\d{3})\d+/, "$1");
  const asOf = stamp && Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toISOString() : new Date().toISOString();

  return { contracts: contracts.slice(0, 3), asOf };
}
