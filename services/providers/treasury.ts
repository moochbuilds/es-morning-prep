import "server-only";

/**
 * US Treasury daily par yield curve — official, keyless, no rate limit.
 *
 * Published once per business day after the close, so the latest observation is
 * typically T-1 during the morning prep window. Used here only for the 2-year
 * leg; the 10-year comes from Cboe's ^TNX so the stress model gets an intraday
 * basis-point move.
 */

const FEED =
  "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=";

export interface ParYields {
  date: string;
  us2y: number;
  us10y: number;
  /** Change vs the prior published business day, in basis points. */
  us2yChangeBp: number;
  us10yChangeBp: number;
}

const field = (entry: string, tag: string): number | null => {
  const m = entry.match(new RegExp(`<d:${tag}[^>]*>([^<]*)<`));
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? v : null;
};

export async function getParYields(): Promise<ParYields> {
  const year = new Date().getUTCFullYear();

  // Early in January the current-year feed can still be empty; fall back once.
  for (const y of [year, year - 1]) {
    const res = await fetch(`${FEED}${y}`, {
      headers: { "User-Agent": "es-morning-prep/1.0", Accept: "application/xml" },
      cache: "no-store",
    });
    if (!res.ok) continue;

    const entries = (await res.text()).split("<entry>").slice(1);
    const parsed = entries
      .map((e) => ({
        date: (e.match(/<d:NEW_DATE[^>]*>([^<]*)</) || [])[1]?.slice(0, 10) ?? "",
        us2y: field(e, "BC_2YEAR"),
        us10y: field(e, "BC_10YEAR"),
      }))
      .filter((e): e is { date: string; us2y: number; us10y: number } =>
        Boolean(e.date) && e.us2y !== null && e.us10y !== null,
      );

    if (parsed.length < 2) continue;

    const latest = parsed[parsed.length - 1];
    const prior = parsed[parsed.length - 2];
    return {
      date: latest.date,
      us2y: latest.us2y,
      us10y: latest.us10y,
      us2yChangeBp: Math.round((latest.us2y - prior.us2y) * 100),
      us10yChangeBp: Math.round((latest.us10y - prior.us10y) * 100),
    };
  }

  throw new Error("Treasury par yield curve unavailable");
}
