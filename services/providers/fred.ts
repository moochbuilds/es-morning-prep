import "server-only";

import type { Credit } from "@/lib/types";

/**
 * ICE BofA US High Yield option-adjusted spread (FRED series BAMLH0A0HYM2).
 *
 * Two paths:
 *  1. The official API, when FRED_API_KEY is set. Reliable, fast, and the only
 *     path that works consistently from cloud IPs. Keys are free.
 *  2. The public CSV export, as a keyless fallback. Works locally but FRED
 *     rate-limits it aggressively — it will intermittently time out from any
 *     host once it has seen a few requests.
 *
 * The series is daily and published with a one-day lag, so `asOfDate` is
 * surfaced and `dailyOnly` is set: the UI must not imply intraday precision.
 */

const SERIES = "BAMLH0A0HYM2";

/**
 * Short on purpose. The dashboard fans out with Promise.all and credit carries
 * only 25% of the stress score, so dropping it for one cycle beats making every
 * other card wait. The cache layer applies backoff on repeated failures.
 */
const TIMEOUT_MS = 6_000;

/** Only the newest observations are needed: latest value plus the prior one. */
const LOOKBACK_DAYS = 120;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface Observation {
  date: string;
  value: number;
}

export async function getHighYieldSpread(): Promise<Credit> {
  const key = process.env.FRED_API_KEY?.trim();
  const observations = key ? await viaApi(key) : await viaCsv();

  if (observations.length < 2) {
    throw new Error(`FRED ${SERIES}: insufficient observations`);
  }

  const latest = observations[observations.length - 1];
  const prior = observations[observations.length - 2];

  return {
    // Series is quoted in percentage points; the dashboard works in bp.
    hySpreadBp: Math.round(latest.value * 100),
    hySpreadChangeBp: Math.round((latest.value - prior.value) * 100),
    asOfDate: latest.date,
    dailyOnly: true,
  };
}

/** Preferred path. Returns the newest observations, oldest-first. */
async function viaApi(apiKey: string): Promise<Observation[]> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${SERIES}&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&sort_order=desc&limit=8`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // FRED puts the reason in the body for 400s (bad or missing key).
    throw new Error(`FRED API: HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    observations?: Array<{ date?: string; value?: string }>;
  };

  return (json.observations ?? [])
    .map((o) => ({ date: o.date ?? "", value: Number(o.value) }))
    // FRED writes "." on non-observation days (holidays).
    .filter((o) => o.date && Number.isFinite(o.value))
    .reverse();
}

/** Keyless fallback. Best effort — FRED throttles this endpoint hard. */
async function viaCsv(): Promise<Observation[]> {
  const start = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const res = await fetch(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${SERIES}&cosd=${start}`,
    {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/csv,text/plain,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`FRED CSV: HTTP ${res.status}`);

  return (await res.text())
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [date, value] = line.split(",");
      return { date: date?.trim() ?? "", value: Number(value) };
    })
    .filter((o) => o.date && Number.isFinite(o.value));
}
