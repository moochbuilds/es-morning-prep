import "server-only";

import type { CalendarEvent, Importance } from "@/lib/types";

/**
 * TradingEconomics US economic calendar.
 *
 * Scraped from the public calendar page — TE discontinued its guest API key.
 * The parser is deliberately strict: if the page markup changes it throws, so
 * the card degrades to UNAVAILABLE rather than silently rendering nothing.
 *
 * Two facts established by checking known release schedules:
 *   - Importance is encoded as `calendar-date-N` on the time span (3 = red).
 *   - Times are UTC. CPI shows 12:30, which is 08:30 ET. We convert.
 */

const URL = "https://tradingeconomics.com/united-states/calendar";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Releases that actually move US equity index futures.
 *
 * This list — not TradingEconomics' star rating — decides what counts as HIGH.
 * TE stars reflect general macro significance, so a 3-star print like Existing
 * Home Sales would otherwise push the day's event risk to HIGH even though ES
 * barely notices it. Everything 2-star and above is still SHOWN; this only
 * governs which events are treated as genuinely dangerous.
 */
const MARKET_MOVERS = [
  // Inflation
  "inflation rate", "core inflation", "cpi", "ppi", "pce",
  // Labour
  "non farm payrolls", "nonfarm", "unemployment rate", "average hourly earnings",
  "initial jobless claims", "jolts", "adp employment change",
  // Fed
  "fed interest rate decision", "fomc", "fed press conference", "fed chair",
  "powell", "beige book",
  // Growth and activity
  "gdp growth", "retail sales", "ism manufacturing", "ism services",
  "pmi", "durable goods", "consumer confidence", "michigan consumer sentiment",
  "philadelphia fed", "empire state", "chicago pmi",
];

/** Auctions matter at the long end, where they can reprice the curve. */
const AUCTION_MOVERS = [
  "10-year note auction",
  "20-year bond auction",
  "30-year bond auction",
];

const strip = (s: string): string =>
  s.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function titleCase(slug: string): string {
  return slug
    .split(" ")
    .map((w) =>
      /^(cpi|ppi|pce|gdp|ism|api|eia|mba|jolts|adp|fomc|us|yoy|mom|qoq|s\.a)$/i.test(w)
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
  importance: number;
  country: string;
  slug: string;
  category: string;
}

function parseRows(html: string): RawRow[] {
  const rows = html.match(/<tr\b[^>]*data-event=[\s\S]*?<\/tr>/g) ?? [];
  return rows.flatMap((r) => {
    const attr = (k: string) =>
      (r.match(new RegExp(`data-${k}="([^"]*)"`)) || [])[1] ?? "";
    const dateCell = r.match(/<td[^>]*class='\s*(\d{4}-\d{2}-\d{2})'/);
    const timeSpan = r.match(
      /<span class="[^"]*calendar-date-(\d)[^"]*">([^<]*)<\/span>/,
    );
    if (!dateCell || !timeSpan) return [];
    return [{
      date: dateCell[1],
      time: strip(timeSpan[2]),
      importance: Number(timeSpan[1]),
      country: attr("country"),
      slug: attr("event").toLowerCase(),
      category: attr("category").toLowerCase(),
    }];
  });
}

function importanceOf(row: RawRow): Importance | null {
  // "ADP Employment Change Weekly" is a different, much lower-impact series
  // than the monthly print. Initial Jobless Claims is weekly but isn't named
  // that way, so it keeps its HIGH standing.
  const isWeeklyVariant = /\bweekly\b/.test(row.slug);

  const isMover =
    !isWeeklyVariant &&
    (MARKET_MOVERS.some((k) => row.slug.includes(k)) ||
      AUCTION_MOVERS.some((k) => row.slug.includes(k)));

  // HIGH is reserved for prints that move ES, not for everything TE stars red.
  if (isMover && row.importance >= 2) return "HIGH";
  if (row.importance >= 2) return "MED";
  return null; // 1-star and below: excluded per the 2-star floor.
}

/** Today's ET calendar date, as YYYY-MM-DD. */
function etDateKey(d = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return p;
}

export interface CalendarResult {
  events: CalendarEvent[];
  /** ET date the events belong to — today, or the next session if today is empty. */
  forDate: string;
  isToday: boolean;
}

export async function getUsCalendar(): Promise<CalendarResult> {
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

  const scored = raw
    .filter((r) => r.country === "united states")
    .flatMap((r) => {
      const importance = importanceOf(r);
      const time = toInstant(r.date, r.time);
      if (!importance || !time) return [];
      return [{
        // ET date can differ from TE's UTC date (e.g. a 00:30 UTC print).
        etDate: etDateKey(new Date(time)),
        event: {
          id: `${r.date}-${r.slug}`.replace(/\s+/g, "-"),
          time,
          title: titleCase(r.slug),
          importance,
          category: categorize(r.slug),
        } satisfies CalendarEvent,
      }];
    });

  if (scored.length === 0) throw new Error("TradingEconomics: no US events matched");

  const today = etDateKey();
  const upcoming = [...new Set(scored.map((s) => s.etDate))]
    .filter((d) => d >= today)
    .sort();

  // Weekends and holidays have no US releases; fall forward to the next session
  // rather than showing an empty card, and label which day it is.
  const forDate = scored.some((s) => s.etDate === today)
    ? today
    : (upcoming[0] ?? today);

  const dayEvents = scored
    .filter((s) => s.etDate === forDate)
    .map((s) => s.event)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return { events: dedupe(dayEvents), forDate, isToday: forDate === today };
}

/**
 * TE lists each release once per series (CPI publishes MoM, YoY, Core MoM,
 * Core YoY, plus a raw index). Collapse to one line per release time + family,
 * keeping the highest-importance variant, so the card stays scannable.
 */
function dedupe(events: CalendarEvent[]): CalendarEvent[] {
  const rank: Record<Importance, number> = { HIGH: 3, MED: 2, LOW: 1 };
  const best = new Map<string, CalendarEvent>();

  for (const e of events) {
    const family = e.title
      .toLowerCase()
      .replace(/\b(mom|yoy|qoq|s\.a|adv|prel|final|core)\b/g, "")
      .replace(/[^a-z ]/g, "")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" ");
    const key = `${e.time}|${family}`;
    const prev = best.get(key);
    if (!prev || rank[e.importance] > rank[prev.importance]) best.set(key, e);
  }

  return [...best.values()].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
}
