import "server-only";

/**
 * Live S&P 500 membership, used for two things:
 *   1. the breadth universe (all 503 constituents, not a proxy basket)
 *   2. deciding which earnings reports actually matter to the index
 *
 * Sourced from the datahub S&P 500 dataset, which tracks the Wikipedia
 * constituent table. Membership changes a handful of times a year, so this is
 * cached for a day. If it cannot be fetched, the callers throw rather than fall
 * back to a stale hardcoded list.
 */

const SOURCE =
  "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface Constituent {
  /** Yahoo-style ticker (BRK-B, not BRK.B). */
  symbol: string;
  name: string;
  sector: string;
}

let cache: { at: number; value: Map<string, Constituent> } | null = null;

/** Splits a CSV line, honouring double-quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export async function getConstituents(): Promise<Map<string, Constituent>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const res = await fetch(SOURCE, {
    headers: { "User-Agent": "es-morning-prep/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`S&P 500 constituents: HTTP ${res.status}`);

  const lines = (await res.text()).trim().split("\n");
  const header = splitCsvLine(lines[0]);
  const iSym = header.indexOf("Symbol");
  const iName = header.indexOf("Security");
  const iSector = header.indexOf("GICS Sector");
  if (iSym < 0) throw new Error("S&P 500 constituents: unexpected CSV shape");

  const map = new Map<string, Constituent>();
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const raw = cols[iSym];
    if (!raw) continue;
    // Yahoo uses a hyphen for share classes (BRK.B -> BRK-B).
    map.set(raw.replace(/\./g, "-"), {
      symbol: raw.replace(/\./g, "-"),
      name: cols[iName] ?? raw,
      sector: cols[iSector] ?? "",
    });
  }

  if (map.size < 400) {
    throw new Error(`S&P 500 constituents: only ${map.size} rows parsed`);
  }

  cache = { at: Date.now(), value: map };
  return map;
}

/** Membership lookup that tolerates BRK.B / BRK-B style differences. */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}
