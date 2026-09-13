import "server-only";

import type { CreditData, SpreadSeries } from "@/lib/types";

/**
 * ICE BofA option-adjusted spreads via FRED:
 *   BAMLH0A0HYM2  US High Yield
 *   BAMLC0A0CM    US Corporate (investment grade)
 *
 * Two paths:
 *  1. The official API, when FRED_API_KEY is set. Reliable, fast, and the only
 *     path that works consistently from cloud IPs. Keys are free.
 *  2. The public CSV export, as a keyless fallback. FRED rate-limits it
 *     aggressively, so expect it to fail intermittently.
 *
 * Both series are daily and published with a one-day lag. Roughly three years
 * of history is fetched so the engine can rank today's 5-day change against
 * the series' own distribution of 5-day changes.
 */

const HY = "BAMLH0A0HYM2";
const IG = "BAMLC0A0CM";
const TIMEOUT_MS = 8_000;
const LIMIT = 800;
const LOOKBACK_DAYS = 3 * 366;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/** FRED quotes spreads in percentage points; the dashboard works in bp. */
function toSeries(obs: Array<{ date: string; value: number }>): SpreadSeries {
  return {
    dates: obs.map((o) => o.date),
    values: obs.map((o) => Math.round(o.value * 100)),
  };
}

export async function getCreditSpreads(): Promise<CreditData> {
  const key = process.env.FRED_API_KEY?.trim();

  if (key) {
    const [hy, ig] = await Promise.all([
      viaApi(key, HY),
      viaApi(key, IG).catch((e) => {
        console.warn(`[fred] ${IG} failed:`, e.message);
        return null;
      }),
    ]);
    if (hy.length < 6) throw new Error(`FRED ${HY}: insufficient observations`);
    return { hy: toSeries(hy), ig: ig && ig.length >= 6 ? toSeries(ig) : null };
  }

  const cols = await viaCsv([HY, IG]);
  const hy = cols.get(HY) ?? [];
  const ig = cols.get(IG) ?? [];
  if (hy.length < 6) throw new Error(`FRED ${HY}: insufficient observations`);
  return { hy: toSeries(hy), ig: ig.length >= 6 ? toSeries(ig) : null };
}

async function viaApi(apiKey: string, series: string) {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${series}&api_key=${encodeURIComponent(apiKey)}` +
    `&file_type=json&sort_order=desc&limit=${LIMIT}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`FRED API ${series}: HTTP ${res.status}`);

  const json = (await res.json()) as { observations?: Array<{ date?: string; value?: string }> };
  return (json.observations ?? [])
    .map((o) => ({ date: o.date ?? "", value: Number(o.value) }))
    // FRED writes "." on non-observation days (holidays).
    .filter((o) => o.date && Number.isFinite(o.value))
    .reverse();
}

/** Keyless fallback; one request returns both series as columns. */
async function viaCsv(ids: string[]) {
  const start = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${ids.join(",")}&cosd=${start}`,
    {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/csv,text/plain,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`FRED CSV: HTTP ${res.status}`);

  const [header, ...lines] = (await res.text()).trim().split("\n");
  const names = header.split(",").map((s) => s.trim());
  const out = new Map<string, Array<{ date: string; value: number }>>();
  for (const line of lines) {
    const cells = line.split(",");
    const date = cells[0]?.trim();
    if (!date) continue;
    names.slice(1).forEach((name, i) => {
      const cell = cells[i + 1]?.trim();
      // Empty and "." cells are non-observation days, not zero.
      if (!cell || cell === ".") return;
      const value = Number(cell);
      if (!Number.isFinite(value)) return;
      if (!out.has(name)) out.set(name, []);
      out.get(name)!.push({ date, value });
    });
  }
  return out;
}
