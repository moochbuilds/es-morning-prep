/**
 * NYSE trading calendar and session state.
 *
 * "Next session" is a property of the exchange calendar, not of the economic
 * calendar: a Monday with no data releases is still the next session. Holidays
 * are computed from the NYSE rules rather than hardcoded per year, so the
 * calendar never silently runs out.
 */

import { SESSION } from "@/config/thresholds";
import type { SessionInfo } from "@/lib/types";

export const ET_ZONE = "America/New_York";

// ---------------------------------------------------------------------------
// Date keys (YYYY-MM-DD, always in Eastern Time)
// ---------------------------------------------------------------------------

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface EtParts {
  key: string;
  year: number;
  month: number;
  day: number;
  /** Minutes since ET midnight. */
  minutes: number;
  /** 0 = Sunday. */
  weekday: number;
}

export function etParts(at: number | Date): EtParts {
  const p = partsFmt.formatToParts(new Date(at));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const key = toKey(year, month, day);
  return {
    key,
    year,
    month,
    day,
    minutes: get("hour") * 60 + get("minute"),
    weekday: weekdayOf(key),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function keyToUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function weekdayOf(key: string): number {
  return keyToUtc(key).getUTCDay();
}

export function addDays(key: string, n: number): string {
  const d = keyToUtc(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Epoch ms for an Eastern wall-clock time on a given ET date (DST-aware). */
export function etInstant(key: string, minutes: number): number {
  const [y, m, d] = key.split("-").map(Number);
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  for (const offset of [4, 5]) {
    const candidate = Date.UTC(y, m - 1, d, h + offset, min);
    const p = etParts(candidate);
    if (p.key === key && p.minutes === minutes) return candidate;
  }
  return Date.UTC(y, m - 1, d, h + 5, min);
}

// ---------------------------------------------------------------------------
// NYSE holidays
// ---------------------------------------------------------------------------

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return toKey(year, month, day);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const back = (last.getUTCDay() - weekday + 7) % 7;
  return toKey(year, month, last.getUTCDate() - back);
}

/** Anonymous Gregorian algorithm. */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toKey(year, month, day);
}

/** Saturday holidays are observed Friday, Sunday holidays Monday. */
function observed(key: string): string {
  const wd = weekdayOf(key);
  if (wd === 6) return addDays(key, -1);
  if (wd === 0) return addDays(key, 1);
  return key;
}

const holidayCache = new Map<number, Map<string, string>>();

export function nyseHolidays(year: number): Map<string, string> {
  const hit = holidayCache.get(year);
  if (hit) return hit;

  const out = new Map<string, string>();
  // New Year's Day: a Saturday New Year is NOT observed on the prior Friday.
  const newYear = toKey(year, 1, 1);
  if (weekdayOf(newYear) !== 6) out.set(observed(newYear), "New Year's Day");
  out.set(nthWeekday(year, 1, 1, 3), "Martin Luther King Jr. Day");
  out.set(nthWeekday(year, 2, 1, 3), "Washington's Birthday");
  out.set(addDays(easter(year), -2), "Good Friday");
  out.set(lastWeekday(year, 5, 1), "Memorial Day");
  if (year >= 2022) out.set(observed(toKey(year, 6, 19)), "Juneteenth");
  out.set(observed(toKey(year, 7, 4)), "Independence Day");
  out.set(nthWeekday(year, 9, 1, 1), "Labor Day");
  out.set(nthWeekday(year, 11, 4, 4), "Thanksgiving Day");
  out.set(observed(toKey(year, 12, 25)), "Christmas Day");
  for (const k of SESSION.extraClosures) {
    if (k.startsWith(String(year))) out.set(k, "Market closure");
  }

  holidayCache.set(year, out);
  return out;
}

export function holidayName(key: string): string | null {
  return nyseHolidays(Number(key.slice(0, 4))).get(key) ?? null;
}

export function isTradingDay(key: string): boolean {
  const wd = weekdayOf(key);
  return wd !== 0 && wd !== 6 && holidayName(key) === null;
}

/** 1:00 pm ET closes: July 3, the day after Thanksgiving, Christmas Eve. */
export function isEarlyClose(key: string): boolean {
  if (!isTradingDay(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  if (m === 7 && d === 3) return true;
  if (m === 12 && d === 24) return true;
  return addDays(nthWeekday(y, 11, 4, 4), 1) === key;
}

export function nextTradingDay(key: string): string {
  let k = addDays(key, 1);
  while (!isTradingDay(k)) k = addDays(k, 1);
  return k;
}

export function prevTradingDay(key: string): string {
  let k = addDays(key, -1);
  while (!isTradingDay(k)) k = addDays(k, -1);
  return k;
}

export function closeMinutes(key: string): number {
  return isEarlyClose(key) ? SESSION.earlyCloseMinutes : SESSION.rthCloseMinutes;
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export function sessionInfo(now: number): SessionInfo {
  const p = etParts(now);
  const today = p.key;
  const trading = isTradingDay(today);
  const holiday = holidayName(today);
  const t = p.minutes;
  const globexEvening = t >= SESSION.globexOpenMinutes;

  const base = {
    today,
    holidayName: holiday,
    lastSession:
      trading && t >= SESSION.rthOpenMinutes ? today : prevTradingDay(today),
  };

  if (trading) {
    const close = closeMinutes(today);
    const beforeClose = t < close;
    const nextSession = beforeClose ? today : nextTradingDay(today);

    if (t >= SESSION.rthOpenMinutes && beforeClose) {
      return { ...base, phase: "RTH", label: "Market open", cashOpen: true, futuresOpen: true, nextSession };
    }
    if (t < SESSION.rthOpenMinutes) {
      return { ...base, phase: "PRE-MARKET", label: "Pre-market · Globex open", cashOpen: false, futuresOpen: true, nextSession };
    }
    // After the close: Friday evening is the weekend.
    if (p.weekday === 5 && t >= SESSION.globexHaltMinutes) {
      return { ...base, phase: "WEEKEND", label: "Closed — weekend", cashOpen: false, futuresOpen: false, nextSession };
    }
    if (t >= SESSION.globexHaltMinutes && !globexEvening) {
      return { ...base, phase: "DAILY HALT", label: "Globex daily halt", cashOpen: false, futuresOpen: false, nextSession };
    }
    if (globexEvening) {
      return { ...base, phase: "PRE-MARKET", label: "Overnight · Globex open", cashOpen: false, futuresOpen: true, nextSession };
    }
    return { ...base, phase: "POST-CLOSE", label: "After the close", cashOpen: false, futuresOpen: true, nextSession };
  }

  const nextSession = nextTradingDay(today);
  // Globex reopens at 6 pm ET ahead of the next session (Sunday evening, or
  // the evening of a holiday).
  const reopening = globexEvening && addDays(today, 1) <= nextSession && p.weekday !== 5 && p.weekday !== 6;
  if (reopening) {
    return { ...base, phase: "PRE-MARKET", label: "Overnight · Globex open", cashOpen: false, futuresOpen: true, nextSession };
  }
  if (holiday && p.weekday !== 0 && p.weekday !== 6) {
    return { ...base, phase: "HOLIDAY", label: `Closed — ${holiday}`, cashOpen: false, futuresOpen: false, nextSession };
  }
  return { ...base, phase: "WEEKEND", label: "Closed — weekend", cashOpen: false, futuresOpen: false, nextSession };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const weekdayLong = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });
const weekdayShort = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** "Monday" */
export const dayName = (key: string) => weekdayLong.format(keyToUtc(key));
/** "Mon" */
export const dayShort = (key: string) => weekdayShort.format(keyToUtc(key));
/** "Sep 14" */
export const monthDayLabel = (key: string) => monthDay.format(keyToUtc(key));
/** "Monday, Sep 14" */
export const sessionLabel = (key: string) => `${dayName(key)}, ${monthDayLabel(key)}`;

/**
 * Relative day name from `today`: "Today", "Tomorrow", a weekday within the
 * week, otherwise a date.
 */
export function relativeDay(key: string, today: string): string {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  const diff = (keyToUtc(key).getTime() - keyToUtc(today).getTime()) / 86_400_000;
  if (diff > 0 && diff < 7) return dayName(key);
  return sessionLabel(key);
}

/**
 * How to label a cash-market or futures quote so weekend data never reads as
 * live: "Live", "Fri close", or "Thu Sep 10 close".
 */
export function quoteLabel(
  quoteIso: string,
  session: SessionInfo,
  kind: "cash" | "futures",
): { label: string; live: boolean } {
  const key = etParts(Date.parse(quoteIso)).key;
  const open = kind === "cash" ? session.cashOpen : session.futuresOpen;
  if (open && (key === session.today || kind === "futures")) {
    return { label: "Live", live: true };
  }
  if (kind === "futures" && !open) {
    return { label: `${dayShort(key)} close`, live: false };
  }
  if (key === session.lastSession) {
    return { label: `${dayShort(key)} close`, live: false };
  }
  return { label: `${dayShort(key)} ${monthDayLabel(key)} close`, live: false };
}
