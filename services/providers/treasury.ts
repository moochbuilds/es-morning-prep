import "server-only";

/**
 * US Treasury daily par yield curves — official, keyless, no rate limit.
 *
 * Both the nominal curve and the real (TIPS) curve come from the same source,
 * so the 10Y nominal / real / breakeven split is internally consistent (it is
 * the same construction FRED uses for T10YIE). Published once per business day
 * after the close, so the latest row is typically the prior session during the
 * morning prep window — the UI labels it with its date.
 */

import type { CurveRow } from "@/lib/types";
import { etParts } from "@/lib/engine/session";

const FEED =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml";

/** Enough rows to rank moves against roughly a year of history. */
const MAX_ROWS = 300;

type Row = { date: string; fields: Record<string, number> };

async function fetchYear(data: string, year: number): Promise<Row[]> {
  const res = await fetch(`${FEED}?data=${data}&field_tdr_date_value=${year}`, {
    headers: { "User-Agent": "es-morning-prep/1.0", Accept: "application/xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Treasury ${data} ${year}: HTTP ${res.status}`);

  return (await res.text())
    .split("<entry>")
    .slice(1)
    .flatMap((entry) => {
      const date = entry.match(/<d:NEW_DATE[^>]*>([^<]*)</)?.[1]?.slice(0, 10);
      if (!date) return [];
      const fields: Record<string, number> = {};
      for (const m of entry.matchAll(/<d:([A-Z0-9_]+)[^>]*>([^<]+)</g)) {
        const v = Number(m[2]);
        if (Number.isFinite(v)) fields[m[1]] = v;
      }
      return [{ date, fields }];
    });
}

export async function getCurveHistory(): Promise<CurveRow[]> {
  const year = etParts(Date.now()).year;
  const years = [year - 1, year];

  const [nominal, real] = await Promise.all([
    Promise.allSettled(years.map((y) => fetchYear("daily_treasury_yield_curve", y))),
    Promise.allSettled(years.map((y) => fetchYear("daily_treasury_real_yield_curve", y))),
  ]);

  const nominalRows = nominal.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (nominal.every((r) => r.status === "rejected")) {
    throw new Error("Treasury nominal par yield curve unavailable");
  }

  // Real yields are optional: without them the 10Y driver is simply omitted.
  const realByDate = new Map<string, number>();
  for (const r of real) {
    if (r.status !== "fulfilled") continue;
    for (const row of r.value) {
      const v = row.fields.TC_10YEAR;
      if (v !== undefined) realByDate.set(row.date, v);
    }
  }

  const byDate = new Map<string, CurveRow>();
  for (const { date, fields } of nominalRows) {
    const { BC_3MONTH, BC_2YEAR, BC_5YEAR, BC_10YEAR, BC_30YEAR } = fields;
    if ([BC_3MONTH, BC_2YEAR, BC_5YEAR, BC_10YEAR, BC_30YEAR].some((v) => v === undefined)) continue;
    byDate.set(date, {
      date,
      y3m: BC_3MONTH,
      y2: BC_2YEAR,
      y5: BC_5YEAR,
      y10: BC_10YEAR,
      y30: BC_30YEAR,
      real10: realByDate.get(date) ?? null,
    });
  }

  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-MAX_ROWS);
  if (rows.length < 6) throw new Error("Treasury par yield curve: insufficient history");
  return rows;
}
