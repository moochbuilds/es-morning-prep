import "server-only";

/**
 * Nasdaq public calendar endpoints (keyless).
 *
 * Supplies today's earnings reporters and the actual-vs-consensus EPS surprise
 * for names that have already reported. Revenue, guidance and margins are NOT
 * available from any keyless source, so they are never fabricated — the UI
 * simply omits those rows.
 */

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

async function nasdaq<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.nasdaq.com/api/${path}`, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Nasdaq ${path}: HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.data) throw new Error(`Nasdaq ${path}: empty payload`);
  return json.data as T;
}

export interface EarningsRow {
  symbol: string;
  name: string;
  /** Parsed from "$71,937,231,179". */
  marketCapUsd: number | null;
  slot: "PRE-MARKET" | "AFTER CLOSE" | null;
  epsForecast: number | null;
}

const parseMoney = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** `date` must be YYYY-MM-DD in Eastern Time. */
export async function getEarningsCalendarFor(date: string): Promise<EarningsRow[]> {
  const data = await nasdaq<{ rows?: Array<Record<string, string>> | null }>(
    `calendar/earnings?date=${date}`,
  );
  return (data.rows ?? []).map((r) => ({
    symbol: (r.symbol ?? "").trim().toUpperCase(),
    name: (r.name ?? "").trim(),
    marketCapUsd: parseMoney(r.marketCap),
    slot:
      r.time === "time-pre-market"
        ? "PRE-MARKET"
        : r.time === "time-after-hours"
          ? "AFTER CLOSE"
          : null,
    epsForecast: parseMoney(r.epsForecast),
  }));
}

export interface EpsSurprise {
  dateReported: string;
  eps: number;
  consensus: number;
  surprisePct: number;
}

/** Most recent reported quarter for a symbol, or null if unavailable. */
export async function getLatestEpsSurprise(
  symbol: string,
): Promise<EpsSurprise | null> {
  try {
    const data = await nasdaq<{
      earningsSurpriseTable?: { rows?: Array<Record<string, string | number>> };
    }>(`company/${encodeURIComponent(symbol)}/earnings-surprise`);

    const row = data.earningsSurpriseTable?.rows?.[0];
    if (!row) return null;

    const eps = Number(row.eps);
    const consensus = Number(row.consensusForecast);
    if (!Number.isFinite(eps) || !Number.isFinite(consensus)) return null;

    return {
      dateReported: String(row.dateReported ?? ""),
      eps,
      consensus,
      surprisePct: Number(row.percentageSurprise) || 0,
    };
  } catch {
    return null;
  }
}
