import "server-only";

import type { CalendarEvent } from "@/lib/types";
import { etInstant, etParts } from "@/lib/engine/session";

/**
 * TradingEconomics US economic calendar.
 *
 * Scraped from the public calendar page — TE discontinued its guest API key.
 * The parser is deliberately strict: if the page markup changes it throws, so
 * the section degrades to UNAVAILABLE rather than silently rendering nothing.
 *
 * Facts established by checking known release schedules:
 *   - The star rating is encoded as `calendar-date-N` on the time span.
 *   - Times are UTC. CPI shows 12:30, which is 08:30 ET. We convert.
 *   - Each row carries actual, previous (plus any revision), consensus and
 *     TE's own model forecast. Consensus is the market's expectation; TE's
 *     forecast is kept separately and used only when no consensus exists.
 *
 * Importance, category and grouping are NOT decided here: the release library
 * (config/releases.ts) does that in the engine, so there is one source of truth.
 */

const URL = "https://tradingeconomics.com/united-states/calendar";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Far enough ahead to always find the next major catalyst. */
const LOOKAHEAD_DAYS = 14;

/** TE rates events 1-3 stars; below this they are excluded. */
const MIN_STARS = 2;

const strip = (s: string): string =>
  s.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/®/g, "")
    .replace(/\s+/g, " ")
    .trim();

function titleCase(slug: string): string {
  return slug
    .split(" ")
    .map((w) =>
      /^(cpi|ppi|pce|gdp|ism|api|eia|mba|jolts|adp|fomc|us|ny|nahb|cb|yoy|mom|qoq|s\.a)$/i.test(w)
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

function categorize(slug: string): CalendarEvent["category"] {
  if (/auction/.test(slug)) return "auction";
  if (/fed|fomc|powell|beige book/.test(slug)) return "fed";
  if (/budget|treasury|tariff/.test(slug)) return "government";
  return "data";
}

/** UTC wall clock from TE -> a true instant, then rendered in ET downstream. */
function toInstant(date: string, time: string): string | null {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const suffix = m[3]?.toUpperCase();
  if (suffix === "PM" && hour !== 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  const [y, mo, d] = date.split("-").map(Number);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d, hour, minute)).toISOString();
}

interface RawRow {
  date: string;
  time: string;
  stars: number;
  country: string;
  slug: string;
  title: string;
  period: string | null;
  actual: string | null;
  previous: string | null;
  consensus: string | null;
  forecast: string | null;
}

/** Text of the element with this id inside a row, or null when empty. */
function cell(row: string, id: string): string | null {
  const m = row.match(new RegExp(`id=['"]${id}['"][^>]*>([^<]*)<`));
  const value = m ? strip(m[1]) : "";
  return value || null;
}

function parseRows(html: string): RawRow[] {
  // Split on row starts. Each row nests a small flag <table>, so a lazy
  // "<tr ... </tr>" match would stop inside it, before the value cells.
  const rows = html.split(/(?=<tr\b[^>]*data-event=)/).slice(1);
  return rows.flatMap((r) => {
    const attr = (k: string) => (r.match(new RegExp(`data-${k}="([^"]*)"`)) || [])[1] ?? "";
    const dateCell = r.match(/<td[^>]*class='\s*(\d{4}-\d{2}-\d{2})'/);
    const timeSpan = r.match(/<span class="[^"]*calendar-date-(\d)[^"]*">([^<]*)<\/span>/);
    if (!dateCell || !timeSpan) return [];
    const slug = attr("event").toLowerCase();
    const title = strip((r.match(/class='calendar-event'[^>]*>([^<]*)</) || [])[1] ?? "");
    const period = strip((r.match(/class="calendar-reference">([^<]*)</) || [])[1] ?? "");
    return [{
      date: dateCell[1],
      time: strip(timeSpan[2]),
      stars: Number(timeSpan[1]),
      country: attr("country"),
      slug,
      title: title || titleCase(slug),
      period: period || null,
      actual: cell(r, "actual"),
      // A revision to the prior reading replaces it: that is what the market compares against.
      previous: cell(r, "revised") ?? cell(r, "previous"),
      consensus: cell(r, "consensus"),
      forecast: cell(r, "forecast"),
    }];
  });
}

/**
 * Every US event of two stars and up, from the start of today (ET) through
 * the lookahead window, including releases that have already printed.
 */
export async function getUsCalendar(): Promise<CalendarEvent[]> {
  const res = await fetch(URL, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`TradingEconomics: HTTP ${res.status}`);

  const raw = parseRows(await res.text());
  if (raw.length === 0) {
    throw new Error("TradingEconomics: no calendar rows parsed (markup changed?)");
  }

  const events = raw
    .filter((r) => r.country === "united states" && r.stars >= MIN_STARS)
    .flatMap((r) => {
      const time = toInstant(r.date, r.time);
      if (!time) return [];
      return [{
        id: `${r.date}-${r.slug}`.replace(/\s+/g, "-"),
        time,
        title: r.title,
        importance: "MED",
        category: categorize(r.slug),
        key: r.slug,
        period: r.period,
        actual: r.actual,
        consensus: r.consensus,
        modelForecast: r.forecast,
        previous: r.previous,
      } satisfies CalendarEvent];
    });

  if (events.length === 0) throw new Error("TradingEconomics: no US events matched");

  const from = etInstant(etParts(Date.now()).key, 0);
  const to = Date.now() + LOOKAHEAD_DAYS * 86_400_000;
  return events
    .filter((e) => {
      const t = Date.parse(e.time);
      return t >= from && t <= to;
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
